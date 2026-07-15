"use client";
// Grafik latency satu node + filter rentang waktu.
//
// Diangkat dari nodes/[id]/page.tsx agar dipakai bersama oleh halaman detail
// node DAN baris accordion di daftar node — grafiknya identik, jadi kalau
// disalin tiap perbaikan harus dikerjakan dua kali.
//
// Komponen ini hanya mengurus `points`. Riwayat status (`events`) dari respons
// API sengaja diabaikan; itu tetap urusan halaman detail (lihat spec §3.1).
import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { STATUS_HEX } from "@/lib/statusColors";

const RANGES = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGES)[number];
type Point = { t: number; latency: number | null };

// Format sumbu X: jam untuk rentang pendek, tanggal untuk rentang panjang.
function fmtTick(range: Range) {
  return (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h")
      return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  };
}

export default function LatencyChart({
  nodeId,
  height = 260,
}: {
  nodeId: string;
  height?: number;
}) {
  const [range, setRange] = useState<Range>("1h");
  const [points, setPoints] = useState<Point[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await fetch(`/api/nodes/${nodeId}/history?range=${range}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setPoints(d.points);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [nodeId, range]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Latency</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm ${
                range === r
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded border bg-white p-3">
        {state === "error" ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-600">Gagal memuat grafik.</p>
            <button onClick={load} className="mt-1 text-sm text-blue-600 hover:underline">
              Coba lagi
            </button>
          </div>
        ) : state === "loading" && points.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Memuat…</p>
        ) : points.length === 0 ? (
          <p className="py-16 text-center text-gray-400">Belum ada data ping untuk rentang ini.</p>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
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
              {/* connectNulls=false → latency null (ping gagal) memutus garis,
                  jadi periode DOWN/UNREACHABLE kelihatan sebagai celah. */}
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
    </div>
  );
}
