// Seed SIMULASI Solok (localhost) — CLAUDE.md Fase 3 (uji canvas).
// Tujuan: mengganti isi canvas "default" dengan node dari peta Solok yang
// Fx kirim: hanya ISP (+) dan ATM (layar), tanpa perangkat lain dulu.
//
// Aturan tipe (karena ikon di gambar tak selalu terbaca jelas):
//   - kode numerik (060xxx / 710xxx) → ATM (ikon "atm")
//   - nama tempat                    → ISP (ikon "isp")
// Fx bisa ubah tipe yang salah lewat PropertyPanel.
//
// Status UP/DOWN diacak (deterministik, ~30% DOWN) — ini simulasi, belum
// di-ping sungguhan. IP dummy dari 10.50.x.x (unik, tak routable) → aman.
// Idempoten: bisa dijalankan ulang; node & edge di map "default" dibersihkan.

import { PrismaClient, Status } from "@prisma/client";

const db = new PrismaClient();

// ── Daftar node dari gambar (dikelompokkan per tipe) ──
const ISP = [
  "SUNGAI LASI", "P SUMAT", "M PANEH", "GDG PROMOSI", "CABANG", "LBK SIKARA",
  "SS KBPT", "PSR SLK", "PAJAK", "SS KOTA", "G TALANG", "SYARIAH", "06BAS",
  "KK RSUD", "RSUD A SUKA", "SAMSAT LAING", "SPBU K R", "TK PUJA", "CAPEM",
  "LBK SILASIH", "SPBU RSUD SLK", "BALAI KT", "PEMKO LAING", "SMA2 SUMBAR",
  "ARO SUKA", "BUPATI AROSUKA", "SAMNAG", "KB SLK",
];
const ATM = [
  "060003", "060004", "060005", "060006", "060007", "060008", "060010",
  "060011", "060012", "060014", "060015", "060016", "060017", "060018",
  "060102", "060113", "710202", "710203", "710204",
];

// LCG kecil biar acak tapi reproducible (tak perlu dependency).
let _s = 1337;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

type Item = { name: string; type: "ISP" | "ATM"; icon: string };

async function main() {
  const map = await db.map.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "Default", slug: "default" },
  });

  // Bersihkan canvas: edge (garis) dulu lalu node. Edge tak punya FK cascade ke
  // Node (lihat schema), jadi kalau node dihapus tanpa ini garisnya jadi yatim.
  await db.edge.deleteMany({ where: { mapId: map.id } });
  const del = await db.node.deleteMany({ where: { mapId: map.id } });
  console.log(`✓ hapus ${del.count} node lama + semua edge di map "default".`);

  const items: Item[] = [
    ...ISP.map((name) => ({ name, type: "ISP" as const, icon: "isp" })),
    ...ATM.map((name) => ({ name, type: "ATM" as const, icon: "atm" })),
  ];

  // Tata letak: grid longgar + jitter → acak tapi tak tumpuk. 8 kolom.
  const COLS = 8, STEP_X = 240, STEP_Y = 210, X0 = 200, Y0 = 160;
  const now = new Date();

  const data = items.map((it, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const posX = X0 + col * STEP_X + (rnd() - 0.5) * 80;
    const posY = Y0 + row * STEP_Y + (rnd() - 0.5) * 80;

    // status acak: ~30% DOWN, sisanya UP (sedikit WARNING kalau latensi tinggi).
    const roll = rnd();
    let status: Status, lastLatency: number | null;
    if (roll < 0.3) {
      status = Status.DOWN;
      lastLatency = null;
    } else {
      lastLatency = Math.round((5 + rnd() * 240) * 10) / 10;
      status = lastLatency > 200 ? Status.WARNING : Status.UP;
    }

    // IP dummy unik: ISP → 10.50.1.x, ATM → 10.50.2.x
    const group = it.type === "ISP" ? 1 : 2;
    const ipAddress = `10.50.${group}.${(i % 250) + 1}`;

    return {
      name: it.name,
      ipAddress,
      type: it.type,
      icon: it.icon,
      region: "Solok",
      mapId: map.id,
      posX, posY,
      status,
      lastLatency,
      lastCheckAt: now,
      lastChangeAt: now,
    };
  });

  await db.node.createMany({ data });
  const up = data.filter((d) => d.status === Status.UP).length;
  const warn = data.filter((d) => d.status === Status.WARNING).length;
  const down = data.filter((d) => d.status === Status.DOWN).length;
  console.log(
    `✓ buat ${data.length} node (${ISP.length} ISP + ${ATM.length} ATM) — ` +
      `UP:${up} WARNING:${warn} DOWN:${down}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
