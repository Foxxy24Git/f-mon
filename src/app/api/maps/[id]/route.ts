import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const BG_TYPES = ["dots", "grid", "plain"];

// PATCH /api/maps/[id]  → ganti nama / background.
// Slug SENGAJA tidak ikut berubah saat nama diganti: slug itu URL /map/[slug],
// kalau ikut berubah semua link & bookmark yang sudah ada langsung mati.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const data: Prisma.MapUpdateInput = {};
  if (b.name !== undefined) {
    if (typeof b.name !== "string" || !b.name.trim())
      return NextResponse.json({ error: "Nama map wajib diisi" }, { status: 400 });
    data.name = b.name.trim();
  }
  if (b.bgType !== undefined) {
    if (!BG_TYPES.includes(b.bgType))
      return NextResponse.json({ error: "Background tidak valid" }, { status: 400 });
    data.bgType = b.bgType;
  }

  try {
    return NextResponse.json(await db.map.update({ where: { id }, data }));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "Map tidak ditemukan" }, { status: 404 });
    throw e;
  }
}

// DELETE /api/maps/[id]
// Node TIDAK punya FK ke Map (mapId cuma string), jadi tidak ada cascade dari DB.
// Kalau map dihapus sementara masih ada node di dalamnya, node itu jadi yatim:
// tidak muncul di canvas manapun tapi tetap di-ping. Jadi tolak dulu, suruh Fx
// pindahkan node-nya. Edge & annotation aman dihapus — keduanya dekoratif.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const nodeCount = await db.node.count({ where: { mapId: id } });
  if (nodeCount > 0)
    return NextResponse.json(
      { error: `Map masih berisi ${nodeCount} node. Pindahkan dulu node-nya, baru hapus map.` },
      { status: 409 },
    );

  try {
    await db.$transaction([
      db.edge.deleteMany({ where: { mapId: id } }),
      db.annotation.deleteMany({ where: { mapId: id } }),
      db.map.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "Map tidak ditemukan" }, { status: 404 });
    throw e;
  }
}
