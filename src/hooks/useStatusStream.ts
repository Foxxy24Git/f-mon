"use client";
// Versi generik dari langganan SSE /api/stream: panggil `onStatus` tiap ada
// perubahan status, tanpa mengikat ke canvasStore. Dipakai dashboard (refetch
// agregat) & halaman detail (update badge node yang sedang dibuka).
// EventSource reconnect otomatis kalau koneksi putus.
import { useEffect, useRef } from "react";
import type { Status } from "@prisma/client";

export function useStatusStream(
  onStatus: (nodeId: string, status: Status, rootCause: string | null) => void,
) {
  // Simpan callback di ref supaya EventSource tidak di-subscribe ulang tiap render.
  const cb = useRef(onStatus);
  cb.current = onStatus;

  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "status") cb.current(m.nodeId, m.status, m.rootCause ?? null);
    };
    es.onerror = () => console.warn("SSE error, mencoba reconnect…");
    return () => es.close();
  }, []);
}
