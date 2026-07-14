// Store canvas (Zustand). Untuk sekarang cukup memegang status tiap node supaya
// bisa di-patch realtime dari SSE TANPA refetch semua node (CLAUDE.md §6).
// Fase canvas nanti menambah posisi, edge, seleksi, dll ke store yang sama.
import { create } from "zustand";
import type { Status } from "@prisma/client";

export type NodeLite = {
  id: string;
  name: string;
  ipAddress: string;
  status: Status;
  rootCause?: string | null;
};

type CanvasState = {
  nodes: Record<string, NodeLite>;
  setNodes: (list: NodeLite[]) => void;
  // Patch SATU node saja. Bikin object nodes baru (biar React tahu ada perubahan),
  // tapi entri node lain memakai referensi lama → komponen yang subscribe ke
  // node lain lewat selector tidak ikut re-render.
  patchStatus: (nodeId: string, status: Status, rootCause?: string | null) => void;
};

export const useCanvasStore = create<CanvasState>((set) => ({
  nodes: {},
  setNodes: (list) =>
    set({ nodes: Object.fromEntries(list.map((n) => [n.id, n])) }),
  patchStatus: (nodeId, status, rootCause) =>
    set((s) => {
      const cur = s.nodes[nodeId];
      // Node tak dikenal (belum di-load) → abaikan, jangan bikin entri parsial.
      if (!cur || (cur.status === status && cur.rootCause === rootCause)) return s;
      return { nodes: { ...s.nodes, [nodeId]: { ...cur, status, rootCause } } };
    }),
}));
