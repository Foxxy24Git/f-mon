// Helper murni untuk node — TIDAK boleh impor `db`/@prisma/client agar aman
// dipakai di client component (form, tabel) maupun di route API.

export const NODE_TYPES = [
  "ATM",
  "GATEWAY",
  "SWITCH",
  "ROUTER",
  "SERVER",
  "BRANCH",
  "ISP",
  "OTHER",
] as const;
export type NodeTypeStr = (typeof NODE_TYPES)[number];

export const STATUSES = ["UP", "DOWN", "WARNING", "UNREACHABLE", "PAUSED", "UNKNOWN"] as const;

// Validasi IPv4 dengan cek tiap oktet 0–255 (bukan sekadar \d+, biar 999.x ditolak).
const OCTET = "(25[0-5]|2[0-4]\\d|1?\\d?\\d)";
const IPV4 = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
export function isValidIp(ip: string): boolean {
  return IPV4.test(ip.trim());
}

// Validasi payload node dari form/API. Return pesan error (Indonesia) atau null.
export function validateNode(b: {
  name?: string;
  ipAddress?: string;
  type?: string;
}): string | null {
  if (!b?.name?.trim()) return "Nama wajib diisi";
  if (!b?.ipAddress?.trim()) return "IP wajib diisi";
  if (!isValidIp(b.ipAddress)) return "Format IP tidak valid";
  if (b.type && !NODE_TYPES.includes(b.type as NodeTypeStr))
    return `Tipe '${b.type}' tidak dikenal`;
  return null;
}

// Parser CSV kecil yang paham tanda kutip (field boleh mengandung koma/newline
// jika di-quote). Cukup untuk format 7 kolom kita tanpa nambah dependency.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // buang baris yang benar-benar kosong
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
