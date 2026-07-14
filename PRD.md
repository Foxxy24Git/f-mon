# PRD — F-mon (Fx Monitoring)

**Versi:** 1.0
**Pemilik:** Fx — Network Monitoring & ATM Officer, Bank Nagari
**Status:** Draft / MVP Planning

---

## 1. Ringkasan Produk

F-mon adalah aplikasi monitoring jaringan & ATM **self-hosted** yang:

1. Melakukan **ping (ICMP)** langsung dari server monitoring ke seluruh target (ATM, gateway cabang, perangkat jaringan).
2. Menyimpan seluruh hasil ping ke **database milik aplikasi sendiri** (tanpa Zabbix, tanpa Prometheus).
3. Menyediakan **canvas topologi yang dirancang penuh oleh user** — user sendiri yang menentukan tata letak, icon, dan garis (link) antar node.
4. Menampilkan status **root-cause aware**: jika gateway/cabang down, ATM di bawahnya ditandai `UNREACHABLE` (bukan `DOWN`), sehingga tidak terjadi banjir alert palsu.

### Masalah yang Diselesaikan

- Tools existing (Zabbix/Grafana) tidak fleksibel untuk topologi visual custom.
- Butuh gambaran cepat "mana yang benar-benar mati, mana yang cuma korban gateway mati".
- Butuh peta jaringan yang mencerminkan struktur nyata (Cabang → ATM), bukan grid acak.

### Non-Goal (Tidak Dikerjakan di v1)

- SNMP, trap, atau metrik selain ICMP.
- Integrasi API MikroTik (dipertimbangkan di v2 sebagai secondary validation).
- Konfigurasi perangkat / write access ke device.
- Multi-tenant.

---

## 2. Pengguna

| Peran                  | Kebutuhan                                                       |
| ---------------------- | --------------------------------------------------------------- |
| **Admin / Fx**         | CRUD node, desain canvas, atur relasi parent-child, kelola user |
| **Operator NOC**       | Melihat canvas read-only, melihat alert, melihat history        |
| **Viewer / Manajemen** | Lihat dashboard ringkasan (jumlah UP/DOWN per regency)          |

---

## 3. Fitur Utama

### 3.1 Ping Engine (Core)

**Keputusan arsitektur:** ping dilakukan **langsung dari server monitoring**, bukan dari API MikroTik.

Requirement:

- Mendukung minimal **1.000 target IP** (kebutuhan saat ini ±700).
- Interval ping dapat dikonfigurasi **per node** (default: 30 detik).
- Ping dijalankan **paralel/batch** — gunakan `fping` (subprocess) sebagai engine utama karena efisien untuk ratusan host sekaligus. Fallback: library ICMP Node.js.
- Setiap siklus mencatat: `is_alive`, `latency_ms` (avg), `packet_loss_pct`.
- Timeout & retry dapat dikonfigurasi (default: timeout 1000ms, 3 paket per siklus).
- Ping engine berjalan sebagai **worker terpisah** dari web server Next.js (agar UI tidak terblokir).

**Penentuan Status (state machine):**

| Status        | Kondisi                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `UP`          | Ping sukses (packet loss < 100%)                                             |
| `WARNING`     | Ping sukses tapi latency > threshold ATAU packet loss antara 1–99%           |
| `DOWN`        | Ping gagal **DAN** semua parent-nya `UP` (jadi ini benar-benar mati sendiri) |
| `UNREACHABLE` | Ping gagal **DAN** ada parent yang `DOWN`/`UNREACHABLE` (korban root cause)  |
| `PAUSED`      | Node dimatikan monitoringnya secara manual (maintenance)                     |
| `UNKNOWN`     | Belum pernah di-ping sejak start                                             |

**Logika Root-Cause (wajib):**
Setiap siklus ping, setelah semua hasil terkumpul:

