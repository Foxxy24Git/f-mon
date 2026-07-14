// Menambahkan `id` & `role` ke tipe bawaan NextAuth agar TypeScript tahu
// field ini ada di session.user, di objek user (authorize), dan di JWT.
import type { DefaultSession } from "next-auth";

type Role = "ADMIN" | "OPERATOR" | "VIEWER";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
