"use client";

// Bungkus SessionProvider agar useSession() bisa dipakai di komponen client.
import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
