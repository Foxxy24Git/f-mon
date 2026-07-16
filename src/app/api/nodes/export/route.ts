import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/nodes/export → CSV semua node, format sama persis dengan /api/nodes/import
// supaya hasil export bisa langsung di-import balik saat restore server.
// map_slug/pos_x/pos_y ikut diexport supaya tata letak canvas ikut ke-restore.
const HEADER = "name,ip,type,region,branch,atm_id,parent_ip,icon,map_slug,pos_x,pos_y";

// Quote hanya kalau perlu (ada koma/kutip/newline) — biar file tetap enak dibaca di Excel.
function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const [nodes, maps] = await Promise.all([
    db.node.findMany({
      orderBy: { name: "asc" },
      select: {
        name: true,
        ipAddress: true,
        type: true,
        region: true,
        branch: true,
        atmId: true,
        icon: true,
        mapId: true,
        posX: true,
        posY: true,
        parent: { select: { ipAddress: true } },
      },
    }),
    // Node.mapId tidak punya relasi Prisma ke Map, jadi slug dijoin manual di sini.
    db.map.findMany({ select: { id: true, slug: true } }),
  ]);
  const slugById = new Map(maps.map((m) => [m.id, m.slug]));

  const lines = nodes.map((n) =>
    [
      n.name,
      n.ipAddress,
      n.type,
      n.region,
      n.branch,
      n.atmId,
      n.parent?.ipAddress,
      n.icon,
      slugById.get(n.mapId),
      String(n.posX),
      String(n.posY),
    ]
      .map(csvCell)
      .join(","),
  );

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse([HEADER, ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fmon-nodes-${date}.csv"`,
    },
  });
}
