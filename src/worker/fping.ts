// Wrapper subprocess `fping` — ping BANYAK IP sekaligus lewat SATU proses.
// Kenapa fping, bukan loop `ping`? fping mengirim ke semua target secara
// paralel & mengatur lajunya sendiri, jadi 700 IP selesai dalam hitungan detik
// tanpa membanjiri jaringan (CLAUDE.md §7).

import { spawn } from "node:child_process";

export type PingOutcome = {
  isAlive: boolean; // ada balasan? (rcv > 0)
  latencyMs: number | null; // rata-rata latency; null kalau mati
  lossPct: number; // packet loss 0–100
};

export type FpingOpts = {
  count?: number; // -c: jumlah paket per host
  timeoutMs?: number; // -t: timeout tiap paket
};

// Baris ringkasan fping (mode `-c ... -q`), contoh:
//   192.0.2.1 : xmt/rcv/%loss = 3/0/100%
//   127.0.0.1 : xmt/rcv/%loss = 3/3/0%, min/avg/max = 0.05/0.08/0.12
const LINE =
  /^(\S+)\s*:\s*xmt\/rcv\/%loss = \d+\/(\d+)\/(\d+)%(?:, min\/avg\/max = [\d.]+\/([\d.]+)\/[\d.]+)?/;

export function parseFping(stderr: string): Map<string, PingOutcome> {
  const out = new Map<string, PingOutcome>();
  for (const raw of stderr.split("\n")) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [, ip, rcv, loss, avg] = m;
    out.set(ip, {
      isAlive: Number(rcv) > 0,
      lossPct: Number(loss),
      latencyMs: avg ? Number(avg) : null,
    });
  }
  return out;
}

// Ping sekumpulan IP lewat satu proses fping. IP dikirim via stdin (`-f -`)
// supaya tidak kena batas panjang argumen untuk ratusan target.
export function pingBatch(
  ips: string[],
  opts: FpingOpts = {},
): Promise<Map<string, PingOutcome>> {
  const count = opts.count ?? 3;
  const timeoutMs = opts.timeoutMs ?? 1000;
  return new Promise((resolve, reject) => {
    if (ips.length === 0) return resolve(new Map());
    const fp = spawn("fping", [
      "-q", // ringkasan saja (tanpa progres per-round)
      "-c",
      String(count),
      "-t",
      String(timeoutMs),
      "-f",
      "-", // baca daftar target dari stdin
    ]);
    let stderr = "";
    let spawnErr: Error | null = null;
    // fping tidak di PATH / gagal spawn → ditangkap di sini, bukan lempar tak jelas.
    fp.on("error", (e) => (spawnErr = e));
    fp.stderr.on("data", (d) => (stderr += d));
    fp.stdin.on("error", () => {}); // abaikan EPIPE bila fping mati duluan
    fp.stdin.write(ips.join("\n") + "\n");
    fp.stdin.end();
    fp.on("close", () => {
      if (spawnErr) return reject(spawnErr);
      // PENTING: fping keluar dgn exit code ≠ 0 kalau ADA host mati — itu NORMAL,
      // bukan error. Jadi kita tidak peduli exit code, cukup parse stderr.
      resolve(parseFping(stderr));
    });
  });
}
