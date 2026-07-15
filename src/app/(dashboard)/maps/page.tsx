// Halaman kelola map. Server component: ambil map + jumlah node per map dari DB,
// lalu render tabelnya di client (butuh state untuk form edit).
import { auth } from "@/auth";
import { db } from "@/lib/db";
import MapsTable from "./MapsTable";

export default async function MapsPage() {
  const session = await auth();
  const canEdit = session?.user?.role === "ADMIN";

  const [maps, counts] = await Promise.all([
    db.map.findMany({ orderBy: { name: "asc" } }),
    // Node.mapId cuma string (tanpa relasi), jadi jumlahnya dihitung via groupBy,
    // bukan _count di include.
    db.node.groupBy({ by: ["mapId"], _count: { _all: true } }),
  ]);
  const byMap = new Map(counts.map((c) => [c.mapId, c._count._all]));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Kelola Map</h1>
      <MapsTable
        maps={maps.map((m) => ({ ...m, nodeCount: byMap.get(m.id) ?? 0 }))}
        canEdit={canEdit}
      />
    </main>
  );
}
