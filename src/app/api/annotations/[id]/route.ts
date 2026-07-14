import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// PATCH /api/annotations/:id → geser (posX/posY), resize (width/height),
// atau edit tampilan (text/color/fontSize) dari PropertyPanel.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const data: Prisma.AnnotationUpdateInput = {};
  if (b.posX !== undefined) data.posX = b.posX;
  if (b.posY !== undefined) data.posY = b.posY;
  if (b.width !== undefined) data.width = b.width;
  if (b.height !== undefined) data.height = b.height;
  if (b.text !== undefined) data.text = String(b.text);
  if (b.color !== undefined) data.color = b.color;
  if (b.fontSize !== undefined) data.fontSize = b.fontSize;

  try {
    const ann = await db.annotation.update({ where: { id }, data });
    return NextResponse.json(ann);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "Annotation tidak ditemukan" }, { status: 404 });
    throw e;
  }
}

// DELETE /api/annotations/:id → hapus kotak/teks (mis. salah taruh lalu Backspace).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.annotation.delete({ where: { id } }).catch(() => {}); // sudah terhapus? abaikan
  return NextResponse.json({ ok: true });
}
