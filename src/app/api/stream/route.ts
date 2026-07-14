// SSE status realtime.
// Worker ping jalan di PROSES TERPISAH (CLAUDE.md §7), jadi server web tidak bisa
// dapat event in-process. Cara paling sederhana yang benar lintas-proses & sesuai
// aturan "PostgreSQL satu-satunya penyimpanan": polling tabel StatusEvent untuk
// baris baru sejak koneksi dibuka, lalu push ke client sebagai SSE.
//
// Catatan cursor: worker memakai SATU `now` untuk semua event dalam satu siklus,
// jadi banyak StatusEvent bisa punya `ts` identik. Karena itu cursor tidak boleh
// pakai `ts > x` (bisa buang event yang ts-nya sama persis). Kita pakai `ts >= x`
// lalu dedup pakai id event pada ts terakhir yang sudah dikirim.
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 2000;

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Mulai dari "sekarang": hanya stream perubahan SETELAH client connect.
      let cursor = new Date();
      let seenAtCursor = new Set<string>();

      send({ type: "ready" });

      const poll = async () => {
        if (closed) return;
        try {
          const events = await db.statusEvent.findMany({
            where: { ts: { gte: cursor } },
            orderBy: { ts: "asc" },
            select: { id: true, nodeId: true, to: true, rootCause: true, ts: true },
          });
          const fresh = events.filter((e) => !seenAtCursor.has(e.id));
          for (const e of fresh) {
            send({ type: "status", nodeId: e.nodeId, status: e.to, rootCause: e.rootCause });
          }
          if (events.length) {
            const maxTs = events[events.length - 1].ts;
            cursor = maxTs;
            // Ingat id semua event pada ts terakhir → poll berikutnya (ts >= maxTs)
            // tidak mengirim ulang. Set ini terbatas (hanya event di 1 milidetik).
            seenAtCursor = new Set(
              events.filter((e) => e.ts.getTime() === maxTs.getTime()).map((e) => e.id),
            );
          } else {
            // Tak ada event → kirim komentar heartbeat biar koneksi tak di-timeout proxy.
            if (!closed) controller.enqueue(encoder.encode(`: ping\n\n`));
          }
        } catch (err) {
          console.error("SSE poll gagal:", err);
        }
      };

      // setTimeout rekursif (bukan setInterval) supaya poll tak tumpang-tindih
      // kalau query lambat.
      const loop = async () => {
        await poll();
        if (!closed) timer = setTimeout(loop, POLL_MS);
      };
      let timer: ReturnType<typeof setTimeout> = setTimeout(loop, POLL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
