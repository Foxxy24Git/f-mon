# CLAUDE.md — F-mon (Fx Monitoring)

File ini adalah konteks permanen untuk Claude Code. **Baca ini sebelum menulis kode apa pun.**

---

## 1. Tentang Project

F-mon adalah aplikasi monitoring jaringan & ATM self-hosted untuk Bank Nagari (bank pembangunan daerah, Sumatera Barat). Memonitor ±700 IP (ATM, gateway cabang, switch) yang tersebar di banyak kabupaten/kota.

**Tiga prinsip yang TIDAK BOLEH dilanggar:**

1. **Hanya ICMP ping.** Tidak ada SNMP, tidak ada agent. Ping dilakukan dari server monitoring sendiri, bukan dari API MikroTik.
2. **Database milik aplikasi sendiri.** JANGAN pernah menyarankan atau menambahkan Zabbix, Prometheus, InfluxDB, atau time-series eksternal lain. PostgreSQL + Prisma adalah satu-satunya penyimpanan.
3. **Canvas dikendalikan penuh oleh user.** JANGAN membuat auto-layout (dagre, elk, force-directed). User yang menaruh icon, user yang menggambar garis. Aplikasi hanya menyimpan dan menampilkan.

---

## 2. Tentang Developer (penting untuk gaya jawaban)

- Nama: Fx. Petugas monitoring jaringan & ATM di Bank Nagari.
- Level coding: **beginner (Level 1)** — belajar sambil praktik, suka mengoprek.
- Punya home lab Proxmox, terbiasa Docker, Linux, dan networking (bukan pemula di infrastruktur).
- **Bahasa: Indonesia.** Semua penjelasan, komentar penting, dan commit message dalam Bahasa Indonesia. Nama variabel/fungsi tetap Bahasa Inggris.

**Aturan gaya bekerja:**

- Jelaskan **kenapa**, bukan cuma **apa**. Setiap keputusan teknis beri alasan singkat.
- Kerjakan **bertahap dan kecil**. Jangan buang 20 file sekaligus. Satu fitur → selesai → tes → lanjut.
- Setelah selesai, selalu beritahu **cara mengetesnya** (command apa yang dijalankan, apa yang harus terlihat).
- Kalau ada dua pilihan, sebutkan trade-off-nya lalu beri rekomendasi. Jangan diam-diam memilih.
- Kalau ada asumsi yang belum jelas → **tanya dulu**, jangan tebak.

---

## 3. Tech Stack (sudah final, jangan diganti tanpa diskusi)

| Layer     | Teknologi                                                |
| --------- | -------------------------------------------------------- |
| Framework | Next.js 15 (App Router)                                  |
| Bahasa    | TypeScript (strict)                                      |
| Styling   | Tailwind CSS                                             |
| Canvas    | React Flow (`@xyflow/react`) — custom node & custom edge |
| State     | Zustand                                                  |
| ORM       | Prisma                                                   |
| Database  | PostgreSQL 16                                            |
| Ping      | Node.js worker + `fping` (subprocess)                    |
| Realtime  | Server-Sent Events (SSE)                                 |
| Auth      | NextAuth (credentials)                                   |
| Icon      | lucide-react + custom SVG upload                         |
| Deploy    | Docker Compose (Proxmox VM)                              |

**Kenapa React Flow, bukan canvas dari nol?**
Pan, zoom, minimap, drag, dan koneksi handle sudah stabil dan teruji. Tapi node & edge dibuat **custom sepenuhnya** — jadi Fx tetap punya kontrol penuh atas icon, garis, dan tata letak. Tidak ada yang otomatis.

---

## 4. Struktur Folder