1. Bangun graph dari relasi `parentId`.
2. Traverse dari root ke bawah.
3. Jika sebuah node gagal ping **dan** ada ancestor yang tidak `UP` → status = `UNREACHABLE`.
4. Jika gagal ping tapi semua ancestor `UP` → status = `DOWN` (ini yang memicu alert).

Hanya perubahan status ke `DOWN` yang memicu notifikasi. `UNREACHABLE` tidak boleh spam alert.

**Anti-Flapping:**

- Status baru dianggap sah setelah N siklus berturut-turut (default N=2), agar tidak flapping karena 1 paket hilang.

---

### 3.2 Canvas Topologi (Fitur Pembeda Utama)

Canvas adalah **editor yang sepenuhnya dikendalikan user**. Ini bukan auto-layout.

**Kanvas:**

- Ukuran kerja sangat besar — minimal **10.000 × 10.000 px** virtual space (bukan sebatas viewport).
- **Pan** (drag background / spacebar+drag / scroll).
- **Zoom** (scroll wheel + tombol +/- + "fit to screen"), range 10%–300%.
- **Minimap** di pojok untuk navigasi cepat (penting karena banyak node).
- **Grid** background dengan opsi **snap-to-grid** (on/off).
- Background canvas bisa diganti (polos / grid / dot).

**Node (Icon):**

- User **memilih sendiri icon** untuk setiap node dari library icon (ATM, router, switch, server, gedung cabang, cloud/ISP, firewall, printer, dll).
- User dapat **upload icon custom** (SVG/PNG).
- Node bisa **di-drag bebas** ke posisi manapun; posisi (`x`, `y`) disimpan ke DB.
- Node bisa **di-resize** (kecil/sedang/besar).
- Label node bisa diatur: tampilkan nama saja / nama + IP / nama + IP + latency.
- Node bisa **multi-select** (drag box atau ctrl+click) lalu digeser/dihapus bersamaan.
- Node bisa di-**copy/paste** dan **duplicate**.
- Warna border/glow node otomatis mengikuti status: hijau (UP), kuning (WARNING), merah (DOWN), abu-abu (UNREACHABLE), biru (PAUSED).
- Node `DOWN` boleh diberi animasi berkedip agar mudah terlihat di canvas besar.

**Line / Edge (Link):**

- User **menggambar sendiri** garis antar node (drag dari handle node A ke node B).
- Handle koneksi tersedia di 4 sisi node (atas, bawah, kiri, kanan) — supaya rapi.
- Tipe garis dapat dipilih: **straight**, **step (siku-siku)**, **smoothstep**, **bezier**.
- Warna & ketebalan garis dapat diatur user.
- Garis dapat diberi **label** (misal: "FO 100Mbps", "VSAT", "VLAN 210").
- Garis mewarisi status: jika salah satu ujung tidak `UP`, garis berubah warna/putus-putus.
- Garis dapat diberi **waypoint** manual (opsional, v1.1) supaya user bisa mengatur belokan kabel.

**Relasi Parent-Child:**

- Garis di canvas **tidak otomatis** membuat relasi parent-child.
- Relasi parent-child ditentukan **eksplisit** di properti node (dropdown "Parent"), agar logika root-cause tetap akurat meski user menggambar garis dekoratif.

**Layer / Multi-Map:**

- Mendukung banyak canvas/map. Contoh: satu map per regency (Padang, Bukittinggi, Payakumbuh, dst) + satu map "Overview".
- Node bisa muncul di lebih dari satu map (opsional v1.1).

**Editor Behavior:**

- Mode **Edit** vs mode **View** dipisahkan (toggle). Mode View = read-only, tidak sengaja menggeser icon.
- **Auto-save** posisi setiap perubahan (debounce ~800ms), plus tombol "Save" manual.
- **Undo/Redo** (Ctrl+Z / Ctrl+Shift+Z).
- Export canvas ke PNG/SVG.

---

### 3.3 Manajemen Node

