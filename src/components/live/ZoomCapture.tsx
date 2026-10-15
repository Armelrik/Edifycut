"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AudioLines, Pause, Play, Square, Combine, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ZoomCapture as Capture } from "@/types/zoom";
const labels = { waiting: "En attente de Zoom", starting: "Connexion au flux", recording: "Enregistrement audio", paused: "En pause", merging: "Assemblage audio", completed: "Terminée", error: "Interrompue" };
export function ZoomCapture() {
  const [sessions, setSessions] = useState<Capture[]>([]);
  const [availability, setAvailability] = useState({ available: false, authorized: false, reason: "Vérification du serveur…" });
  const [login, setLogin] = useState(false), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [meetingId, setMeetingId] = useState(""), [title, setTitle] = useState(""), [consent, setConsent] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let alive = true, timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch("/api/zoom", { cache: "no-store", signal: controller.signal }), data = await response.json();
        if (!alive) return;
        setLogin(response.status === 401);
        if (response.ok) { setSessions(data.sessions); setAvailability({ available: data.available, authorized: data.authorized, reason: data.reason }); }
        else if (response.status !== 401) setError(data.error || "Le serveur Zoom est indisponible.");
      } catch { if (alive && !controller.signal.aborted) setError("Impossible de joindre le serveur de capture."); }
      finally { if (alive) timer = setTimeout(refresh, 3000); }
    }
    void refresh(); return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, []);
  async function command(id: string, action: string) {
    if (busy) return;
    if (action === "delete" && !window.confirm("Supprimer cet enregistrement Zoom et ses fragments audio ?")) return;
    setBusy(id || "new"); setError("");
    try {
      const response = await fetch(id ? "/api/zoom/" + id : "/api/zoom", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { action } : { meetingId, title, consent }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Commande refusée.");
      setSessions(previous => data ? [data, ...previous.filter(session => session.id !== data.id)] : previous.filter(session => session.id !== id));
      if (!id) { setMeetingId(""); setTitle(""); setConsent(false); }
    } catch (error) { setError((error as Error).message); } finally { setBusy(""); }
  }
  return <div className="space-y-6">
    <div className="flex items-start gap-3"><AudioLines size={23} className="mt-1 shrink-0 text-cyan-700" /><div><h2 className="text-xl font-semibold">Audio des réunions Zoom</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Réception sur le serveur via Zoom RTMS. Aucun son de votre ordinateur n’est capturé à distance.</p></div></div>
    {login ? <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700">Se connecter pour accéder aux enregistrements</Link> : <>
      {!availability.available && <p role="status" className="border-y border-zinc-200 py-4 text-sm text-zinc-500">{availability.reason}</p>}
      {availability.available && !availability.authorized && <p className="text-sm text-zinc-500">Ce compte n’est pas associé à l’intégration Zoom du serveur.</p>}
      <form onSubmit={event => { event.preventDefault(); void command("", "start"); }} className="space-y-4">
        <fieldset disabled={!!busy || !availability.available || !availability.authorized} className="grid gap-4 disabled:opacity-50 sm:grid-cols-2"><label className="field-label min-w-0">Numéro de réunion Zoom<input aria-label="Numéro de réunion Zoom" inputMode="numeric" required maxLength={20} value={meetingId} onChange={event => setMeetingId(event.target.value)} placeholder="123 456 7890" className="w-full rounded-md border border-zinc-200 bg-white px-3" /></label><label className="field-label min-w-0">Nom de l’enregistrement<input aria-label="Nom de l’enregistrement Zoom" maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ma réunion" className="w-full rounded-md border border-zinc-200 bg-white px-3" /></label><label className="flex items-start gap-3 text-sm leading-6 sm:col-span-2"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 size-4 shrink-0 accent-indigo-600" />J’ai l’autorisation de l’hôte et des participants pour enregistrer l’audio de cette réunion.</label><div className="sm:col-span-2"><Button disabled={!consent || !!busy || !availability.available || !availability.authorized}><AudioLines size={17} />Préparer la capture serveur</Button></div></fieldset>
      </form>
    </>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {sessions.map(session => {
      const terminal = ["completed", "error"].includes(session.status), waiting = session.status === "waiting", merging = session.status === "merging", locked = !!busy || merging;
      return <section key={session.id} className="space-y-4 border-y border-zinc-200 bg-white px-4 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{session.title}</h3><p className="mt-1 text-xs text-zinc-500">Zoom · {session.meetingId} · {new Date(session.createdAt).toLocaleString("fr-FR")}</p></div><span className={`text-xs font-medium ${session.status === "recording" ? "text-red-600" : "text-indigo-700"}`}>{labels[session.status]}</span></div><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums"><span>{Math.floor(session.seconds / 60)}:{String(Math.floor(session.seconds % 60)).padStart(2, "0")} audio</span><span>{session.fragments.length} fragments</span><span>{(session.bytes / 1024 ** 2).toFixed(1)} Mo</span></div>
        {session.error && <p role="alert" className="text-sm text-red-700">{session.error}</p>}
        <div className="flex flex-wrap gap-2">{["starting", "recording"].includes(session.status) && <Button variant="secondary" disabled={locked} onClick={() => command(session.id, "pause")}><Pause size={16} />Pause</Button>}{session.status === "paused" && <Button variant="secondary" disabled={locked} onClick={() => command(session.id, "resume")}><Play size={16} />Continuer</Button>}<Button variant="secondary" disabled={locked || !session.fragments.length || waiting} onClick={() => command(session.id, "merge")}><Combine size={16} />Assembler</Button>{!terminal && <Button variant="secondary" disabled={locked} onClick={() => command(session.id, "stop")}><Square size={16} />Terminer</Button>}{session.output && <a href={"/api/zoom/" + session.id} download aria-disabled={merging} className={`inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white ${merging ? "pointer-events-none opacity-50" : ""}`}><Download size={16} />Audio M4A</a>}<Button variant="ghost" title="Supprimer l’enregistrement Zoom" aria-label="Supprimer l’enregistrement Zoom" disabled={locked || !terminal} onClick={() => command(session.id, "delete")}><Trash2 size={17} /></Button></div>
        {!!session.fragments.length && <details><summary className="cursor-pointer text-sm text-zinc-500">Fragments audio</summary><ol className="mt-2 max-h-48 divide-y divide-zinc-200 overflow-y-auto">{session.fragments.map((part, i) => <li key={part.name} className="flex items-center justify-between gap-3 py-2 text-xs"><span>Fragment {i + 1} · {(part.bytes / 1024 ** 2).toFixed(1)} Mo</span><a href={`/api/zoom/${session.id}?fragment=${encodeURIComponent(part.name)}`} download aria-label={`Télécharger le fragment audio ${i + 1}`} className="flex size-10 items-center justify-center text-indigo-700"><Download size={16} /></a></li>)}</ol></details>}
      </section>;
    })}
    <p className="border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">L’application Zoom RTMS doit être installée et autorisée dans la réunion. La capture commence à réception du flux, pas à la saisie du numéro. Elle continue si vous fermez cette page, tant que Zoom autorise le flux et que le serveur reste en marche. Pause interrompt l’écriture audio, pas le partage RTMS dans Zoom. Limites : 6 h et 1 Go de source audio. Les captures terminées inactives sont nettoyées après 24 h au prochain accès.</p>
  </div>;
}
