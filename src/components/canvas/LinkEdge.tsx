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
  type EdgeProps,
} from "@xyflow/react";
import { useCanvasStore } from "@/store/canvasStore";

export type LinkEdgeData = {
  lineType?: string; // straight | step | smoothstep | bezier
  color?: string;
  width?: number;
  label?: string;
};

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

function LinkEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const d = (data ?? {}) as LinkEdgeData;

  // Status kedua ujung dari store (kalau sudah ter-load). null = anggap normal.
  const srcStatus = useCanvasStore((s) => s.nodes[source]?.status);
  const tgtStatus = useCanvasStore((s) => s.nodes[target]?.status);
  const degraded =
    (srcStatus != null && srcStatus !== "UP") || (tgtStatus != null && tgtStatus !== "UP");

  const [path, labelX, labelY] = buildPath(d.lineType, {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
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
