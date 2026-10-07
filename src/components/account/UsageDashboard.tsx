"use client";
import { useEffect, useState } from "react";
import { Activity, Users, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UsageStatistics, UsageSample } from "@/types/statistics";
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} Go` : `${(value / 1024 ** 2).toFixed(1)} Mo`;
function UsageGraph({ title, history, value, format, color, ceiling }: { title: string; history: UsageSample[]; value: (sample: UsageSample) => number | null; format: (value: number) => string; color: string; ceiling?: number }) {
  const points = history.filter(sample => value(sample) !== null), max = ceiling || Math.max(1, ...points.map(sample => value(sample)!)) * 1.15;
  const start = history[0]?.time || 0, end = Math.max(start + 10_000, history.at(-1)?.time || 0);
  const x = (sample: UsageSample) => 36 + (sample.time - start) / (end - start) * 568;
  const y = (sample: UsageSample) => 155 - value(sample)! / max * 130;
  const segments: UsageSample[][] = [];
  for (const sample of points) { const last = segments.at(-1); if (!last || sample.time - last.at(-1)!.time > 30_000) segments.push([sample]); else last.push(sample); }
  return <section className="min-w-0 border-t border-zinc-200 py-5"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2><span className="text-xs tabular-nums text-zinc-500">{points.length ? format(value(points.at(-1)!)!) : "En attente"}</span></div>
    <svg viewBox="0 0 640 190" className="mt-3 w-full" role="img" aria-label={`${title}. ${points.length} mesures. Dernière valeur : ${points.length ? format(value(points.at(-1)!)!) : "indisponible"}`}>
      {[0, .5, 1].map(ratio => <g key={ratio}><line x1="36" x2="604" y1={155 - ratio * 130} y2={155 - ratio * 130} stroke="var(--chart-grid)" /><text x="32" y={159 - ratio * 130} textAnchor="end" fill="currentColor" fontSize="10">{Math.round(max * ratio)}</text></g>)}
      {segments.map((segment, i) => <polyline key={i} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" points={segment.map(sample => `${x(sample)},${y(sample)}`).join(" ")} />)}
      {points.map(sample => <circle key={sample.time} cx={x(sample)} cy={y(sample)} r="3" fill={color}><title>{new Date(sample.time).toLocaleTimeString("fr-FR")} · {format(value(sample)!)}</title></circle>)}
      <text x="36" y="180" fill="currentColor" fontSize="10">{start ? new Date(start).toLocaleTimeString("fr-FR") : ""}</text><text x="604" y="180" textAnchor="end" fill="currentColor" fontSize="10">{history.length ? new Date(history.at(-1)!.time).toLocaleTimeString("fr-FR") : ""}</text>
    </svg>
  </section>;
}
export function UsageDashboard() {
  const [data, setData] = useState<UsageStatistics | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0), [paused, setPaused] = useState(false);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/admin/statistics", { cache: "no-store", signal: controller.signal });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || "Statistiques indisponibles.");
        if (alive) { setData(body); setError(""); }
      } catch (error) { if (alive && !controller.signal.aborted) setError((error as Error).message); }
      finally { if (alive && !paused) timer = setTimeout(poll, 10_000); }
    }
    function poll() { if (document.visibilityState === "visible") void refresh(); else timer = setTimeout(poll, 10_000); }
    void refresh(); return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [revision, paused]);
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">ADMINISTRATION / USAGE</p><h1 className="mt-2 text-2xl font-semibold">Statistiques du studio</h1><p className="mt-2 text-sm text-zinc-500">Activité des comptes et ressources du serveur.</p></div><div className="flex items-center gap-3"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={!paused} onChange={event => setPaused(!event.target.checked)} className="size-4 accent-indigo-600" />Actualisation auto</label><Button variant="secondary" title="Actualiser" aria-label="Actualiser les statistiques" onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} /></Button></div></header>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!data && !error && <p role="status" className="py-8 text-sm text-zinc-500">Chargement des mesures…</p>}
    {data && <>
      <div className="grid grid-cols-2 gap-5 border-y border-zinc-200 py-5 lg:grid-cols-4">{[
        { label: "Utilisateurs connectés", value: String(data.sample.online), detail: "Actifs depuis moins de 90 s", icon: Users },
        { label: "CPU machine", value: data.sample.cpu === null ? "—" : `${data.sample.cpu.toFixed(1)} %`, detail: `${data.cores} cœurs logiques`, icon: Cpu },
        { label: "Mémoire serveur Node", value: bytes(data.sample.rss), detail: "Mémoire résidente (RSS)", icon: MemoryStick },
        { label: "Stockage EdifyCut", value: bytes(data.storage.bytes), detail: "Captures et données .data", icon: HardDrive },
      ].map(item => <div key={item.label} className="min-w-0"><item.icon size={19} className="mb-3 text-indigo-600" /><p className="text-xs text-zinc-500">{item.label}</p><p className="mt-1 break-words text-xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-zinc-500">{item.detail}</p></div>)}</div>
      <div className="grid gap-x-8 md:grid-cols-2"><UsageGraph title="CPU machine (%)" history={data.history} value={sample => sample.cpu} format={value => `${value.toFixed(1)} %`} ceiling={100} color="#818cf8" /><UsageGraph title="Mémoire serveur Node (Mo)" history={data.history} value={sample => sample.rss / 1024 ** 2} format={value => `${value.toFixed(1)} Mo`} color="#06b6d4" /><UsageGraph title="Comptes connectés" history={data.history} value={sample => sample.online} format={value => String(value)} ceiling={Math.max(2, data.accounts)} color="#34d399" /><UsageGraph title="Mémoire machine (%)" history={data.history} value={sample => sample.memoryUsed / sample.memoryTotal * 100} format={value => `${value.toFixed(1)} %`} ceiling={100} color="#fb7185" /></div>
      <section className="border-t border-zinc-200 pt-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Activity size={17} />État du serveur</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Comptes inscrits / autorisés</dt><dd className="mt-1 font-medium">{data.accounts} / {data.enabledAccounts}</dd></div><div><dt className="text-zinc-500">Espace disque disponible</dt><dd className="mt-1 font-medium">{data.storage.free === null ? "Non disponible" : bytes(data.storage.free)}</dd></div><div><dt className="text-zinc-500">Serveur démarré depuis</dt><dd className="mt-1 font-medium">{Math.floor(data.uptime / 3600)} h {Math.floor(data.uptime % 3600 / 60)} min</dd></div></dl></section>
      {data.storage.total !== null && data.storage.free !== null && <section className="border-t border-zinc-200 pt-5"><h2 className="text-sm font-semibold">Occupation du disque serveur</h2><div role="img" aria-label={`Disque : ${bytes(data.storage.total - data.storage.free)} occupés sur ${bytes(data.storage.total)}. EdifyCut : ${bytes(data.storage.bytes)}.`} className="mt-4 flex h-3 overflow-hidden rounded-sm bg-zinc-200"><div title="Données EdifyCut" className="h-full bg-indigo-600" style={{ width: `${Math.min(100, data.storage.bytes / Math.max(1, data.storage.total) * 100)}%` }} /><div title="Autres données et système" className="h-full bg-cyan-700" style={{ width: `${Math.max(0, Math.min(100, (data.storage.total - data.storage.free - data.storage.bytes) / Math.max(1, data.storage.total) * 100))}%` }} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500"><span className="inline-flex items-center gap-2"><span className="size-2 bg-indigo-600" />EdifyCut · {bytes(data.storage.bytes)}</span><span className="inline-flex items-center gap-2"><span className="size-2 bg-cyan-700" />Autres données · {bytes(Math.max(0, data.storage.total - data.storage.free - data.storage.bytes))}</span><span className="inline-flex items-center gap-2"><span className="size-2 bg-zinc-200" />Libre · {bytes(data.storage.free)}</span></div></section>}
      <p className="border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">Dernière mesure : {new Date(data.sample.time).toLocaleTimeString("fr-FR")}. Historique de la dernière heure, collecté pendant la consultation et conservé 24 h. Un compte est connecté si un onglet authentifié visible a envoyé un signal depuis moins de 90 s. CPU et mémoire machine incluent les autres applications ; le montage FFmpeg dans les navigateurs n&apos;est pas mesuré.</p>
    </>}
  </div>;
}
