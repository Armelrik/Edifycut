"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasPro, PRO_PRICE } from "@/lib/plans";
import type { UserAccount } from "@/types/account";
export function ProOffer({ user, configured, sandbox }: { user: UserAccount | null; configured: boolean; sandbox: boolean }) {
  const [until, setUntil] = useState(user?.proUntil), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function confirm(orderId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setUntil(body.proUntil); setNotice("Paiement confirmé. Votre accès Pro est actif.");
      window.history.replaceState(null, "", "/pro");
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      if (query.get("paypal") === "cancelled") setNotice("Paiement abandonné. Aucun accès Pro n’a été activé.");
      if (user && query.get("paypal") === "approved" && query.get("token")) void confirm(query.get("token")!);
    }, 0);
    return () => clearTimeout(timer);
  // Confirmation is idempotent server-side, including React development remounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  async function checkout() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/billing/checkout", { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); window.location.assign(body.url); }
    catch (error) { setError((error as Error).message); setBusy(false); }
  }
  return <div className="mx-auto max-w-4xl space-y-7"><header><p className="eyebrow">EDIFYCUT PRO</p><h1 className="mt-3 text-3xl font-semibold">Votre studio, plus loin</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Importez et montez gratuitement. Choisissez Pro pour les exports avancés.</p></header>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-indigo-700">{notice}</p>}
    <div className="grid gap-6 sm:grid-cols-2">{[{ label: "Gratuit", price: "0 €", features: ["Import, montage et aperçu", "Vidéo jusqu’à 60 s en 720p ou 480p", "Audio jusqu’à 60 s en MP3 128 kb/s", "Téléchargement et partage des exports gratuits"] }, { label: "EdifyCut Pro", price: PRO_PRICE, features: ["Toutes les fonctions gratuites", "Exports vidéo et audio plus longs", "1080p et qualité vidéo originale", "MP3 jusqu’à 256 kb/s, M4A et WAV"] }].map((plan, i) => <section key={plan.label} className={`min-w-0 rounded-lg border p-5 ${i ? "border-indigo-200 bg-indigo-50" : "border-zinc-200 bg-white"}`}><h2 className="flex items-center gap-2 text-lg font-semibold">{i === 1 && <Crown size={21} className="text-indigo-600" />}{plan.label}</h2><p className="mt-4 text-3xl font-semibold">{plan.price}{i === 1 && <span className="text-sm font-normal text-zinc-500"> / an</span>}</p><ul className="mt-5 space-y-4">{plan.features.map(feature => <li key={feature} className="flex items-start gap-2 text-sm leading-6"><Check size={17} className="mt-1 shrink-0 text-emerald-700" />{feature}</li>)}</ul>{i === 1 && <div className="mt-6">{hasPro(until) ? <p className="text-sm font-semibold text-indigo-700">Pro actif jusqu’au {new Date(until!).toLocaleDateString("fr-FR")}</p> : !user ? <Link href="/account" className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white">Se connecter pour choisir Pro</Link> : <Button disabled={busy || !configured} onClick={checkout}><CreditCard size={18} />{busy ? "Vérification…" : sandbox && configured ? "Tester avec PayPal Sandbox" : "Payer 5,99 € avec PayPal"}</Button>}<p className="mt-3 text-xs leading-5 text-zinc-500">Un paiement pour un an d’accès. Aucun renouvellement automatique.{!configured && " Le paiement n’est pas encore disponible sur cette installation."}{configured && sandbox && " Mode Sandbox : aucun encaissement réel."}</p></div>}</section>)}</div>
    <p className="border-t border-zinc-200 pt-5 text-xs leading-5 text-zinc-500">Les limites techniques de fichiers, de mémoire et de nombre de pistes restent applicables à Pro. Live Capture et les imports YouTube ne sont pas concernés par ce paywall. L’export est contrôlé localement dans le navigateur ; vos originaux ne sont jamais modifiés.</p><Link href="/terms" className="inline-flex min-h-11 items-center text-sm text-indigo-700">Conditions d’utilisation</Link>
  </div>;
}
