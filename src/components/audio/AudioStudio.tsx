"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Download, Share2, Scissors, RotateCcw, X, AudioLines } from "lucide-react";
import { AudioProcessor, readAudio, type AudioSource, type AudioSettings } from "@/lib/audio/audio-processor";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "./AudioRecorder";
const initial: AudioSettings = { start: 0, end: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, normalize: false, format: "mp3", bitrate: "192" };
export function AudioStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<AudioSource | null>(null);
  const [settings, setSettings] = useState(initial);
  const [result, setResult] = useState<{ blob: Blob; fileName: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  const processor = useRef<AudioProcessor | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; processor.current?.terminate(); }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source.objectUrl); }, [source]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { if (player.current) { player.current.playbackRate = settings.speed; player.current.volume = Math.min(1, settings.volume); } }, [settings.speed, settings.volume, source]);
  function change<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); setResult(null); setNotice(""); }
  async function importFile(value: File) {
    const token = ++generation.current; setError(""); setBusy(true); setResult(null);
    try {
      const metadata = await readAudio(value);
      if (generation.current !== token) { URL.revokeObjectURL(metadata.objectUrl); return; }
      setFile(value); setSource(metadata); setSettings({ ...initial, end: metadata.duration });
    } catch (error) { if (generation.current === token) setError((error as Error).message); }
    finally { if (generation.current === token) setBusy(false); }
  }
  async function render() {
    if (!file || !source) return;
    const token = ++generation.current;
    const worker = new AudioProcessor(); processor.current = worker;
    setBusy(true); setExporting(true); setProgress(0); setError(""); setResult(null); player.current?.pause();
    try {
      const output = await worker.export(file, source.duration, settings, value => { if (generation.current === token) setProgress(Math.round(value)); });
      if (generation.current === token) setResult({ ...output, url: URL.createObjectURL(output.blob) });
    } catch (error) { if (generation.current === token) setError((error as Error).message); }
    finally { if (generation.current === token) { setBusy(false); setExporting(false); processor.current = null; } }
  }
  function download() {
    if (!result) return;
    const a = document.createElement("a"); a.href = result.url; a.download = result.fileName; a.click();
  }
  async function share() {
    if (!result) return;
    const files = [new File([result.blob], result.fileName, { type: result.blob.type })];
    if (navigator.share && navigator.canShare?.({ files })) {
      try { await navigator.share({ files, title: result.fileName }); }
      catch (error) { if ((error as Error).name !== "AbortError") { setNotice("Partage indisponible. Le fichier a été téléchargé."); download(); } }
    } else { download(); setNotice("Le fichier a été téléchargé. Vous pouvez le joindre depuis votre application de partage."); }
  }
  const valid = !!source && settings.start >= 0 && settings.end <= source.duration && settings.end - settings.start >= 0.05;
  return <div className="mx-auto max-w-5xl space-y-7">
    <div><p className="eyebrow">STUDIO / AUDIO</p><h1 className="mt-2 text-3xl font-semibold">Atelier audio</h1></div>
    <AudioRecorder disabled={busy} onActive={setRecording} onReady={importFile} />
    <label className={`flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed border-indigo-200 bg-white p-5 text-center text-indigo-700 ${busy || recording ? "pointer-events-none opacity-50" : "hover:bg-indigo-50"}`}><Upload size={22} /><span className="min-w-0 break-words font-medium">{file ? "Changer de fichier audio" : "Importer un fichier audio"}</span><input disabled={busy || recording} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" className="sr-only" onChange={event => { const value = event.target.files?.[0]; if (value) void importFile(value); event.target.value = ""; }} /></label>
    {error && <p role="alert" className="bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {source && file && <>
      <section className="border-y border-zinc-200 py-5"><div className="mb-4 flex items-start gap-3"><AudioLines className="shrink-0 text-indigo-600" size={22} /><div className="min-w-0"><h2 className="break-words font-semibold">{file.name}</h2><p className="mt-1 text-xs text-zinc-500">{(file.size / 1024 ** 2).toFixed(1)} Mo · {source.duration.toFixed(2)} s</p></div></div><audio ref={player} src={source.objectUrl} controls className="w-full" onTimeUpdate={() => { const audio = player.current; if (audio && !audio.paused && audio.currentTime >= settings.end) audio.pause(); }} onPlay={() => { const audio = player.current; if (audio && (audio.currentTime < settings.start || audio.currentTime >= settings.end)) audio.currentTime = settings.start; }} /></section>
      <fieldset disabled={busy || recording} className="grid min-w-0 gap-7 md:grid-cols-2">
        <section className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">Découpe</h2><div className="grid grid-cols-2 gap-3">{(["start", "end"] as const).map(key => <label key={key} className="min-w-0"><span className="field-label">{key === "start" ? "Début (s)" : "Fin (s)"}</span><input aria-label={key === "start" ? "Début (s)" : "Fin (s)"} type="number" min={0} max={source.duration} step="0.01" value={settings[key]} onChange={event => change(key, Number(event.target.value))} className="mt-2 h-11 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3" /><Button variant="ghost" className="mt-1 w-full px-1 text-xs" onClick={() => change(key, Math.round((player.current?.currentTime || 0) * 100) / 100)}><Scissors size={14} />{key === "start" ? "Début ici" : "Fin ici"}</Button></label>)}</div>
          <label className="block"><span className="field-label">Début</span><input aria-label="Début de l'extrait audio" type="range" min="0" max={source.duration} step="0.01" value={settings.start} onChange={event => change("start", Math.min(Number(event.target.value), settings.end - 0.05))} className="mt-2 w-full accent-indigo-600" /></label><label className="block"><span className="field-label">Fin</span><input aria-label="Fin de l'extrait audio" type="range" min="0" max={source.duration} step="0.01" value={settings.end} onChange={event => change("end", Math.max(Number(event.target.value), settings.start + 0.05))} className="mt-2 w-full accent-indigo-600" /></label>
          <p className={`text-sm ${valid ? "text-zinc-500" : "text-red-700"}`}>{valid ? `Durée finale : ${((settings.end - settings.start) / settings.speed).toFixed(2)} s` : "La fin doit être après le début, dans la durée du fichier."}</p>
        </section>
        <section className="min-w-0 space-y-4"><h2 className="text-lg font-semibold">Son et export</h2><label className="block"><span className="field-label">Vitesse · {settings.speed}×</span><input type="range" min="0.5" max="2" step="0.05" value={settings.speed} onChange={event => change("speed", Number(event.target.value))} className="mt-2 w-full accent-indigo-600" /></label><label className="block"><span className="field-label">Volume · {Math.round(settings.volume * 100)} %</span><input type="range" min="0" max="2" step="0.05" value={settings.volume} onChange={event => change("volume", Number(event.target.value))} className="mt-2 w-full accent-indigo-600" /></label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings.normalize} onChange={event => change("normalize", event.target.checked)} className="size-4 accent-indigo-600" />Normaliser le niveau sonore</label>
          <div className="grid grid-cols-2 gap-3">{(["fadeIn", "fadeOut"] as const).map(key => <label key={key} className="min-w-0"><span className="field-label">{key === "fadeIn" ? "Fondu entrée (s)" : "Fondu sortie (s)"}</span><input type="number" min="0" max="30" step="0.1" value={settings[key]} onChange={event => change(key, Number(event.target.value))} className="mt-2 h-11 w-full rounded-md border border-zinc-200 bg-white px-3" /></label>)}</div>
          <div className="grid grid-cols-2 gap-3"><label className="min-w-0"><span className="field-label">Format</span><select aria-label="Format" value={settings.format} onChange={event => change("format", event.target.value as AudioSettings["format"])} className="mt-2 h-11 w-full rounded-md border border-zinc-200 bg-white px-3"><option value="mp3">MP3</option><option value="m4a">M4A / AAC</option><option value="wav">WAV</option></select></label><label className="min-w-0"><span className="field-label">Débit</span><select aria-label="Débit" disabled={settings.format === "wav"} value={settings.bitrate} onChange={event => change("bitrate", event.target.value as AudioSettings["bitrate"])} className="mt-2 h-11 w-full rounded-md border border-zinc-200 bg-white px-3">{[96, 128, 192, 256].map(value => <option key={value} value={value}>{value} kb/s</option>)}</select></label></div>
        </section>
      </fieldset>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || recording || !valid} onClick={render}><AudioLines size={18} />Exporter l&apos;audio</Button><Button variant="secondary" disabled={busy || recording} onClick={() => { setSettings({ ...initial, end: source.duration }); setResult(null); }}><RotateCcw size={18} />Réinitialiser</Button>{exporting && <Button variant="secondary" onClick={() => { generation.current++; processor.current?.terminate(); processor.current = null; setBusy(false); setExporting(false); setNotice("Export annulé."); }}><X size={18} />Annuler</Button>}</div>
    </>}
    {busy && <div role="status"><progress value={progress} max={100} className="h-2 w-full" /><p className="mt-2 text-sm text-zinc-500">{progress < 12 ? "Préparation du moteur audio" : "Traitement audio"} · {progress} %</p></div>}
    {result && <section className="space-y-4 border-y border-zinc-200 py-5"><h2 className="break-words font-semibold">{result.fileName}</h2><audio src={result.url} controls className="w-full" /><p className="text-xs text-zinc-500">{(result.blob.size / 1024 ** 2).toFixed(2)} Mo</p><div className="flex flex-wrap gap-3"><Button onClick={download}><Download size={18} />Télécharger</Button><Button variant="secondary" onClick={share}><Share2 size={18} />Partager</Button></div></section>}
    {notice && <p role="status" className="text-sm text-zinc-600">{notice}</p>}
  </div>;
}
