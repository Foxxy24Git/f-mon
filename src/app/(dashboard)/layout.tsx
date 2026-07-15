// Layout dashboard: nav atas + isi halaman. Daftar map diambil dari DB supaya
// map baru otomatis muncul di menu tanpa perlu hardcode slug.
import { db } from "@/lib/db";
import Nav from "./Nav";

// Data monitoring selalu berubah (status ping tiap siklus) — jangan pernah
// di-prerender statis. Ini juga yang bikin `next build` gagal di Docker:
// tanpa ini, Next mencoba query DB saat build padahal container db belum jalan.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const maps = await db.map.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });

  return (
    <div className="flex h-dvh flex-col">
      <Nav maps={maps} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
