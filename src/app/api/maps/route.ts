import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/maps  → daftar map untuk dropdown di form node & kolom tabel.
export async function GET() {
  const maps = await db.map.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return NextResponse.json(maps);
}

// POST /api/maps  → bikin map baru. Slug di-generate dari nama supaya URL /map/[slug] rapi.
export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Nama map wajib diisi" }, { status: 400 });
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) return NextResponse.json({ error: "Nama map tidak valid" }, { status: 400 });

  // Slug unik di schema → tangkap duplikat, jangan sampai 500.
  if (await db.map.findUnique({ where: { slug }, select: { id: true } })) {
    return NextResponse.json({ error: `Map "${slug}" sudah ada` }, { status: 409 });
  }
  const map = await db.map.create({
    data: { name: name.trim(), slug },
    select: { id: true, name: true, slug: true },
  });
  return NextResponse.json(map, { status: 201 });
}
