import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidIp } from "@/lib/nodes";

// Next 15: params sekarang Promise, wajib di-await.
type Ctx = { params: Promise<{ id: string }> };

// GET /api/nodes/[id]  → detail node
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const node = await db.node.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true, ipAddress: true, status: true } },
    },
  });
  if (!node) return NextResponse.json({ error: "Node tidak ditemukan" }, { status: 404 });
  return NextResponse.json(node);
}

// PATCH /api/nodes/[id]  → update sebagian field
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  if (b.ipAddress !== undefined && !isValidIp(b.ipAddress))
    return NextResponse.json({ error: "Format IP tidak valid" }, { status: 400 });
  // ponytail: cegah node jadi parent-nya sendiri; deteksi siklus penuh ditunda
  // ke ping worker (Fase 2) yang traversal tree-nya harus defensif juga.
  if (b.parentId && b.parentId === id)
    return NextResponse.json({ error: "Node tidak bisa jadi parent-nya sendiri" }, { status: 400 });

  const data: Prisma.NodeUpdateInput = {};
  if (b.name !== undefined) data.name = b.name.trim();
  if (b.ipAddress !== undefined) data.ipAddress = b.ipAddress.trim();
  if (b.type !== undefined) data.type = b.type;
  if (b.region !== undefined) data.region = b.region?.trim() || null;
  if (b.branch !== undefined) data.branch = b.branch?.trim() || null;
  if (b.intervalSec !== undefined) data.intervalSec = b.intervalSec;
  if (b.latencyWarnMs !== undefined) data.latencyWarnMs = b.latencyWarnMs;
  if (b.enabled !== undefined) data.enabled = b.enabled;
  if (b.parentId !== undefined)
    data.parent = b.parentId ? { connect: { id: b.parentId } } : { disconnect: true };

  try {
    const node = await db.node.update({ where: { id }, data });
    return NextResponse.json(node);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json({ error: "IP sudah dipakai node lain" }, { status: 409 });
      if (e.code === "P2025")
        return NextResponse.json({ error: "Node tidak ditemukan" }, { status: 404 });
    }
    throw e;
  }
}

// DELETE /api/nodes/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    await db.node.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
      return NextResponse.json({ error: "Node tidak ditemukan" }, { status: 404 });
    throw e;
  }
}
