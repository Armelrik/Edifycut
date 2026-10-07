"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Maximize, Pause, Play, Volume2, SkipBack, SkipForward } from "lucide-react";
import { preciseTime, neutralEffects, retainedSegments } from "@/lib/video/editing";
import type { EditorSettings } from "@/types/video";

export type SeekRequest = { id: number; time: number; play?: boolean; stopAt?: number };

export function VideoPlayer({ src, duration, settings, currentTime, onTimeChange, previewOnly, onPreviewChange, seekRequest, elementRef }: {
  src: string; duration: number; settings: EditorSettings; currentTime: number;
  onTimeChange: (time: number) => void; previewOnly: boolean; onPreviewChange: (value: boolean) => void; seekRequest: SeekRequest | null;
  elementRef: RefObject<HTMLVideoElement | null>;
}) {
  const videoRef = elementRef;
  const stopAt = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const segments = useMemo(() => retainedSegments(duration, settings), [duration, settings]);
  const effects = { ...neutralEffects, ...settings.effects };
  const played = segments.reduce((sum, part) => sum + Math.max(0, Math.min(currentTime, part.end) - part.start), 0) / settings.speed;
  const total = segments.reduce((sum, part) => sum + part.end - part.start, 0) / settings.speed;
  const firstLength = segments.length ? (segments[0].end - segments[0].start) / settings.speed : 0;
  const lastLength = segments.length ? (segments[segments.length - 1].end - segments[segments.length - 1].start) / settings.speed : 0;
  const fadeIn = Math.min(effects.fadeIn, firstLength / 2);
  const fadeOut = Math.min(effects.fadeOut, lastLength / 2);
  const fade = previewOnly ? Math.max(0, Math.min(1, fadeIn > 0 ? played / fadeIn : 1, fadeOut > 0 ? (total - played) / fadeOut : 1)) : 1;

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = settings.speed; }, [settings.speed, videoRef]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, volume * effects.volume * fade)); }, [volume, effects.volume, fade, videoRef]);
  useEffect(() => {
    if (!seekRequest || !videoRef.current) return;
    const video = videoRef.current;
    stopAt.current = seekRequest.stopAt ?? null;
    video.currentTime = Math.max(0, Math.min(duration, seekRequest.time));
    if (seekRequest.play) void video.play().catch(() => setError("La lecture n'a pas pu démarrer. Touchez le bouton Lecture."));
  }, [seekRequest, duration, videoRef]);
  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    const check = () => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      if (stopAt.current !== null && video.currentTime >= stopAt.current) { video.pause(); stopAt.current = null; }
      else if (previewOnly) {
        const next = segments.find(part => part.end > video.currentTime + 0.005);
        if (!next) video.pause();
        else if (video.currentTime < next.start) video.currentTime = next.start;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, previewOnly, segments, videoRef]);

  const seek = (time: number) => {
    stopAt.current = null;
    const next = Math.max(0, Math.min(duration, time));
    if (videoRef.current) videoRef.current.currentTime = next;
    onTimeChange(next);
  };
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    if (!video.paused) { video.pause(); return; }
    if (previewOnly) {
      stopAt.current = null;
      const next = segments.find(part => part.end > video.currentTime + 0.01);
      if (!next && segments.length) video.currentTime = segments[0].start;
      else if (next && video.currentTime < next.start) video.currentTime = next.start;
      if (!segments.length) return;
    } else if (video.currentTime >= duration - 0.01) video.currentTime = 0;
    try { await video.play(); } catch { setError("Impossible de lire la vidéo dans ce navigateur."); }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
      <video ref={videoRef} src={src} preload="metadata" playsInline className="aspect-video w-full object-contain"
        style={{ filter: "brightness(" + (1 + effects.brightness) + ") contrast(" + effects.contrast + ") saturate(" + effects.saturation + ")", opacity: fade }}
        onLoadedMetadata={event => { event.currentTarget.playbackRate = settings.speed; event.currentTarget.volume = volume * effects.volume; }}
        onTimeUpdate={event => {
          const video = event.currentTarget;
          if (stopAt.current !== null && video.currentTime >= stopAt.current) { video.pause(); stopAt.current = null; }
          else if (previewOnly && !video.paused) {
            const next = segments.find(part => part.end > video.currentTime + 0.005);
            if (!next) { video.pause(); }
            else if (video.currentTime < next.start) video.currentTime = next.start;
          }
          onTimeChange(video.currentTime);
        }}
        onSeeked={event => onTimeChange(event.currentTarget.currentTime)}
        onPause={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onEnded={() => setIsPlaying(false)} />
      <div className="space-y-3 p-3 text-white">
        <input aria-label="Position de lecture" type="range" min={0} max={duration} step={0.01} value={currentTime} onChange={event => seek(Number(event.target.value))} className="h-7 w-full accent-indigo-500" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1"><button type="button" title="Reculer de 0,1 seconde" aria-label="Reculer de 0,1 seconde" onClick={() => seek(currentTime - 0.1)} className="flex size-10 items-center justify-center rounded-md hover:bg-white/10"><SkipBack size={17} /></button><button type="button" title={isPlaying ? "Pause" : "Lecture"} aria-label={isPlaying ? "Pause" : "Lecture"} onClick={() => void togglePlay()} className="flex size-11 items-center justify-center rounded-md bg-indigo-600">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" title="Avancer de 0,1 seconde" aria-label="Avancer de 0,1 seconde" onClick={() => seek(currentTime + 0.1)} className="flex size-10 items-center justify-center rounded-md hover:bg-white/10"><SkipForward size={17} /></button><span className="ml-1 font-mono text-xs text-zinc-300">{preciseTime(currentTime)}</span></div>
          <div className="flex items-center gap-2"><Volume2 size={17} /><input aria-label="Volume de lecture" type="range" min={0} max={1} step={0.05} value={volume} onChange={event => setVolume(Number(event.target.value))} className="h-7 w-20 accent-indigo-500" /><button type="button" title="Plein écran" aria-label="Plein écran" onClick={() => { void videoRef.current?.requestFullscreen?.().catch(() => setError("Le plein écran n'est pas disponible.")); }} className="flex size-10 items-center justify-center rounded-md hover:bg-white/10"><Maximize size={17} /></button></div>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={previewOnly} onChange={event => { stopAt.current = null; onPreviewChange(event.target.checked); }} className="size-4 accent-indigo-500" /> Aperçu de l&apos;extrait avec les coupes</label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </div>
    </section>
  );
}
