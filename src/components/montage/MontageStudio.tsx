"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Upload, Play, Pause, Download, Share2, Trash2, ArrowLeft, ArrowRight, Undo2, Redo2, Save, X, Film, AudioLines, Scissors, Volume2, VolumeX, SkipBack, SkipForward, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MontageProcessor } from "@/lib/video/montage-processor";
import { readVideoMetadata } from "@/lib/video/video-utils";
import Image from "next/image";
import { readStudio } from "@/lib/studio-preferences";
import { videoThumbnail } from "@/lib/video/thumbnail";
import { readAudio } from "@/lib/audio/audio-processor";
import { WaveformProcessor } from "@/lib/audio/waveform-processor";
import { PreviewAudioMixer } from "@/lib/audio/preview-mixer";
import { MontageTimeline } from "./MontageTimeline";
import { Waveform } from "./Waveform";
import { saveProject, projectSnapshot, parseProjects, subscribeProjects, reference, matches, type StudioProject } from "@/lib/projects";
import { clipDuration, montageTimeline, defaultMontage, audioGain as trackGain, audioDuration, type MontageClip, type MontageSettings, type MontageAudioClip, type MontageResource as Resource } from "@/types/montage";
type MontageProject = Extract<StudioProject, { kind: "montage" }>;
type LibraryItem = { id: string; kind: "video" | "photo" | "audio"; sourceDuration: number; resource: Resource };
const transitions = [{ value: "none", label: "Coupe directe" }, { value: "fade", label: "Fondu enchaîné" }, { value: "wipeleft", label: "Balayage" }, { value: "slideleft", label: "Glissement" }];
export function MontageWorkspace({ projectId }: { projectId?: string }) {
  const raw = useSyncExternalStore(subscribeProjects, projectSnapshot, () => null);
  const saved = parseProjects(raw).find(project => project.id === projectId && project.kind === "montage") as MontageProject | undefined;
  return <MontageStudio key={saved?.id || "new"} initial={saved} />;
}
function MediaLayer({ clip, resource, localTime, playing, opacity, audioGain, style, mixer }: { clip: MontageClip; resource?: Resource; localTime: number; playing: boolean; opacity: number; audioGain: number; style?: React.CSSProperties; mixer: PreviewAudioMixer }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { const media = video.current; return () => { if (media) { media.pause(); mixer.release(media); } }; }, [resource?.url, mixer]);
  useEffect(() => {
    const element = video.current;
    if (!element || !resource) return;
    const target = clip.start + Math.max(0, Math.min(clipDuration(clip), localTime));
    if (Math.abs(element.currentTime - target) > (playing ? 0.18 : 0.001)) element.currentTime = target;
    mixer.setGain(element, clip.volume * audioGain);
    if (playing && element.paused) void element.play().catch(() => {}); else if (!playing && !element.paused) element.pause();
  }, [clip, resource, localTime, playing, audioGain, mixer]);
  if (!resource) return <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-300">{clip.media.name} · fichier à resélectionner</div>;
  const common = { ...style, opacity };
  // Original media is used for the interactive preview; exported transitions use FFmpeg.
  return clip.kind === "photo" ? <Image src={resource.url} alt={clip.media.name} fill unoptimized style={common} className="montage-media" /> : <video ref={video} src={resource.url} playsInline preload="auto" style={common} className="montage-media absolute inset-0 h-full w-full" />;
}
function AudioLayer({ track, resource, time, duration, playing, mixer }: { track: MontageAudioClip; resource?: Resource; time: number; duration: number; playing: boolean; mixer: PreviewAudioMixer }) {
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => { const audio = player.current; return () => { if (audio) { audio.pause(); mixer.release(audio); } }; }, [resource?.url, mixer]);
  useEffect(() => {
    const audio = player.current; if (!audio || !resource) return;
    const active = time >= track.offset && time < Math.min(duration, track.offset + audioDuration(track));
    const target = track.start + Math.max(0, time - track.offset);
    if (active && Math.abs(audio.currentTime - target) > (playing ? 0.1 : 0.001)) audio.currentTime = Math.min(track.end, target);
    mixer.setGain(audio, trackGain(track, time, duration));
    if (playing && active && !track.muted) { if (audio.paused) void audio.play().catch(() => {}); } else if (!audio.paused) audio.pause();
  }, [track, resource, time, duration, playing, mixer]);
  return resource ? <audio ref={player} src={resource.url} preload="auto" /> : null;
}
function MontageStudio({ initial }: { initial?: MontageProject }) {
  const [clips, setClips] = useState<MontageClip[]>(initial?.clips || []);
  const [settings, setSettings] = useState<MontageSettings>(initial?.settings || defaultMontage);
  const [name, setName] = useState(initial?.name || "Mon montage");
  const [inspectorTab, setInspectorTab] = useState<"selection" | "mix" | "export">("selection");
  const [resources, setResources] = useState<Map<string, Resource>>(new Map());
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState(initial?.clips[0]?.id || "");
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false), [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0), [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [history, setHistory] = useState<{ clips: MontageClip[]; settings: MontageSettings }[]>([]);
  const [redo, setRedo] = useState<{ clips: MontageClip[]; settings: MontageSettings }[]>([]);
  const [mixer] = useState(() => new PreviewAudioMixer());
  const worker = useRef<MontageProcessor | null>(null), id = useRef(initial?.id || "");
  const urls = useRef(new Set<string>()), alive = useRef(true), version = useRef(0);
  const waveformWorker = useRef<WaveformProcessor | null>(null);
  const pending = useRef<{ latest: StudioProject | null }>({ latest: null });
  const dirty = useRef(false);
  const playhead = useRef(0);
  useEffect(() => { playhead.current = time; }, [time]);
  useEffect(() => { alive.current = true; const allocatedUrls = urls.current, projectCache = pending.current; return () => { alive.current = false; worker.current?.terminate(); waveformWorker.current?.terminate(); mixer.dispose(); allocatedUrls.forEach(url => URL.revokeObjectURL(url)); if (readStudio().autosave && projectCache.latest) { try { saveProject(projectCache.latest); } catch { /* Explicit saving still reports storage errors in the studio. */ } } }; }, [mixer]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  const timeline = montageTimeline(clips), duration = timeline.at(-1)?.end || 0;
  const tracks = settings.audioTracks || [];
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now(), frame: number;
    function tick(now: number) { const delta = Math.min(0.1, (now - previous) / 1000); previous = now; const next = Math.min(duration, playhead.current + delta); playhead.current = next; setTime(next); if (next >= duration) setPlaying(false); else frame = requestAnimationFrame(tick); }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  const save = () => {
    if (!clips.length && !tracks.length && !id.current) return;
    if (!id.current) id.current = crypto.randomUUID();
    saveProject({ version: 1, id: id.current, name: name.trim() || "Mon montage", updatedAt: new Date().toISOString(), kind: "montage", clips, settings });
  };
  useEffect(() => {
    if (!dirty.current || (!clips.length && !(settings.audioTracks?.length) && !id.current)) return;
    if (!id.current) id.current = crypto.randomUUID();
    const snapshot: StudioProject = { version: 1, id: id.current, name: name.trim() || "Mon montage", updatedAt: new Date().toISOString(), kind: "montage", clips, settings }; pending.current.latest = snapshot;
    if (!readStudio().autosave) return;
    const timer = setTimeout(() => { try { saveProject(snapshot); setStatus("Projet enregistré sur cet appareil."); } catch (error) { setError((error as Error).message); } }, 800);
    return () => clearTimeout(timer);
  }, [clips, settings, name]);
  function remember() { dirty.current = true; setHistory(previous => [...previous.slice(-29), { clips, settings }]); setRedo([]); setResult(null); setPlaying(false); }
  function edit(patch: Partial<MontageClip>) { remember(); setClips(previous => previous.map(clip => clip.id === selected ? { ...clip, ...patch } : clip)); }
  function trim(id: string, start: number, end: number) { setClips(previous => previous.map(clip => clip.id === id ? clip.kind === "photo" ? { ...clip, start: 0, end: end - start } : { ...clip, start, end } : clip)); }
  function audioEdit(id: string, patch: Partial<MontageAudioClip>) { setSettings(previous => ({ ...previous, audioTracks: previous.audioTracks?.map(track => track.id === id ? { ...track, ...patch } : track) })); }
  function changeAudio(patch: Partial<MontageAudioClip>) { remember(); audioEdit(selected, patch); }
  function select(id: string) { setSelected(id); setInspectorTab("selection"); const visual = timeline.find(entry => entry.clip.id === id); const audio = tracks.find(track => track.id === id); setTime(Math.min(duration, visual?.start ?? audio?.offset ?? 0)); setPlaying(false); }
  function restore(direction: "undo" | "redo") {
    const source = direction === "undo" ? history : redo, snapshot = source.at(-1); if (!snapshot) return;
    dirty.current = true;
    if (direction === "undo") { setHistory(history.slice(0, -1)); setRedo(previous => [...previous, { clips, settings }]); } else { setRedo(redo.slice(0, -1)); setHistory(previous => [...previous, { clips, settings }]); }
    setClips(snapshot.clips); setSettings(snapshot.settings); setPlaying(false); setResult(null);
    if (![...snapshot.clips, ...(snapshot.settings.audioTracks || [])].some(item => item.id === selected)) setSelected(snapshot.clips[0]?.id || snapshot.settings.audioTracks?.[0]?.id || "");
  }
  function move(from: string, to: string) { if (from === to) return; remember(); setClips(previous => { const list = [...previous]; const index = list.findIndex(clip => clip.id === from), target = list.findIndex(clip => clip.id === to); if (index < 0 || target < 0) return list; const [clip] = list.splice(index, 1); list.splice(target, 0, clip); return list; }); }
  function placeMedia(mediaId: string, position = duration, lane?: "visual" | "audio") {
    if (busy || importing) return;
    const item = library.find(item => item.id === mediaId); if (!item) return;
    const isAudio = item.kind === "audio";
    if (lane && (isAudio ? lane !== "audio" : lane !== "visual")) { setError("Déposez ce média sur la piste correspondante."); return; }
    if (isAudio && tracks.length >= 4 || !isAudio && clips.length >= 12) { setError(isAudio ? "Maximum 4 pistes audio par montage." : "Maximum 12 médias visuels par montage."); return; }
    setError(""); remember(); const newId = crypto.randomUUID();
    setResources(previous => new Map(previous).set(newId, item.resource));
    if (isAudio) {
      const offset = Math.round(Math.max(0, Math.min(position, Math.max(0, duration - 0.1))) * 30) / 30;
      const track: MontageAudioClip = { id: newId, media: reference(item.resource.file), sourceDuration: item.sourceDuration, start: 0, end: item.sourceDuration, offset, volume: 0.7, fadeIn: 0.2, fadeOut: 0.3, muted: false };
      setSettings(previous => ({ ...previous, audioTracks: [...(previous.audioTracks || []), track] }));
      setTime(offset);
    } else {
      const clip: MontageClip = { id: newId, media: reference(item.resource.file), kind: item.kind as "video" | "photo", sourceDuration: item.sourceDuration, start: 0, end: item.sourceDuration, volume: 1, transition: readStudio().transition, transitionDuration: 0.5 };
      const insertion = timeline.findIndex(entry => position < (entry.start + entry.end) / 2);
      setClips(previous => { const copy = [...previous]; copy.splice(insertion < 0 ? copy.length : insertion, 0, clip); return copy; });
      setTime(insertion < 0 ? duration : timeline[insertion].start);
    }
    setSelected(newId); setInspectorTab("selection");
  }
  async function importFiles(list: FileList | File[]) {
    if (busy || importing) return;
    setError(""); setImporting(true); setPlaying(false);
    const newResources = new Map(resources), newLibrary = [...library], allocated = new Set<string>(), failures: string[] = [];
    const own = (url: string) => { urls.current.add(url); allocated.add(url); };
    try {
      for (const file of Array.from(list)) {
        if (!alive.current) break;
        try {
          const existing = newLibrary.find(item => matches(file, reference(item.resource.file)));
          if (existing) {
            for (const item of [...clips, ...tracks].filter(item => matches(file, item.media))) newResources.set(item.id, existing.resource);
            continue;
          }
          if (newLibrary.length >= 40) throw new Error("Maximum 40 fichiers dans la médiathèque.");
          const unique = new Set([...newResources.values(), ...newLibrary.map(item => item.resource)].map(resource => resource.file)); unique.add(file);
          if ([...unique].reduce((sum, file) => sum + file.size, 0) > 512 * 1024 ** 2) throw new Error("Limitez les fichiers du montage à 512 Mo au total.");
          const missing = [...clips, ...tracks].find(item => matches(file, item.media));
          const isAudio = missing ? !("kind" in missing) : file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name);
          const photo = !isAudio && (file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name));
          let url: string, sourceDuration: number, thumbnail: string | undefined, waveform: number[] | undefined;
          setStatus(`Import de ${file.name}…`);
          if (isAudio) {
            if (file.size > 64 * 1024 ** 2) throw new Error("Limitez chaque piste audio à 64 Mo.");
            const metadata = await readAudio(file); url = metadata.objectUrl; sourceDuration = metadata.duration; own(url);
            if (sourceDuration > 1800) throw new Error("Limitez chaque piste audio à 30 minutes.");
            const analyzer = new WaveformProcessor(); waveformWorker.current = analyzer;
            try { waveform = await analyzer.analyze(file); }
            catch { if (alive.current) failures.push(`${file.name} : importé sans forme d'onde (analyse indisponible).`); }
            finally { analyzer.terminate(); waveformWorker.current = null; }
          } else if (photo) {
            if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error("Photos compatibles : JPG, PNG et WebP.");
            url = URL.createObjectURL(file); own(url);
            const image = document.createElement("img"); image.src = url; await image.decode();
            if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 32_000_000) throw new Error("Photo invalide ou supérieure à 32 mégapixels.");
            sourceDuration = readStudio().photoDuration; thumbnail = url;
          } else {
            const metadata = await readVideoMetadata(file); url = metadata.objectUrl; sourceDuration = metadata.duration; own(url);
            const blob = await videoThumbnail(url, sourceDuration);
            if (blob) { thumbnail = URL.createObjectURL(blob); own(thumbnail); }
          }
          if (!alive.current) break;
          const resource = { file, url, thumbnail, waveform }, libraryId = crypto.randomUUID();
          newLibrary.push({ id: libraryId, kind: isAudio ? "audio" : photo ? "photo" : "video", sourceDuration, resource });
          newResources.set(libraryId, resource);
          for (const item of [...clips, ...tracks].filter(item => matches(file, item.media))) newResources.set(item.id, resource);
        } catch (error) { failures.push(`${file.name} : ${(error as Error).message}`); }
      }
    } finally {
      const retained = new Set([...newResources.values()].flatMap(resource => [resource.url, resource.thumbnail]));
      for (const url of allocated) if (!alive.current || !retained.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
      if (alive.current) {
        setLibrary(newLibrary); setResources(newResources); setImporting(false);
        setStatus(`${newLibrary.length} média(s) dans la médiathèque.`);
        if (failures.length) setError(failures.join(" "));
      }
    }
  }
  async function exportMontage() {
    const token = ++version.current; const processor = new MontageProcessor(); worker.current = processor;
    setBusy(true); setPlaying(false); setResult(null); setError(""); setProgress(0);
    try {
      if (readStudio().autosave) save();
      const blob = await processor.export(clips, new Map([...resources].map(([key, value]) => [key, value.file])), settings, (value, message) => { if (alive.current && version.current === token) { setProgress(Math.round(value)); setStatus(message); } });
      if (alive.current && version.current === token) setResult({ blob, url: URL.createObjectURL(blob), name: `${name.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "montage"}.mp4` });
    } catch (error) { if (alive.current && version.current === token) setError((error as Error).message); }
    finally { if (alive.current && version.current === token) { setBusy(false); worker.current = null; } }
  }
  function download() { if (!result) return; const link = document.createElement("a"); link.href = result.url; link.download = result.name; link.click(); }
  async function share() {
    if (!result) return;
    const files = [new File([result.blob], result.name, { type: "video/mp4" })];
    try { if (navigator.share && navigator.canShare?.({ files })) await navigator.share({ files, title: name }); else { download(); setStatus("Fichier téléchargé pour le partage."); } }
    catch (error) { if ((error as Error).name !== "AbortError") { download(); setStatus("Partage indisponible : fichier téléchargé."); } }
  }
  const current = clips.find(clip => clip.id === selected), index = clips.findIndex(clip => clip.id === selected);
  const currentAudio = tracks.find(track => track.id === selected);
  const selectedEntry = timeline.find(entry => entry.clip.id === selected);
  const displayTime = Math.max(0, Math.min(time, duration)), active = timeline.filter(entry => displayTime >= entry.start && displayTime < entry.end);
  if (!active.length && timeline.length) active.push(timeline.at(-1)!);
  const locked = busy || importing;
  const canSplit = currentAudio ? tracks.length < 4 && displayTime > currentAudio.offset + 0.1 && displayTime < Math.min(duration, currentAudio.offset + audioDuration(currentAudio)) - 0.1 : !!selectedEntry && clips.length < 12 && displayTime > selectedEntry.start + 0.1 && displayTime < selectedEntry.end - 0.1;
  const audioValid = tracks.every(track => audioDuration(track) >= 0.1 && track.start >= 0 && track.end <= track.sourceDuration && (track.muted || track.volume === 0 || resources.has(track.id) && track.offset < duration));
  function split() {
    if (!canSplit) return;
    remember(); const newId = crypto.randomUUID();
    setResources(previous => { const copy = new Map(previous); const resource = copy.get(selected); if (resource) copy.set(newId, resource); return copy; });
    if (currentAudio) {
      const position = currentAudio.start + displayTime - currentAudio.offset;
      setSettings(previous => ({ ...previous, audioTracks: previous.audioTracks?.flatMap(track => track.id !== selected ? [track] : [{ ...track, end: position, fadeOut: 0 }, { ...track, id: newId, start: position, offset: displayTime, fadeIn: 0 }]) }));
    } else if (current && selectedEntry) {
      const length = Math.round((displayTime - selectedEntry.start) * 30) / 30, position = current.start + length;
      setClips(previous => previous.flatMap(clip => clip.id !== selected ? [clip] : clip.kind === "photo" ? [{ ...clip, start: 0, end: length, transition: "none" }, { ...clip, id: newId, start: 0, end: clipDuration(clip) - length }] : [{ ...clip, end: position, transition: "none" }, { ...clip, id: newId, start: position }]));
    }
    setSelected(newId);
  }
  function removeSelected() {
    remember();
    if (currentAudio) { setSettings(previous => ({ ...previous, audioTracks: previous.audioTracks?.filter(track => track.id !== selected) })); setSelected(clips[0]?.id || ""); }
    else { setClips(clips.filter(clip => clip.id !== selected)); setSelected(clips[index + 1]?.id || clips[index - 1]?.id || tracks[0]?.id || ""); }
  }
  return <div className="mx-auto max-w-7xl space-y-5" onKeyDown={event => {
    if (locked || (event.target as HTMLElement).closest("input, textarea, select")) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") { event.preventDefault(); restore(event.shiftKey ? "redo" : "undo"); }
    else if ((event.ctrlKey || event.metaKey) && key === "b") { event.preventDefault(); split(); }
    else if (event.key === "Delete" && (current || currentAudio)) { event.preventDefault(); removeSelected(); }
    else if (event.key === " " && (event.target as HTMLElement).tagName !== "BUTTON" && duration) { event.preventDefault(); if (time >= duration) setTime(0); if (!playing) void mixer.resume().catch(() => setError("Lecture audio indisponible.")); setPlaying(!playing); }
  }}>
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">STUDIO / MONTAGE</p><h1 className="mt-2 text-2xl font-semibold">Montage photo, vidéo & audio</h1></div><Button variant="secondary" disabled={locked || (!clips.length && !tracks.length)} onClick={() => { try { save(); setStatus("Projet enregistré."); } catch (error) { setError((error as Error).message); } }}><Save size={17} />Enregistrer</Button></header>
    <div className="flex flex-wrap items-center gap-3 border-y border-zinc-200 py-3">
      <label className="min-w-0 flex-1 sm:max-w-xs"><span className="sr-only">Nom du projet</span><input aria-label="Nom du projet" disabled={locked} value={name} maxLength={100} onChange={event => { dirty.current = true; setName(event.target.value); }} className="h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium" /></label>
      <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white ${locked ? "pointer-events-none opacity-50" : ""}`}><Upload size={17} />{initial && [...clips, ...tracks].some(item => !resources.has(item.id)) ? "Resélectionner" : "Médias"}<input aria-label="Importer des médias" disabled={locked} type="file" multiple accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,audio/*,.mov,.m4a,.mp3,.wav" className="sr-only" onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ""; }} /></label>
      <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium ${locked ? "pointer-events-none opacity-50" : ""}`}><AudioLines size={17} />Audio<input aria-label="Importer une piste audio" disabled={locked} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" className="sr-only" onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ""; }} /></label>
      <div className="flex items-center gap-1 sm:ml-auto"><Button variant="ghost" title="Annuler" aria-label="Annuler la modification" disabled={locked || !history.length} onClick={() => restore("undo")}><Undo2 size={17} /></Button><Button variant="ghost" title="Rétablir" aria-label="Rétablir la modification" disabled={locked || !redo.length} onClick={() => restore("redo")}><Redo2 size={17} /></Button><Button variant="ghost" title="Scinder à la tête de lecture" aria-label="Scinder ici" disabled={locked || !canSplit} onClick={split}><Scissors size={17} /></Button><Button variant="ghost" title="Supprimer la sélection" aria-label="Supprimer la sélection" disabled={locked || (!current && !currentAudio)} onClick={removeSelected}><Trash2 size={17} /></Button></div>
    </div>
    <section aria-label="Médiathèque" className="min-w-0 border-b border-zinc-200 pb-4" onDragOver={event => { if (!locked && event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); if (!locked) void importFiles(event.dataTransfer.files); } }}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Médiathèque</h2><span className="text-xs text-zinc-500">{library.length} médias</span></div>
      {!library.length && <div className="flex min-h-24 items-center justify-center border border-dashed border-zinc-300 text-sm text-zinc-500">{importing ? "Import en cours…" : "Aucun média importé"}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{library.map(item => <article key={item.id} data-testid="library-media" draggable={!locked} onDragStart={event => { event.dataTransfer.setData("application/x-edifycut-media", item.id); event.dataTransfer.effectAllowed = "copy"; }} onDoubleClick={() => placeMedia(item.id, item.kind === "audio" ? displayTime : duration)} className="min-w-0 overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-zinc-100">{item.resource.thumbnail ? <Image src={item.resource.thumbnail} alt={item.resource.file.name} fill unoptimized className="object-cover" /> : <AudioLines size={28} className="text-cyan-700" />}{item.kind === "audio" && <div className="absolute inset-x-1 bottom-1"><Waveform peaks={item.resource.waveform} start={0} end={item.sourceDuration} duration={item.sourceDuration} /></div>}</div>
        <div className="flex min-w-0 items-center gap-1 p-2"><div className="min-w-0 flex-1"><p title={item.resource.file.name} className="truncate text-xs font-medium">{item.resource.file.name}</p><p className="text-[10px] text-zinc-500">{item.kind === "audio" ? "Audio" : item.kind === "photo" ? "Photo" : "Vidéo"} · {item.sourceDuration.toFixed(1)} s</p></div><Button variant="ghost" disabled={locked} title="Ajouter au montage" aria-label={`Ajouter ${item.resource.file.name} au montage`} onClick={() => placeMedia(item.id, item.kind === "audio" ? displayTime : duration)}><Plus size={17} /></Button></div>
      </article>)}</div>
    </section>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_288px]">
      <section className="order-1 min-w-0 space-y-3"><div className="flex items-center justify-between text-xs text-zinc-500"><span>Aperçu</span><span>{settings.aspect === "landscape" ? "16:9" : settings.aspect === "portrait" ? "9:16" : "1:1"} · {settings.resolution}</span></div>
        <div className="relative mx-auto w-full overflow-hidden bg-black" style={{ aspectRatio: settings.aspect === "portrait" ? "9 / 16" : settings.aspect === "square" ? "1" : "16 / 9", maxWidth: settings.aspect === "portrait" ? 236 : settings.aspect === "square" ? 420 : 960 }} data-fit={settings.fit}>
          {!clips.length && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500"><Film size={32} /><span className="text-sm">Aucun média visuel</span></div>}
          {active.map((entry, i) => {
            const previous = timeline[clips.indexOf(entry.clip) - 1], transition = previous ? previous.end - entry.start : 0;
            const ratio = transition > 0 ? Math.max(0, Math.min(1, (displayTime - entry.start) / transition)) : 1, entering = i > 0;
            const next = timeline[clips.indexOf(entry.clip) + 1], outgoingOverlap = next ? entry.end - next.start : 0;
            const gain = (entering ? ratio : outgoingOverlap > 0 && displayTime >= next!.start ? (entry.end - displayTime) / outgoingOverlap : 1) * (settings.originalVolume ?? 1);
            const style = entering && previous?.clip.transition === "wipeleft" ? { clipPath: `inset(0 0 0 ${100 - ratio * 100}%)` } : entering && previous?.clip.transition === "slideleft" ? { transform: `translateX(${(1 - ratio) * 100}%)` } : undefined;
            return <MediaLayer key={entry.clip.id} clip={entry.clip} resource={resources.get(entry.clip.id)} localTime={displayTime - entry.start} playing={playing && time < duration} opacity={entering && previous?.clip.transition === "fade" ? ratio : 1} audioGain={gain} style={style} mixer={mixer} />;
          })}
        </div>
        {tracks.map(track => <AudioLayer key={track.id} track={track} resource={resources.get(track.id)} time={displayTime} duration={duration} playing={playing && time < duration} mixer={mixer} />)}
        <div className="flex items-center gap-1"><Button variant="ghost" title="Début du montage" aria-label="Début du montage" disabled={locked || !duration} onClick={() => { setTime(0); setPlaying(false); }}><SkipBack size={17} /></Button><Button variant="secondary" title={playing ? "Pause" : "Lire le montage"} aria-label={playing ? "Pause" : "Lire le montage"} disabled={locked || !duration} onClick={() => { if (time >= duration) setTime(0); if (!playing) void mixer.resume().catch(() => setError("Lecture audio indisponible.")); setPlaying(!playing); }}>{playing ? <Pause size={18} /> : <Play size={18} />}</Button><Button variant="ghost" title="Fin du montage" aria-label="Fin du montage" disabled={locked || !duration} onClick={() => { setTime(duration); setPlaying(false); }}><SkipForward size={17} /></Button><input aria-label="Position dans le montage" type="range" disabled={locked || !duration} min="0" max={Math.max(0.1, duration)} step={1 / 30} value={displayTime} onChange={event => setTime(Number(event.target.value))} className="min-w-0 flex-1 accent-indigo-600" /><span className="ml-1 whitespace-nowrap text-xs tabular-nums text-zinc-500">{displayTime.toFixed(2)} s</span></div>
      </section>
      <aside className="order-3 min-w-0 lg:order-2 lg:border-l lg:border-zinc-200 lg:pl-5">
        <div className="mb-4 flex border-b border-zinc-200" role="tablist" aria-label="Réglages du montage">{([{ value: "selection", label: "Sélection" }, { value: "mix", label: "Mixage" }, { value: "export", label: "Export" }] as const).map(tab => <button type="button" role="tab" aria-selected={inspectorTab === tab.value} key={tab.value} onClick={() => setInspectorTab(tab.value)} className={`min-h-11 flex-1 border-b-2 text-xs font-medium ${inspectorTab === tab.value ? "border-indigo-600 text-indigo-700" : "border-transparent text-zinc-500"}`}>{tab.label}</button>)}</div>
        <fieldset disabled={locked} className="min-w-0 space-y-4 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
          {inspectorTab === "selection" && currentAudio && <><h2 className="break-words text-sm font-semibold">{currentAudio.media.name}</h2><Waveform peaks={resources.get(currentAudio.id)?.waveform} start={currentAudio.start} end={currentAudio.end} duration={currentAudio.sourceDuration} muted={currentAudio.muted} /><label className="field-label">Position dans le montage (s)<input aria-label="Position audio (s)" type="number" min="0" step="0.01" value={currentAudio.offset} onChange={event => changeAudio({ offset: Math.max(0, Number(event.target.value)) })} className="rounded-md border border-zinc-200 bg-white px-3" /></label><div className="grid grid-cols-2 gap-3">{(["start", "end"] as const).map(key => <label key={key} className="field-label min-w-0">{key === "start" ? "Début source" : "Fin source"}<input aria-label={key === "start" ? "Début audio (s)" : "Fin audio (s)"} type="number" min="0" max={currentAudio.sourceDuration} step="0.01" value={currentAudio[key]} onChange={event => changeAudio({ [key]: Number(event.target.value) })} className="w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3" /></label>)}</div><label className="field-label">Volume · {Math.round(currentAudio.volume * 100)} %<input aria-label="Volume audio" type="range" min="0" max="1" step="0.05" value={currentAudio.volume} onChange={event => changeAudio({ volume: Number(event.target.value) })} className="accent-indigo-600" /></label><div className="grid grid-cols-2 gap-3">{(["fadeIn", "fadeOut"] as const).map(key => <label key={key} className="field-label min-w-0">{key === "fadeIn" ? "Fondu entrée" : "Fondu sortie"}<input aria-label={key === "fadeIn" ? "Fondu audio entrée (s)" : "Fondu audio sortie (s)"} type="number" min="0" max="30" step="0.1" value={currentAudio[key]} onChange={event => changeAudio({ [key]: Number(event.target.value) })} className="w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3" /></label>)}</div><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={currentAudio.muted} onChange={event => changeAudio({ muted: event.target.checked })} className="size-4 accent-indigo-600" />Couper cette piste</label><p className="text-xs text-zinc-500">Source · {currentAudio.sourceDuration.toFixed(2)} s · Montage · {Math.max(0, Math.min(audioDuration(currentAudio), duration - currentAudio.offset)).toFixed(2)} s</p></>}
          {inspectorTab === "selection" && current && <><h2 className="break-words text-sm font-semibold">Clip {index + 1} · {current.media.name}</h2><div className="flex gap-1"><Button variant="secondary" title="Déplacer avant" aria-label="Déplacer avant" disabled={index <= 0} onClick={() => move(current.id, clips[index - 1].id)}><ArrowLeft size={16} /></Button><Button variant="secondary" title="Déplacer après" aria-label="Déplacer après" disabled={index >= clips.length - 1} onClick={() => move(current.id, clips[index + 1].id)}><ArrowRight size={16} /></Button><Button variant="ghost" title="Retirer le clip" aria-label="Retirer le clip" onClick={removeSelected}><Trash2 size={17} /></Button></div>{current.kind === "photo" ? <label className="field-label">Durée de la photo (s)<input type="number" min="0.1" max="120" step="0.1" value={clipDuration(current)} onChange={event => edit({ start: 0, end: Number(event.target.value) })} className="rounded-md border border-zinc-200 bg-white px-3" /></label> : <div className="grid grid-cols-2 gap-3">{(["start", "end"] as const).map(key => <label key={key} className="field-label min-w-0">{key === "start" ? "Début (s)" : "Fin (s)"}<input aria-label={key === "start" ? "Début clip (s)" : "Fin clip (s)"} type="number" min="0" max={current.sourceDuration} step="0.01" value={current[key]} onChange={event => edit({ [key]: Number(event.target.value) })} className="w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3" /></label>)}</div>}{current.kind === "video" && <label className="field-label">Volume source · {Math.round(current.volume * 100)} %<input type="range" min="0" max="1" step="0.05" value={current.volume} onChange={event => edit({ volume: Number(event.target.value) })} className="accent-indigo-600" /></label>}{index < clips.length - 1 && <><label className="field-label">Transition suivante<select aria-label="Transition suivante" value={current.transition} onChange={event => edit({ transition: event.target.value as MontageClip["transition"] })} className="h-11 rounded-md border border-zinc-200 bg-white px-3">{transitions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label className="field-label">Transition (s)<input type="number" disabled={current.transition === "none"} min="0.1" max="3" step="0.1" value={current.transitionDuration} onChange={event => edit({ transitionDuration: Number(event.target.value) })} className="rounded-md border border-zinc-200 bg-white px-3" /></label></>}</>}
          {inspectorTab === "selection" && !current && !currentAudio && <p className="text-sm text-zinc-500">Aucune sélection</p>}
          {inspectorTab === "mix" && <><h2 className="text-sm font-semibold">Mixage audio</h2><label className="field-label">Son des vidéos · {Math.round((settings.originalVolume ?? 1) * 100)} %<input aria-label="Volume du son des vidéos" type="range" min="0" max="1" step="0.05" value={settings.originalVolume ?? 1} onChange={event => { remember(); setSettings({ ...settings, originalVolume: Number(event.target.value) }); }} className="accent-indigo-600" /></label>{tracks.map((track, i) => <div key={track.id} className="space-y-2 border-t border-zinc-200 pt-3"><div className="flex items-center gap-2"><button className="min-w-0 flex-1 truncate text-left text-xs font-medium" onClick={() => select(track.id)}>{i + 1} · {track.media.name}</button><Button variant="ghost" title={track.muted ? "Réactiver la piste" : "Couper la piste"} aria-label={track.muted ? "Réactiver la piste" : "Couper la piste"} onClick={() => { remember(); audioEdit(track.id, { muted: !track.muted }); }}>{track.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</Button></div><input aria-label={`Volume piste ${i + 1}`} type="range" min="0" max="1" step="0.05" value={track.volume} onChange={event => { remember(); audioEdit(track.id, { volume: Number(event.target.value) }); }} className="w-full accent-indigo-600" /></div>)}</>}
          {inspectorTab === "export" && <><h2 className="text-sm font-semibold">Format du montage</h2>{([{ key: "aspect", label: "Cadre", options: [["landscape", "Paysage · 16:9"], ["portrait", "Portrait · 9:16"], ["square", "Carré · 1:1"]] }, { key: "resolution", label: "Résolution", options: [["1080p", "1080p"], ["720p", "720p"], ["480p", "480p"]] }, { key: "fit", label: "Cadrage", options: [["contain", "Média entier"], ["cover", "Remplir le cadre"]] }] as const).map(field => <label key={field.key} className="field-label">{field.label}<select aria-label={field.label} value={settings[field.key]} onChange={event => { remember(); setSettings({ ...settings, [field.key]: event.target.value }); }} className="h-11 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3">{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}<label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings.compress} onChange={event => { remember(); setSettings({ ...settings, compress: event.target.checked }); }} className="size-4 accent-indigo-600" />Compression renforcée</label><p className="text-xs text-zinc-500">MP4 · H.264 / AAC · {duration.toFixed(2)} s</p></>}
        </fieldset>
      </aside>
      <div className="order-2 min-w-0 lg:order-3 lg:col-span-2"><MontageTimeline onDropMedia={placeMedia} clips={clips} tracks={tracks} resources={resources} selected={selected} time={displayTime} duration={duration} originalVolume={settings.originalVolume ?? 1} disabled={locked} onSelect={select} onSeek={value => { setTime(value); setPlaying(false); }} onBeginEdit={remember} onTrim={trim} onAudioEdit={audioEdit} onReorder={move} onOriginalVolume={() => { remember(); setSettings({ ...settings, originalVolume: (settings.originalVolume ?? 1) > 0 ? 0 : 1 }); }} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4"><Button disabled={locked || !clips.length || !audioValid || clips.some(clip => !resources.has(clip.id) || clipDuration(clip) < 0.1)} onClick={exportMontage}><Film size={18} />Exporter le montage MP4</Button>{busy && <Button variant="secondary" onClick={() => { version.current++; worker.current?.terminate(); worker.current = null; setBusy(false); setStatus("Export annulé."); }}><X size={18} />Annuler</Button>}{status && <p role="status" className="text-xs text-zinc-500">{status}{busy ? ` · ${progress} %` : ""}</p>}</div>
    {busy && <progress aria-label="Progression de l'export montage" max="100" value={progress} className="h-2 w-full" />}
    {result && <section className="space-y-4 border-t border-zinc-200 pt-5"><h2 className="break-words font-semibold">{result.name}</h2><video src={result.url} controls playsInline className="max-h-[480px] w-full" /><div className="flex flex-wrap gap-3"><Button onClick={download}><Download size={18} />Télécharger</Button><Button variant="secondary" onClick={share}><Share2 size={18} />Partager</Button></div></section>}
  </div>;
}
