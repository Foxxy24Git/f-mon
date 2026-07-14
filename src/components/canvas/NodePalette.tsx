"use client";

// Sidebar palette (CLAUDE.md §6): daftar icon yang bisa di-drag ke canvas
// untuk membuat node baru. Drag native HTML5 — key icon dikirim lewat
// dataTransfer, TopologyCanvas yang menangani onDrop.
import { ICONS } from "@/lib/icons";

export const DND_MIME = "application/f-mon-icon";

export default function NodePalette() {
  return (
    <aside className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-2">
      <p className="px-1 pb-2 text-xs font-semibold text-slate-500">
        Drag ke canvas
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ICONS.map(({ key, label, Icon }) => (
          <div
            key={key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_MIME, key);
              e.dataTransfer.effectAllowed = "move";
            }}
            title={label}
            className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-blue-400 hover:text-blue-600 active:cursor-grabbing"
          >
            <Icon size={22} strokeWidth={1.75} />
            <span className="text-[10px] leading-none">{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
