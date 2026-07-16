import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NODE_TYPES, NodeTypeStr, isValidIp } from "@/lib/nodes";

// Backup/restore SELURUH topologi dalam satu file JSON:
// semua map + node + edge + annotation sekaligus.
//
// Kenapa di bawah /api/maps/ ? Supaya middleware (CRUD_API) otomatis
// mewajibkan role ADMIN untuk POST — tidak perlu cek auth manual di sini.
//
// CSV di /api/nodes/{import,export} TETAP ada dan tidak digantikan:
// CSV = data entry lewat Excel, JSON = backup utuh. Beda keperluan.

type Backup = {
  version: number;
  exportedAt: string;
  maps: { name: string; slug: string; bgType: string }[];
  nodes: unknown[];
  edges: unknown[];
  annotations: unknown[];
};

// GET /api/maps/backup → file JSON berisi semua map/node/edge/annotation.
export async function GET() {
  const [maps, nodes, edges, annotations] = await Promise.all([
    db.map.findMany({ orderBy: { slug: "asc" } }),
    db.node.findMany({ orderBy: { ipAddress: "asc" } }),
    db.edge.findMany(),
    db.annotation.findMany(),
  ]);

  // id internal (cuid) tidak diekspor mentah — dipetakan ke kunci natural
  // (map=slug, node=ipAddress) supaya file tetap valid saat direstore ke
  // database baru yang cuid-nya pasti berbeda.
  const slugById = new Map(maps.map((m) => [m.id, m.slug]));
  const ipById = new Map(nodes.map((n) => [n.id, n.ipAddress]));

  const backup: Backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    maps: maps.map(({ name, slug, bgType }) => ({ name, slug, bgType })),
    nodes: nodes.map((n) => ({
      name: n.name,
      ip: n.ipAddress,
      type: n.type,
      region: n.region,
      branch: n.branch,
      atmId: n.atmId,
      parentIp: n.parentId ? (ipById.get(n.parentId) ?? null) : null,
      mapSlug: slugById.get(n.mapId) ?? null,
      posX: n.posX,
      posY: n.posY,
      icon: n.icon,
      size: n.size,
      labelMode: n.labelMode,
      enabled: n.enabled,
      intervalSec: n.intervalSec,
      latencyWarnMs: n.latencyWarnMs,
      maintenance: n.maintenance,
    })),
    // Edge & annotation tidak punya kunci natural — diekspor apa adanya
    // dengan endpoint diterjemahkan ke IP.
    edges: edges
      .map((e) => ({
        mapSlug: slugById.get(e.mapId) ?? null,
        sourceIp: ipById.get(e.sourceId) ?? null,
        targetIp: ipById.get(e.targetId) ?? null,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        lineType: e.lineType,
        color: e.color,
        width: e.width,
        label: e.label,
        animated: e.animated,
      }))
      .filter((e) => e.sourceIp && e.targetIp && e.mapSlug),
    annotations: annotations
      .map((a) => ({
        mapSlug: slugById.get(a.mapId) ?? null,
        kind: a.kind,
        posX: a.posX,
        posY: a.posY,
        width: a.width,
        height: a.height,
        text: a.text,
        color: a.color,
        fontSize: a.fontSize,
      }))
      .filter((a) => a.mapSlug),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fmon-backup-${date}.json"`,
    },
  });
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

