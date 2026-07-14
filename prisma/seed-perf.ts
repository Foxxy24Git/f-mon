// Seed KHUSUS uji performa canvas: 100 node tersebar acak di area 10.000×10.000
// (CLAUDE.md §6 target 500+ node — 100 sudah cukup untuk cek pan/zoom halus).
// Map terpisah slug "perf" agar tidak mencampuri data "default".
// Idempoten: posisi hanya di-set saat create (upsert by ipAddress) → re-run stabil.
//
// Jalankan: npx tsx prisma/seed-perf.ts   → buka /map/perf
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const COUNT = 100;
const AREA = 10000;

async function main() {
  const map = await db.map.upsert({
    where: { slug: "perf" },
    update: {},
    create: { name: "Perf Test", slug: "perf" },
  });

  for (let i = 1; i <= COUNT; i++) {
    // 100 IP unik di TEST-NET-2 (198.51.100.0/24, RFC 5737) — aman, tak routable.
    const ip = `198.51.100.${i}`;
    await db.node.upsert({
      where: { ipAddress: ip },
      update: { mapId: map.id },
      create: {
        name: `Node-${i}`,
        ipAddress: ip,
        type: "ATM",
        mapId: map.id,
        posX: Math.round(Math.random() * AREA),
        posY: Math.round(Math.random() * AREA),
      },
    });
  }

  console.log(`✓ seed perf selesai (${COUNT} node di /map/perf).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
