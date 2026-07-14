# PROMPT.md — F-mon (Fx Monitoring)

Kumpulan prompt siap-pakai untuk Claude Code CLI. Kerjakan **satu prompt per sesi**, jangan loncat fase. Pastikan `PRD.md` dan `CLAUDE.md` sudah ada di root project sebelum mulai — Claude Code akan otomatis membaca `CLAUDE.md` sebagai konteks.

Cara pakai: buka folder project di terminal → `claude` → copas satu blok prompt di bawah → tunggu selesai → tes sesuai instruksi di akhir jawaban Claude → baru lanjut prompt berikutnya.

---

## FASE 0 — Inisialisasi Project

```
Baca PRD.md dan CLAUDE.md di root project ini sebagai konteks utama sebelum mulai.

Tolong inisialisasi project F-mon dari nol dengan:
1. Next.js 15 (App Router, TypeScript strict, Tailwind CSS)
2. Struktur folder sesuai bagian "Struktur Folder" di CLAUDE.md
3. Setup Prisma + siapkan docker-compose.yml untuk PostgreSQL 16 (service db saja dulu)
4. File .env.example sesuai bagian "Environment Variables" di CLAUDE.md
5. ESLint + Prettier dasar

Jangan install React Flow atau library canvas dulu — itu di fase nanti.

Setelah selesai, jelaskan langkah-langkah untuk menjalankan project ini pertama kali di komputer saya (termasuk cara menjalankan docker-compose untuk database).
```

---

## FASE 1 — Skema Database & Seed Data

```
Sekarang buatkan schema.prisma sesuai skema database di PRD.md bagian 5, dengan penyesuaian struktur folder dari CLAUDE.md.

Setelah schema jadi:
1. Jalankan migrasi awal (prisma migrate dev)
2. Buatkan seed script (prisma/seed.ts) dengan data DUMMY yang sengaja bertingkat untuk menguji logika root-cause nanti, contoh:
   - 1 map "Padang"
   - 1 node BRANCH "Cabang Padang" (gateway)
   - 5 node ATM dengan parentId = gateway tersebut
   - 1 map "Bukittinggi" dengan struktur serupa
3. Pastikan seed bisa dijalankan ulang tanpa duplikasi (idempoten)

Setelah selesai, kasih tahu saya command untuk menjalankan seed dan cara mengecek datanya masuk dengan benar (misalnya lewat Prisma Studio).
```

---

## FASE 2 — CRUD Node + Import CSV

```
Baca kembali CLAUDE.md bagian struktur folder dan aturan database sebelum lanjut.

Buatkan halaman dan API untuk manajemen node:
1. API route CRUD node (GET list dengan filter/search, GET detail, POST create, PATCH update, DELETE)
2. Halaman /nodes: tabel semua node dengan kolom nama, IP, tipe, region, status, parent. Ada search dan filter by status/region.
3. Form tambah/edit node (nama, IP, tipe, region, branch, parent, interval ping, threshold latency, aktif/nonaktif)
4. Fitur import CSV dengan format: name,ip,type,region,branch,parent_ip,icon
   - Validasi IP tidak duplikat
   - Kalau IP sudah ada, UPDATE bukan bikin baru (idempoten)
   - Tampilkan ringkasan hasil import (berapa baru, berapa diupdate, berapa gagal + alasannya)

Belum perlu styling canvas atau ping — fokus CRUD dan import dulu, styling cukup rapi pakai Tailwind standar.

Setelah selesai, kasih saya contoh isi file CSV dummy untuk saya coba import, dan jelaskan cara mengetesnya.
```

---

## FASE 3 — Ping Worker + Logika Root-Cause

```
Ini fase paling penting. Baca ulang CLAUDE.md bagian 5 (Logika Status) dan bagian 7 (Aturan Ping Worker) dengan teliti sebelum menulis kode — jangan menyederhanakan logika root-cause.

Buatkan:
1. Wrapper fping (src/worker/fping.ts) — jalankan fping sebagai subprocess terhadap banyak IP sekaligus, parse hasilnya (alive/dead, latency, packet loss)
2. Loop worker (src/worker/pinger.ts) yang:
   - Ambil semua node aktif (enabled=true) dari DB
   - Ping semua sekaligus lewat fping wrapper
   - Simpan PingResult secara batch (createMany)
3. State machine (src/lib/status.ts) yang mengimplementasikan PERSIS logika di CLAUDE.md bagian 5:
   - Bangun tree dari parentId
   - Traverse dari root ke bawah
   - Tentukan DOWN vs UNREACHABLE berdasarkan status ancestor
   - Anti-flapping: status baru sah setelah 2 siklus berturut-turut
   - Simpan StatusEvent HANYA kalau status berubah, sertakan rootCause kalau UNREACHABLE
4. Jalankan worker ini sebagai proses terpisah (bukan bagian dari request Next.js), pakai interval dari .env

Setelah selesai:
- Jelaskan cara menjalankan worker ini secara manual untuk saya tes
- Buatkan skenario tes: matikan (pause) node gateway dummy dari Fase 1, jalankan worker, lalu tunjukkan query untuk membuktikan ATM di bawahnya jadi UNREACHABLE bukan DOWN
```

