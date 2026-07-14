// Membuat / mengupdate user ADMIN pertama dari .env.
// Jalankan: npm run seed:admin
// Idempoten: kalau username sudah ada, password & role di-update (upsert).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error("Set ADMIN_USERNAME dan ADMIN_PASSWORD di .env dulu.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash, role: "ADMIN" },
    create: { username, passwordHash, role: "ADMIN", name: "Administrator" },
  });

  console.log(`✅ Admin siap: ${user.username} (role ${user.role})`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