- CRUD node: nama, IP, tipe (ATM / GATEWAY / SWITCH / SERVER / BRANCH / OTHER), lokasi (regency/cabang), parent, interval ping, threshold latency, aktif/nonaktif.
- **Bulk import via CSV** — wajib, karena ±700 IP.
  Format: `name,ip,type,region,branch,parent_ip,icon`
- Bulk edit (ubah interval / pause banyak node sekaligus).
- Pencarian & filter node (by IP, nama, regency, status).

---

### 3.4 Dashboard & Monitoring

- **Ringkasan global:** total node, UP, DOWN, WARNING, UNREACHABLE.
- **Breakdown per regency**: tabel/kartu UP-DOWN per wilayah.
- **Live status**: update realtime (WebSocket / SSE / polling 5–10 detik).
- **Daftar node bermasalah** diurutkan berdasarkan durasi down terlama.
- **Halaman detail node:** grafik latency (1h / 24h / 7d / 30d), riwayat perubahan status, uptime %, log kejadian.

---

### 3.5 Alerting (v1 sederhana)

- Alert dibuat hanya saat transisi ke `DOWN` (bukan `UNREACHABLE`).
- Kanal: **Telegram Bot** (prioritas 1) dan Email (opsional).
- Isi pesan: nama node, IP, lokasi, waktu down, dan parent-nya.
- Alert "recovery" saat kembali `UP`, sertakan durasi downtime.
- Silence/maintenance window per node.

---

### 3.6 Autentikasi

- Login (NextAuth / auth sederhana), role: `ADMIN`, `OPERATOR`, `VIEWER`.
- Hanya `ADMIN` yang bisa masuk mode Edit canvas & CRUD node.

---

## 4. Arsitektur Teknis

```
┌──────────────────────────────────────────────────────┐
│  Proxmox VM (Ubuntu)                                  │
│                                                       │
│  ┌────────────────┐      ┌────────────────────────┐   │
│  │ Next.js App    │◄────►│ PostgreSQL             │   │
│  │ (UI + API)     │      │ - nodes                │   │
│  │                │      │ - edges / maps         │   │
│  └────────┬───────┘      │ - ping_results (TS)    │   │
│           │              │ - status_events        │   │
│           │ SSE/WS       └───────────┬────────────┘   │
│           ▼                          ▲                │
│  ┌────────────────┐                  │                │
│  │ Ping Worker    │──────────────────┘                │
│  │ (Node.js)      │                                   │
│  │  └─ fping      │                                   │
│  └────────┬───────┘                                   │
└───────────┼───────────────────────────────────────────┘
            │ ICMP
            ▼
   700+ target: ATM, Gateway Cabang, Switch
```

### Stack

| Layer       | Teknologi                                             |
| ----------- | ----------------------------------------------------- |
| Frontend    | Next.js 15 (App Router), TypeScript, Tailwind CSS     |
| Canvas      | React Flow (custom node + custom edge, bukan default) |
| State       | Zustand                                               |
| Backend     | Next.js Route Handlers                                |
| ORM         | Prisma                                                |
| Database    | PostgreSQL 16                                         |
| Ping Engine | Node.js worker + `fping`                              |
| Realtime    | Server-Sent Events (SSE)                              |
| Deploy      | Docker Compose di Proxmox VM                          |

**Catatan React Flow:** dipilih karena sudah menyediakan pan/zoom/minimap/drag yang stabil, tapi **node dan edge dibuat custom sepenuhnya** — user tetap punya kontrol penuh atas icon, garis, dan tata letak. Ini menghemat waktu dibanding membangun engine canvas dari nol.

---

## 5. Skema Database (draft)

