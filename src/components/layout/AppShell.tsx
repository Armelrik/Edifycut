"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Home, Menu, Plus, Settings, UserRound, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/videos", label: "Mes videos", icon: FolderOpen },
  { href: "/editor", label: "Nouveau projet", icon: Video },
  { href: "/settings", label: "Parametres", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-stone-200/80 bg-white/78 px-4 py-5 backdrop-blur lg:block">
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-lg bg-stone-950 text-sm font-bold text-white">
            EC
          </span>
          <span className="text-lg font-bold tracking-tight">EdifyCut</span>
        </Link>

        <nav className="mt-10 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-amber-50 text-amber-800" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950",
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/82 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-stone-950 text-xs font-bold text-white">
                EC
              </span>
              <span className="font-bold">EdifyCut</span>
            </Link>
            <div className="hidden items-center gap-2 text-sm text-stone-500 lg:flex">
              <Menu size={17} />
              <span>Studio de montage</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/editor">
                <Button className="h-10 px-3">
                  <Plus size={17} />
                  <span className="hidden sm:inline">Nouveau projet</span>
                </Button>
              </Link>
              <button
                aria-label="Profil utilisateur"
                className="flex size-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700"
              >
                <UserRound size={18} />
              </button>
            </div>
          </div>
          <nav className="grid grid-cols-4 border-t border-stone-200 bg-white lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium",
                    active ? "text-amber-800" : "text-stone-500",
                  )}
                >
                  <Icon size={17} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