```
f-mon/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx              # ringkasan global
│   │   │   ├── map/[slug]/page.tsx   # canvas topologi
│   │   │   ├── nodes/page.tsx        # tabel + CRUD + import CSV
│   │   │   └── nodes/[id]/page.tsx   # detail + grafik latency
│   │   └── api/
│   │       ├── nodes/
│   │       ├── edges/
│   │       ├── maps/
│   │       └── stream/route.ts       # SSE status realtime
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── TopologyCanvas.tsx    # wrapper React Flow
│   │   │   ├── DeviceNode.tsx        # custom node (icon + status)
│   │   │   ├── LinkEdge.tsx          # custom edge
│   │   │   ├── NodePalette.tsx       # sidebar: drag icon ke canvas
│   │   │   ├── PropertyPanel.tsx     # edit properti node/edge terpilih
│   │   │   └── CanvasToolbar.tsx     # zoom, grid, snap, edit/view, save
│   │   └── ui/
│   ├── lib/
│   │   ├── db.ts
│   │   ├── status.ts                 # state machine + root-cause
│   │   └── icons.ts                  # registry icon
│   ├── store/
│   │   └── canvasStore.ts            # Zustand
│   └── worker/
│       ├── pinger.ts                 # loop ping utama
│       └── fping.ts                  # wrapper subprocess fping
├── docker-compose.yml
└── CLAUDE.md
```

---

## 5. Logika Status — INI JANTUNG APLIKASI

Jangan pernah menyederhanakan bagian ini.

```
UP           = ping sukses
WARNING      = ping sukses, tapi latency > threshold ATAU packet loss 1–99%
DOWN         = ping GAGAL dan SEMUA ancestor-nya UP  → node ini benar-benar mati
UNREACHABLE  = ping GAGAL dan ada ancestor yang tidak UP → korban, bukan pelaku
PAUSED       = dimatikan manual (maintenance)
UNKNOWN      = belum pernah dicek
```

**Algoritma tiap siklus ping:**

1. Ping semua node aktif secara paralel (`fping`), kumpulkan hasil mentah.
2. Bangun tree dari `parentId`.
3. Traverse **dari root ke bawah** (BFS/DFS).
4. Untuk tiap node yang gagal ping: cek ancestor terdekat yang tidak `UP`.
   - Ketemu → status `UNREACHABLE`, simpan `rootCause` = id ancestor tersebut.
   - Tidak ada → status `DOWN`.
5. Simpan `PingResult` (raw) + `StatusEvent` (hanya jika status berubah).
6. Push perubahan ke UI lewat SSE.

**Anti-flapping:** status baru baru dianggap sah setelah 2 siklus berturut-turut hasilnya sama.

**Alert:** HANYA transisi ke `DOWN` yang mengirim notifikasi. `UNREACHABLE` tidak boleh mengirim alert — ini seluruh alasan aplikasi ini dibuat.

---

## 6. Aturan Canvas (SANGAT PENTING)

- Ukuran virtual canvas **minimal 10.000 × 10.000 px**. Jangan batasi ke ukuran viewport.
- **Wajib ada:** pan, zoom (10%–300%), minimap, grid, snap-to-grid (toggle), fit-to-view.
- Node dan edge **HARUS custom component**, bukan default React Flow.
- Handle koneksi di **4 sisi** node (top/right/bottom/left) agar garis bisa rapi.
- Tipe garis yang bisa dipilih user: `straight`, `step`, `smoothstep`, `bezier`.
- User bisa atur: warna garis, tebal garis, label garis, animasi garis.
- User bisa pilih icon per node + upload SVG/PNG sendiri.
- **Garis yang digambar user ≠ relasi parent-child.** Relasi parent diatur eksplisit lewat dropdown di PropertyPanel. Jangan gabungkan keduanya.
- Mode **Edit** dan **View** dipisah. Di mode View node tidak bisa digeser.
- Auto-save posisi (debounce 800ms) + tombol Save manual.
- Undo/Redo wajib ada.

**Performa canvas (target 500+ node):**

- Aktifkan `onlyRenderVisibleElements`.
- `React.memo` pada `DeviceNode`, bandingkan hanya field yang berpengaruh ke tampilan.
- Update status via SSE → patch node di Zustand, JANGAN refetch semua node.
- Jangan pernah `setNodes(allNodes)` untuk sekadar mengubah warna satu node.

