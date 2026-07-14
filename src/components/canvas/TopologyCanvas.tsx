"use client";

// Wrapper React Flow untuk canvas topologi (CLAUDE.md §6).
// Sekarang pakai custom DeviceNode + drag-drop dari NodePalette untuk membuat
// node baru yang langsung tersimpan ke DB.
import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import DeviceNode from "./DeviceNode";
import LinkEdge from "./LinkEdge";
import NodePalette, { DND_MIME } from "./NodePalette";
import { iconFor } from "@/lib/icons";

// Grid untuk snap. Kanvas React Flow sendiri tak terbatas (§6).
const SNAP_GRID: [number, number] = [16, 16];
// nodeTypes/edgeTypes WAJIB di module scope (referensi stabil) agar React Flow tak warning.
const NODE_TYPES: NodeTypes = { device: DeviceNode };
const EDGE_TYPES: EdgeTypes = { link: LinkEdge };

type Props = {
  nodes: Node[];
  edges: Edge[];
  mapId: string;
};

function Toolbar({ snap, onToggleSnap }: { snap: boolean; onToggleSnap: () => void }) {
  const { fitView } = useReactFlow();
  return (
    <div className="absolute right-3 top-3 z-10 flex gap-2">
      <button
        onClick={() => fitView({ duration: 300 })}
        className="rounded bg-white px-3 py-1.5 text-sm shadow ring-1 ring-slate-300 hover:bg-slate-50"
      >
        Fit to view
      </button>
      <button
        onClick={onToggleSnap}
        className={`rounded px-3 py-1.5 text-sm shadow ring-1 ring-slate-300 hover:bg-slate-50 ${
          snap ? "bg-blue-600 text-white ring-blue-600" : "bg-white"
        }`}
      >
        Snap: {snap ? "ON" : "OFF"}
      </button>
    </div>
  );
}

// Flow harus jadi anak ReactFlowProvider supaya bisa pakai useReactFlow (drop).
function Flow({ nodes, edges, mapId }: Props) {
  const [snap, setSnap] = useState(false);
  const toggleSnap = useCallback(() => setSnap((s) => !s), []);
  const { screenToFlowPosition, addNodes, addEdges } = useReactFlow();

  // User menarik garis dari handle satu node ke handle node lain → simpan ke DB
  // lalu tampilkan. Garis ini DEKORATIF, tidak menyentuh parentId (CLAUDE.md §6).
  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target) return;
      const res = await fetch("/api/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapId,
          sourceId: c.source,
          targetId: c.target,
          sourceHandle: c.sourceHandle,
          targetHandle: c.targetHandle,
        }),
      });
      if (!res.ok) {
        window.alert("Gagal menyimpan garis");
        return;
      }
      const e = await res.json();
      addEdges({
        id: e.id, // pakai id dari DB, bukan id acak → konsisten setelah refresh
        source: e.sourceId,
        target: e.targetId,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        type: "link",
        animated: e.animated,
        data: { lineType: e.lineType, color: e.color, width: e.width, label: e.label ?? undefined },
      });
    },
    [mapId, addEdges],
  );

  // Hapus garis (pilih lalu Backspace) → hapus juga di DB biar tak muncul lagi.
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) fetch(`/api/edges/${e.id}`, { method: "DELETE" });
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const key = e.dataTransfer.getData(DND_MIME);
      if (!key) return;
      const meta = iconFor(key);
      // Posisi drop di koordinat canvas (bukan layar) → node muncul tepat di kursor.
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // ponytail: prompt sementara. Ganti dengan form PropertyPanel saat sudah ada.
      const ipAddress = window.prompt(`IP untuk ${meta.label} baru:`)?.trim();
      if (!ipAddress) return; // batal / kosong

      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${meta.label} ${ipAddress}`,
          ipAddress,
          type: meta.type,
          icon: key,
          mapId,
          posX: pos.x,
          posY: pos.y,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        window.alert(error ?? "Gagal membuat node");
        return;
      }
      const n = await res.json();
      addNodes({
        id: n.id,
        type: "device",
        position: pos,
        data: {
          name: n.name,
          ipAddress: n.ipAddress,
          icon: n.icon,
          size: n.size,
          labelMode: n.labelMode,
          status: n.status,
          latency: n.lastLatency,
        },
      });
    },
    [screenToFlowPosition, addNodes, mapId],
  );

  return (
    <div className="relative h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <Toolbar snap={snap} onToggleSnap={toggleSnap} />
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        minZoom={0.1} // 10%
        maxZoom={3} // 300%
        snapToGrid={snap}
        snapGrid={SNAP_GRID}
        onlyRenderVisibleElements // performa: hanya render yang terlihat (§6)
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export default function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
