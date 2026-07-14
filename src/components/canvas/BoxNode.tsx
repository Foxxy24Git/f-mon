"use client";

// Kotak penanda daerah (mis. PAYAKUMBUH, BUKITTINGGI). DEKORATIF MURNI —
// bukan Node, tidak ikut root-cause/ping. Render di BELAKANG device node
// (zIndex rendah diset saat konversi di TopologyCanvas) supaya jadi latar.
// Resize pakai <NodeResizer> bawaan @xyflow/react (hanya muncul saat terpilih).
// Persist ukuran/posisi hasil resize di-PATCH langsung ke /api/annotations.
import { memo } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";

export type BoxNodeData = { text: string; color: string; fontSize: number; width: number; height: number };

// hex "#rrggbb" → rgba dengan alpha, untuk isi kotak yang transparan.
function withAlpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function BoxNode({ id, data, selected }: NodeProps) {
  const d = data as BoxNodeData;
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={60}
        color={d.color}
        onResizeEnd={(_e, p) => {
          // simpan posisi + ukuran baru; resize dari sisi atas/kiri ikut geser posisi.
          fetch(`/api/annotations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ posX: p.x, posY: p.y, width: p.width, height: p.height }),
          });
        }}
      />
      <div
        className="h-full w-full rounded-md select-none"
        style={{ border: `2px solid ${d.color}`, background: withAlpha(d.color, 0.1) }}
      >
        <div
          className="px-2 py-1 font-bold tracking-wide uppercase"
          style={{ color: d.color, fontSize: d.fontSize }}
        >
          {d.text}
        </div>
      </div>
    </>
  );
}

export default memo(BoxNode);
