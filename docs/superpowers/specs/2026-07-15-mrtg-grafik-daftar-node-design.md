# Desain: Grafik "MRTG" di Halaman Daftar Node + Seed Simulasi

Tanggal: 2026-07-15
Status: menunggu review Fx

---

## 1. Latar Belakang & Ruang Lingkup

Fx minta "fitur MRTG": dari halaman daftar semua node, bisa langsung cek grafik
tiap node di situ juga.

**Klarifikasi penting:** MRTG asli adalah grafik trafik berbasis SNMP. Itu
melanggar CLAUDE.md §1 (hanya ICMP) dan §9 (tanpa SNMP). Setelah dikonfirmasi ke
Fx, yang dimaksud adalah **grafik latency/uptime dari data ping yang sudah
dikumpulkan F-mon sendiri** — istilah "MRTG" dipakai sebagai sebutan umum untuk
"grafik". Tidak ada SNMP, tidak ada dependensi baru, tidak ada aturan yang
dilanggar.

### Yang sudah ada (tidak dibuat ulang)

- `GET /api/nodes/[id]/history?range=1h|24h|7d|30d` — sudah mengembalikan
  `points` + `events`, dan sudah otomatis membaca `PingResult` (1h/24h) atau
  `PingHourly` (7d/30d) sesuai retensi di CLAUDE.md §8.
- `nodes/[id]/page.tsx` — sudah menggambar grafik latency lengkap dengan filter
  rentang, pakai recharts (sudah terpasang).

### Yang benar-benar kurang

1. Cara melihat grafik itu dari daftar node, tanpa pindah halaman satu per satu.
2. Data ping untuk simulasi. `seed-solok-sim.ts` hanya mengisi kolom `status` +
   `lastLatency`, nol baris `PingResult`. Akibatnya semua grafik sekarang kosong.

### Di luar ruang lingkup

- API baru untuk grafik. Yang ada sudah cukup persis.
- Grafik trafik/bandwidth. Butuh SNMP → dilarang.
- Perubahan pada mesin status, worker ping, atau canvas.

---

## 2. Keputusan Desain

| Keputusan            | Pilihan                              | Alasan                                                                                             |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Bentuk tampilan      | Accordion (baris tabel bisa dibuka)  | Grafik hanya di-fetch saat dibuka → 700 node tetap enteng. Tanpa API baru.                          |
| Kedalaman data sim   | 24 jam mentah + 30 hari per-jam      | Semua tombol rentang (1h/24h/7d/30d) berisi.                                                        |
| Pola data sim        | Realistis + insiden berdurasi        | Sekalian menguji root-cause secara visual, bukan cuma grafik ramai.                                 |
| `parentId` node sim  | Diisi seed sim, hanya jika masih null | Tanpa parent tidak ada ancestor → `UNREACHABLE` mustahil muncul. Parent yang sudah di-set Fx aman.  |
| Lokasi seed sim      | File baru, terpisah dari seed Solok  | Seed Solok mengurus node & tata letak; ini mengurus riwayat. Bisa dijalankan ulang tanpa mengacak canvas. |

---

## 3. Komponen

### 3.1 `src/components/LatencyChart.tsx` (baru)

Blok grafik yang sekarang ada di dalam `nodes/[id]/page.tsx`, diangkat apa adanya
menjadi komponen sendiri.

- **Prop:** `{ nodeId: string }`. Satu-satunya.
- **Tanggung jawab:** mengurus state `range`, fetch `/api/nodes/[id]/history`,
  render tombol rentang + `LineChart`.
- **Tidak mengurus:** riwayat status (`events`) — itu tetap milik halaman detail.
  Komponen ini menerima `events` dari respons API tapi mengabaikannya.
- **Dipakai oleh:** `nodes/[id]/page.tsx` dan accordion di `nodes/page.tsx`.

**Konsekuensi yang disadari:** di halaman detail, `LatencyChart` mengambil
`points` dan halaman itu sendiri tetap mengambil `events` — dua request ke
endpoint yang sama. Ini sengaja dibiarkan: `events` tidak bergantung pada `range`
dan harus ikut ter-refresh saat SSE melaporkan perubahan status, sedangkan
`points` ikut `range`. Menyatukan keduanya berarti mengangkat state `range` ke
halaman detail, dan accordion jadi ikut menanggung urusan riwayat status yang
tidak dipakainya. Satu request ekstra di satu halaman lebih murah daripada itu.