// POST /api/maps/backup  (body = file JSON hasil GET di atas)
//
// Idempoten lewat kunci natural: map dicocokkan by slug, node by ipAddress.
// Edge & annotation TIDAK punya kunci natural, jadi untuk tiap map yang ada di
// file, garis & penanda lama DIHAPUS lalu ditulis ulang dari file. Kalau tidak,
// import dua kali akan menggandakan semua garis.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "File bukan JSON yang valid" }, { status: 400 });
  }

  const b = body as Partial<Backup>;
  if (!b || typeof b !== "object" || !Array.isArray(b.nodes)) {
    return NextResponse.json(
      { error: "Struktur backup tidak dikenal (field 'nodes' tidak ada)" },
      { status: 400 },
    );
  }
  if (b.version !== 1) {
    return NextResponse.json(
      { error: `Versi backup '${b.version}' tidak didukung (harus 1)` },
      { status: 400 },
    );
  }

  const result = {
    maps: 0,
    nodesCreated: 0,
    nodesUpdated: 0,
    edges: 0,
    annotations: 0,
    failed: [] as { ip: string; reason: string }[],
  };

  // ── 1. Map (by slug) ──
  const mapIdBySlug = new Map<string, string>();
  for (const raw of (b.maps ?? []) as Row[]) {
    const slug = str(raw.slug);
    if (!slug) continue;
    const data = { name: str(raw.name) || slug, bgType: str(raw.bgType) || "dots" };
    const map = await db.map.upsert({
      where: { slug },
      update: data,
      create: { ...data, slug },
      select: { id: true },
    });
    mapIdBySlug.set(slug, map.id);
    result.maps++;
  }

  // ── 2. Node (by ipAddress) ──
  const nodeIdByIp = new Map<string, string>();
  const parentLinks: { ip: string; parentIp: string }[] = [];

  for (const raw of b.nodes as Row[]) {
    const ip = str(raw.ip);
    const name = str(raw.name);
    if (!name || !isValidIp(ip)) {
      result.failed.push({ ip, reason: "name kosong / IP tidak valid" });
      continue;
    }
    const type = (str(raw.type) || "ATM").toUpperCase();
    if (!NODE_TYPES.includes(type as NodeTypeStr)) {
      result.failed.push({ ip, reason: `tipe '${type}' tidak dikenal` });
      continue;
    }
    const mapSlug = str(raw.mapSlug);
    const mapId = mapIdBySlug.get(mapSlug);
    if (!mapId) {
      result.failed.push({ ip, reason: `map '${mapSlug}' tidak ada di file backup` });
      continue;
    }

    // status/lastLatency sengaja TIDAK direstore — itu hasil ping, biar worker
    // yang mengisi ulang. Backup hanya memulihkan konfigurasi & tata letak.
    const data = {
      name,
      type: type as NodeTypeStr,
      region: str(raw.region) || null,
      branch: str(raw.branch) || null,
      atmId: str(raw.atmId) || null,
      mapId,
      posX: num(raw.posX, 0),
      posY: num(raw.posY, 0),
      icon: str(raw.icon) || "atm",
      size: num(raw.size, 48),
      labelMode: str(raw.labelMode) || "NAME_IP",
      enabled: bool(raw.enabled, true),
      intervalSec: num(raw.intervalSec, 30),
      latencyWarnMs: num(raw.latencyWarnMs, 200),
      maintenance: bool(raw.maintenance, false),
    };

    const existing = await db.node.findUnique({ where: { ipAddress: ip }, select: { id: true } });
    if (existing) {
      await db.node.update({ where: { ipAddress: ip }, data });
      nodeIdByIp.set(ip, existing.id);
      result.nodesUpdated++;
    } else {
      const created = await db.node.create({
        data: { ...data, ipAddress: ip },
        select: { id: true },
      });
      nodeIdByIp.set(ip, created.id);
      result.nodesCreated++;
    }
    const parentIp = str(raw.parentIp);
    if (parentIp) parentLinks.push({ ip, parentIp });
  }

  // ── 3. Parent (pass 2: parent boleh muncul setelah anaknya di file) ──
  for (const link of parentLinks) {
    const parentId = nodeIdByIp.get(link.parentIp);
    if (!parentId) {
      result.failed.push({ ip: link.ip, reason: `parent '${link.parentIp}' tidak ditemukan` });
      continue;
    }
    await db.node.update({ where: { ipAddress: link.ip }, data: { parentId } });
  }

  // ── 4. Edge & annotation: hapus milik map yang diimport, lalu tulis ulang ──
  const mapIds = [...mapIdBySlug.values()];
  if (mapIds.length) {
    await db.edge.deleteMany({ where: { mapId: { in: mapIds } } });
    await db.annotation.deleteMany({ where: { mapId: { in: mapIds } } });
  }

  const edgeRows = ((b.edges ?? []) as Row[]).flatMap((e) => {
    const mapId = mapIdBySlug.get(str(e.mapSlug));
    const sourceId = nodeIdByIp.get(str(e.sourceIp));
    const targetId = nodeIdByIp.get(str(e.targetIp));
    // Garis yang ujungnya gagal diimport ikut dibuang — kalau dipaksa masuk,
    // Edge nunjuk node hantu dan canvas error saat render.
    if (!mapId || !sourceId || !targetId) return [];
    return [
      {
        mapId,
        sourceId,
        targetId,
        sourceHandle: str(e.sourceHandle) || null,
        targetHandle: str(e.targetHandle) || null,
        lineType: str(e.lineType) || "smoothstep",
        color: str(e.color) || "#64748b",
        width: num(e.width, 2),
        label: str(e.label) || null,
        animated: bool(e.animated, false),
      },
    ];
  });
  if (edgeRows.length) {
    await db.edge.createMany({ data: edgeRows });
    result.edges = edgeRows.length;
  }

  const annRows = ((b.annotations ?? []) as Row[]).flatMap((a) => {
    const mapId = mapIdBySlug.get(str(a.mapSlug));
    if (!mapId) return [];
    return [
      {
        mapId,
        kind: str(a.kind) || "BOX",
        posX: num(a.posX, 0),
        posY: num(a.posY, 0),
        width: num(a.width, 320),
        height: num(a.height, 180),
        text: str(a.text),
        color: str(a.color) || "#f97316",
        fontSize: num(a.fontSize, 14),
      },
    ];
  });
  if (annRows.length) {
    await db.annotation.createMany({ data: annRows });
    result.annotations = annRows.length;
  }

  return NextResponse.json(result);
}
