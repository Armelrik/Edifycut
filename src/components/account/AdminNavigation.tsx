"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ChartNoAxesCombined } from "lucide-react";
export function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="mx-auto mb-6 flex max-w-6xl gap-5 border-b border-zinc-200">{[{ href: "/admin", label: "Utilisateurs", icon: Users }, { href: "/admin/statistics", label: "Statistiques", icon: ChartNoAxesCombined }].map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`flex min-h-12 items-center gap-2 border-b-2 text-sm font-medium ${pathname === item.href ? "border-indigo-500 text-indigo-700" : "border-transparent text-zinc-500"}`}><item.icon size={17} />{item.label}</Link>)}</nav>;
}
