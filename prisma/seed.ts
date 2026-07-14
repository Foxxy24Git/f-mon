// Seed dummy untuk menguji logika root-cause (CLAUDE.md §5, Fase 1 langkah 3).
// Topologi kecil tapi cukup membuktikan DOWN vs UNREACHABLE:
//
//   core (127.0.0.1, UP)
//   ├── gw-padang (192.0.2.1)  ← DIPAUSE (enabled=false)
//   │   ├── atm-padang-1 (192.0.2.11, mati)  → harusnya UNREACHABLE (penyebab: gw)
//   │   └── atm-padang-2 (192.0.2.12, mati)  → harusnya UNREACHABLE (penyebab: gw)
//   └── atm-pusat-1 (192.0.2.50, mati)       → harusnya DOWN (parent core UP)
//
// 127.0.0.1 = loopback (selalu balas). 192.0.2.0/24 = TEST-NET-1 (RFC 5737),
// tidak pernah routable → pasti "mati" saat di-ping. Idempoten: upsert by IP.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const map = await db.map.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "Default", slug: "default" },
  });

  // Urutan penting: parent dibuat dulu agar parentId bisa direferensikan.
  const core = await upsertNode({
    name: "Core Router Pusat",
    ipAddress: "127.0.0.1",
    type: "ROUTER",
    mapId: map.id,
  });
  const gw = await upsertNode({
    name: "Gateway Padang",
    ipAddress: "192.0.2.1",
    type: "GATEWAY",
    mapId: map.id,
    parentId: core.id,
    enabled: false, // dipause manual → memicu UNREACHABLE pada anak-anaknya
  });
  await upsertNode({
    name: "ATM Padang-1",
    ipAddress: "192.0.2.11",
    type: "ATM",
    mapId: map.id,
    parentId: gw.id,
  });
  await upsertNode({
    name: "ATM Padang-2",
    ipAddress: "192.0.2.12",
    type: "ATM",
    mapId: map.id,
    parentId: gw.id,
  });
  await upsertNode({
    name: "ATM Pusat-1",
    ipAddress: "192.0.2.50",
    type: "ATM",
    mapId: map.id,
    parentId: core.id,
  });

  console.log("✓ seed selesai (5 node).");
}

type NodeSeed = {
  name: string;
  ipAddress: string;
  type: "ROUTER" | "GATEWAY" | "ATM" | "SWITCH" | "SERVER" | "BRANCH" | "ISP" | "OTHER";
  mapId: string;
  parentId?: string;
  enabled?: boolean;
};

function upsertNode(n: NodeSeed) {
  const data = {
    name: n.name,
    type: n.type,
    mapId: n.mapId,
    parentId: n.parentId ?? null,
    enabled: n.enabled ?? true,
  };
  return db.node.upsert({
    where: { ipAddress: n.ipAddress },
    update: data,
    create: { ipAddress: n.ipAddress, ...data },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
