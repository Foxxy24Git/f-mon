// Prisma client singleton.
// Di dev, Next.js hot-reload bisa bikin banyak instance PrismaClient dan
// menghabiskan koneksi database. Simpan satu instance di globalThis.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Map wajib ada untuk tiap node (schema: Node.mapId), tapi manajemen map baru
// dibangun di fase canvas. Sampai itu, semua node baru nempel ke map "default".
export async function getDefaultMapId(): Promise<string> {
  const map = await db.map.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "Default", slug: "default" },
  });
  return map.id;
}
