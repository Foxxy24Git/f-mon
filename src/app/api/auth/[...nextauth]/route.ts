// Endpoint NextAuth (sign-in, sign-out, callback, session). Semua ditangani
// otomatis oleh handlers dari auth.ts.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
