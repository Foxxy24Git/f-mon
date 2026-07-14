"use client";
// Detail node (/nodes/[id]): info dasar + status live, grafik latency dengan
// filter rentang waktu, dan riwayat perubahan status (StatusEvent).
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Status } from "@prisma/client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStatusStream } from "@/hooks/useStatusStream";
import { STATUS_BADGE, STATUS_HEX } from "@/lib/statusColors";

type NodeInfo = {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  region: string | null;
  branch: string | null;
  status: Status;
  lastLatency: number | null;
  lastCheckAt: string | null;
  latencyWarnMs: number;
  enabled: boolean;
  parent: { id: string; name: string } | null;
};
type Point = { t: number; latency: number | null };
type Event = {
  id: string;
  from: Status;
  to: Status;
  ts: string;
  rootCauseName: string | null;
};

const RANGES = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];

// Format sumbu X: jam untuk rentang pendek, tanggal untuk rentang panjang.
function fmtTick(range: Range) {
  return (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h")
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };
}

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [node, setNode] = useState<NodeInfo | null>(null);
  const [range, setRange] = useState<Range>("1h");
  const [points, setPoints] = useState<Point[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notFound, setNotFound] = useState(false);

  const loadNode = useCallback(async () => {
    const r = await fetch(`/api/nodes/${id}`);
    if (r.status === 404) return setNotFound(true);
    if (r.ok) setNode(await r.json());
  }, [id]);

  const loadHistory = useCallback(async () => {
    const r = await fetch(`/api/nodes/${id}/history?range=${range}`);
    if (r.ok) {
      const d = await r.json();
      setPoints(d.points);
      setEvents(d.events);
    }
  }, [id, range]);

  useEffect(() => {
    loadNode();
  }, [loadNode]);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Status live: kalau node INI berubah, update badge + tarik ulang riwayat.
  useStatusStream((nodeId, status) => {
    if (nodeId !== id) return;
    setNode((n) => (n ? { ...n, status } : n));
    loadHistory();
  });

  if (notFound)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p className="text-gray-500">Node tidak ditemukan.</p>
        <Link href="/" className="text-blue-600 hover:underline">
          ← Kembali ke ringkasan
        </Link>
      </main>
    );
  if (!node) return <main className="mx-auto max-w-4xl p-6 text-gray-400">Memuat…</main>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Ringkasan
      </Link>

      {/* Info dasar + status */}
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{node.name}</h1>
        <span className={`rounded px-2 py-0.5 text-sm font-medium ${STATUS_BADGE[node.status]}`}>
          {node.status}
        </span>
        {!node.enabled && <span className="text-sm text-gray-400">(nonaktif)</span>}
      </div>
      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <Info label="IP" value={node.ipAddress} mono />
        <Info label="Tipe" value={node.type} />
        <Info label="Region" value={node.region ?? "-"} />
        <Info label="Branch" value={node.branch ?? "-"} />
        <Info label="Parent" value={node.parent?.name ?? "-"} />
        <Info
          label="Latency terakhir"
          value={node.lastLatency != null ? `${Math.round(node.lastLatency)} ms` : "-"}
        />
        <Info label="Threshold warn" value={`${node.latencyWarnMs} ms`} />
        <Info
          label="Cek terakhir"
          value={node.lastCheckAt ? new Date(node.lastCheckAt).toLocaleString("id-ID") : "-"}
        />
      </dl>

      {/* Grafik latency */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Latency</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm ${
                range === r ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-8 rounded border bg-white p-3">
        {points.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Belum ada data ping untuk rentang ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={fmtTick(range)}
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis unit=" ms" tick={{ fontSize: 11 }} width={56} />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleString("id-ID")}
                formatter={(v) => [v == null ? "gagal" : `${Math.round(Number(v))} ms`, "latency"]}
              />
              <Line
                type="monotone"
                dataKey="latency"
                stroke={STATUS_HEX.UP}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Riwayat perubahan status */}
      <h2 className="mb-2 font-semibold">Riwayat Status</h2>
      <ol className="rounded border bg-white text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <span className="w-36 shrink-0 text-xs text-gray-500">
              {new Date(e.ts).toLocaleString("id-ID")}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[e.from]}`}>{e.from}</span>
            <span className="text-gray-400">→</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[e.to]}`}>
              {e.to}
            </span>
            {e.rootCauseName && (
              <span className="text-xs text-orange-600">akibat {e.rootCauseName}</span>
            )}
          </li>
        ))}
        {events.length === 0 && (
          <li className="px-3 py-6 text-center text-gray-400">Belum ada perubahan status.</li>
        )}
      </ol>
    </main>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={mono ? "font-mono" : ""}>{value}</dd>
    </div>
  );
}
