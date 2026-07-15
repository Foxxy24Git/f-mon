// Seed SIMULASI riwayat ping — CLAUDE.md Fase 4 (grafik) & §5 (uji root-cause).
//
// Membangkitkan PingResult + PingHourly + StatusEvent palsu untuk node di map
// "default", supaya grafik latency ada isinya tanpa perlu perangkat sungguhan.
//
// TERPISAH dari seed-solok-sim.ts: seed itu mengurus node & tata letak canvas,
// seed ini mengurus riwayat. Jadi riwayat bisa dibangkitkan ulang tanpa
// mengacak-acak canvas yang sudah ditata Fx.
//
// Idempoten: PingResult/PingHourly/StatusEvent node terkait dihapus dulu.
//
// CATATAN: ini SIMULASI. Tidak ada ping sungguhan, tidak ada SNMP. Semua angka
// dibangkitkan dari model matematis di bawah (lihat spec §3.3).

import { PrismaClient, Status } from "@prisma/client";

const db = new PrismaClient();

// ── Parameter simulasi ──
const RAW_HOURS = 24; // PingResult mentah: 24 jam terakhir
const HOURLY_DAYS = 30; // PingHourly: 30 hari
const TICK_SEC = 30; // sesuai PING_INTERVAL_SEC default
const BATCH = 5000; // ukuran batch createMany

// PRNG deterministik (mulberry32). Sengaja BUKAN Math.random(): hasilnya harus
// bisa diulang supaya "insiden jam 14:00" tetap di jam 14:00 saat seed diulang.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash nama → angka, supaya tiap node punya karakter tetap (latency dasarnya
// selalu sama tiap kali seed dijalankan).
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Kurva harian: jam kerja (08:00–16:00 WIB) lebih sibuk → latency naik ±60%.
// WIB = UTC+7; Date.getUTCHours() dipakai supaya tak tergantung TZ server.
function dailyCurve(t: number) {
  const wibHour = (new Date(t).getUTCHours() + 7) % 24;
  const busy = Math.exp(-((wibHour - 12) ** 2) / 18); // puncak siang
  return 1 + 0.6 * busy;
}

type SimNode = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  latencyWarnMs: number;
  base: number; // latency dasar (ms)
};

type Incident = { nodeId: string; start: number; end: number };

// Latency pada waktu t untuk node tertentu (tanpa memperhitungkan insiden).
function latencyAt(n: SimNode, t: number, rnd: () => number) {
  const noise = 1 + (rnd() - 0.5) * 0.3; // ±15%
  return Math.round(n.base * dailyCurve(t) * noise * 10) / 10;
}

// Status dari hasil ping mentah + kondisi ancestor (CLAUDE.md §5).
function deriveStatus(
  alive: boolean,
  latency: number | null,
  warnMs: number,
  ancestorDown: boolean,
) {
  if (!alive) return ancestorDown ? Status.UNREACHABLE : Status.DOWN;
  return latency != null && latency > warnMs ? Status.WARNING : Status.UP;
}

