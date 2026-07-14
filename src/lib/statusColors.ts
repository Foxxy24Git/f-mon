// Satu sumber warna status, dipakai badge (tabel/list) & chart/titik (hex).
// Sebelumnya warna ini di-copy di beberapa file — disatukan di sini biar konsisten.
import type { Status } from "@prisma/client";

// Kelas Tailwind untuk badge kecil (background + teks).
export const STATUS_BADGE: Record<Status, string> = {
  UP: "bg-green-100 text-green-800",
  DOWN: "bg-red-100 text-red-800",
  WARNING: "bg-yellow-100 text-yellow-800",
  UNREACHABLE: "bg-orange-100 text-orange-800",
  PAUSED: "bg-blue-100 text-blue-800",
  UNKNOWN: "bg-gray-100 text-gray-500",
};

// Warna solid (hex) untuk garis chart, titik, dan angka besar di kartu ringkasan.
export const STATUS_HEX: Record<Status, string> = {
  UP: "#16a34a",
  WARNING: "#eab308",
  DOWN: "#dc2626",
  UNREACHABLE: "#f97316",
  PAUSED: "#3b82f6",
  UNKNOWN: "#9ca3af",
};
