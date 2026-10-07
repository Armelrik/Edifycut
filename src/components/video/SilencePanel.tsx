"use client";

import { AudioLines, Search, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preciseTime } from "@/lib/video/editing";
import type { SilenceOptions, VideoCut } from "@/types/video";

export function SilencePanel({ options, onOptions, cuts, onCuts, onDetect, onListen, message, busy, progress }: {
  options: SilenceOptions; onOptions: (options: SilenceOptions) => void; cuts: VideoCut[];
  onCuts: (cuts: VideoCut[]) => void; onDetect: () => void; onListen: (start: number, end: number) => void;
  message: string | null; busy: boolean; progress: number | null;
}) {
  return <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4"><h2 className="flex items-center gap-2 font-semibold"><AudioLines size={18} /> Silences et coupes</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="field-label">Seuil sonore<select value={options.threshold} onChange={event => onOptions({ ...options, threshold: Number(event.target.value) })} disabled={busy} className="h-11 rounded-md border border-zinc-200 bg-white px-2"><option value={-50}>Prudent (−50 dB)</option><option value={-40}>Standard (−40 dB)</option><option value={-30}>Sensible (−30 dB)</option></select></label>
      <label className="field-label">Pause minimale<select value={options.minDuration} onChange={event => onOptions({ ...options, minDuration: Number(event.target.value) })} disabled={busy} className="h-11 rounded-md border border-zinc-200 bg-white px-2">{[0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value} s</option>)}</select></label>
      <label className="field-label">Marge de parole<select value={options.padding} onChange={event => onOptions({ ...options, padding: Number(event.target.value) })} disabled={busy} className="h-11 rounded-md border border-zinc-200 bg-white px-2">{[0.15, 0.2, 0.25, 0.3].map(value => <option key={value} value={value}>{value} s</option>)}</select></label>
    </div>
    <Button type="button" variant="secondary" onClick={onDetect} disabled={busy}><Search size={17} />{busy ? "Analyse en cours..." : "Détecter les silences"}</Button>
    {busy && <progress aria-label="Analyse des silences" max={100} value={progress ?? undefined} className="h-2 w-full accent-indigo-600" />}
    {message && <p role="status" className="text-sm leading-6 text-zinc-500">{message}</p>}
    {cuts.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{cuts.filter(c => c.enabled).length} passages à retirer</span><label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={cuts.every(c => c.enabled)} disabled={busy} onChange={event => onCuts(cuts.map(c => ({ ...c, enabled: event.target.checked })))} className="size-4 accent-indigo-600" /> Tout sélectionner</label></div>
      <div className="max-h-72 overflow-auto divide-y divide-zinc-100">{cuts.map(cut => <div key={cut.id} className="flex items-center gap-3 py-3"><label className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" aria-label={"Retirer " + preciseTime(cut.start) + " à " + preciseTime(cut.end)} checked={cut.enabled} disabled={busy} onChange={event => onCuts(cuts.map(c => c.id === cut.id ? { ...c, enabled: event.target.checked } : c))} className="size-5 shrink-0 accent-indigo-600" /><span className="min-w-0"><span className="block text-xs text-zinc-500">{cut.source === "silence" ? "Silence détecté" : "Coupe manuelle"} · {(cut.end - cut.start).toFixed(2)} s</span><span className="block font-mono text-xs">{preciseTime(cut.start)} → {preciseTime(cut.end)}</span></span></label><button type="button" title="Écouter ce passage" aria-label={"Écouter le passage à " + preciseTime(cut.start)} disabled={busy} onClick={() => onListen(cut.start, cut.end)} className="flex size-10 shrink-0 items-center justify-center rounded-md hover:bg-indigo-50"><Play size={16} /></button><button type="button" title="Retirer cette coupe" aria-label="Retirer cette coupe" disabled={busy} onClick={() => onCuts(cuts.filter(c => c.id !== cut.id))} className="flex size-10 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div>)}</div>
    </>}
  </section>;
}
