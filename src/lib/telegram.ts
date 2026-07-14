// Alert Telegram (CLAUDE.md §5, Fase 5).
// Pengirim + formatter pesan. Pemilihan SIAPA yang di-alert ada di worker
// (pinger.ts) — di sini hanya "cara mengirim" dan "bentuk pesan".
//
// Tidak ada dependency baru: pakai global `fetch` (Node 18+).

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

// Kirim satu pesan. Kalau token/chat belum diisi → diam saja (bukan error),
// supaya worker tetap jalan di lingkungan yang belum setup Telegram.
export async function sendTelegram(text: string): Promise<void> {
  if (!TOKEN || !CHAT) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("Telegram gagal:", res.status, await res.text());
  } catch (e) {
    console.error("Telegram error:", e);
  }
}

// Field minimal yang dibutuhkan formatter.
export type AlertNode = {
  name: string;
  ipAddress: string;
  region: string | null;
  branch: string | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtWaktu(d: Date): string {
  return (
    d.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "short",
      timeStyle: "medium",
    }) + " WIB"
  );
}

export function fmtDurasi(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const det = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  parts.push(`${det}d`);
  return parts.join(" ");
}

function lokasi(n: AlertNode): string {
  return [n.region, n.branch].filter(Boolean).map((x) => esc(x!)).join(" / ") || "—";
}

export function fmtDown(n: AlertNode, parentName: string | null, at: Date): string {
  return [
    "🔴 <b>NODE DOWN</b>",
    `<b>Nama:</b> ${esc(n.name)}`,
    `<b>IP:</b> ${esc(n.ipAddress)}`,
    `<b>Lokasi:</b> ${lokasi(n)}`,
    `<b>Parent:</b> ${parentName ? esc(parentName) : "—"}`,
    `<b>Waktu down:</b> ${fmtWaktu(at)}`,
  ].join("\n");
}

export function fmtRecovery(n: AlertNode, downMs: number, at: Date): string {
  return [
    "🟢 <b>NODE PULIH</b>",
    `<b>Nama:</b> ${esc(n.name)}`,
    `<b>IP:</b> ${esc(n.ipAddress)}`,
    `<b>Lokasi:</b> ${lokasi(n)}`,
    `<b>Down selama:</b> ${fmtDurasi(downMs)}`,
    `<b>Pulih:</b> ${fmtWaktu(at)}`,
  ].join("\n");
}

// ── Self-check: `npx tsx src/lib/telegram.ts` (tidak mengirim apa pun) ──
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("SELF-CHECK GAGAL: " + msg);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  assert(fmtDurasi(0) === "0d", "0ms harus '0d'");
  assert(fmtDurasi(72_000) === "1m 12d", "72s harus '1m 12d'");
  assert(fmtDurasi(3_661_000) === "1j 1m 1d", "3661s harus '1j 1m 1d'");
  assert(esc("<a>&b") === "&lt;a&gt;&amp;b", "escape HTML salah");
  const n: AlertNode = { name: "ATM <Pasar>", ipAddress: "10.0.0.1", region: "Padang", branch: null };
  assert(fmtDown(n, "GW-Padang", new Date()).includes("&lt;Pasar&gt;"), "nama harus di-escape di pesan");
  assert(lokasi(n) === "Padang", "lokasi hanya region kalau branch null");
  console.log("✓ semua self-check telegram.ts lulus");
}
