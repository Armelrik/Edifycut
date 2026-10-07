"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportRestriction, hasPro, PRO_PRICE, type ExportRequest } from "@/lib/plans";
import type { UserAccount } from "@/types/account";
export function ExportPlanNotice() {
  return <p className="text-xs leading-5 text-zinc-500">Gratuit : 60 s, vidéo 720p maximum, audio MP3 128 kb/s. <Link href="/pro" className="font-medium text-indigo-700">Pro · {PRO_PRICE}/an</Link></p>;
}
export function useExportAccess() {
  const [reason, setReason] = useState(""), [checking, setChecking] = useState(false);
  const pending = useRef(false), alive = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (reason && !dialog.current?.open) dialog.current?.showModal(); }, [reason]);
  async function allow(request: ExportRequest) {
    if (pending.current) return false;
    const restriction = exportRestriction(request); if (!restriction) return true;
    pending.current = true; setChecking(true);
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const { user } = await response.json() as { user: UserAccount | null };
      if (!alive.current) return false;
      if (hasPro(user?.proUntil)) return true;
      setReason(restriction);
    } catch { if (alive.current) setReason("Impossible de vérifier l’accès Pro. Réessayez ou utilisez les réglages gratuits."); }
    finally { pending.current = false; if (alive.current) setChecking(false); }
    return false;
  }
  const paywall = <dialog ref={dialog} aria-labelledby="export-paywall-title" onClose={() => setReason("")} className="pro-dialog m-auto w-[calc(100%-32px)] max-w-md rounded-lg border border-zinc-200 bg-white p-5 text-zinc-950 backdrop:bg-black/60">
    <div className="flex items-center justify-between gap-3"><Crown size={24} className="text-indigo-600" /><Button variant="ghost" title="Fermer" aria-label="Fermer l’offre Pro" onClick={() => dialog.current?.close()}><X size={18} /></Button></div>
    <h2 id="export-paywall-title" className="mt-3 text-xl font-semibold">Passez à EdifyCut Pro</h2><p className="mt-3 text-sm text-zinc-500">{reason}</p><p className="mt-4 text-2xl font-semibold">{PRO_PRICE}<span className="text-sm font-normal text-zinc-500"> / an</span></p><p className="mt-2 text-sm leading-6 text-zinc-500">Exports plus longs, 1080p, qualité originale et formats audio supplémentaires.</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link href="/pro" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white"><Crown size={17} />Voir l’offre Pro</Link><Button variant="secondary" onClick={() => dialog.current?.close()}>Ajuster l’export gratuit</Button></div>
  </dialog>;
  return { allow, checking, paywall };
}