---

## FASE 4 — SSE Realtime Status

```
Buatkan endpoint SSE (src/app/api/stream/route.ts) yang mem-push perubahan status node secara realtime ke client, berdasarkan StatusEvent yang baru tercatat dari worker Fase 3.

Buatkan juga hook client (misal useNodeStatusStream) yang:
- Subscribe ke endpoint SSE
- Update state di Zustand store (canvasStore.ts) hanya untuk node yang statusnya berubah — JANGAN refetch semua node

Buatkan halaman percobaan sederhana yang menampilkan daftar node dengan badge warna status, dan buktikan bahwa saat worker jalan dan ada perubahan status, badge di halaman berubah warna otomatis tanpa refresh.

Jelaskan cara mengetesnya end-to-end (jalankan DB, jalankan worker, jalankan Next.js dev server, buka halaman, lalu apa yang harus saya lihat).
```

---

## FASE 5 — Canvas Topologi (Bagian Terbesar, Boleh Dipecah Lagi)

### 5a. Setup Canvas Dasar

```
Baca CLAUDE.md bagian 6 (Aturan Canvas) dengan sangat teliti — ini fitur pembeda utama aplikasi ini, jangan dibuat auto-layout.

Install dan setup React Flow (@xyflow/react). Buatkan:
1. TopologyCanvas.tsx — wrapper React Flow dengan:
   - Virtual canvas minimal 10.000x10.000 px
   - Pan, zoom (10%-300%), minimap, background grid dengan toggle snap-to-grid
   - Tombol "fit to view"
2. Halaman /map/[slug] yang memuat node & edge dari database sesuai mapId, dan menampilkannya di canvas ini
3. Untuk sekarang pakai node/edge default React Flow dulu (belum custom) — tujuan fase ini cuma memastikan pan/zoom/minimap/grid berfungsi dengan lancar untuk 100+ node dummy

Tambahkan 100 node dummy tersebar acak (lewat seed atau script terpisah) khusus untuk uji performa, lalu laporkan apakah pan/zoom masih smooth.
```

### 5b. Custom Node (Icon, Status, Handle)

```
Sekarang ganti node default di TopologyCanvas dengan custom node sesuai CLAUDE.md bagian 6:

1. DeviceNode.tsx (custom node React Flow):
   - Tampilkan icon sesuai field `icon` di database (pakai lucide-react untuk icon bawaan)
   - Border/glow warna sesuai status (hijau=UP, kuning=WARNING, merah=DOWN + animasi berkedip, abu-abu=UNREACHABLE, biru=PAUSED)
   - Label bisa mode: nama saja / nama+IP / nama+IP+latency (sesuai field labelMode)
   - 4 connection handle: atas, bawah, kiri, kanan
   - Wajib pakai React.memo, re-render HANYA kalau status/posisi/label berubah
2. icons.ts — registry/daftar icon yang tersedia (ATM, router, switch, server, gedung cabang, cloud/ISP, firewall, printer, dll pakai lucide-react)
3. NodePalette.tsx — sidebar berisi daftar icon yang bisa di-drag ke canvas untuk membuat node baru

Setelah selesai, jelaskan cara saya mengetes: drag icon dari palette ke canvas harus membuat node baru tersimpan ke database dengan posisi sesuai tempat saya drop.
```

### 5c. Custom Edge (Garis Manual oleh User)

```
Buatkan custom edge sesuai CLAUDE.md bagian 6:

1. LinkEdge.tsx (custom edge React Flow):
   - Tipe garis bisa dipilih: straight, step, smoothstep, bezier
   - Warna dan ketebalan garis bisa diatur per-edge
   - Bisa punya label text
   - Warna edge otomatis mengikuti status (kalau salah satu ujung node tidak UP, edge jadi putus-putus/pudar)
2. Interaksi menggambar garis: drag dari handle satu node ke handle node lain harus membuat edge baru, tersimpan ke tabel Edge di database dengan sourceHandle/targetHandle yang benar
3. Klik pada edge yang sudah ada harus bisa memilihnya (untuk diedit di PropertyPanel nanti)

PENTING: edge yang digambar di sini TIDAK OTOMATIS membuat relasi parentId di tabel Node. Itu diatur terpisah di fase berikutnya (PropertyPanel). Edge murni untuk visual/dekoratif.

Jelaskan cara mengetes: gambar garis antar 2 node dummy, refresh halaman, pastikan garis dan propertinya (tipe, warna) tetap tersimpan.
```

