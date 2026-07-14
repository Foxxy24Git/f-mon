import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const LINE_TYPES = ["straight", "step", "smoothstep", "bezier"];

// PATCH /api/edges/:id → edit tampilan garis dari PropertyPanel
// (tipe garis, warna, tebal, label). Tidak menyentuh relasi parent-child.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const data: Prisma.EdgeUpdateInput = {};
  if (b.lineType !== undefined && LINE_TYPES.includes(b.lineType)) data.lineType = b.lineType;
  if (b.color !== undefined) data.color = b.color;
  if (b.width !== undefined) data.width = b.width;
  if (b.label !== undefined) data.label = b.label?.trim() || null;

  try {
    const edge = await db.edge.update({ where: { id }, data });
    return NextResponse.json(edge);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "Garis tidak ditemukan" }, { status: 404 });
    throw e;
  }
}

// DELETE /api/edges/:id → hapus garis (mis. user salah gambar lalu tekan Backspace).
// Tanpa ini, garis salah gambar akan muncul lagi setiap refresh.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.edge.delete({ where: { id } }).catch(() => {}); // sudah terhapus? abaikan
  return NextResponse.json({ ok: true });
}
