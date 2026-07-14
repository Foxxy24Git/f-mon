"use client";
// Subscribe ke /api/stream (SSE) dan patch status node di canvasStore.
// HANYA node yang statusnya berubah yang di-update — tidak pernah refetch semua
// node (CLAUDE.md §6). EventSource otomatis reconnect kalau koneksi putus.
import { useEffect } from "react";
import { useCanvasStore } from "@/store/canvasStore";

export function useNodeStatusStream() {
  const patchStatus = useCanvasStore((s) => s.patchStatus);

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "status") {
        patchStatus(msg.nodeId, msg.status, msg.rootCause);
      }
    };
    es.onerror = () => {
      // Biarkan EventSource reconnect sendiri; cuma log biar kelihatan saat debug.
      console.warn("SSE error, mencoba reconnect…");
    };
    return () => es.close();
  }, [patchStatus]);
}
