"use client";

import type { EditorSettings, VideoMetadata } from "@/types/video";
import { preciseTime } from "@/lib/video/editing";
import { getEstimatedDuration } from "@/lib/video/video-utils";

export function VideoTimeline({ metadata, settings, currentTime, onSeek, onBoundsChange, cutMarker }: {
  metadata: VideoMetadata; settings: EditorSettings; currentTime: number;
  onSeek: (time: number) => void; onBoundsChange: (start: number, end: number) => void; cutMarker: number | null;
}) {
  const duration = metadata.duration;
  const start = settings.trimStart;
  const end = duration - settings.trimEnd;
  const percent = (time: number) => Math.max(0, Math.min(100, time / duration * 100));
  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Votre extrait</h2><span className="text-sm text-indigo-700">Durée finale : {preciseTime(getEstimatedDuration(metadata, settings))}</span></div>
      <div className="relative h-24 overflow-hidden rounded-md bg-zinc-200">
        <button type="button" aria-label="Positionner la lecture sur la timeline" className="absolute inset-0 w-full cursor-crosshair" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onSeek((event.clientX - rect.left) / rect.width * duration); }} />
        <div className="pointer-events-none absolute inset-y-3 border-y-2 border-indigo-500 bg-indigo-100" style={{ left: percent(start) + "%", width: percent(end - start) + "%" }} />
        {(settings.cuts ?? []).map(cut => <div key={cut.id} className={"pointer-events-none absolute inset-y-4 " + (cut.enabled ? "bg-red-300/80" : "border border-dashed border-amber-500 bg-amber-100/60")} style={{ left: percent(cut.start) + "%", width: percent(cut.end - cut.start) + "%" }} />)}
        {cutMarker !== null && <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-red-600" style={{ left: percent(cutMarker) + "%" }} />}
        <div className="pointer-events-none absolute inset-y-0 border-l-2 border-zinc-900" style={{ left: percent(currentTime) + "%" }} />
        <input aria-label="Borne de début" type="range" min={0} max={duration} step={0.01} value={start} className="trim-handle absolute inset-x-0 top-3" onChange={event => onBoundsChange(Math.min(Number(event.target.value), end - 0.05), end)} />
        <input aria-label="Borne de fin" type="range" min={0} max={duration} step={0.01} value={end} className="trim-handle absolute inset-x-0 top-12" onChange={event => onBoundsChange(start, Math.max(start + 0.05, Number(event.target.value)))} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 font-mono text-xs text-zinc-500"><span>Début {preciseTime(start)}</span><span>Fin {preciseTime(end)}</span></div>
    </section>
  );
}
