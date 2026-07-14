import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const KINDS = ["BOX", "TEXT"];

// POST /api/annotations → simpan kotak penanda daerah / teks bebas di canvas.
// DEKORATIF MURNI: bukan Node, tidak masuk pohon root-cause / loop ping.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!b?.mapId) return NextResponse.json({ error: "mapId wajib" }, { status: 400 });

  const ann = await db.annotation.create({
    data: {
      mapId: b.mapId,
      ...(KINDS.includes(b.kind) ? { kind: b.kind } : {}),
      // sisanya opsional; kalau kosong pakai default di schema
      ...(b.posX != null ? { posX: b.posX } : {}),
      ...(b.posY != null ? { posY: b.posY } : {}),
      ...(b.width != null ? { width: b.width } : {}),
      ...(b.height != null ? { height: b.height } : {}),
      ...(b.text != null ? { text: b.text } : {}),
      ...(b.color ? { color: b.color } : {}),
      ...(b.fontSize != null ? { fontSize: b.fontSize } : {}),
    },
  });
  return NextResponse.json(ann, { status: 201 });
}
