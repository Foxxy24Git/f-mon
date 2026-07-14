"use client";

// Custom edge React Flow — garis DEKORATIF yang digambar user (CLAUDE.md §6).
// PENTING: edge di sini TIDAK ada hubungannya dengan relasi parent-child.
// Relasi parent diatur terpisah di PropertyPanel (fase berikutnya).
//
// Yang bisa diatur per-edge (disimpan di data, sumbernya kolom Edge di DB):
// - lineType: straight | step | smoothstep | bezier
// - color, width, label, animated
//
// Warna otomatis mengikuti status: kalau salah satu ujung node TIDAK UP,
// garis jadi pudar + putus-putus (opacity turun, strokeDasharray). Status
// realtime diambil dari Zustand (di-patch SSE), jadi cuma edge terkait yang
// re-render saat status berubah — bukan seluruh canvas.
import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  Position,
  type EdgeProps,
  type InternalNode,
  type Node,
} from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";

export type LinkEdgeData = {
  lineType?: string; // straight | step | smoothstep | bezier
  color?: string;
  width?: number;
  label?: string;
};

// ── Floating edge (pola standar React Flow) ──
// Garis TIDAK menempel ke handle tetap, tapi ke titik di batas node yang
// MENGHADAP node lawan. Jadi garis selalu rapi & ikut menyesuaikan saat node
// digeser (bukan memaksa ke sisi tertentu yang bikin garis melengkung jelek).
function getNodeIntersection(node: InternalNode<Node>, other: InternalNode<Node>) {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const x2 = node.internals.positionAbsolute.x + w;
  const y2 = node.internals.positionAbsolute.y + h;
  const x1 = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2;
  const y1 = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function edgeSide(node: InternalNode<Node>, p: { x: number; y: number }): Position {
  const nx = node.internals.positionAbsolute.x;
  const ny = node.internals.positionAbsolute.y;
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  if (Math.round(p.x) <= Math.round(nx) + 1) return Position.Left;
  if (Math.round(p.x) >= Math.round(nx + w) - 1) return Position.Right;
  if (Math.round(p.y) <= Math.round(ny) + 1) return Position.Top;
  return Position.Bottom;
}

// Semua helper mengembalikan [path, labelX, labelY, ...]; kita pakai 3 pertama.
function buildPath(type: string | undefined, p: Parameters<typeof getSmoothStepPath>[0]) {
  switch (type) {
    case "straight":
      return getStraightPath(p);
    case "step":
      return getSmoothStepPath({ ...p, borderRadius: 0 }); // step = smoothstep tanpa sudut membulat
    case "bezier":
      return getBezierPath(p);
    default:
      return getSmoothStepPath(p); // smoothstep (default)
  }
}

function LinkEdge({ id, source, target, data, selected }: EdgeProps) {
  const d = (data ?? {}) as LinkEdgeData;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Status kedua ujung dari store (kalau sudah ter-load). null = anggap normal.
  const srcStatus = useCanvasStore((s) => s.nodes[source]?.status);
  const tgtStatus = useCanvasStore((s) => s.nodes[target]?.status);
  const degraded =
    (srcStatus != null && srcStatus !== "UP") || (tgtStatus != null && tgtStatus !== "UP");

  // Node belum terukur (mis. saat pertama render) → jangan gambar path NaN.
  if (!sourceNode || !targetNode) return null;

  const sp = getNodeIntersection(sourceNode, targetNode);
  const tp = getNodeIntersection(targetNode, sourceNode);
  const [path, labelX, labelY] = buildPath(d.lineType, {
    sourceX: sp.x,
    sourceY: sp.y,
    targetX: tp.x,
    targetY: tp.y,
    sourcePosition: edgeSide(sourceNode, sp),
    targetPosition: edgeSide(targetNode, tp),
  });

  const color = d.color ?? "#64748b";
  const width = d.width ?? 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 1 : width,
          strokeDasharray: degraded ? "6 4" : undefined, // putus-putus kalau ujung tak UP
          opacity: degraded ? 0.4 : 1, // pudar
          filter: selected ? "drop-shadow(0 0 3px #3b82f6)" : undefined,
        }}
      />
      {d.label ? (
        <EdgeLabelRenderer>
          <div
            className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow ring-1 ring-slate-200"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default memo(LinkEdge);