Kenapa diangkat, bukan disalin: keduanya menggambar grafik yang identik. Disalin
berarti tiap perbaikan dikerjakan dua kali dan pasti ada yang kelewat.

Efek ke halaman detail: **lebih pendek**, ±60 baris pindah keluar. Tampilannya
tidak berubah sama sekali.

### 3.2 `src/app/(dashboard)/nodes/page.tsx` (diubah)

- State baru: `expandedId: string | null`.
- Kolom baru paling kiri: penanda `▶` / `▼`, dan baris bisa diklik untuk
  buka/tutup.
- Saat terbuka: satu `<tr>` tambahan berisi `<td colSpan={...}>` dengan
  `<LatencyChart nodeId={n.id} />` di dalamnya.
- **Hanya satu baris terbuka sekaligus.** Bukan demi kerapian — supaya jumlah
  fetch dan chart yang hidup selalu tepat satu, berapa pun panjang tabelnya.
  Baris tertutup tidak me-render chart sama sekali.
- Tombol Edit/Hapus yang sudah ada tidak boleh ikut men-trigger buka/tutup
  (`stopPropagation`).

### 3.3 `prisma/seed-ping-sim.ts` (baru)

Script seed, dijalankan manual. Idempoten.

**Langkah:**

1. Ambil semua node di map `default`.
2. **Isi parent yang kosong:** tiap ATM disambung ke satu ISP, dibagi rata dan
   deterministik. Node yang `parentId`-nya sudah terisi **tidak disentuh**.
3. Hapus `PingResult` + `PingHourly` lama milik node-node itu (idempoten).
4. Bangkitkan riwayat, tulis `createMany` per batch.
5. Selaraskan kolom cache `status` / `lastLatency` / `lastCheckAt` dengan titik
   terakhir yang dibangkitkan, supaya tabel & canvas tidak bertentangan dengan
   grafiknya.

**Model latency per node:**

```
latency(t) = base(node) × kurvaHarian(t) × (1 + derau)
```

- `base`: ISP 5–15 ms, ATM 20–60 ms. Tetap per node (deterministik dari nama).
- `kurvaHarian`: naik di jam kerja (08:00–16:00 WIB), turun malam.
- `derau`: acak kecil, ±15%.
- Deterministik — PRNG ber-seed, bukan `Math.random()`, supaya hasilnya bisa
  diulang dan dibandingkan.

**Insiden yang ditanam:**

| Insiden          | Durasi   | Efek yang diharapkan                                                          |
| ---------------- | -------- | ----------------------------------------------------------------------------- |
| 2–3 ATM mati     | 20–90 mnt | Ping gagal → `DOWN`. Grafik putus. Ini yang boleh kirim alert.                 |
| 1 ISP mati       | ±3 jam    | ISP → `DOWN`. **Semua ATM di bawahnya → `UNREACHABLE`**, grafik putus bersamaan. |
| Beberapa node lambat | 1–2 jam | Latency menembus `latencyWarnMs` → `WARNING`, grafik menonjol tapi tidak putus. |

Insiden ISP adalah yang paling penting: itu seluruh alasan aplikasi ini dibuat
(CLAUDE.md §5 — `UNREACHABLE` tidak boleh kirim alert).

**Volume:** 47 node × 2.880 titik (24 jam @30 dtk) ≈ 135rb baris `PingResult`,
plus 47 × 720 ≈ 34rb baris `PingHourly` (30 hari × 24 jam).

**Hubungan dua tabel itu:** `PingResult` hanya diisi untuk **24 jam terakhir**
(meniru retensi asli 7 hari di CLAUDE.md §8 — tidak perlu penuh untuk simulasi).
`PingHourly` diisi untuk **30 hari penuh**, dengan pembagian:

- **24 jam terakhir:** diagregasi dari titik `PingResult` yang baru dibangkitkan,
  supaya grafik 7d/30d nyambung mulus dengan 1h/24h di jam yang sama.
