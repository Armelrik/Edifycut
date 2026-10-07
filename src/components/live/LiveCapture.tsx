"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Pause, Play, Square, Combine, Download, Trash2, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LiveSession } from "@/types/live";
const labels = { starting: "Connexion au direct", recording: "Capture en cours", pausing: "Finalisation du fragment", paused: "En pause", merging: "Assemblage en cours", completed: "Terminée", error: "Interrompue" };
const size = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
export function LiveCapture() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/live", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!alive) return;
        setLogin(response.status === 401);
        if (response.ok) setSessions(data.sessions);
        else if (response.status !== 401) setError(data.error);
      } catch { if (alive) setError("Impossible de joindre le serveur de capture."); }
      finally { if (alive) timer = setTimeout(refresh, 2000); }
    }
    void refresh();
    return () => { alive = false; controller.abort(); clearTimeout(timer); };
  }, []);
  async function command(id: string, action: string) {
    if (action === "delete" && !window.confirm("Supprimer définitivement cette capture et tous ses fichiers ?")) return;
    setBusy(id || "new"); setError("");
    try {
      const response = await fetch(id ? `/api/live/${id}` : "/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { action } : { url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "La commande a échoué.");
      setSessions(previous => data ? [data, ...previous.filter(session => session.id !== data.id)] : previous.filter(session => session.id !== id));
      if (!id) setUrl("");
    } catch (error) { setError(error instanceof Error ? error.message : "Erreur de capture."); }
    finally { setBusy(""); }
  }
  return <div className="mx-auto max-w-5xl space-y-7">
    <div><p className="eyebrow">STUDIO / DIRECT</p><h1 className="mt-2 text-3xl font-semibold">Live Capture</h1></div>
    {login ? <div className="border-y border-zinc-200 py-6"><Link className="font-medium text-indigo-700 underline" href="/account">Se connecter</Link><p className="mt-2 text-sm text-zinc-500">Les captures sont privées et rattachées à votre compte.</p></div> : <form onSubmit={event => { event.preventDefault(); void command("", "start"); }} className="flex flex-col gap-3 sm:flex-row"><label className="min-w-0 flex-1"><span className="field-label">Lien du direct YouTube</span><input required type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/live/..." className="mt-2 h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-base" /></label><Button className="sm:self-end" disabled={!!busy}><Radio size={18} />Capturer le direct</Button></form>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="space-y-6">{sessions.map(session => {
      const active = ["starting", "recording", "pausing", "merging"].includes(session.status);
      const locked = !!busy || ["pausing", "merging"].includes(session.status);
      return <section key={session.id} className="border-y border-zinc-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{session.title}</h2><p className="mt-1 text-xs text-zinc-500">{new Date(session.createdAt).toLocaleString("fr-FR")}</p></div><span className={`flex items-center gap-2 text-sm font-medium ${session.status === "recording" ? "text-red-600" : "text-indigo-700"}`}>{active ? <LoaderCircle size={16} className="animate-spin" /> : <Radio size={16} />}{labels[session.status]}</span></div>
        <div className="my-5 grid grid-cols-3 gap-3 border-y border-zinc-100 py-4"><div><p className="text-xs text-zinc-500">Durée reçue</p><p className="mt-1 font-semibold tabular-nums">{Math.floor(session.seconds / 60)}:{String(Math.floor(session.seconds % 60)).padStart(2, "0")}</p></div><div><p className="text-xs text-zinc-500">Fragments</p><p className="mt-1 font-semibold">{session.fragments.length}</p></div><div><p className="text-xs text-zinc-500">Conservé</p><p className="mt-1 font-semibold">{size(session.bytes)}</p></div></div>
        {session.error && <p role="alert" className="mb-4 text-sm text-red-700">{session.error}</p>}
        <div className="flex flex-wrap gap-2">
          {session.status === "recording" || session.status === "starting" ? <Button variant="secondary" disabled={locked} onClick={() => command(session.id, "pause")}><Pause size={16} />Pause</Button> : session.status !== "completed" && <Button disabled={locked} onClick={() => command(session.id, "resume")}><Play size={16} />Continuer</Button>}
          <Button variant="secondary" disabled={locked || (!session.fragments.length && session.status !== "recording")} onClick={() => command(session.id, "merge")}><Combine size={16} />Assembler</Button>
          {session.status !== "completed" && <Button variant="secondary" disabled={locked} onClick={() => command(session.id, "stop")}><Square size={16} />Terminer</Button>}
          {session.output && <a href={`/api/live/${session.id}`} download className="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white"><Download size={16} />MP4 · {session.mergedFragments} fragments</a>}
          <Button variant="ghost" title="Supprimer la capture" aria-label="Supprimer la capture" disabled={locked} onClick={() => command(session.id, "delete")}><Trash2 size={18} /></Button>
        </div>
        {session.output && session.fragments.length > session.mergedFragments && <p className="mt-3 flex items-center gap-2 text-xs text-amber-700"><RefreshCw size={14} />De nouveaux fragments attendent l&apos;assemblage.</p>}
        {!!session.fragments.length && <details className="mt-5"><summary className="cursor-pointer text-sm text-zinc-600">Fragments enregistrés</summary><ol className="mt-3 max-h-52 divide-y divide-zinc-100 overflow-y-auto">{session.fragments.map((part, index) => <li key={part.name} className="flex items-center justify-between gap-3 py-2 text-sm"><span>Fragment {index + 1} <span className="text-zinc-400">· {size(part.bytes)}</span></span><a href={`/api/live/${session.id}?fragment=${encodeURIComponent(part.name)}`} download title={`Télécharger le fragment ${index + 1}`} className="flex size-10 items-center justify-center text-indigo-700"><Download size={16} /></a></li>)}</ol></details>}
      </section>;
    })}</div>
    <p className="text-xs leading-5 text-zinc-500">Capture depuis le point actuel du direct. Les périodes en pause ne sont pas enregistrées. L&apos;assemblage met la capture en pause ; cliquez sur Continuer pour reprendre. Limites : 6 heures et 4 Go par capture. Les captures inactives expirent après 24 heures. Le serveur doit rester allumé.</p>
  </div>;
}
