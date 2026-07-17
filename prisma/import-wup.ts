// Import CSV node dari CLI, memakai handler /api/nodes/import yang sama
// persis dengan tombol Import di UI — jadi tidak ada logika import kembar.
// Middleware auth hanya berlaku untuk request lewat HTTP, script ini memanggil
// handler-nya langsung, jadi tidak perlu sesi login.
//
// Jalankan: npm run import:csv -- <file.csv>
import { readFileSync } from "node:fs";
import { POST } from "@/app/api/nodes/import/route";
import type { NextRequest } from "next/server";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Pakai: npm run import:csv -- <file.csv>");

  const csv = readFileSync(file, "utf8");
  const req = new Request("http://localhost/api/nodes/import", {
    method: "POST",
    body: csv,
  }) as NextRequest;

  const res = await POST(req);
  const result = await res.json();

  console.log(`✅ dibuat: ${result.created}, diupdate: ${result.updated}`);
  if (result.failed?.length) {
    console.log(`⚠️  gagal: ${result.failed.length}`);
    for (const f of result.failed.slice(0, 20)) {
      console.log(`   baris ${f.line} (${f.ip}): ${f.reason}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));
