"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPreferencesSnapshot, parsePreferences, preferencesKey, subscribePreferences } from "@/lib/video/preferences";
import { StudioPreferences } from "./StudioPreferences";

export function SettingsPanel() {
  const raw = useSyncExternalStore(subscribePreferences, getPreferencesSnapshot, () => null);
  const values = parsePreferences(raw);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div><p className="eyebrow">VOTRE STUDIO</p><h1 className="mt-3 text-3xl font-semibold">Préférences</h1><p className="mt-3 leading-7 text-zinc-500">Choisissez les réglages appliqués aux prochaines vidéos importées sur cet appareil.</p></div>
      <form key={raw ?? "default"} className="space-y-6 border-y border-zinc-200 py-6" onSubmit={event => {
        event.preventDefault(); setError(null); setMessage(null);
        const form = new FormData(event.currentTarget);
        try {
          localStorage.setItem(preferencesKey, JSON.stringify({ quality: form.get("quality"), speed: Number(form.get("speed")), optimizeForWhatsApp: form.get("compress") === "on" }));
          window.dispatchEvent(new Event("edifycut-preferences"));
          setMessage("Préférences enregistrées sur cet appareil.");
        } catch { setError("Le navigateur ne permet pas l'enregistrement des préférences."); }
      }}>
        <h2 className="text-lg font-semibold">Export et montage</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">Résolution par défaut<select name="quality" defaultValue={values.quality} className="h-12 rounded-md border border-zinc-200 bg-white px-3 text-base"><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option><option value="original">Originale</option></select></label>
          <label className="field-label">Vitesse par défaut<select name="speed" defaultValue={values.speed} className="h-12 rounded-md border border-zinc-200 bg-white px-3 text-base">{[1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
        </div>
        <label className="flex min-h-12 items-center gap-3 text-sm"><input name="compress" type="checkbox" defaultChecked={values.optimizeForWhatsApp} className="size-5 accent-indigo-600" /> Optimiser les exports pour le partage</label>
        <Button type="submit"><Save size={17} /> Enregistrer</Button>
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </form>
      <StudioPreferences />
      <Link href="/account" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700"><UserRound size={17} /> Gérer mon compte et mon mot de passe</Link>
    </div>
  );
}
