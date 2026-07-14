import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Status } from "@prisma/client";

// GET /api/dashboard → agregat untuk halaman ringkasan.
// Dihitung di DB (groupBy) supaya ringan walau node ratusan; dipanggil ulang
// oleh client tiap ada perubahan status via SSE (event-driven, bukan polling).
export const dynamic = "force-dynamic";

const PROBLEM: Status[] = ["DOWN", "UNREACHABLE", "WARNING"];

export async function GET() {
  const [byStatus, byRegion, problems] = await Promise.all([
    db.node.groupBy({ by: ["status"], _count: { _all: true } }),
    db.node.groupBy({ by: ["region", "status"], _count: { _all: true } }),
    db.node.findMany({
      where: { status: { in: PROBLEM } },
      // lastChangeAt paling lama = paling lama bermasalah → tampil paling atas.
      orderBy: { lastChangeAt: "asc" },
      select: {
        id: true,
        name: true,
        ipAddress: true,
        region: true,
        status: true,
        lastChangeAt: true,
      },
      take: 100,
    }),
  ]);

  // Ringkasan global per status.
  const summary: Record<string, number> = {
    total: 0,
    UP: 0,
    DOWN: 0,
    WARNING: 0,
    UNREACHABLE: 0,
    PAUSED: 0,
    UNKNOWN: 0,
  };
  for (const r of byStatus) {
    summary[r.status] = r._count._all;
    summary.total += r._count._all;
  }

  // Breakdown per region.
  type RegionRow = {
    region: string;
    up: number;
    down: number;
    warning: number;
    unreachable: number;
    total: number;
  };
  const regions = new Map<string, RegionRow>();
  for (const r of byRegion) {
    const key = r.region ?? "Tanpa region";
    let e = regions.get(key);
    if (!e) {
      e = { region: key, up: 0, down: 0, warning: 0, unreachable: 0, total: 0 };
      regions.set(key, e);
    }
    const c = r._count._all;
    e.total += c;
    if (r.status === "UP") e.up += c;
    else if (r.status === "DOWN") e.down += c;
    else if (r.status === "WARNING") e.warning += c;
    else if (r.status === "UNREACHABLE") e.unreachable += c;
  }
  // Urutkan: yang paling banyak masalah (down+unreachable) di atas.
  const regionList = [...regions.values()].sort(
    (a, b) => b.down + b.unreachable - (a.down + a.unreachable) || b.total - a.total,
  );

  // rootCause untuk node UNREACHABLE = StatusEvent terakhir node itu.
  // Cuma perlu untuk yang UNREACHABLE, jadi query-nya dijaga.
  const unreachIds = problems.filter((p) => p.status === "UNREACHABLE").map((p) => p.id);
  const rootCauseOf = new Map<string, string>();
  if (unreachIds.length) {
    const events = await db.statusEvent.findMany({
      where: { nodeId: { in: unreachIds } },
      orderBy: { ts: "desc" },
      select: { nodeId: true, rootCause: true },
    });
    for (const e of events) {
      if (e.rootCause && !rootCauseOf.has(e.nodeId)) rootCauseOf.set(e.nodeId, e.rootCause);
    }
  }
  // Resolve id penyebab → nama.
  const rootIds = [...new Set(rootCauseOf.values())];
  const rootNodes = rootIds.length
    ? await db.node.findMany({ where: { id: { in: rootIds } }, select: { id: true, name: true } })
    : [];
  const rootName = new Map(rootNodes.map((n) => [n.id, n.name]));

  const problemList = problems.map((p) => ({
    ...p,
    rootCauseName: rootCauseOf.has(p.id)
      ? (rootName.get(rootCauseOf.get(p.id)!) ?? "?")
      : null,
  }));

  return NextResponse.json({ summary, regions: regionList, problems: problemList });
}
