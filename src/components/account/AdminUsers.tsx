"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Users, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserAccount } from "@/types/account";

export function AdminUsers({ users, currentId }: { users: UserAccount[]; currentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const update = async (id: string, data: Record<string, unknown>) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("Compte mis à jour. Ses sessions précédentes ont été invalidées.");
      setResetId(null); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "La demande a échoué."); }
    finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div><p className="eyebrow">Administration</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><ShieldCheck size={28} className="text-indigo-600" /> Comptes utilisateurs</h1><p className="mt-3 text-zinc-500">Gérez les accès, les rôles et les mots de passe.</p></div>
      <div className="flex gap-3 border-y border-zinc-200 py-5"><Users className="text-indigo-600" /><span><strong>{users.length}</strong> comptes · <strong>{users.filter(u => !u.disabled).length}</strong> actifs</span></div>
      <Button variant="secondary" disabled={busy} onClick={() => setCreating(!creating)}><UserPlus size={18} />Créer un compte</Button>
      {creating && <form className="space-y-4 border-y border-zinc-200 py-5" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; setBusy(true); setError(null); setMessage(null);
        try {
          const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
          const body = await response.json(); if (!response.ok) throw new Error(body.error);
          form.reset(); setCreating(false); setMessage("Compte créé. Transmettez le mot de passe par un canal sécurisé."); router.refresh();
        } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
      }}><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Nom<Input name="name" required maxLength={80} autoComplete="off" /></label><label className="field-label">E-mail<Input name="email" type="email" required maxLength={254} autoComplete="off" /></label><label className="field-label">Mot de passe initial<Input name="password" type="password" required minLength={12} autoComplete="new-password" /></label><label className="field-label">Rôle<select name="role" className="h-11 rounded-md border border-zinc-200 bg-white px-3"><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select></label></div><Button type="submit" disabled={busy}><UserPlus size={18} />Créer l&apos;utilisateur</Button></form>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <div className="divide-y divide-zinc-200">
        {users.map(user => <div key={user.id} className="space-y-3 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1"><p className="font-semibold">{user.name}{user.id === currentId ? " (vous)" : ""}</p><p className="break-all text-sm text-zinc-500">{user.email}</p><p className="mt-1 text-xs text-zinc-400">Créé le {new Date(user.createdAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor={`role-${user.id}`}>Rôle de {user.name}</label>
              <select id={`role-${user.id}`} className="h-11 rounded-md border border-zinc-200 bg-white px-3 text-sm" value={user.role} disabled={busy || user.id === currentId} onChange={event => void update(user.id, { role: event.target.value })}><option value="user">Utilisateur</option><option value="admin">Administrateur</option></select>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-indigo-600" checked={!user.disabled} disabled={busy || user.id === currentId} onChange={event => void update(user.id, { disabled: !event.target.checked })} /> Actif</label>
              {user.id !== currentId && <Button type="button" variant="ghost" disabled={busy} onClick={() => setResetId(resetId === user.id ? null : user.id)}><KeyRound size={17} /> Réinitialiser</Button>}
            </div>
          </div>
          {resetId === user.id && <form className="flex max-w-lg flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); void update(user.id, { password: new FormData(event.currentTarget).get("password") }); }}><label className="flex-1"><span className="sr-only">Nouveau mot de passe</span><Input name="password" type="password" autoComplete="new-password" placeholder="Nouveau mot de passe, 12 caractères min." required minLength={12} /></label><Button type="submit" disabled={busy}><KeyRound size={16} /> Confirmer</Button></form>}
        </div>)}
      </div>
    </div>
  );
}
