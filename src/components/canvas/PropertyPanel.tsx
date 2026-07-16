"use client";

// Panel properti (CLAUDE.md §6): muncul saat SATU node atau SATU edge terpilih.
// - Node: nama, icon, ukuran, labelMode, dan PARENT (dropdown) — parent inilah
//   yang menentukan logika root-cause, TERPISAH dari garis visual (edge).
// - Edge: tipe garis, warna, tebal, label.
// Panel hanya mengirim perubahan lewat callback; TopologyCanvas yang menyimpan
// ke DB dan mem-patch state canvas.
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import { ICONS } from "@/lib/icons";
import type { DeviceNodeData } from "./DeviceNode";
import type { LinkEdgeData } from "./LinkEdge";

const LABEL_MODES = [
  { v: "NAME", t: "Nama saja" },
  { v: "NAME_IP", t: "Nama + IP" },
  { v: "NAME_ID", t: "Nama + ID" },
  { v: "NAME_IP_LATENCY", t: "Nama + IP + Latency" },
];
const LINE_TYPES = [
  { v: "straight", t: "Lurus" },
  { v: "step", t: "Siku" },
  { v: "smoothstep", t: "Siku halus" },
  { v: "bezier", t: "Lengkung" },
];

type Props = {
  node: Node | null;
  edge: Edge | null;
  allNodes: Node[];
  // patch = field DB (name/icon/size/labelMode/parentId). name kosong = biarkan.
  onUpdateNode: (id: string, patch: Record<string, unknown>) => void;
  onUpdateEdge: (id: string, patch: Record<string, unknown>) => void;
  onUpdateAnnotation: (id: string, patch: Record<string, unknown>) => void;
  onDelete: () => void; // hapus elemen terpilih (node/garis/kotak/teks)
};

const label = "block text-xs font-medium text-slate-500";
const input =
  "mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none";

