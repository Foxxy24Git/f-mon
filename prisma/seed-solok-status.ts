// Seed SIMULASI status Solok — hanya mengubah STATUS, tidak menyentuh
// posisi/ikon/parent (jadi layout canvas yang sudah Fx atur tetap aman).
//
// Cara kerja: bikin hasil ping PALSU (sebagian gagal), lalu serahkan ke
// computeStatuses() dari src/lib/status.ts — logika DOWN vs UNREACHABLE yang
// asli, bukan ditebak di sini. Jadi tampilannya persis seperti kalau worker
// beneran menemukan ISP mati.
//
// Jalankan: npm run seed:solok-status

import { PrismaClient } from "@prisma/client";
import { computeStatuses, type Ping } from "../src/lib/status";

const db = new PrismaClient();

// Node yang sengaja dibuat GAGAL ping (nama sesuai seed Solok).
// - P SUMAT        : ISP dengan 7 anak ATM. Anak-anaknya ikut gagal ping
//                    (otomatis, lihat di bawah) → mereka jadi UNREACHABLE,
//                    P SUMAT sendiri yang DOWN = pelakunya.
// - 060004, 060102 : ATM mati sendiri padahal parent-nya UP → DOWN asli.
// - SS KOTA        : ISP tanpa anak → DOWN.
const MATI = ["P SUMAT", "060004", "060102", "SS KOTA"];
// Node yang hidup tapi latensi tinggi → WARNING.
// Jangan pakai node yang punya anak, nanti anaknya ikut jadi UNREACHABLE.
const LEMOT = ["CABANG", "060011", "SS KBPT"];

async function main() {
  const map = await db.map.findUnique({ where: { slug: "default" } });
  if (!map) throw new Error('map "default" tidak ada — jalankan seed Solok dulu');

  const nodes = await db.node.findMany({
    where: { mapId: map.id },
    select: {
      id: true,
      name: true,
      parentId: true,
      enabled: true,
      latencyWarnMs: true,
      status: true,
    },
  });

  // Kalau ISP mati, semua ATM di bawahnya ikut gagal ping — itu yang bikin
  // mereka UNREACHABLE (korban), bukan DOWN. Kumpulkan turunannya di sini.
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const namaMati = new Set(MATI);
  const gagal = new Set<string>();
  for (const n of nodes) {
    for (let cur = n; ; ) {
      if (namaMati.has(cur.name)) {
        gagal.add(n.id);
        break;
      }
      const p = cur.parentId ? byId.get(cur.parentId) : null;
      if (!p) break;
      cur = p;
    }
  }

  const pings = new Map<string, Ping>();
  for (const n of nodes) {
    if (gagal.has(n.id)) {
      pings.set(n.id, { isAlive: false, latencyMs: null, lossPct: 100 });
    } else if (LEMOT.includes(n.name)) {
      pings.set(n.id, { isAlive: true, latencyMs: 350, lossPct: 0 });
    } else {
      pings.set(n.id, { isAlive: true, latencyMs: 5 + Math.random() * 40, lossPct: 0 });
    }
  }

  const hasil = computeStatuses(nodes, pings);
  const now = new Date();

  for (const n of nodes) {
    const { status, rootCause } = hasil.get(n.id)!;
    const p = pings.get(n.id)!;
    await db.node.update({
      where: { id: n.id },
      data: {
        status,
        lastLatency: p.isAlive ? Math.round((p.latencyMs ?? 0) * 10) / 10 : null,
        lastCheckAt: now,
        lastChangeAt: n.status === status ? undefined : now,
      },
    });
    if (n.status !== status) {
      await db.statusEvent.create({
        data: { nodeId: n.id, from: n.status, to: status, ts: now, rootCause },
      });
    }
  }

  const hitung: Record<string, number> = {};
  for (const { status } of hasil.values()) hitung[status] = (hitung[status] ?? 0) + 1;
  console.log("✓ status Solok disimulasikan:", hitung);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
