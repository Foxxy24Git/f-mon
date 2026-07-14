import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/nodes/[id]/history?range=1h|24h|7d|30d
// Mengembalikan titik-titik latency untuk grafik + riwayat perubahan status.
//
// Sumber data beda tergantung rentang (sesuai retensi di CLAUDE.md §8):
//   1h / 24h → PingResult mentah (retensi 7 hari, resolusi detik)
//   7d / 30d → PingHourly (agregasi per jam; data mentah sudah dibuang)
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const RANGE_MS: Record<string, number> = {
  "1h": 3600e3,
  "24h": 24 * 3600e3,
  "7d": 7 * 24 * 3600e3,
  "30d": 30 * 24 * 3600e3,
};

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const range = req.nextUrl.searchParams.get("range") ?? "1h";
  const span = RANGE_MS[range] ?? RANGE_MS["1h"];
  const since = new Date(Date.now() - span);
  const useHourly = range === "7d" || range === "30d";

  // points: { t: epoch ms, latency: number|null }. latency null = ping gagal
  // (recharts otomatis memutus garis di titik null → periode down kelihatan).
  let points: { t: number; latency: number | null }[];
  if (useHourly) {
    const rows = await db.pingHourly.findMany({
      where: { nodeId: id, hour: { gte: since } },
      orderBy: { hour: "asc" },
      select: { hour: true, avgLatency: true },
    });
    points = rows.map((r) => ({ t: r.hour.getTime(), latency: r.avgLatency }));
  } else {
    const rows = await db.pingResult.findMany({
      where: { nodeId: id, ts: { gte: since } },
      orderBy: { ts: "asc" },
      select: { ts: true, latencyMs: true, isAlive: true },
    });
    points = rows.map((r) => ({ t: r.ts.getTime(), latency: r.isAlive ? r.latencyMs : null }));
  }

  // Riwayat perubahan status (tidak tergantung range) — 50 terakhir.
  const events = await db.statusEvent.findMany({
    where: { nodeId: id },
    orderBy: { ts: "desc" },
    take: 50,
    select: { id: true, from: true, to: true, ts: true, rootCause: true },
  });
  // Resolve id penyebab (rootCause) → nama node.
  const rootIds = [...new Set(events.map((e) => e.rootCause).filter(Boolean) as string[])];
  const rootNodes = rootIds.length
    ? await db.node.findMany({ where: { id: { in: rootIds } }, select: { id: true, name: true } })
    : [];
  const rootName = new Map(rootNodes.map((n) => [n.id, n.name]));

  const eventList = events.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    ts: e.ts,
    rootCause: e.rootCause,
    rootCauseName: e.rootCause ? (rootName.get(e.rootCause) ?? "?") : null,
  }));

  return NextResponse.json({ range, points, events: eventList });
}