function NodeForm({ node, allNodes, onUpdate }: {
  node: Node;
  allNodes: Node[];
  onUpdate: Props["onUpdateNode"];
}) {
  const d = node.data as DeviceNodeData;
  // nama pakai state lokal supaya bisa mengetik dulu, commit saat blur.
  const [name, setName] = useState(d.name);
  useEffect(() => setName(d.name), [node.id, d.name]);
  const [atmId, setAtmId] = useState(d.atmId ?? "");
  useEffect(() => setAtmId(d.atmId ?? ""), [node.id, d.atmId]);

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Nama</label>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== d.name && onUpdate(node.id, { name })}
        />
      </div>

      <div>
        <label className={label}>ID ATM</label>
        <input
          className={input}
          value={atmId}
          placeholder="kosongkan kalau bukan ATM"
          onChange={(e) => setAtmId(e.target.value)}
          onBlur={() => atmId !== (d.atmId ?? "") && onUpdate(node.id, { atmId })}
        />
      </div>

      <div>
        <label className={label}>Icon</label>
        <select
          className={input}
          value={d.icon}
          onChange={(e) => onUpdate(node.id, { icon: e.target.value })}
        >
          {ICONS.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Ukuran ({d.size}px)</label>
        <input
          type="range"
          min={32}
          max={96}
          step={4}
          value={d.size}
          onChange={(e) => onUpdate(node.id, { size: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </div>

      <div>
        <label className={label}>Mode label</label>
        <select
          className={input}
          value={d.labelMode}
          onChange={(e) => onUpdate(node.id, { labelMode: e.target.value })}
        >
          {LABEL_MODES.map((m) => (
            <option key={m.v} value={m.v}>
              {m.t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label}>Parent (untuk root-cause)</label>
        <select
          className={input}
          value={(node.data as { parentId?: string | null }).parentId ?? ""}
          onChange={(e) => onUpdate(node.id, { parentId: e.target.value })}
        >
          <option value="">— tidak ada —</option>
          {allNodes
            .filter((n) => n.id !== node.id)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {(n.data as DeviceNodeData).name}
              </option>
            ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-400">
          Parent ≠ garis yang digambar. Ini yang dipakai logika DOWN/UNREACHABLE.
        </p>
      </div>
    </div>
  );
}

function EdgeForm({ edge, onUpdate }: { edge: Edge; onUpdate: Props["onUpdateEdge"] }) {
  const d = (edge.data ?? {}) as LinkEdgeData;
  const [lbl, setLbl] = useState(d.label ?? "");
  useEffect(() => setLbl(d.label ?? ""), [edge.id, d.label]);

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Tipe garis</label>
        <select
          className={input}
          value={d.lineType ?? "smoothstep"}
          onChange={(e) => onUpdate(edge.id, { lineType: e.target.value })}
        >
          {LINE_TYPES.map((t) => (
            <option key={t.v} value={t.v}>
              {t.t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <div>
          <label className={label}>Warna</label>
          <input
            type="color"
            value={d.color ?? "#64748b"}
            onChange={(e) => onUpdate(edge.id, { color: e.target.value })}
            className="mt-1 h-8 w-12 cursor-pointer rounded border border-slate-300"
          />
        </div>
        <div className="flex-1">
          <label className={label}>Tebal ({d.width ?? 2}px)</label>
          <input
            type="range"
            min={1}
            max={8}
            value={d.width ?? 2}
            onChange={(e) => onUpdate(edge.id, { width: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </div>
      </div>

      <div>
        <label className={label}>Label</label>
        <input
          className={input}
          value={lbl}
          onChange={(e) => setLbl(e.target.value)}
          onBlur={() => lbl !== (d.label ?? "") && onUpdate(edge.id, { label: lbl })}
        />
      </div>
    </div>
  );
}

// Form untuk kotak daerah / teks (annotation). Ukuran kotak diatur lewat drag
// resize di canvas, bukan di sini — panel hanya untuk isi, warna, dan font.
function AnnotationForm({ node, onUpdate }: { node: Node; onUpdate: Props["onUpdateAnnotation"] }) {
  const d = node.data as { text: string; color: string; fontSize: number };
  const isBox = node.type === "box";
  const [text, setText] = useState(d.text ?? "");
  useEffect(() => setText(d.text ?? ""), [node.id, d.text]);

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>{isBox ? "Label daerah" : "Isi teks"}</label>
        <textarea
          className={input}
          rows={isBox ? 1 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (d.text ?? "") && onUpdate(node.id, { text })}
        />
      </div>
      <div className="flex items-center gap-2">
        <div>
          <label className={label}>Warna</label>
          <input
            type="color"
            value={d.color ?? "#f97316"}
            onChange={(e) => onUpdate(node.id, { color: e.target.value })}
            className="mt-1 h-8 w-12 cursor-pointer rounded border border-slate-300"
          />
        </div>
        <div className="flex-1">
          <label className={label}>Ukuran font ({d.fontSize ?? 14}px)</label>
          <input
            type="range"
            min={10}
            max={48}
            value={d.fontSize ?? 14}
            onChange={(e) => onUpdate(node.id, { fontSize: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </div>
      </div>
      {isBox && (
        <p className="text-[11px] text-slate-400">Ukuran kotak: tarik sudut/sisinya di canvas.</p>
      )}
    </div>
  );
}

export default function PropertyPanel({ node, edge, allNodes, onUpdateNode, onUpdateEdge, onUpdateAnnotation, onDelete }: Props) {
  if (!node && !edge) return null;
  const isAnn = node?.type === "box" || node?.type === "text";
  const title = isAnn ? (node!.type === "box" ? "Properti Kotak" : "Properti Teks") : node ? "Properti Node" : "Properti Garis";
  const whatToDelete = isAnn ? (node!.type === "box" ? "kotak ini" : "teks ini") : node ? "node ini" : "garis ini";
  return (
    <div className="absolute right-3 top-16 z-10 w-64 rounded-lg bg-white p-3 shadow-lg ring-1 ring-slate-200">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {isAnn ? (
        <AnnotationForm node={node!} onUpdate={onUpdateAnnotation} />
      ) : node ? (
        <NodeForm node={node} allNodes={allNodes} onUpdate={onUpdateNode} />
      ) : (
        <EdgeForm edge={edge!} onUpdate={onUpdateEdge} />
      )}

      <button
        type="button"
        onClick={() => { if (window.confirm(`Hapus ${whatToDelete}? Bisa dikembalikan dengan Ctrl+Z.`)) onDelete(); }}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
      >
        <Trash2 size={15} strokeWidth={1.75} /> Hapus
      </button>
    </div>
  );
}
