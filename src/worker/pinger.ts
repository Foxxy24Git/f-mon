// Worker ping — PROSES TERPISAH dari Next.js (jalan sendiri / container sendiri).
// Loop: ambil node aktif → ping (fping) → simpan PingResult batch → hitung
// status (root-cause + anti-flapping) → catat StatusEvent kalau berubah.
//
// Jalankan:
//   npm run worker        (loop terus, interval dari .env)
//   npm run worker:once   (satu siklus lalu keluar — untuk smoke test)

import { db } from "../lib/db";
import {
  applyFlap,
  computeStatuses,
  type FlapState,
  type Ping,
} from "../lib/status";
import { pingBatch } from "./fping";

const INTERVAL_MS = Number(process.env.PING_INTERVAL_SEC ?? 30) * 1000;
const COUNT = Number(process.env.PING_COUNT ?? 3);
const TIMEOUT_MS = Number(process.env.PING_TIMEOUT_MS ?? 1000);
const CONCURRENCY = Number(process.env.PING_CONCURRENCY ?? 100);
const FLAP = Number(process.env.FLAP_THRESHOLD ?? 2);

// State anti-flapping bertahan antar siklus, tapi HANYA di memory proses ini.
// Kalau worker restart, hitungan flap mulai dari nol — itu wajar & aman.
const flapState = new Map<string, FlapState>();

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function cycle(verbose: boolean) {
  const t0 = Date.now();
  const nodes = await db.node.findMany({
    select: {
      id: true,
      parentId: true,
      enabled: true,
      latencyWarnMs: true,
      ipAddress: true,
      status: true,
      name: true,
    },
  });
  const active = nodes.filter((n) => n.enabled);

  // Ping per-chunk (maks PING_CONCURRENCY host per proses fping) supaya tidak
  // membanjiri jaringan bank (CLAUDE.md §7). Chunk dijalankan paralel.
  const ipToId = new Map(active.map((n) => [n.ipAddress, n.id]));
  const chunks = chunk(
    active.map((n) => n.ipAddress),
    CONCURRENCY,
  );
  const partials = await Promise.all(
    chunks.map((c) => pingBatch(c, { count: COUNT, timeoutMs: TIMEOUT_MS })),
  );
  const pings = new Map<string, Ping>();
  for (const part of partials) {
    for (const [ip, o] of part) {
      const id = ipToId.get(ip);
      if (id) pings.set(id, o);
    }
  }

  const now = new Date();

  // 1) Simpan hasil ping mentah — BATCH (CLAUDE.md §7/§8). Node yang aktif tapi
  // tak muncul di output fping dianggap mati total (loss 100%).
  const rawRows = active.map((n) => {
    const p = pings.get(n.id) ?? { isAlive: false, latencyMs: null, lossPct: 100 };
    if (!pings.has(n.id)) pings.set(n.id, p); // supaya ikut dihitung statusnya
    return { nodeId: n.id, ts: now, isAlive: p.isAlive, latencyMs: p.latencyMs, lossPct: p.lossPct };
  });
  if (rawRows.length) await db.pingResult.createMany({ data: rawRows });

  // 2) Hitung status (tree + root-cause) untuk SEMUA node (termasuk yg paused).
  const computed = computeStatuses(nodes, pings);

  // 3) Anti-flapping → tentukan perubahan yang sah.
  const events: { nodeId: string; from: typeof nodes[number]["status"]; to: typeof nodes[number]["status"]; rootCause: string | null; ts: Date }[] =
    [];
  const updates: Promise<unknown>[] = [];
  for (const n of nodes) {
    const c = computed.get(n.id)!;
    const { commit, next } = applyFlap(c.status, n.status, flapState.get(n.id), FLAP);
    if (next) flapState.set(n.id, next);
    else flapState.delete(n.id);

    const changed = commit !== n.status;
    const pinged = pings.has(n.id) && n.enabled;

    if (changed) {
      events.push({
        nodeId: n.id,
        from: n.status,
        to: commit,
        rootCause: commit === "UNREACHABLE" ? c.rootCause : null,
        ts: now,
      });
    }
    // Update cache Node hanya kalau perlu (di-ping atau statusnya berubah) —
    // hindari nulis 700 baris tiap siklus tanpa alasan.
    // ponytail: update per-node satu-satu; kalau jadi bottleneck ganti UPDATE ... unnest raw SQL.
    if (pinged || changed) {
      const p = pings.get(n.id);
      updates.push(
        db.node.update({
          where: { id: n.id },
          data: {
            status: commit,
            ...(pinged ? { lastLatency: p?.latencyMs ?? null, lastCheckAt: now } : {}),
            ...(changed ? { lastChangeAt: now } : {}),
          },
        }),
      );
    }
  }

  // 4) StatusEvent HANYA saat berubah (batch) + tulis cache Node.
  if (events.length) await db.statusEvent.createMany({ data: events });
  await Promise.all(updates);

  const dt = Date.now() - t0;
  console.log(
    `[${now.toISOString()}] ping ${active.length} node dalam ${dt}ms, ${events.length} perubahan status`,
  );
  for (const e of events) {
    const name = nodes.find((n) => n.id === e.nodeId)?.name ?? e.nodeId;
    console.log(
      `  ${name}: ${e.from} → ${e.to}${e.rootCause ? ` (penyebab: ${e.rootCause})` : ""}`,
    );
  }

  if (verbose) {
    // Mode --once: flap belum tentu commit (butuh 2 siklus), jadi tampilkan
    // hasil MENTAH per node biar langsung kelihatan DOWN vs UNREACHABLE.
    console.log("  status terhitung (mentah, sebelum anti-flapping):");
    for (const n of nodes) {
      const c = computed.get(n.id)!;
      console.log(
        `    ${n.name.padEnd(24)} ${c.status}${c.rootCause ? ` ← ${c.rootCause}` : ""}`,
      );
    }
  }
}

async function main() {
  const once = process.argv.includes("--once");
  if (once) {
    await cycle(true);
    await db.$disconnect();
    return;
  }
  console.log(`Worker ping mulai. Interval ${INTERVAL_MS / 1000}s, flap ${FLAP} siklus.`);
  // Loop sekuensial: tunggu satu siklus selesai baru jadwalkan berikutnya,
  // supaya siklus tak tumpang-tindih kalau ping lambat.
  for (;;) {
    try {
      await cycle(false);
    } catch (e) {
      console.error("Siklus gagal:", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
