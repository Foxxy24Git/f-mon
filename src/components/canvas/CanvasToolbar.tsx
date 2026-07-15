"use client";

// Toolbar canvas (CLAUDE.md §6): mode Edit/View, grid & snap, zoom, indikator
// auto-save, undo/redo, dan Save manual. Dirender di dalam ReactFlowProvider
// supaya bisa memakai useReactFlow (zoom/fit) tanpa prop-drilling.
import { useReactFlow } from "@xyflow/react";
import {
  Pencil,
  Grid3x3,
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo2,
  Redo2,
  Save,
} from "lucide-react";

export type SaveStatus = "saved" | "saving";

type Props = {
  canEdit: boolean; // ADMIN saja; kalau false, tombol mode Edit disembunyikan
  editMode: boolean;
  onToggleMode: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snap: boolean;
  onToggleSnap: () => void;
  saveStatus: SaveStatus;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

function Btn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-blue-600 text-white ring-blue-600 hover:bg-blue-600" : "bg-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function CanvasToolbar(p: Props) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  // Mode View = fokus ke status node: semua tool edit disembunyikan, sisakan
  // tombol untuk kembali ke mode Edit saja.
  if (!p.editMode) {
    if (!p.canEdit) return null; // non-ADMIN: tak ada tombol sama sekali
    return (
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-white/90 p-1 shadow ring-1 ring-slate-200 backdrop-blur">
        <Btn title="Kembali ke mode Edit" onClick={p.onToggleMode}>
          <Pencil size={15} />
          Edit
        </Btn>
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-white/90 p-1 shadow ring-1 ring-slate-200 backdrop-blur">
      <Btn active title="Mode Edit aktif — klik untuk ke mode View" onClick={p.onToggleMode}>
        <Pencil size={15} />
        Edit
      </Btn>
      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Btn active={p.showGrid} title="Grid" onClick={p.onToggleGrid}>
        <Grid3x3 size={15} />
      </Btn>
      <Btn active={p.snap} title="Snap to grid" onClick={p.onToggleSnap}>
        <Magnet size={15} />
      </Btn>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Btn title="Zoom in" onClick={() => zoomIn({ duration: 200 })}>
        <ZoomIn size={15} />
      </Btn>
      <Btn title="Zoom out" onClick={() => zoomOut({ duration: 200 })}>
        <ZoomOut size={15} />
      </Btn>
      <Btn title="Fit to view" onClick={() => fitView({ duration: 300 })}>
        <Maximize size={15} />
      </Btn>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Btn disabled={!p.canUndo} title="Undo (Ctrl+Z)" onClick={p.onUndo}>
        <Undo2 size={15} />
      </Btn>
      <Btn disabled={!p.canRedo} title="Redo (Ctrl+Shift+Z)" onClick={p.onRedo}>
        <Redo2 size={15} />
      </Btn>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <Btn title="Simpan sekarang" onClick={p.onSave}>
        <Save size={15} />
        Save
      </Btn>
      <span
        className={`px-1 text-xs ${p.saveStatus === "saving" ? "text-amber-600" : "text-slate-400"}`}
      >
        {p.saveStatus === "saving" ? "Menyimpan…" : "Tersimpan"}
      </span>
    </div>
  );
}
