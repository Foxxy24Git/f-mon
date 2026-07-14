"use client";
// Halaman percobaan SSE. Bukan bagian UI final — hanya untuk membuktikan bahwa
// perubahan status dari worker sampai ke browser TANPA refresh.
import { useEffect } from "react";
import type { Status } from "@prisma/client";
import { useCanvasStore, type NodeLite } from "@/store/canvasStore";
import { useNodeStatusStream } from "@/hooks/useNodeStatusStream";

const COLOR: Record<Status, string> = {
  UP: "#16a34a",
  WARNING: "#eab308",
  DOWN: "#dc2626",
  UNREACHABLE: "#f97316",
  PAUSED: "#3b82f6",
  UNKNOWN: "#9ca3af",
};

function Badge({ node }: { node: NodeLite }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <span
        style={{
          background: COLOR[node.status],
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 6,
          minWidth: 96,
          textAlign: "center",
        }}
      >
        {node.status}
      </span>
      <span>{node.name}</span>
      <span style={{ color: "#888", fontFamily: "monospace" }}>{node.ipAddress}</span>
      {node.rootCause && (
        <span style={{ color: "#f97316", fontSize: 12 }}>← penyebab: {node.rootCause}</span>
      )}
    </li>
  );
}

export default function StatusTestPage() {
  const nodes = useCanvasStore((s) => s.nodes);
  const setNodes = useCanvasStore((s) => s.setNodes);

  // Load awal sekali. Setelah ini status di-update HANYA lewat SSE.
  useEffect(() => {
    fetch("/api/nodes")
      .then((r) => r.json())
      .then((list: NodeLite[]) => setNodes(list))
      .catch((e) => console.error("gagal load node:", e));
  }, [setNodes]);

  useNodeStatusStream();

  const list = Object.values(nodes).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Uji SSE — status realtime</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        {list.length} node. Jalankan worker; badge berubah warna otomatis saat status berubah
        (tanpa refresh).
      </p>
      <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
        {list.map((n) => (
          <Badge key={n.id} node={n} />
        ))}
      </ul>
    </main>
  );
}