```prisma
model Node {
  id           String   @id @default(cuid())
  name         String
  ipAddress    String   @unique
  type         NodeType @default(ATM)
  region       String?          // regency
  branch       String?
  parentId     String?
  parent       Node?    @relation("Tree", fields: [parentId], references: [id])
  children     Node[]   @relation("Tree")

  // canvas
  mapId        String
  posX         Float    @default(0)
  posY         Float    @default(0)
  icon         String   @default("atm")
  size         Int      @default(48)
  labelMode    String   @default("NAME_IP")

  // monitoring
  enabled      Boolean  @default(true)
  intervalSec  Int      @default(30)
  latencyWarnMs Int     @default(200)

  status       Status   @default(UNKNOWN)
  lastLatency  Float?
  lastCheckAt  DateTime?
  lastChangeAt DateTime?

  pings        PingResult[]
  events       StatusEvent[]
}

model Edge {
  id        String @id @default(cuid())
  mapId     String
  sourceId  String
  targetId  String
  sourceHandle String?   // top | right | bottom | left
  targetHandle String?
  lineType  String @default("smoothstep")
  color     String @default("#64748b")
  width     Int    @default(2)
  label     String?
  animated  Boolean @default(false)
}

model Map {
  id     String @id @default(cuid())
  name   String
  slug   String @unique
  bgType String @default("dots")
}

model PingResult {
  id        BigInt   @id @default(autoincrement())
  nodeId    String
  ts        DateTime @default(now())
  isAlive   Boolean
  latencyMs Float?
  lossPct   Float
  @@index([nodeId, ts])
}

model StatusEvent {
  id        String   @id @default(cuid())
  nodeId    String
  from      Status
  to        Status
  ts        DateTime @default(now())
  rootCause String?   // id node penyebab jika UNREACHABLE
}

enum NodeType { ATM GATEWAY SWITCH ROUTER SERVER BRANCH ISP OTHER }
enum Status   { UP DOWN WARNING UNREACHABLE PAUSED UNKNOWN }
```

**Retensi data:** `PingResult` mentah disimpan 7 hari, lalu diagregasi ke tabel `PingHourly` (avg/max latency, uptime %) untuk histori jangka panjang. Ini penting — 700 node × interval 30 detik = ±2 juta baris/hari.

---

## 6. Performa & Skala

| Metrik            | Target                                       |
| ----------------- | -------------------------------------------- |
| Jumlah node       | 1.000                                        |
| Siklus ping penuh | < 15 detik untuk 700 IP                      |
| Render canvas     | 500+ node tetap smooth (60fps saat pan/zoom) |
| Update UI         | ≤ 10 detik dari perubahan status             |
| Query dashboard   | < 500 ms                                     |

**Optimasi canvas wajib:**

- Virtualisasi / `onlyRenderVisibleElements` pada React Flow.
- Node di-`memo`, tidak re-render kalau status tidak berubah.
- Status di-push via SSE, bukan refetch seluruh node.

---

## 7. Roadmap

**Fase 1 — Fondasi (MVP)**

- Setup project + Prisma + PostgreSQL
- CRUD node + import CSV
- Ping worker (fping) + simpan hasil
- Logika root-cause

**Fase 2 — Canvas**

- Canvas editor: drag icon, pan, zoom, minimap, grid snap
- Custom node dengan icon pilihan user
- Custom edge: gambar garis manual, pilih tipe/warna/label
- Auto-save layout, undo/redo, mode Edit/View

**Fase 3 — Monitoring UI**

- Dashboard ringkasan + per regency
- Realtime SSE
- Halaman detail node + grafik latency

**Fase 4 — Alert & Polish**

- Telegram alert + recovery
- Maintenance window
- Export PNG, agregasi data, retensi

**Fase 5 (v2, opsional)**

- Integrasi MikroTik API / Netwatch sebagai secondary check
- Traceroute on-demand saat node DOWN

---

## 8. Kriteria Sukses

- Semua ±700 IP ter-monitor dengan siklus stabil < 15 detik.
- Saat gateway cabang mati, hanya **1 alert** yang muncul (gateway-nya), bukan puluhan alert ATM.
- Fx bisa mendesain ulang tata letak topologi tanpa menyentuh kode sama sekali.
- Canvas tetap responsif dengan ratusan node di layar.
