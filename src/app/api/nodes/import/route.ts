import { NextRequest, NextResponse } from "next/server";
import { db, getDefaultMapId } from "@/lib/db";
import { NODE_TYPES, NodeTypeStr, isValidIp, parseCsv } from "@/lib/nodes";

// POST /api/nodes/import  (body = teks CSV mentah)
// Format: name,ip,type,region,branch,atm_id,parent_ip,icon[,map_slug,pos_x,pos_y]
// 3 kolom terakhir opsional — CSV lama (8 kolom) tetap jalan, posisi node tidak disentuh.
// Idempoten: IP yang sudah ada di-UPDATE, bukan diduplikasi (CLAUDE.md §8).

// Map dibuat otomatis kalau slug di CSV belum ada, supaya restore ke server kosong
// tidak perlu bikin map manual dulu.
async function resolveMapId(slug: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const map = await db.map.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug },
    select: { id: true },
  });
  cache.set(slug, map.id);
  return map.id;
}

export async function POST(req: NextRequest) {
  const text = await req.text();
  const rows = parseCsv(text);
  if (!rows.length) return NextResponse.json({ error: "CSV kosong" }, { status: 400 });

  // lewati baris header jika ada
  const start = rows[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;
  const defaultMapId = await getDefaultMapId();
  const mapIdBySlug = new Map<string, string>();

  const result = {
    created: 0,
    updated: 0,
    failed: [] as { line: number; ip: string; reason: string }[],
  };
  // parent_ip diresolve di pass 2 supaya parent boleh muncul setelah anaknya di file.
  const parentLinks: { ip: string; parentIp: string; line: number }[] = [];

  for (let i = start; i < rows.length; i++) {
    const line = i + 1; // nomor baris file (1-based)
    const [
      name = "",
      ip = "",
      type = "",
      region = "",
      branch = "",
      atmId = "",
      parentIp = "",
      icon = "",
      mapSlug = "",
      posX = "",
      posY = "",
    ] = rows[i].map((c) => c.trim());

    if (!name || !ip) {
      result.failed.push({ line, ip, reason: "name/ip kosong" });
      continue;
    }
    if (!isValidIp(ip)) {
      result.failed.push({ line, ip, reason: "IP tidak valid" });
      continue;
    }
    const t = (type || "ATM").toUpperCase();
    if (!NODE_TYPES.includes(t as NodeTypeStr)) {
      result.failed.push({ line, ip, reason: `tipe '${type}' tidak dikenal` });
      continue;
    }

    // Tata letak hanya ikut kalau kedua koordinat valid; kalau kolomnya kosong,
    // posisi node yang sudah tersusun di canvas jangan ditimpa jadi 0,0.
    const x = Number(posX);
    const y = Number(posY);
    const pos =
      posX && posY && Number.isFinite(x) && Number.isFinite(y) ? { posX: x, posY: y } : {};

    const data = {
      name,
      type: t as NodeTypeStr,
      region: region || null,
      branch: branch || null,
      atmId: atmId || null,
      icon: icon || "atm",
      ...pos,
      ...(mapSlug ? { mapId: await resolveMapId(mapSlug, mapIdBySlug) } : {}),
    };
    const existing = await db.node.findUnique({ where: { ipAddress: ip }, select: { id: true } });
    if (existing) {
      await db.node.update({ where: { ipAddress: ip }, data });
      result.updated++;
    } else {
      await db.node.create({ data: { mapId: defaultMapId, ...data, ipAddress: ip } });
      result.created++;
    }
    if (parentIp) parentLinks.push({ ip, parentIp, line });
  }

  // pass 2: sambungkan parent by IP
  for (const link of parentLinks) {
    const parent = await db.node.findUnique({
      where: { ipAddress: link.parentIp },
      select: { id: true },
    });
    if (!parent) {
      result.failed.push({
        line: link.line,
        ip: link.ip,
        reason: `parent_ip '${link.parentIp}' tidak ditemukan`,
      });
      continue;
    }
    await db.node.update({ where: { ipAddress: link.ip }, data: { parentId: parent.id } });
  }

  return NextResponse.json(result);
}
