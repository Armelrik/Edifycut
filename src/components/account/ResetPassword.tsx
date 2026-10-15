"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function hashSnapshot() {
  const value = new URLSearchParams(window.location.hash.slice(1)).get("token_hash");
  return value && value.length <= 2048 ? value : "-";
}
export function ResetPassword({ tokenHash: supplied, enabled = true }: { tokenHash?: string; enabled?: boolean }) {
  const hash = useSyncExternalStore(subscribeHash, hashSnapshot, () => "");
  const tokenHash = enabled ? supplied || (hash && hash !== "-" ? hash : undefined) : undefined;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  return <div className="mx-auto max-w-md space-y-5"><p className="eyebrow">MON COMPTE / SÉCURITÉ</p><h1 className="text-2xl font-semibold">Nouveau mot de passe</h1>{done ? <p role="status" className="text-sm text-emerald-700">Votre mot de passe a été mis à jour.</p> : !tokenHash ? <p role={enabled && hash === "" ? "status" : "alert"} className="text-sm text-zinc-500">{enabled && hash === "" ? "Vérification du lien…" : "Le lien de récupération est absent ou invalide. Demandez un nouveau lien depuis la connexion."}</p> : <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget), password = data.get("password");
    if (password !== data.get("confirm")) { setError("Les mots de passe ne correspondent pas."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/recover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenHash, password }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Réinitialisation impossible.");
      window.history.replaceState(null, "", "/account/reset"); setDone(true);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }}><label className="field-label">Mot de passe<Input name="password" type="password" minLength={12} required autoComplete="new-password" /></label><label className="field-label">Confirmer le mot de passe<Input name="confirm" type="password" minLength={12} required autoComplete="new-password" /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button disabled={busy}><KeyRound size={17} />{busy ? "Vérification…" : "Enregistrer le mot de passe"}</Button></form>}<Link href="/account" className="inline-flex min-h-11 items-center text-sm text-indigo-700">Retour à mon compte</Link></div>;
}
