import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db, getDefaultMapId } from "@/lib/db";
import { validateNode } from "@/lib/nodes";

// GET /api/nodes?search=&status=&region=  → daftar node (dengan filter)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim();
  const status = sp.get("status")?.trim();
  const region = sp.get("region")?.trim();

  const where: Prisma.NodeWhereInput = {};
  if (status) where.status = status as Prisma.NodeWhereInput["status"];
  if (region) where.region = { contains: region, mode: "insensitive" };
  if (search)
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search } },
    ];

  const nodes = await db.node.findMany({
    where,
    orderBy: { name: "asc" },
    include: { parent: { select: { id: true, name: true } } },
  });
  return NextResponse.json(nodes);
}

// POST /api/nodes  → buat node baru
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const err = validateNode(b);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const node = await db.node.create({
      data: {
        // id opsional: dipakai fitur undo agar node yang dihapus kembali dengan
        // id semula (garis/edge yang menunjuk ke id ini tetap valid).
        ...(b.id ? { id: b.id } : {}),
        name: b.name.trim(),
        ipAddress: b.ipAddress.trim(),
        type: b.type ?? "ATM",
        region: b.region?.trim() || null,
        branch: b.branch?.trim() || null,
        parentId: b.parentId || null,
        intervalSec: b.intervalSec ?? 30,
        latencyWarnMs: b.latencyWarnMs ?? 200,
        enabled: b.enabled ?? true,
        mapId: b.mapId || (await getDefaultMapId()),
        // posisi & icon dari drag-drop canvas (opsional; default di schema)
        ...(b.posX != null ? { posX: b.posX } : {}),
        ...(b.posY != null ? { posY: b.posY } : {}),
        ...(b.icon ? { icon: b.icon } : {}),
        ...(b.size != null ? { size: b.size } : {}),
        ...(b.labelMode ? { labelMode: b.labelMode } : {}),
      },
    });
    return NextResponse.json(node, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "IP sudah dipakai node lain" }, { status: 409 });
    throw e;
  }
}