- **29 hari sebelumnya:** dibangkitkan langsung per jam dari model latency yang
  sama (tanpa membuat titik mentahnya), karena data mentahnya memang seharusnya
  sudah dibuang oleh retensi.

**Script:** `"seed:ping-sim": "node --env-file=.env --import tsx prisma/seed-ping-sim.ts"`

---

## 4. Aliran Data

```
Fx klik baris node
      ↓
expandedId = node.id
      ↓
<LatencyChart nodeId> ter-mount
      ↓
GET /api/nodes/[id]/history?range=1h     ← API yang SUDAH ADA
      ↓
1h/24h → PingResult   |   7d/30d → PingHourly
      ↓
points[] → recharts LineChart (latency null = garis putus = periode gagal ping)
```

Fx klik baris lain → yang lama unmount (fetch berhenti), yang baru mount.

---

## 5. Penanganan Error

- **Belum ada data ping:** sudah ditangani — `points.length === 0` menampilkan
  "Belum ada data ping untuk rentang ini." Perilaku ini ikut terangkat ke
  `LatencyChart`.
- **Fetch gagal:** `LatencyChart` tampilkan pesan gagal + tombol coba lagi.
  Halaman detail sekarang diam saja kalau fetch gagal; ini perbaikan kecil yang
  ikut terbawa ke dua tempat sekaligus.
- **Seed dijalankan tanpa node:** berhenti dengan pesan jelas, suruh jalankan
  `seed-solok-sim.ts` dulu.
- **Seed dijalankan dua kali:** aman, data lama dihapus dulu.

---

## 6. Cara Menguji

Setelah implementasi, Fx jalankan:

```bash
npm run seed:ping-sim      # bangkitkan riwayat ping palsu
npm run dev
```

Lalu buka `http://localhost:3000/nodes` dan periksa:

1. Tiap baris punya tanda `▶` di depan nama.
2. Klik satu baris → grafik latency muncul melebar di bawahnya, ada isinya
   (bukan "belum ada data").
3. Tombol `1h` / `24h` / `7d` / `30d` semuanya menampilkan grafik.
4. Klik baris lain → yang pertama menutup sendiri.
5. Klik tombol Edit → form terbuka, baris **tidak** ikut buka/tutup.
6. Cari node ber-status `DOWN` → grafiknya ada bagian putus.
7. Buka node ISP yang kena insiden, catat jam putusnya. Buka salah satu ATM
   di bawahnya → **putus di jam yang sama**, dan di halaman detail ATM itu
   riwayat statusnya berbunyi `UNREACHABLE` dengan keterangan "akibat <nama ISP>".
   Ini bukti root-cause jalan.
8. Halaman detail node (`/nodes/[id]`) tampilannya **tidak berubah** — grafiknya
   sama seperti sebelumnya.

---

## 7. Berkas yang Disentuh

| Berkas                                | Aksi   |
| ------------------------------------- | ------ |
| `src/components/LatencyChart.tsx`     | baru   |
| `src/app/(dashboard)/nodes/page.tsx`  | ubah   |
| `src/app/(dashboard)/nodes/[id]/page.tsx` | ubah (jadi lebih pendek) |
| `prisma/seed-ping-sim.ts`             | baru   |
| `package.json`                        | ubah (1 script) |

Empat berkas, nol dependensi baru, nol endpoint baru.

---

## 8. Kepatuhan pada CLAUDE.md §9

- ✅ Tanpa SNMP — sumber data hanya hasil ping ICMP sendiri.
- ✅ Tanpa Zabbix/Prometheus/InfluxDB/Grafana — recharts sudah terpasang.
- ✅ Tanpa auto-layout — tidak menyentuh canvas.
- ✅ Tanpa hardcode IP/kredensial — IP simulasi 10.50.x.x tidak routable, dan
  hanya ada di berkas seed, bukan di source aplikasi.
- ✅ Data ping tetap persist ke DB, bukan di memory.
- ✅ Tidak mengirim alert untuk `UNREACHABLE` — desain ini tidak menyentuh alert
  sama sekali (Fase 5 belum dikerjakan).
- ✅ Bertahap — 4 berkas, bukan 15.
