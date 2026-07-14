// State machine status — INI JANTUNG APLIKASI (CLAUDE.md §5).
// Fungsi di sini MURNI (tidak menyentuh DB), supaya gampang dites.
//
// Aturan status:
//   UP          = ping sukses, latency & loss aman
//   WARNING     = ping sukses tapi latency > threshold ATAU loss 1–99%
//   DOWN        = ping GAGAL dan semua ancestor UP  → benar-benar mati
//   UNREACHABLE = ping GAGAL tapi ada ancestor yang TIDAK UP → korban, bukan pelaku
//   PAUSED      = dimatikan manual (enabled=false)
//   UNKNOWN     = belum ada hasil ping

import type { Status } from "@prisma/client";

export type NodeInput = {
  id: string;
  parentId: string | null;
  enabled: boolean;
  latencyWarnMs: number;
};

export type Ping = { isAlive: boolean; latencyMs: number | null; lossPct: number };

export type Computed = { status: Status; rootCause: string | null };

// Hitung status SEMUA node untuk satu siklus.
// Ditelusuri dari root ke bawah (BFS) supaya saat mengecek anak, status
// ancestor-nya sudah pasti dihitung lebih dulu.
export function computeStatuses(
  nodes: NodeInput[],
  pings: Map<string, Ping>,
): Map<string, Computed> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      const list = children.get(n.parentId);
      if (list) list.push(n.id);
      else children.set(n.parentId, [n.id]);
    } else {
      roots.push(n.id); // tak punya parent (atau parent di luar set) = root
    }
  }

  // Status "diri sendiri" tanpa melihat ancestor.
  function selfStatus(n: NodeInput): Status {
    if (!n.enabled) return "PAUSED";
    const p = pings.get(n.id);
    if (!p) return "UNKNOWN"; // aktif tapi tak ada hasil ping (jarang)
    if (!p.isAlive) return "DOWN"; // sementara — bisa naik jadi UNREACHABLE di bawah
    if (p.lossPct > 0 || (p.latencyMs ?? 0) > n.latencyWarnMs) return "WARNING";
    return "UP";
  }

  const result = new Map<string, Computed>();
  const queue = [...roots];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue; // jaga-jaga kalau parentId membentuk siklus
    seen.add(id);
    const n = byId.get(id)!;
    let status = selfStatus(n);
    let rootCause: string | null = null;

    if (status === "DOWN") {
      // Ping gagal: cari ancestor TERDEKAT yang statusnya bukan UP.
      // Karena BFS dari root, status ancestor sudah ada di `result`.
      let pid = n.parentId;
      while (pid) {
        const anc = result.get(pid);
        if (anc && anc.status !== "UP") {
          status = "UNREACHABLE";
          rootCause = pid; // penyebab = ancestor rusak terdekat
          break;
        }
        pid = byId.get(pid)?.parentId ?? null;
      }
    }

    result.set(id, { status, rootCause });
    for (const c of children.get(id) ?? []) queue.push(c);
  }

  // Node yang tak terjangkau BFS (parentId membentuk siklus) — hitung apa adanya.
  for (const n of nodes) {
    if (!result.has(n.id)) result.set(n.id, { status: selfStatus(n), rootCause: null });
  }
  return result;
}

// ── Anti-flapping (CLAUDE.md §5) ──────────────────────────────────────────
// Status baru baru dianggap SAH setelah `threshold` siklus berturut-turut
// hasilnya sama. State ini disimpan di memory worker antar siklus.

export type FlapState = { candidate: Status; count: number };

// `committed` = status resmi node sekarang (Node.status di DB).
// Return: status yang harus dicommit (bisa = committed artinya belum berubah),
// dan state flap berikutnya (null = reset/tak perlu ditunggu lagi).
export function applyFlap(
  raw: Status,
  committed: Status,
  prev: FlapState | undefined,
  threshold: number,
): { commit: Status; next: FlapState | null } {
  if (raw === committed) return { commit: committed, next: null }; // stabil → reset
  const count = prev && prev.candidate === raw ? prev.count + 1 : 1;
  if (count >= threshold) return { commit: raw, next: null }; // cukup → sah
  return { commit: committed, next: { candidate: raw, count } }; // masih ditunggu
}

// ── Self-check: `npx tsx src/lib/status.ts` ────────────────────────────────
// Membuktikan DOWN vs UNREACHABLE dan anti-flapping tanpa DB.
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SELF-CHECK GAGAL: " + msg);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const nodes: NodeInput[] = [
    { id: "core", parentId: null, enabled: true, latencyWarnMs: 200 },
    { id: "gw", parentId: "core", enabled: false, latencyWarnMs: 200 }, // PAUSED
    { id: "atm1", parentId: "gw", enabled: true, latencyWarnMs: 200 },
    { id: "atmDirect", parentId: "core", enabled: true, latencyWarnMs: 200 },
    { id: "slow", parentId: "core", enabled: true, latencyWarnMs: 200 },
  ];
  const pings = new Map<string, Ping>([
    ["core", { isAlive: true, latencyMs: 5, lossPct: 0 }],
    ["atm1", { isAlive: false, latencyMs: null, lossPct: 100 }],
    ["atmDirect", { isAlive: false, latencyMs: null, lossPct: 100 }],
    ["slow", { isAlive: true, latencyMs: 500, lossPct: 0 }], // di atas threshold
  ]);
  const r = computeStatuses(nodes, pings);
  assert(r.get("core")!.status === "UP", "core harus UP");
  assert(r.get("gw")!.status === "PAUSED", "gw (enabled=false) harus PAUSED");
  // atm1 gagal ping, ancestor terdekat (gw) PAUSED = bukan UP → korban
  assert(r.get("atm1")!.status === "UNREACHABLE", "atm1 harus UNREACHABLE");
  assert(r.get("atm1")!.rootCause === "gw", "rootCause atm1 harus gw");
  // atmDirect gagal ping tapi parent (core) UP → benar-benar mati
  assert(r.get("atmDirect")!.status === "DOWN", "atmDirect harus DOWN");
  assert(r.get("atmDirect")!.rootCause === null, "DOWN tidak punya rootCause");
  assert(r.get("slow")!.status === "WARNING", "slow (latency>200) harus WARNING");

  // Anti-flapping threshold 2: UNKNOWN→DOWN baru sah di siklus ke-2.
  const s1 = applyFlap("DOWN", "UNKNOWN", undefined, 2);
  assert(s1.commit === "UNKNOWN" && s1.next?.count === 1, "flap siklus 1 belum commit");
  const s2 = applyFlap("DOWN", "UNKNOWN", s1.next!, 2);
  assert(s2.commit === "DOWN" && s2.next === null, "flap siklus 2 harus commit DOWN");

  console.log("✓ semua self-check status.ts lulus");
}
