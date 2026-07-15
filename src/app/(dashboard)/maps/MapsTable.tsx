"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type MapRow = { id: string; name: string; slug: string; bgType: string; nodeCount: number };

const BG_TYPES = ["dots", "grid", "plain"];

export default function MapsTable({ maps, canEdit }: { maps: MapRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MapRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const res = await fetch(`/api/maps/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, bgType: editing.bgType }),
    });
    setBusy(false);
    if (!res.ok) return alert((await res.json()).error ?? "Gagal menyimpan");
    setEditing(null);
    router.refresh(); // nama map juga muncul di nav (server component) → refresh
  }

  async function remove(m: MapRow) {
    if (!confirm(`Hapus map "${m.name}"? Garis & anotasi di dalamnya ikut terhapus.`)) return;
    const res = await fetch(`/api/maps/${m.id}`, { method: "DELETE" });
    if (!res.ok) return alert((await res.json()).error ?? "Gagal menghapus");
    router.refresh();
  }

  return (
    <>
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th className="px-3 py-2">Nama</th>
            <th className="px-3 py-2">Slug (URL)</th>
            <th className="px-3 py-2">Background</th>
            <th className="px-3 py-2">Node</th>
            {canEdit && <th className="px-3 py-2 text-right">Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {maps.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="px-3 py-2 font-medium">
                <Link href={`/map/${m.slug}`} className="text-blue-600 hover:underline">
                  {m.name}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-slate-500">{m.slug}</td>
              <td className="px-3 py-2">{m.bgType}</td>
              <td className="px-3 py-2">{m.nodeCount}</td>
              {canEdit && (
                <td className="px-3 py-2 text-right">
                  <button className="mr-3 text-blue-600 hover:underline" onClick={() => setEditing(m)}>
                    Edit
                  </button>
                  {/* Map berisi node tidak boleh dihapus — node-nya akan jadi yatim
                      (tidak muncul di canvas manapun tapi tetap di-ping). */}
                  <button
                    className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={m.nodeCount > 0}
                    title={m.nodeCount > 0 ? "Pindahkan dulu node di map ini" : "Hapus map"}
                    onClick={() => remove(m)}
                  >
                    Hapus
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold">Edit Map</h2>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-slate-600">Nama</span>
              <input
                className="input w-full"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Background canvas</span>
              <select
                className="input w-full"
                value={editing.bgType}
                onChange={(e) => setEditing({ ...editing, bgType: e.target.value })}
              >
                {BG_TYPES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs text-slate-500">
              Slug <span className="font-mono">{editing.slug}</span> tidak bisa diubah — itu URL map
              ini, kalau berubah semua link lama mati.
            </p>
            <div className="mt-5 flex justify-end gap-2 text-sm">
              <button className="px-3 py-2 text-slate-600" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={busy || !editing.name.trim()}
                onClick={save}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