async function main() {
  const map = await db.map.findUnique({ where: { slug: "default" } });
  if (!map) throw new Error('Map "default" tidak ada. Jalankan seed node dulu.');

  let nodes = await db.node.findMany({
    where: { mapId: map.id },
    select: { id: true, name: true, type: true, parentId: true, latencyWarnMs: true },
  });
  if (nodes.length === 0)
    throw new Error('Belum ada node di map "default". Jalankan: npx tsx prisma/seed-solok-sim.ts');

  // ── 1. Isi parentId yang masih kosong ──
  // Tanpa parent tak ada ancestor → UNREACHABLE mustahil muncul, dan justru
  // bagian terpenting aplikasi ini tak kelihatan di simulasi.
  //
  // Normalnya hanya parent KOSONG yang diisi — yang sudah Fx set lewat
  // PropertyPanel tak boleh disentuh (CLAUDE.md §6: relasi parent hak user).
  // Tapi itu berarti seed ini tak bisa memperbaiki topologi yang dibuatnya
  // sendiri di run sebelumnya. `--reparent` untuk itu: paksa susun ulang SEMUA.
  const reparent = process.argv.includes("--reparent");
  const isps = nodes.filter((n) => n.type === "ISP");
  const orphanAtms = nodes.filter((n) => n.type !== "ISP" && (reparent || n.parentId === null));
  // Dikelompokkan ke SEDIKIT ISP, bukan dibagi rata ke semua. Peta Solok punya
  // 28 ISP tapi cuma 19 ATM — kalau dibagi rata tiap ISP cuma kebagian 0–1 anak,
  // dan mematikan satu ISP nyaris tak menghasilkan UNREACHABLE (percuma untuk
  // uji root-cause). Di lapangan pun ATM menggantung di beberapa titik saja.
  const HUBS = 3;
  const hubs = isps.slice(0, HUBS);
  if (hubs.length > 0 && orphanAtms.length > 0) {
    await Promise.all(
      orphanAtms.map((n, i) =>
        db.node.update({ where: { id: n.id }, data: { parentId: hubs[i % hubs.length].id } }),
      ),
    );
    console.log(
      `✓ sambung ${orphanAtms.length} node ke ${hubs.length} ISP hub: ` +
        `${hubs.map((h) => h.name).join(", ")}` +
        (reparent ? " (--reparent: SEMUA parent disusun ulang)." : " (parent kosong saja)."),
    );
    nodes = await db.node.findMany({
      where: { mapId: map.id },
      select: { id: true, name: true, type: true, parentId: true, latencyWarnMs: true },
    });
  }

  const sim: SimNode[] = nodes.map((n) => ({
    ...n,
    // ISP tulang punggung → cepat (5–15ms). ATM di ujung → lebih lambat (20–60ms).
    base: n.type === "ISP" ? 5 + (hash(n.name) % 100) / 10 : 20 + (hash(n.name) % 400) / 10,
  }));
  const byId = new Map(sim.map((n) => [n.id, n]));

  // ── 2. Bersihkan riwayat lama (idempoten) ──
  const ids = sim.map((n) => n.id);
  await db.pingResult.deleteMany({ where: { nodeId: { in: ids } } });
  await db.pingHourly.deleteMany({ where: { nodeId: { in: ids } } });
  await db.statusEvent.deleteMany({ where: { nodeId: { in: ids } } });
  console.log(`✓ hapus riwayat lama ${ids.length} node.`);

  // ── 3. Tanam insiden ──
  const rnd = mulberry32(42);
  const now = Date.now();
  const rawStart = now - RAW_HOURS * 3600e3;
  const incidents: Incident[] = [];

  // (a) 1 ISP mati ±3 jam → ini yang bikin ATM di bawahnya UNREACHABLE.
  //     Inilah seluruh alasan aplikasi ini dibuat (CLAUDE.md §5).
  const ispDown = isps.length > 0 ? sim.find((n) => n.id === isps[0].id)! : null;
  if (ispDown) {
    const start = rawStart + 6 * 3600e3;
    incidents.push({ nodeId: ispDown.id, start, end: start + 3 * 3600e3 });
  }

  // (b) 3 ATM mati sendiri 20–90 menit → DOWN sungguhan (yang boleh kirim alert).
  const atms = sim.filter((n) => n.type !== "ISP" && n.parentId !== ispDown?.id);
  for (let i = 0; i < Math.min(3, atms.length); i++) {
    const start = rawStart + (2 + i * 5) * 3600e3;
    incidents.push({ nodeId: atms[i].id, start, end: start + (20 + rnd() * 70) * 60e3 });
  }

  // Node lambat: latency dikali 4 selama 1–2 jam → tembus latencyWarnMs → WARNING.
  const slow = new Map<string, { start: number; end: number }>();
  for (let i = 3; i < Math.min(6, atms.length); i++) {
    const start = rawStart + (4 + i * 3) * 3600e3;
    slow.set(atms[i].id, { start, end: start + (1 + rnd()) * 3600e3 });
  }

  const downAt = (nodeId: string, t: number) =>
    incidents.some((x) => x.nodeId === nodeId && t >= x.start && t < x.end);

  // Ancestor mati? Telusuri ke atas (CLAUDE.md §5 langkah 4).
  const ancestorDownAt = (n: SimNode, t: number) => {
    let p = n.parentId ? byId.get(n.parentId) : undefined;
    const seen = new Set<string>();
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      if (downAt(p.id, t)) return true;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return false;
  };

  // ── 4. Bangkitkan PingResult (24 jam) + StatusEvent + PingHourly (24 jam) ──
  const pings: {
    nodeId: string;
    ts: Date;
    isAlive: boolean;
    latencyMs: number | null;
    lossPct: number;
  }[] = [];
  const hourlies: {
    nodeId: string;
    hour: Date;
    avgLatency: number | null;
    maxLatency: number | null;
    uptimePct: number;
  }[] = [];
  const events: { nodeId: string; from: Status; to: Status; ts: Date; rootCause: string | null }[] =
    [];
  const lastOf = new Map<string, { status: Status; latency: number | null; ts: Date }>();
  const ticks = (RAW_HOURS * 3600) / TICK_SEC;

  for (const n of sim) {
    const r = mulberry32(hash(n.name));
    let prev: Status = Status.UNKNOWN;
    // akumulator per jam
    let hourKey = -1;
    let sum = 0,
      cnt = 0,
      max = 0,
      ok = 0,
      total = 0;

    const flushHour = () => {
      if (total === 0) return;
      hourlies.push({
        nodeId: n.id,
        hour: new Date(hourKey),
        avgLatency: cnt > 0 ? Math.round((sum / cnt) * 10) / 10 : null,
        maxLatency: cnt > 0 ? max : null,
        uptimePct: Math.round((ok / total) * 1000) / 10,
      });
      sum = 0;
      cnt = 0;
      max = 0;
      ok = 0;
      total = 0;
    };

    for (let i = 0; i < ticks; i++) {
      const t = rawStart + i * TICK_SEC * 1000;
      const hk = Math.floor(t / 3600e3) * 3600e3;
      if (hk !== hourKey) {
        flushHour();
        hourKey = hk;
      }

      const selfDown = downAt(n.id, t);
      const ancDown = ancestorDownAt(n, t);
      const alive = !selfDown && !ancDown;
      let latency: number | null = null;
      if (alive) {
        latency = latencyAt(n, t, r);
        const sl = slow.get(n.id);
        if (sl && t >= sl.start && t < sl.end) latency = Math.round(latency * 4 * 10) / 10;
      } else {
        r(); // tetap tarik PRNG supaya deret acaknya tak bergeser
      }

      const status = deriveStatus(alive, latency, n.latencyWarnMs, ancDown);
      if (status !== prev) {
        // rootCause: ISP penyebab, hanya diisi saat UNREACHABLE (CLAUDE.md §5).
        let rootCause: string | null = null;
        if (status === Status.UNREACHABLE) {
          let p = n.parentId ? byId.get(n.parentId) : undefined;
          while (p) {
            if (downAt(p.id, t)) {
              rootCause = p.id;
              break;
            }
            p = p.parentId ? byId.get(p.parentId) : undefined;
          }
        }
        events.push({ nodeId: n.id, from: prev, to: status, ts: new Date(t), rootCause });
        prev = status;
      }

      pings.push({
        nodeId: n.id,
        ts: new Date(t),
        isAlive: alive,
        latencyMs: latency,
        lossPct: alive ? 0 : 100,
      });
      total++;
      if (alive) {
        ok++;
        if (latency != null) {
          sum += latency;
          cnt++;
          max = Math.max(max, latency);
        }
      }
      lastOf.set(n.id, { status, latency, ts: new Date(t) });
    }
    flushHour();
  }

  // ── 5. PingHourly hari ke-2..30 ──
  // Data mentahnya TIDAK dibuat: retensi raw cuma 7 hari (CLAUDE.md §8), jadi
  // hari-hari lama memang seharusnya hanya tersisa agregatnya.
  for (const n of sim) {
    const r = mulberry32(hash(n.name) ^ 0x9e3779b9);
    for (let h = RAW_HOURS; h < HOURLY_DAYS * 24; h++) {
      const t = now - h * 3600e3;
      const hour = new Date(Math.floor(t / 3600e3) * 3600e3);
      // Gangguan sesekali (~2% jam) supaya uptime tidak selalu 100%.
      const glitch = r() < 0.02;
      const avg = latencyAt(n, t, r);
      hourlies.push({
        nodeId: n.id,
        hour,
        avgLatency: glitch ? null : avg,
        maxLatency: glitch ? null : Math.round(avg * (1.2 + r() * 0.5) * 10) / 10,
        uptimePct: glitch ? Math.round(r() * 60 * 10) / 10 : 100,
      });
    }
  }

  // ── 6. Tulis batch ──
  for (let i = 0; i < pings.length; i += BATCH)
    await db.pingResult.createMany({ data: pings.slice(i, i + BATCH) });
  for (let i = 0; i < hourlies.length; i += BATCH)
    await db.pingHourly.createMany({ data: hourlies.slice(i, i + BATCH), skipDuplicates: true });
  await db.statusEvent.createMany({ data: events });

  // ── 7. Selaraskan kolom cache di Node ──
  // Kalau tidak, tabel & canvas bilang UP sementara grafiknya putus.
  await Promise.all(
    sim.map((n) => {
      const l = lastOf.get(n.id)!;
      return db.node.update({
        where: { id: n.id },
        data: { status: l.status, lastLatency: l.latency, lastCheckAt: l.ts, lastChangeAt: l.ts },
      });
    }),
  );

  // ── 8. Self-check: yang paling penting HARUS terbukti ──
  const unreach = events.filter((e) => e.to === Status.UNREACHABLE);
  const down = events.filter((e) => e.to === Status.DOWN);
  if (ispDown) {
    const korban = new Set(unreach.map((e) => e.nodeId)).size;
    if (korban === 0)
      throw new Error("BUG: ISP mati tapi tak ada satu pun UNREACHABLE — root-cause tidak jalan.");
    // Satu korban = demo root-cause tak meyakinkan (pernah kejadian: ATM dibagi
    // rata ke 28 ISP → tiap ISP cuma punya 1 anak). Gagalkan, jangan diam saja.
    if (korban < 2)
      throw new Error(
        `BUG: ISP mati cuma menyeret ${korban} node — percabangan terlalu tipis untuk uji root-cause.`,
      );
    if (unreach.some((e) => e.rootCause !== ispDown.id))
      throw new Error("BUG: ada UNREACHABLE yang rootCause-nya bukan ISP yang mati.");
  }
  if (down.length === 0) throw new Error("BUG: tak ada satu pun DOWN — insiden tidak tertanam.");

  console.log(
    `✓ ${pings.length} PingResult, ${hourlies.length} PingHourly, ${events.length} StatusEvent.`,
  );
  if (ispDown) {
    const korban = new Set(unreach.map((e) => e.nodeId)).size;
    const jam = new Date(incidents[0].start).toLocaleString("id-ID");
    console.log(
      `✓ insiden: ISP "${ispDown.name}" mati ${jam} (±3 jam) → ${korban} node UNREACHABLE.`,
    );
  }
  console.log(
    `✓ ${down.length} transisi DOWN (ini yang boleh kirim alert), ${unreach.length} transisi UNREACHABLE (tidak boleh alert).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
