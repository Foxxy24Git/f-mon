// Halaman canvas topologi. Server component: ambil map + node + edge dari DB
// sesuai slug, ubah ke bentuk React Flow, lalu render di TopologyCanvas (client).
import { notFound } from "next/navigation";
import type { Node, Edge } from "@xyflow/react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import TopologyCanvas from "@/components/canvas/TopologyCanvas";
import NodePalette from "@/components/canvas/NodePalette";

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const session = await auth();
  const canEdit = session?.user?.role === "ADMIN"; // mode Edit hanya untuk ADMIN

  const map = await db.map.findUnique({ where: { slug } });
  if (!map) notFound();

  const [dbNodes, dbEdges] = await Promise.all([
    db.node.findMany({
      where: { mapId: map.id },
      select: {
        id: true, name: true, ipAddress: true, posX: true, posY: true,
        icon: true, size: true, labelMode: true, status: true, lastLatency: true,
        parentId: true,
      },
    }),
    db.edge.findMany({ where: { mapId: map.id } }),
  ]);

  const nodes: Node[] = dbNodes.map((n) => ({
    id: n.id,
    type: "device",
    position: { x: n.posX, y: n.posY },
    data: {
      name: n.name,
      ipAddress: n.ipAddress,
      icon: n.icon,
      size: n.size,
      labelMode: n.labelMode,
      status: n.status,
      latency: n.lastLatency,
      parentId: n.parentId, // dipakai PropertyPanel (dropdown parent), bukan visual
    },
  }));

  const edges: Edge[] = dbEdges.map((e) => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    type: "link", // custom LinkEdge; tipe garis asli ada di data.lineType
    animated: e.animated,
    data: { lineType: e.lineType, color: e.color, width: e.width, label: e.label ?? undefined },
  }));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
        <h1 className="text-sm font-semibold">{map.name}</h1>
        <span className="text-xs text-slate-500">{nodes.length} node</span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {canEdit && <NodePalette />}
        <div className="flex-1">
          <TopologyCanvas nodes={nodes} edges={edges} mapId={map.id} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}
