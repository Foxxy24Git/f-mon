// Registry icon untuk node canvas (CLAUDE.md §6).
// Satu tempat yang dipakai bersama oleh DeviceNode (menggambar icon) dan
// NodePalette (daftar icon yang bisa di-drag). Key `icon` disimpan di DB
// (kolom Node.icon, default "atm"). Kalau key tak dikenal → fallback ke atm.
import {
  Banknote,
  Router,
  Network,
  Server,
  Building2,
  Cloud,
  ShieldCheck,
  Printer,
  Wifi,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import type { NodeTypeStr } from "./nodes";

export type IconDef = {
  key: string; // disimpan ke DB (Node.icon)
  label: string; // teks di palette (Bahasa Indonesia)
  Icon: LucideIcon;
  type: NodeTypeStr; // NodeType default saat node dibuat dari icon ini
};

// Urutan di sini = urutan tampil di palette.
export const ICONS: IconDef[] = [
  { key: "atm", label: "ATM", Icon: Banknote, type: "ATM" },
  { key: "router", label: "Router", Icon: Router, type: "ROUTER" },
  { key: "switch", label: "Switch", Icon: Network, type: "SWITCH" },
  { key: "server", label: "Server", Icon: Server, type: "SERVER" },
  { key: "branch", label: "Cabang", Icon: Building2, type: "BRANCH" },
  { key: "isp", label: "ISP / Cloud", Icon: Cloud, type: "ISP" },
  { key: "firewall", label: "Firewall", Icon: ShieldCheck, type: "OTHER" },
  { key: "printer", label: "Printer", Icon: Printer, type: "OTHER" },
  { key: "ap", label: "Access Point", Icon: Wifi, type: "OTHER" },
  { key: "storage", label: "Storage", Icon: HardDrive, type: "OTHER" },
];

const BY_KEY = new Map(ICONS.map((d) => [d.key, d]));

export function iconFor(key: string | null | undefined): IconDef {
  return (key && BY_KEY.get(key)) || BY_KEY.get("atm")!;
}
