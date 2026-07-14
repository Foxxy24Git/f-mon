"use client";

// Custom node React Flow untuk satu perangkat (CLAUDE.md §6).
// - Icon dari registry (Node.icon).
// - Border + glow sesuai status; DOWN berkedip (animate-pulse).
// - Label 3 mode: NAME | NAME_IP | NAME_IP_LATENCY.
// - 4 handle (top/right/bottom/left), tiap sisi source+target agar garis bebas
//   ditarik dari/ke sisi mana pun. Id handle = "top|right|bottom|left" (sesuai
//   Edge.sourceHandle/targetHandle di schema).
// - React.memo: node ini di-render ratusan kali, jadi hanya re-render kalau
//   field yang mempengaruhi tampilan berubah. Status realtime diambil dari
//   Zustand (di-patch SSE) supaya cukup SATU node yang render saat status ganti.
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Status } from "@prisma/client";
import { iconFor } from "@/lib/icons";
import { useCanvasStore } from "@/store/canvasStore";

export type DeviceNodeData = {
  name: string;
  ipAddress: string;
  icon: string;
  size: number;
  labelMode: string; // NAME | NAME_IP | NAME_IP_LATENCY
  status: Status;
  latency?: number | null;
};

// warna border+glow per status. ring = border, glow = boxShadow.
const STATUS_STYLE: Record<Status, { ring: string; glow: string; blink: boolean }> = {
  UP: { ring: "#16a34a", glow: "rgba(22,163,74,0.5)", blink: false },
  WARNING: { ring: "#ca8a04", glow: "rgba(202,138,4,0.6)", blink: false },
  DOWN: { ring: "#dc2626", glow: "rgba(220,38,38,0.7)", blink: true },
  UNREACHABLE: { ring: "#94a3b8", glow: "rgba(148,163,184,0.5)", blink: false },
  PAUSED: { ring: "#2563eb", glow: "rgba(37,99,235,0.5)", blink: false },
  UNKNOWN: { ring: "#cbd5e1", glow: "rgba(203,213,225,0.4)", blink: false },
};

const HANDLE_STYLE = { width: 8, height: 8, background: "#64748b" } as const;
const SIDES = [
  { id: "top", pos: Position.Top },
  { id: "right", pos: Position.Right },
  { id: "bottom", pos: Position.Bottom },
  { id: "left", pos: Position.Left },
] as const;

function labelText(d: DeviceNodeData, status: Status): string {
  if (d.labelMode === "NAME") return d.name;
  if (d.labelMode === "NAME_IP_LATENCY") {
    const ms = status === "UP" || status === "WARNING" ? d.latency : null;
    return `${d.name}\n${d.ipAddress}${ms != null ? ` · ${Math.round(ms)}ms` : ""}`;
  }
  return `${d.name}\n${d.ipAddress}`; // NAME_IP (default)
}

function DeviceNode({ id, data, selected }: NodeProps) {
  const d = data as DeviceNodeData;
  // Status realtime dari store (SSE) kalau ada; kalau belum ter-load pakai data awal.
  const liveStatus = useCanvasStore((s) => s.nodes[id]?.status);
  const status = liveStatus ?? d.status;
  const st = STATUS_STYLE[status];
  const { Icon } = iconFor(d.icon);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {SIDES.map((s) => (
        // dua handle per sisi (source+target), id sama → garis bisa dari/ke sisi ini.
        <div key={s.id}>
          <Handle type="target" id={s.id} position={s.pos} style={HANDLE_STYLE} />
          <Handle type="source" id={s.id} position={s.pos} style={HANDLE_STYLE} />
        </div>
      ))}

      <div
        className={`flex items-center justify-center rounded-xl bg-white ${st.blink ? "animate-pulse" : ""}`}
        style={{
          width: d.size,
          height: d.size,
          border: `3px solid ${st.ring}`,
          boxShadow: `0 0 0 ${selected ? "3px #3b82f6, 0 0 12px 2px" : "0px "}${st.glow}`,
        }}
      >
        <Icon size={Math.round(d.size * 0.55)} color={st.ring} strokeWidth={1.75} />
      </div>

      <div className="max-w-[140px] whitespace-pre text-center text-[11px] leading-tight font-medium text-slate-700">
        {labelText(d, status)}
      </div>
    </div>
  );
}

// Re-render hanya kalau field tampilan berubah. Status realtime ditangani
// selector Zustand di dalam komponen, jadi tak perlu dibandingkan di sini.
export default memo(DeviceNode, (a, b) => {
  const x = a.data as DeviceNodeData;
  const y = b.data as DeviceNodeData;
  return (
    a.selected === b.selected &&
    x.name === y.name &&
    x.ipAddress === y.ipAddress &&
    x.icon === y.icon &&
    x.size === y.size &&
    x.labelMode === y.labelMode &&
    x.status === y.status &&
    x.latency === y.latency
  );
});
