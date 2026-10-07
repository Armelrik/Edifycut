"use client";

import { ThemeControl } from "./ThemeControl";
import { PresenceHeartbeat } from "@/components/account/PresenceHeartbeat";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { FolderOpen, Home, Plus, Settings, UserRound, Video, ShieldCheck, CircleHelp, ArrowUpRight, Radio, AudioLines, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "./Brand";
import type { UserAccount } from "@/types/account";
import { studioSnapshot, parseStudio, subscribeStudio } from "@/lib/studio-preferences";

const navItems = [
  { href: "/", label: "Mon studio", mobile: "Studio", icon: Home },
  { href: "/editor", label: "Éditeur vidéo", mobile: "Éditeur", icon: Video },
  { href: "/merge", label: "Montage & fusion", mobile: "Montage", icon: Film },
  { href: "/live", label: "Live Capture", mobile: "Direct", icon: Radio },
  { href: "/audio", label: "Atelier audio", mobile: "Audio", icon: AudioLines },
  { href: "/videos", label: "Mes vidéos", mobile: "Vidéos", icon: FolderOpen },
  { href: "/settings", label: "Préférences", mobile: "Réglages", icon: Settings },
];
const infoLinks = [{ href: "/about", label: "À propos" }, { href: "/help", label: "Aide" }, { href: "/privacy", label: "Confidentialité" }, { href: "/terms", label: "Conditions" }];

export function AppShell({ children, user }: { children: React.ReactNode; user: UserAccount | null }) {
  const pathname = usePathname();
  const preferences = parseStudio(useSyncExternalStore(subscribeStudio, studioSnapshot, () => null));
  return (
    <div data-accent={preferences.accent} data-density={preferences.density} data-motion={preferences.reducedMotion ? "reduce" : "normal"} className="studio-ui min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <PresenceHeartbeat userId={user?.id ?? null} />
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-zinc-200 bg-white px-5 py-7 lg:flex">
        <Link href="/" aria-label="EdifyCut, accueil"><Brand /></Link>
        <p className="mb-3 mt-10 px-3 text-xs font-medium text-zinc-400">ESPACE DE TRAVAIL</p>
        <nav className="space-y-1" aria-label="Navigation principale">
          {navItems.map(item => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition", active ? "bg-indigo-50 text-indigo-700" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950")}><Icon size={18} />{item.label}</Link>; })}
          {user?.role === "admin" && <Link href="/admin" className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium", pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700" : "text-zinc-500")}><ShieldCheck size={18} />Administration</Link>}
        </nav>
        <div className="mt-auto space-y-5 border-t border-zinc-100 pt-5">
          <Link href="/help" className="flex items-center gap-3 px-3 text-sm text-zinc-500"><CircleHelp size={18} /> Centre d&apos;aide <ArrowUpRight size={14} className="ml-auto" /></Link>
          <Link href="/account" className="flex items-center gap-3 rounded-md border border-zinc-200 p-3 hover:border-indigo-200"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-700"><UserRound size={18} /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{user?.name ?? "Mon compte"}</span><span className="block text-xs text-zinc-500">{user ? user.role === "admin" ? "Administrateur" : "Compte personnel" : "Se connecter"}</span></span></Link>
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="flex h-[76px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-9">
            <Link href="/" className="lg:hidden"><Brand compact /></Link>
            <div className="hidden text-sm text-zinc-400 lg:block">EdifyCut <span className="mx-3">/</span> <span className="font-medium text-zinc-700">{navItems.find(item => item.href === pathname)?.label ?? (pathname.startsWith("/admin") ? "Administration" : pathname === "/account" ? "Mon compte" : infoLinks.find(item => item.href === pathname)?.label)}</span></div>
            <div className="flex items-center gap-2"><ThemeControl /><Link href="/editor" title="Nouveau projet" className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={18} /><span className="hidden sm:inline">Nouveau projet</span></Link><Link href="/account" title="Mon compte" aria-label="Mon compte" className="flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600"><UserRound size={18} /></Link></div>
          </div>
          <nav className="flex overflow-x-auto border-t border-zinc-100 lg:hidden" aria-label="Navigation mobile">{navItems.map(item => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 min-w-[64px] flex-1 shrink-0 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "bg-indigo-50 text-indigo-700" : "text-zinc-500")}><Icon size={18} />{item.mobile}</Link>; })}{user?.role === "admin" && <Link href="/admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined} className={cn("flex min-h-14 min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 px-3 text-[11px] font-medium", pathname.startsWith("/admin") ? "bg-indigo-50 text-indigo-700" : "text-zinc-500")}><ShieldCheck size={18} />Admin</Link>}</nav>
        </header>
        <main id="main" className="flex-1 px-4 py-7 sm:px-6 lg:px-9 lg:py-9">{children}</main>
        <footer className="flex flex-col justify-between gap-4 border-t border-zinc-200 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6 lg:px-9"><span>EdifyCut · Votre contenu, votre rythme.</span><nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Informations">{infoLinks.map(link => <Link key={link.href} href={link.href} className="hover:text-indigo-700">{link.label}</Link>)}</nav></footer>
      </div>
    </div>
  );
}
