// Konfigurasi Auth.js lengkap (jalan di runtime Node, bukan edge).
// Menambahkan provider Credentials: cek username + password ke DB pakai bcrypt.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import authConfig from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const username = creds?.username;
        const password = creds?.password;
        if (typeof username !== "string" || typeof password !== "string") return null;

        const user = await db.user.findUnique({ where: { username } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Yang dikembalikan di sini masuk ke callback jwt() sebagai `user`.
        return { id: user.id, name: user.name ?? user.username, role: user.role };
      },
    }),
  ],
});
