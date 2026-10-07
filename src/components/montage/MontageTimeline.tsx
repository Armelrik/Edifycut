"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Film, AudioLines, ZoomIn, ZoomOut, ScanLine, Magnet, Volume2, VolumeX, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { montageTimeline, clipDuration, audioDuration, type MontageClip, type MontageAudioClip, type MontageResource } from "@/types/montage";
import { Waveform } from "./Waveform";
type Props = {
  clips: MontageClip[]; tracks: MontageAudioClip[]; resources: Map<string, MontageResource>;
  selected: string; time: number; duration: number; originalVolume: number; disabled: boolean;
  onSelect: (id: string) => void; onSeek: (time: number) => void; onBeginEdit: () => void;
  onTrim: (id: string, start: number, end: number) => void;
  onAudioEdit: (id: string, patch: Partial<MontageAudioClip>) => void;
  onReorder: (from: string, to: string) => void; onOriginalVolume: () => void;
};
type Gesture = { id: string; kind: "video" | "audio"; mode: "move" | "start" | "end"; x: number; start: number; end: number; offset: number; limit: number; changed: boolean; delta: number; scale: number; scroll: number; timelineStart: number; boundaries: number[] };
const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
export function MontageTimeline(props: Props) {
  const { clips, tracks, resources, selected, time, duration, originalVolume, disabled, onSelect, onSeek, onBeginEdit, onTrim, onAudioEdit, onReorder, onOriginalVolume } = props;
  const [zoom, setZoom] = useState(48), [snap, setSnap] = useState(true), [viewport, setViewport] = useState(600);
  const [dragging, setDragging] = useState<{ id: string; delta: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | null>(null);
  const timeline = montageTimeline(clips);
  const extent = Math.max(1, duration, ...tracks.map(track => track.offset + audioDuration(track)));
  const width = Math.min(150000, Math.max(viewport, extent * zoom)), scale = width / extent;
  const tickStep = Math.max(scale > 80 ? 1 : scale > 24 ? 2 : scale > 8 ? 5 : 10, Math.ceil(extent / 150));
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const observer = new ResizeObserver(() => setViewport(element.clientWidth)); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (gesture.current) return;
    const element = scroller.current; if (!element) return;
    const position = time * scale;
    if (position < element.scrollLeft || position > element.scrollLeft + element.clientWidth - 24) element.scrollLeft = Math.max(0, position - element.clientWidth / 2);
  }, [time, scale]);
  function seek(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(duration, (event.clientX - rect.left) / scale)));
  }
  function begin(event: React.PointerEvent<HTMLButtonElement>, id: string, kind: "video" | "audio", mode: Gesture["mode"]) {
    if (disabled || event.button !== 0) return;
    event.stopPropagation(); onSelect(id);
    const item = kind === "audio" ? tracks.find(track => track.id === id)! : clips.find(clip => clip.id === id)!;
    gesture.current = { id, kind, mode, x: event.clientX, start: item.start, end: item.end, offset: kind === "audio" ? (item as MontageAudioClip).offset : 0, limit: kind === "video" && (item as MontageClip).kind === "photo" ? 120 : item.sourceDuration, changed: false, delta: 0, scale, scroll: scroller.current?.scrollLeft || 0, timelineStart: kind === "audio" ? (item as MontageAudioClip).offset : timeline.find(entry => entry.clip.id === id)!.start, boundaries: [0, time, duration, ...timeline.filter(entry => entry.clip.id !== id).flatMap(entry => [entry.start, entry.end]), ...tracks.filter(track => track.id !== id).flatMap(track => [track.offset, track.offset + audioDuration(track)])] };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function aligned(value: number, g: Gesture) {
    const frame = Math.round(value * 30) / 30;
    if (!snap) return frame;
    const closest = g.boundaries.reduce((best, candidate) => Math.abs(value - candidate) < Math.abs(value - best) ? candidate : best, g.boundaries[0]);
    return Math.abs(closest - value) * g.scale <= 8 ? closest : frame;
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || disabled) return;
    const element = scroller.current;
    if (element) { const rect = element.getBoundingClientRect(); if (event.clientX > rect.right - 18) element.scrollLeft += 12; else if (event.clientX < rect.left + 18) element.scrollLeft -= 12; }
    const delta = (event.clientX - g.x + (element?.scrollLeft || 0) - g.scroll) / g.scale;
    if (!g.changed && Math.abs(event.clientX - g.x) < 4) return;
    if (!g.changed) { g.changed = true; if (!(g.kind === "video" && g.mode === "move")) onBeginEdit(); }
    g.delta = delta;
    if (g.kind === "video" && g.mode === "move") { setDragging({ id: g.id, delta: delta * scale }); return; }
    if (g.kind === "audio" && g.mode === "move") { onAudioEdit(g.id, { offset: Math.max(0, Math.min(Math.max(0, duration - 0.1), aligned(g.offset + delta, g))) }); return; }
    if (g.mode === "start") {
      const adjustment = aligned(g.timelineStart + delta, g) - g.timelineStart;
      const start = Math.max(0, Math.min(g.end - 0.1, Math.round((g.start + adjustment) * 30) / 30));
      if (g.kind === "video") onTrim(g.id, start, g.end);
      else { const constrained = Math.max(start, g.start - g.offset); onAudioEdit(g.id, { start: constrained, offset: Math.max(0, g.offset + constrained - g.start) }); }
    } else {
      const adjustment = aligned(g.timelineStart + g.end - g.start + delta, g) - (g.timelineStart + g.end - g.start);
      const end = Math.max(g.start + 0.1, Math.min(g.limit, Math.round((g.end + adjustment) * 30) / 30));
      if (g.kind === "video") onTrim(g.id, g.start, end); else onAudioEdit(g.id, { end });
    }
  }
  function finish(event: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const g = gesture.current; if (!g) return;
    if (!cancelled && g.changed && g.kind === "video" && g.mode === "move") {
      const source = timeline.findIndex(entry => entry.clip.id === g.id);
      const center = timeline[source].start + clipDuration(clips[source]) / 2 + g.delta;
      const target = timeline.reduce((best, entry, index) => Math.abs(center - (entry.start + clipDuration(entry.clip) / 2)) < Math.abs(center - (timeline[best].start + clipDuration(timeline[best].clip) / 2)) ? index : best, source);
      if (target !== source) onReorder(g.id, clips[target].id);
    }
    gesture.current = null; setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyTrim(event: React.KeyboardEvent<HTMLButtonElement>, id: string, kind: "video" | "audio", edge: "start" | "end") {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); const item = kind === "audio" ? tracks.find(track => track.id === id)! : clips.find(clip => clip.id === id)!;
    const delta = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 1 / 30), limit = kind === "video" && (item as MontageClip).kind === "photo" ? 120 : item.sourceDuration;
    const value = edge === "start" ? Math.max(0, Math.min(item.end - 0.1, item.start + delta)) : Math.min(limit, Math.max(item.start + 0.1, item.end + delta));
    onBeginEdit();
    if (kind === "video") onTrim(id, edge === "start" ? value : item.start, edge === "end" ? value : item.end);
    else if (edge === "start") { const track = item as MontageAudioClip; const start = Math.max(value, track.start - track.offset); onAudioEdit(id, { start, offset: Math.max(0, track.offset + start - track.start) }); }
    else onAudioEdit(id, { end: value });
  }
  function handle(id: string, kind: "video" | "audio", edge: "start" | "end") {
    const items = kind === "audio" ? tracks : clips, index = items.findIndex(item => item.id === id);
    return <button type="button" disabled={disabled} title={`${edge === "start" ? "Début" : "Fin"} · glisser pour découper`} aria-label={`${edge === "start" ? "Début" : "Fin"} ${kind === "audio" ? "audio" : "clip"} ${index + 1}`} onPointerDown={event => begin(event, id, kind, edge)} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)} onKeyDown={event => keyTrim(event, id, kind, edge)} className={`timeline-handle ${edge === "start" ? "left-0" : "right-0"}`}><span /></button>;
  }
  function keyMove(event: React.KeyboardEvent<HTMLButtonElement>, id: string, kind: "video" | "audio") {
    if (disabled || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault(); const delta = event.key === "ArrowRight" ? 1 : -1;
    if (kind === "audio") { const track = tracks.find(track => track.id === id)!; onBeginEdit(); onAudioEdit(id, { offset: Math.max(0, Math.min(Math.max(0, duration - 0.1), track.offset + delta * (event.shiftKey ? 1 : 1 / 30))) }); }
    else { const index = clips.findIndex(clip => clip.id === id); const target = clips[index + delta]; if (target) onReorder(id, target.id); }
  }
  return <section className="min-w-0 border-y border-zinc-200 bg-white" aria-label="Timeline de montage">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2"><span className="text-sm font-semibold">Timeline <span className="ml-2 text-xs font-normal tabular-nums text-zinc-500">{clock(time)} / {clock(duration)}</span></span><div className="flex items-center gap-1"><Button variant="ghost" title="Zoom arrière" aria-label="Zoom arrière" disabled={disabled} onClick={() => setZoom(value => Math.max(1, value / 1.5))}><ZoomOut size={17} /></Button><Button variant="ghost" title="Ajuster la timeline" aria-label="Ajuster la timeline" disabled={disabled} onClick={() => setZoom(viewport / extent)}><ScanLine size={17} /></Button><Button variant="ghost" title="Zoom avant" aria-label="Zoom avant" disabled={disabled} onClick={() => setZoom(value => Math.min(240, value * 1.5))}><ZoomIn size={17} /></Button><Button variant="ghost" title="Alignement sur les raccords" aria-label="Alignement sur les raccords" aria-pressed={snap} className={snap ? "bg-indigo-50 text-indigo-700" : ""} disabled={disabled} onClick={() => setSnap(!snap)}><Magnet size={17} /></Button></div></div>
    <div className="flex min-w-0"><div className="w-20 shrink-0 border-r border-zinc-200 bg-zinc-50 text-xs sm:w-28"><div className="h-8 border-b border-zinc-200" /><div className="flex h-24 flex-col items-center justify-center gap-2 border-b border-zinc-200"><Film size={17} /><span>Image</span></div><button disabled={disabled} title="Activer ou couper le son des vidéos" onClick={onOriginalVolume} className="flex h-12 w-full items-center justify-center gap-2 border-b border-zinc-200">{originalVolume ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>Source</span></button>{tracks.map((track, i) => <button disabled={disabled} key={track.id} onClick={() => onSelect(track.id)} className={`flex h-16 w-full items-center justify-center gap-2 border-b border-zinc-200 ${selected === track.id ? "bg-cyan-50 text-cyan-800" : ""}`}><AudioLines size={15} /><span>Audio {i + 1}</span></button>)}</div>
      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain" data-testid="timeline-scroll"><div className="relative" style={{ width }}>
        <div tabIndex={disabled ? -1 : 0} role="slider" aria-label="Tête de lecture" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key) && !disabled) { event.preventDefault(); onSeek(Math.max(0, Math.min(duration, time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 1 : 1 / 30)))); } }} className="relative h-8 cursor-crosshair border-b border-zinc-200 bg-zinc-50" onPointerDown={seek} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(event); }} style={{ touchAction: "none" }}>{Array.from({ length: Math.floor(extent / tickStep) + 1 }, (_, i) => <span key={i} className="pointer-events-none absolute top-0 h-8 border-l border-zinc-300 pl-1 pt-1 text-[10px] tabular-nums text-zinc-500" style={{ left: i * tickStep * scale }}>{clock(i * tickStep)}</span>)}</div>
        <div className="relative h-24 border-b border-zinc-200 bg-zinc-50/50">{timeline.map((entry, i) => { const size = clipDuration(entry.clip) * scale; return <div key={entry.clip.id} data-testid="timeline-clip" className={`timeline-clip ${selected === entry.clip.id ? "is-selected" : ""}`} style={{ left: entry.start * scale, width: size, transform: dragging?.id === entry.clip.id ? `translateX(${dragging.delta}px)` : undefined, zIndex: dragging?.id === entry.clip.id ? 5 : undefined }}>
          <button disabled={disabled} title={entry.clip.media.name} aria-label={`Clip ${i + 1} ${entry.clip.media.name}`} aria-pressed={selected === entry.clip.id} onClick={() => onSelect(entry.clip.id)} onKeyDown={event => keyMove(event, entry.clip.id, "video")} onPointerDown={event => begin(event, entry.clip.id, "video", "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)} className="relative flex h-full w-full flex-col overflow-hidden text-left" style={{ touchAction: "none" }}>{resources.get(entry.clip.id)?.thumbnail && <span className="relative block h-12 w-full shrink-0 bg-black"><Image src={resources.get(entry.clip.id)!.thumbnail!} alt="" fill unoptimized className="object-cover" /></span>}<span className="block w-full truncate px-3 py-0.5 text-[11px] leading-4 font-medium">{size > 56 ? entry.clip.media.name : ""}</span><span className="px-3 text-[10px] leading-3 text-zinc-500">{size > 70 ? resources.has(entry.clip.id) ? `${clipDuration(entry.clip).toFixed(1)} s` : "Média manquant" : ""}</span></button>{handle(entry.clip.id, "video", "start")}{handle(entry.clip.id, "video", "end")}
          {entry.clip.transition !== "none" && i < clips.length - 1 && <span title="Zone de transition" className="pointer-events-none absolute bottom-0 right-0 top-0 border-l border-dashed border-indigo-400 bg-indigo-200/35" style={{ width: Math.max(0, entry.end - timeline[i + 1].start) * scale }}>{size > 70 && <ArrowLeftRight size={12} className="absolute bottom-2 right-1 text-indigo-700" />}</span>}
        </div>; })}</div>
        <div className="relative h-12 border-b border-zinc-200">{timeline.map(entry => entry.clip.kind === "video" && <button disabled={disabled} key={entry.clip.id} onClick={() => onSelect(entry.clip.id)} title={`Son de ${entry.clip.media.name}`} className="absolute bottom-2 top-2 overflow-hidden rounded-sm border border-indigo-100 bg-indigo-50 px-2 text-left text-[10px] text-indigo-700" style={{ left: entry.start * scale, width: clipDuration(entry.clip) * scale }}><span className="flex items-center gap-1">{originalVolume && entry.clip.volume ? <Volume2 size={12} /> : <VolumeX size={12} />}{Math.round(entry.clip.volume * originalVolume * 100)} %</span></button>)}</div>
        {tracks.map((track, i) => <div key={track.id} className="relative h-16 border-b border-zinc-200 bg-cyan-50/20"><div data-testid="timeline-audio" className={`timeline-audio ${selected === track.id ? "is-selected" : ""} ${track.muted ? "is-muted" : ""}`} style={{ left: track.offset * scale, width: audioDuration(track) * scale }}><button disabled={disabled} title={track.media.name} aria-label={`Audio ${i + 1} ${track.media.name}`} aria-pressed={selected === track.id} onClick={() => onSelect(track.id)} onKeyDown={event => keyMove(event, track.id, "audio")} onPointerDown={event => begin(event, track.id, "audio", "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={event => finish(event, true)} className="h-full w-full overflow-hidden text-left" style={{ touchAction: "none" }}><span className="block truncate px-3 text-[10px] font-medium text-cyan-900">{resources.has(track.id) ? track.media.name : "Média manquant"}</span><Waveform peaks={resources.get(track.id)?.waveform} start={track.start} end={track.end} duration={track.sourceDuration} muted={track.muted} /></button>{track.offset + audioDuration(track) > duration && <span title="Hors export" className="pointer-events-none absolute bottom-0 right-0 top-0 border-l border-dashed border-zinc-400 bg-zinc-100/70" style={{ width: Math.min(audioDuration(track), track.offset + audioDuration(track) - duration) * scale }} />}{handle(track.id, "audio", "start")}{handle(track.id, "audio", "end")}</div></div>)}
        <div className="pointer-events-none absolute bottom-0 top-8 border-r-2 border-dashed border-zinc-300" style={{ left: duration * scale }} />
        <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500" style={{ left: time * scale }}><span className="absolute -left-1 top-0 h-3 w-2 rounded-b-sm bg-red-500" /></div>
      </div></div>
    </div>
  </section>;
}