---

## 7. Aturan Ping Worker

- Gunakan `fping` via subprocess — bukan loop `ping` satu per satu. 700 IP harus selesai < 15 detik.
- Worker berjalan **terpisah** dari Next.js server (proses sendiri / container sendiri).
- Container ping butuh capability `NET_RAW` di Docker.
- Batasi konkurensi; jangan banjiri jaringan bank.
- Tulis `PingResult` secara **batch** (`createMany`), bukan satu-satu.
- Kalau worker crash, harus auto-restart dan tidak kehilangan jadwal.

---

## 8. Aturan Database

- Migrasi selalu lewat `prisma migrate dev`. Jangan pernah edit DB manual.
- `PingResult` akan sangat besar (±2 juta baris/hari). Wajib:
  - Index `(nodeId, ts)`.
  - Retensi raw: 7 hari.
  - Job agregasi harian → tabel `PingHourly` (avg latency, max latency, uptime %).
- Import CSV harus idempoten — IP yang sudah ada di-update, bukan diduplikasi.

---

## 9. Yang TIDAK Boleh Dilakukan

- ❌ Menambahkan Zabbix / Prometheus / InfluxDB / Grafana.
- ❌ Auto-layout topologi (dagre/elk/force). Layout adalah hak user.
- ❌ SNMP, SSH ke device, atau write access ke perangkat jaringan.
- ❌ Meng-hardcode IP, kredensial, atau token di source code. Semua lewat `.env`.
- ❌ Menyimpan data ping di memory saja tanpa persist ke DB.
- ❌ Mengirim alert untuk node `UNREACHABLE`.
- ❌ Menulis 15 file sekaligus tanpa konfirmasi. Kerjakan bertahap.

---

## 10. Roadmap Pengerjaan (ikuti urutan ini)

**Fase 1 — Fondasi**

1. Init Next.js + TypeScript + Tailwind
2. Prisma schema + PostgreSQL via Docker Compose
3. Seed data dummy (20 node bertingkat untuk uji root-cause)
4. CRUD node + import CSV

**Fase 2 — Ping Engine** 5. Wrapper `fping` 6. Loop worker + simpan `PingResult` 7. State machine + logika root-cause + anti-flapping 8. SSE endpoint

**Fase 3 — Canvas** 9. `TopologyCanvas` + pan/zoom/minimap/grid 10. `DeviceNode` custom (icon, label, warna status, 4 handle) 11. `LinkEdge` custom (tipe garis, warna, tebal, label) 12. `NodePalette` (drag icon dari sidebar ke canvas) 13. `PropertyPanel` (edit node/edge terpilih, set parent) 14. Auto-save layout, undo/redo, mode Edit/View

**Fase 4 — Dashboard** 15. Ringkasan global + breakdown per regency 16. Halaman detail node + grafik latency

**Fase 5 — Alert** 17. Telegram bot (down + recovery) 18. Maintenance window

Selesaikan satu fase sampai benar-benar jalan sebelum lanjut. Setelah tiap langkah, kasih tahu Fx cara mengetesnya.

---

## 11. Environment Variables

```env
DATABASE_URL="postgresql://fmon:password@localhost:5432/fmon"
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"

PING_INTERVAL_SEC=30
PING_TIMEOUT_MS=1000
PING_COUNT=3
PING_CONCURRENCY=100
FLAP_THRESHOLD=2

TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

RAW_RETENTION_DAYS=7
```

---

## 12. Definition of Done (per fitur)

- Kode jalan tanpa error TypeScript.
- Ada cara mengetesnya, dan Fx sudah diberitahu caranya.
- Tidak melanggar satupun aturan di bagian 9.
- Kalau menyentuh canvas: sudah dicoba dengan minimal 100 node dummy dan masih smooth.
