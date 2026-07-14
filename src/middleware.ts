// Penjaga route di sisi server (satu titik enforcement).
// Pakai auth.config (edge-safe) untuk membaca JWT, TANPA Prisma/bcrypt.
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Method yang mengubah data. GET/HEAD/OPTIONS dianggap read-only.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// API CRUD yang hanya boleh diubah ADMIN.
const CRUD_API = /^\/api\/(nodes|edges|maps)(\/|$)/;

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  // Endpoint NextAuth sendiri (login/callback) harus selalu bisa diakses.
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  // Sudah login tapi buka /login → lempar ke dashboard.
  if (pathname === "/login") {
    return user ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }

  // Belum login: API → 401 JSON, halaman → redirect ke /login.
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Sudah login: batasi mutasi CRUD hanya untuk ADMIN.
  if (MUTATING.has(req.method) && CRUD_API.test(pathname) && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Butuh role ADMIN" }, { status: 403 });
  }

  return NextResponse.next();
});

// Jangan jalankan middleware untuk aset statis.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
