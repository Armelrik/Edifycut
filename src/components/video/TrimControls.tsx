"use client";

import { useState } from "react";
import { Flag, Scissors } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { parseTime, preciseTime } from "@/lib/video/editing";

export function TrimControls({ label, value, onChange, kind, min, max, currentTime, getCurrentTime }: {
  label: string; value: number; onChange: (value: number) => void;
  kind: "start" | "end"; min: number; max: number; currentTime: number;
  getCurrentTime: () => number;
}) {
  const [error, setError] = useState<string | null>(null);
  const apply = (next: number) => { setError(null); onChange(Math.max(min, Math.min(max, next))); };
  return (
    <section className="space-y-3">
      <label className="field-label"><span className="flex items-center gap-2"><Flag size={16} className="text-indigo-600" />{label}</span>
        <Input key={value} aria-label={label} title="HH:MM:SS, MM:SS ou secondes" type="text" inputMode="decimal" defaultValue={preciseTime(value)} placeholder="00:00:00.00" className="font-mono" onFocus={event => event.currentTarget.select()} onChange={() => setError(null)}
          onBlur={event => { const next = parseTime(event.target.value); if (next === null) { setError("Entrez HH:MM:SS, MM:SS ou une durée en secondes."); event.target.value = preciseTime(value); } else { apply(next); event.target.value = preciseTime(Math.max(min, Math.min(max, next))); } }}
          onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      </label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => apply(getCurrentTime() ?? currentTime)} className="min-h-11"><Scissors size={15} />{kind === "start" ? "Début ici" : "Fin ici"}</Button>
        <button type="button" onClick={() => apply(value - 1)} aria-label={label + " moins une seconde"} title="Moins une seconde" className="h-11 min-w-11 rounded-md border border-zinc-200 bg-white text-sm">−1 s</button>
        <button type="button" onClick={() => apply(value + 1)} aria-label={label + " plus une seconde"} title="Plus une seconde" className="h-11 min-w-11 rounded-md border border-zinc-200 bg-white text-sm">+1 s</button>
      </div>
    </section>
  );
}
