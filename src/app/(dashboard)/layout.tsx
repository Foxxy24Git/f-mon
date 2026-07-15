// Layout dashboard: nav atas + isi halaman. Daftar map diambil dari DB supaya
// map baru otomatis muncul di menu tanpa perlu hardcode slug.
import { db } from "@/lib/db";
import Nav from "./Nav";

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
