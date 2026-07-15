"use client";
// Nav atas dashboard. Client component hanya karena butuh usePathname untuk
// menandai menu aktif; daftar map-nya dikirim dari layout (server).
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ maps }: { maps: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Ringkasan" },
    { href: "/nodes", label: "Node" },
    ...maps.map((m) => ({ href: `/map/${m.slug}`, label: m.name })),
  ];

  return (
    <nav className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
      <span className="mr-3 text-sm font-bold">F-mon</span>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={`rounded px-3 py-1 text-sm ${
            pathname === it.href
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