### 5d. Property Panel + Parent-Child + Edit/View Mode + Undo/Redo

```
Lengkapi canvas dengan:

1. PropertyPanel.tsx — muncul saat node atau edge terpilih:
   - Kalau node dipilih: edit nama, icon, ukuran, labelMode, dan field PARENT (dropdown pilih node lain sebagai parent) — ini yang menentukan logika root-cause, terpisah dari garis visual
   - Kalau edge dipilih: edit tipe garis, warna, tebal, label
2. CanvasToolbar.tsx:
   - Toggle mode Edit / View (mode View: node tidak bisa digeser/diedit, murni lihat)
   - Toggle grid & snap-to-grid
   - Tombol zoom in/out/fit
   - Indikator status auto-save (misal "Tersimpan" / "Menyimpan...")
3. Auto-save posisi node dengan debounce 800ms ke database, tetap ada tombol Save manual
4. Undo/redo (Ctrl+Z / Ctrl+Shift+Z) minimal untuk aksi: pindah posisi node, hapus node, hapus edge, tambah edge

Jelaskan cara mengetes tiap bagian: ganti parent lewat dropdown lalu cek di database field parentId berubah; matikan mode Edit lalu pastikan node tidak bisa digeser; tekan Ctrl+Z setelah menghapus node dan pastikan node kembali.
```

---

## FASE 6 — Dashboard Ringkasan

```
Buatkan halaman dashboard utama (/):
1. Kartu ringkasan global: total node, jumlah UP, DOWN, WARNING, UNREACHABLE
2. Breakdown per regency (tabel atau kartu): nama regency, jumlah UP/DOWN/total
3. Daftar node bermasalah, diurutkan dari yang paling lama down
4. Semua angka update realtime pakai SSE dari Fase 4 (jangan polling refresh manual)

Juga buatkan halaman detail node (/nodes/[id]):
1. Info dasar node + status saat ini
2. Grafik latency (pakai recharts atau chart.js), dengan filter rentang waktu 1 jam / 24 jam / 7 hari / 30 hari
3. Riwayat perubahan status (StatusEvent) dalam bentuk timeline/list, termasuk rootCause kalau ada

Jelaskan cara mengetes halaman ini dengan data dummy yang sudah ada.
```

---

## FASE 7 — Alert Telegram

```
Buatkan sistem alert sesuai CLAUDE.md dan PRD.md bagian 3.5:

1. Integrasi Telegram Bot (pakai TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID dari .env)
2. Kirim alert HANYA saat StatusEvent baru dengan status "to" = DOWN (bukan UNREACHABLE — ini aturan mutlak, tolong dobel-cek logikanya)
3. Format pesan: nama node, IP, region/branch, waktu down, nama parent-nya
4. Kirim pesan "recovery" saat node kembali ke UP, sertakan berapa lama node tadi down
5. Fitur maintenance window sederhana: field di Node atau tabel baru untuk menandai "sedang maintenance" — kalau aktif, node yang down TIDAK mengirim alert

Jelaskan cara setup bot Telegram dari nol (BotFather) sampai dapat token, dan cara saya mengetes: pause node dummy manual lalu jalankan worker, pastikan pesan masuk ke Telegram saya.
```

---

## FASE 8 — Autentikasi & Role

```
Tambahkan autentikasi sesuai PRD.md bagian 3.6:

1. NextAuth dengan credentials provider (email/username + password)
2. 3 role: ADMIN, OPERATOR, VIEWER
3. ADMIN: akses penuh (CRUD node, mode Edit canvas, import CSV, kelola user)
4. OPERATOR: bisa lihat semua + acknowledge alert, TIDAK bisa masuk mode Edit canvas
5. VIEWER: hanya lihat dashboard & canvas (mode View saja), tidak ada tombol edit sama sekali
6. Halaman login sederhana, redirect ke dashboard setelah berhasil
7. Middleware untuk proteksi route sesuai role

Jelaskan cara membuat user ADMIN pertama kali (misal lewat seed atau script terpisah).
```

---

## Catatan Tambahan

- Kalau di tengah fase Claude Code menyimpang dari aturan CLAUDE.md (misal mulai menyarankan Zabbix, auto-layout, atau menyimpan data cuma di memory), **hentikan dan tegur langsung**, contoh: "Stop, itu melanggar aturan di CLAUDE.md bagian 9, tolong perbaiki."
- Setiap akhir fase, sebelum lanjut ke fase berikutnya, selalu commit ke git dulu supaya ada titik aman untuk rollback.
- Kalau ada fase yang kerasa kepanjangan / kepotong konteksnya, boleh pecah manual jadi 2 prompt terpisah (misal Fase 3 dipecah jadi "fping wrapper dulu" baru "state machine-nya").
