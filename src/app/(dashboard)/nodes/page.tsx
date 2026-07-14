"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { NODE_TYPES, STATUSES } from "@/lib/nodes";

type Node = {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  region: string | null;
  branch: string | null;
  status: string;
  enabled: boolean;
  intervalSec: number;
  latencyWarnMs: number;
  parentId: string | null;
  parent: { id: string; name: string } | null;
};

type FormState = Partial<Node>;

const STATUS_COLOR: Record<string, string> = {
  UP: "bg-green-100 text-green-800",
  DOWN: "bg-red-100 text-red-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  UNREACHABLE: "bg-gray-200 text-gray-700",
  PAUSED: "bg-blue-100 text-blue-800",
  UNKNOWN: "bg-gray-100 text-gray-500",
};

export default function NodesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN"; // CRUD & import hanya ADMIN
  const [nodes, setNodes] = useState<Node[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState | null>(null); // null = form tertutup
  const [importResult, setImportResult] = useState<null | {
    created: number;
    updated: number;
    failed: { line: number; ip: string; reason: string }[];
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (region) qs.set("region", region);
    const res = await fetch(`/api/nodes?${qs}`);
    setNodes(await res.json());
    setLoading(false);
  }, [search, status, region]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveNode(data: FormState) {
    const editing = Boolean(data.id);
    const res = await fetch(editing ? `/api/nodes/${data.id}` : "/api/nodes", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const { error } = await res.json();
      alert(`Gagal simpan: ${error ?? res.status}`);
      return;
    }
    setForm(null);
    load();
  }

  async function deleteNode(n: Node) {
    if (!confirm(`Hapus node "${n.name}" (${n.ipAddress})?`)) return;
    await fetch(`/api/nodes/${n.id}`, { method: "DELETE" });
    load();
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const res = await fetch("/api/nodes/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Import gagal: ${data.error ?? res.status}`);
      return;
    }
    setImportResult(data);
    load();
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Node</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <label className="cursor-pointer rounded bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-800">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importCsv(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                onClick={() =>
                  setForm({ type: "ATM", intervalSec: 30, latencyWarnMs: 200, enabled: true })
                }
              >
                + Tambah Node
              </button>
            </>
          )}
          <button
            className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Keluar
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Cari nama / IP…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Semua status</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Filter region…"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        />
      </div>

      {importResult && (
        <div className="mb-4 rounded border bg-gray-50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Import selesai: {importResult.created} baru, {importResult.updated} diupdate,{" "}
              {importResult.failed.length} gagal.
            </span>
            <button className="text-gray-500 hover:underline" onClick={() => setImportResult(null)}>
              tutup
            </button>
          </div>
          {importResult.failed.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-red-700">
              {importResult.failed.map((f, i) => (
                <li key={i}>
                  baris {f.line} ({f.ip || "-"}): {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tabel */}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Tipe</th>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Parent</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">
                  {n.name}
                  {!n.enabled && <span className="ml-1 text-xs text-gray-400">(nonaktif)</span>}
                </td>
                <td className="px-3 py-2 font-mono">{n.ipAddress}</td>
                <td className="px-3 py-2">{n.type}</td>
                <td className="px-3 py-2">{n.region ?? "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLOR[n.status] ?? ""
                    }`}
                  >
                    {n.status}
                  </span>
                </td>
                <td className="px-3 py-2">{n.parent?.name ?? "-"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {isAdmin ? (
                    <>
                      <button className="text-blue-600 hover:underline" onClick={() => setForm(n)}>
                        Edit
                      </button>
                      <button
                        className="ml-3 text-red-600 hover:underline"
                        onClick={() => deleteNode(n)}
                      >
                        Hapus
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && nodes.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={7}>
                  Belum ada node.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <NodeForm initial={form} nodes={nodes} onCancel={() => setForm(null)} onSave={saveNode} />
      )}
    </main>
  );
}

function NodeForm({
  initial,
  nodes,
  onCancel,
  onSave,
}: {
  initial: FormState;
  nodes: Node[];
  onCancel: () => void;
  onSave: (data: FormState) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState, v: unknown) => setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">{f.id ? "Edit Node" : "Tambah Node"}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Nama *">
            <input
              className="input"
              value={f.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="IP *">
            <input
              className="input font-mono"
              value={f.ipAddress ?? ""}
              onChange={(e) => set("ipAddress", e.target.value)}
            />
          </Field>
          <Field label="Tipe">
            <select
              className="input"
              value={f.type ?? "ATM"}
              onChange={(e) => set("type", e.target.value)}
            >
              {NODE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Region">
            <input
              className="input"
              value={f.region ?? ""}
              onChange={(e) => set("region", e.target.value)}
            />
          </Field>
          <Field label="Branch">
            <input
              className="input"
              value={f.branch ?? ""}
              onChange={(e) => set("branch", e.target.value)}
            />
          </Field>
          <Field label="Parent">
            <select
              className="input"
              value={f.parentId ?? ""}
              onChange={(e) => set("parentId", e.target.value || null)}
            >
              <option value="">— tidak ada —</option>
              {nodes
                .filter((n) => n.id !== f.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.ipAddress})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Interval ping (detik)">
            <input
              type="number"
              className="input"
              value={f.intervalSec ?? 30}
              onChange={(e) => set("intervalSec", Number(e.target.value))}
            />
          </Field>
          <Field label="Threshold latency (ms)">
            <input
              type="number"
              className="input"
              value={f.latencyWarnMs ?? 200}
              onChange={(e) => set("latencyWarnMs", Number(e.target.value))}
            />
          </Field>
          <label className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.enabled ?? true}
              onChange={(e) => set("enabled", e.target.checked)}
            />
            Aktif (dimonitor)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border px-4 py-2 text-sm" onClick={onCancel}>
            Batal
          </button>
          <button
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            onClick={() => onSave(f)}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-gray-600">{label}</span>
      {children}
    </label>
  );
}
