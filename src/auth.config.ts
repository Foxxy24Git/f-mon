// Konfigurasi Auth.js yang AMAN dijalankan di edge (middleware).
// Tidak boleh impor Prisma / bcrypt di sini — middleware Next.js jalan di
// runtime edge yang tidak punya Node API. Provider Credentials (yang butuh DB)
// ditambahkan terpisah di auth.ts. Di sini cukup callback untuk menaruh `role`
// ke dalam token/sesi dan menunjuk halaman login custom.
import type { NextAuthConfig } from "next-auth";

export default {
  trustHost: true, // wajib untuk self-host (bukan Vercel)
  pages: { signIn: "/login" },
  session: { strategy: "jwt" }, // Credentials provider mengharuskan JWT
  providers: [], // diisi di auth.ts
  callbacks: {
    // Salin id & role dari user (saat login) ke dalam JWT.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // Ekspos id & role ke sesi agar bisa dibaca komponen/middleware.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "OPERATOR" | "VIEWER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
