"use client";

// Teks bebas di canvas (judul, catatan). DEKORATIF MURNI, sekelas BoxNode.
// Auto-tinggi; lebar dibatasi data.width sebagai batas wrap. Tidak perlu
// resizer — teks menyesuaikan isinya. Edit isi/warna/ukuran lewat PropertyPanel.
import { memo } from "react";
import { type NodeProps } from "@xyflow/react";

export type TextNodeData = { text: string; color: string; fontSize: number; width: number };

function TextNode({ data }: NodeProps) {
  const d = data as TextNodeData;
  return (
    <div
      className="font-semibold whitespace-pre-wrap select-none"
      style={{ color: d.color, fontSize: d.fontSize, maxWidth: d.width }}
    >
      {d.text}
    </div>
  );
}

export default memo(TextNode);
