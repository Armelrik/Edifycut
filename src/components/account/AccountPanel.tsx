"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut, Save, ShieldCheck, UserPlus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserAccount } from "@/types/account";

export function AccountPanel({ user, initialMode = "login" }: { user: UserAccount | null; initialMode?: "login" | "register" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: string, data: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/account/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "La demande a échoué.");
      if (action === "profile" || action === "password") setMessage(action === "password" ? "Mot de passe mis à jour. Les autres sessions ont été déconnectées." : "Profil enregistré.");
      router.refresh();
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Impossible de joindre le serveur."); }
    finally { setBusy(false); }
    return false;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div><p className="eyebrow">Votre espace</p><h1 className="mt-2 text-3xl font-semibold">{user ? "Mon compte" : "Bienvenue sur EdifyCut"}</h1><p className="mt-3 text-zinc-500">{user ? "Gérez votre profil et la sécurité de votre accès." : "Connectez-vous à votre espace ou créez votre compte."}</p></div>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {!user ? (
        <div className="max-w-md space-y-6">
          <div className="flex border-b border-zinc-200" role="tablist" aria-label="Accès au compte">
            {(["login", "register"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setError(null); }} className={`min-h-12 flex-1 border-b-2 text-sm font-medium ${mode === value ? "border-indigo-600 text-indigo-700" : "border-transparent text-zinc-500"}`}>{value === "login" ? "Connexion" : "Créer un compte"}</button>)}
          </div>
          <form key={mode} className="space-y-5" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit(mode, Object.fromEntries(form)); }}>
            {mode === "register" && <label className="field-label">Nom<Input name="name" autoComplete="name" required maxLength={80} /></label>}
            <label className="field-label">Adresse e-mail<Input type="email" name="email" autoComplete="email" required maxLength={254} /></label>
            <label className="field-label">Mot de passe<Input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} required /></label>
            {mode === "register" && <p className="text-xs leading-5 text-zinc-500">Au moins 12 caractères. En créant un compte, vous acceptez les <Link href="/terms" className="text-indigo-700 underline">conditions d&apos;utilisation</Link>.</p>}
            <Button type="submit" disabled={busy} className="w-full">{mode === "login" ? <LogIn size={18} /> : <UserPlus size={18} />}{busy ? "Connexion en cours..." : mode === "login" ? "Se connecter" : "Créer mon compte"}</Button>
          </form>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 border-b border-zinc-200 pb-6">
            <span className="flex size-14 items-center justify-center rounded-lg bg-indigo-100 text-xl font-semibold text-indigo-700">{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{user.name}</p><p className="break-all text-sm text-zinc-500">{user.email}</p></div>
            {user.role === "admin" && <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700"><ShieldCheck size={18} /> Administration</Link>}
          </div>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit("profile", Object.fromEntries(new FormData(event.currentTarget))); }}>
            <h2 className="text-lg font-semibold">Informations personnelles</h2>
            <label className="field-label max-w-md">Nom<Input name="name" defaultValue={user.name} autoComplete="name" required maxLength={80} /></label>
            <Button type="submit" disabled={busy}><Save size={17} /> Enregistrer le profil</Button>
          </form>
          <form className="space-y-4 border-t border-zinc-200 pt-6" onSubmit={async (event) => { event.preventDefault(); const form = event.currentTarget; if (await submit("password", Object.fromEntries(new FormData(form)))) form.reset(); }}>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={19} /> Sécurité</h2>
            <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Mot de passe actuel<Input type="password" name="currentPassword" autoComplete="current-password" required /></label><label className="field-label">Nouveau mot de passe<Input type="password" name="password" autoComplete="new-password" minLength={12} placeholder="12 caractères minimum" required /></label></div>
            <Button type="submit" variant="secondary" disabled={busy}><KeyRound size={17} /> Changer le mot de passe</Button>
          </form>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit("logout", {})}><LogOut size={17} /> Se déconnecter</Button>
        </>
      )}
    </div>
  );
}
