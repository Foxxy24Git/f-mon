import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const LINE_TYPES = ["straight", "step", "smoothstep", "bezier"];

// POST /api/edges → simpan garis DEKORATIF yang digambar user di canvas.
// Ini BUKAN relasi parent-child (itu diatur lewat Node.parentId di PropertyPanel).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (!b?.sourceId || !b?.targetId)
    return NextResponse.json({ error: "sourceId & targetId wajib" }, { status: 400 });
  if (!b?.mapId) return NextResponse.json({ error: "mapId wajib" }, { status: 400 });

  const edge = await db.edge.create({
    data: {
      mapId: b.mapId,
      sourceId: b.sourceId,
      targetId: b.targetId,
      sourceHandle: b.sourceHandle ?? null,
      targetHandle: b.targetHandle ?? null,
      // properti tampilan opsional; kalau kosong pakai default di schema
      ...(LINE_TYPES.includes(b.lineType) ? { lineType: b.lineType } : {}),
      ...(b.color ? { color: b.color } : {}),
      ...(b.width != null ? { width: b.width } : {}),
      ...(b.label ? { label: b.label } : {}),
      ...(b.animated != null ? { animated: b.animated } : {}),
    },
  });
  return NextResponse.json(edge, { status: 201 });
}
