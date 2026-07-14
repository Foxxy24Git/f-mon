import { NextRequest, NextResponse } from "next/server";
import { db, getDefaultMapId } from "@/lib/db";
import { NODE_TYPES, NodeTypeStr, isValidIp, parseCsv } from "@/lib/nodes";

// POST /api/nodes/import  (body = teks CSV mentah)
// Format: name,ip,type,region,branch,parent_ip,icon
// Idempoten: IP yang sudah ada di-UPDATE, bukan diduplikasi (CLAUDE.md §8).
export async function POST(req: NextRequest) {
  const text = await req.text();
  const rows = parseCsv(text);
  if (!rows.length) return NextResponse.json({ error: "CSV kosong" }, { status: 400 });

  // lewati baris header jika ada
  const start = rows[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;
  const mapId = await getDefaultMapId();

  const result = {
    created: 0,
    updated: 0,
    failed: [] as { line: number; ip: string; reason: string }[],
  };
  // parent_ip diresolve di pass 2 supaya parent boleh muncul setelah anaknya di file.
  const parentLinks: { ip: string; parentIp: string; line: number }[] = [];

  for (let i = start; i < rows.length; i++) {
    const line = i + 1; // nomor baris file (1-based)
    const [name = "", ip = "", type = "", region = "", branch = "", parentIp = "", icon = ""] =
      rows[i].map((c) => c.trim());

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

    const data = {
      name,
      type: t as NodeTypeStr,
      region: region || null,
      branch: branch || null,
      icon: icon || "atm",
    };
    const existing = await db.node.findUnique({ where: { ipAddress: ip }, select: { id: true } });
    if (existing) {
      await db.node.update({ where: { ipAddress: ip }, data });
      result.updated++;
    } else {
      await db.node.create({ data: { ...data, ipAddress: ip, mapId } });
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
