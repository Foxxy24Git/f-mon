import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DELETE /api/edges/:id → hapus garis (mis. user salah gambar lalu tekan Backspace).
// Tanpa ini, garis salah gambar akan muncul lagi setiap refresh.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.edge.delete({ where: { id } }).catch(() => {}); // sudah terhapus? abaikan
  return NextResponse.json({ ok: true });
}
