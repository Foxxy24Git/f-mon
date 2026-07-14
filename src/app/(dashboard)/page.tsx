"use client";
// Dashboard utama (/). Ringkasan global + breakdown per region + daftar node
// bermasalah. Angka update realtime: setiap ada perubahan status via SSE,
// agregat di-refetch (event-driven, bukan polling interval).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Status } from "@prisma/client";
import { useStatusStream } from "@/hooks/useStatusStream";
import { STATUS_BADGE, STATUS_HEX } from "@/lib/statusColors";

type RegionRow = {
  region: string;
  up: number;
  down: number;
  warning: number;
  unreachable: number;
  total: number;
};
type Problem = {
  id: string;
  name: string;
  ipAddress: string;
  region: string | null;
  status: Status;
  lastChangeAt: string | null;
  rootCauseName: string | null;
};
type Dashboard = {
  summary: Record<string, number>;
  regions: RegionRow[];
  problems: Problem[];
};

// "berapa lama" sejak ISO string → teks ringkas (mis. "2j 13m").
function sinceText(iso: string | null): string {
  if (!iso) return "-";
  let s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}h ${h}j`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

const CARDS: { key: string; label: string }[] = [
  { key: "total", label: "Total Node" },
  { key: "UP", label: "UP" },
  { key: "DOWN", label: "DOWN" },
  { key: "WARNING", label: "WARNING" },
  { key: "UNREACHABLE", label: "UNREACHABLE" },
];

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/dashboard");
    if (r.ok) setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Worker kirim banyak StatusEvent sekaligus per siklus → debounce biar
  // burst perubahan cukup memicu satu refetch.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useStatusStream(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 500);
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ringkasan</h1>
        <Link href="/nodes" className="text-sm text-blue-600 hover:underline">
          Kelola Node →
        </Link>
      </div>

      {!data ? (
        <p className="text-gray-400">Memuat…</p>
      ) : (
        <>
          {/* Kartu ringkasan global */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CARDS.map((c) => (
              <div key={c.key} className="rounded-lg border bg-white p-4">
                <div className="text-xs font-medium text-gray-500">{c.label}</div>
                <div
                  className="mt-1 text-3xl font-bold"
                  style={{ color: c.key === "total" ? "#111827" : STATUS_HEX[c.key as Status] }}
                >
                  {data.summary[c.key] ?? 0}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Breakdown per region */}
            <section>
              <h2 className="mb-2 font-semibold">Per Region</h2>
              <div className="overflow-x-auto rounded border bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100 text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Region</th>
                      <th className="px-3 py-2 text-right">UP</th>
                      <th className="px-3 py-2 text-right">DOWN</th>
                      <th className="px-3 py-2 text-right">UNREACH</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.regions.map((r) => (
                      <tr key={r.region} className="border-t">
                        <td className="px-3 py-2">{r.region}</td>
                        <td className="px-3 py-2 text-right text-green-700">{r.up}</td>
                        <td className="px-3 py-2 text-right font-medium text-red-700">{r.down}</td>
                        <td className="px-3 py-2 text-right text-orange-600">{r.unreachable}</td>
                        <td className="px-3 py-2 text-right">{r.total}</td>
                      </tr>
                    ))}
                    {data.regions.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-gray-400" colSpan={5}>
                          Belum ada data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Node bermasalah, paling lama di atas */}
            <section>
              <h2 className="mb-2 font-semibold">Node Bermasalah</h2>
              <div className="overflow-hidden rounded border bg-white">
                <ul className="divide-y text-sm">
                  {data.problems.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}
                      >
                        {p.status}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/nodes/${p.id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-gray-500">{p.ipAddress}</span>
                        {p.rootCauseName && (
                          <span className="ml-2 text-xs text-orange-600">
                            ↳ akibat {p.rootCauseName}
                          </span>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-xs text-gray-500">
                        {sinceText(p.lastChangeAt)}
                      </span>
                    </li>
                  ))}
                  {data.problems.length === 0 && (
                    <li className="px-3 py-6 text-center text-gray-400">
                      Semua node sehat 🎉
                    </li>
                  )}
                </ul>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
