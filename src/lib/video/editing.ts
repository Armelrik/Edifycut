import type { EditorSettings, VideoCut, VideoEffects } from "@/types/video";

export const neutralEffects: VideoEffects = { brightness: 0, contrast: 1, saturation: 1, volume: 1, fadeIn: 0, fadeOut: 0 };
export const visualPresets = [
  { id: "natural", name: "Naturel", effects: { ...neutralEffects } },
  { id: "clear", name: "Clair", effects: { ...neutralEffects, brightness: 0.03, contrast: 1.06, saturation: 1.04 } },
  { id: "vivid", name: "Vif", effects: { ...neutralEffects, contrast: 1.12, saturation: 1.2 } },
  { id: "mono", name: "Noir et blanc", effects: { ...neutralEffects, saturation: 0, contrast: 1.08 } },
];

export function mergedCuts(cuts: VideoCut[], start: number, end: number) {
  const sorted = cuts.filter(c => c.enabled && Number.isFinite(c.start) && Number.isFinite(c.end))
    .map(c => ({ start: Math.max(start, c.start), end: Math.min(end, c.end) }))
    .filter(c => c.end > c.start).sort((a, b) => a.start - b.start);
  const result: { start: number; end: number }[] = [];
  for (const cut of sorted) {
    const last = result[result.length - 1];
    if (last && cut.start <= last.end + 0.001) last.end = Math.max(last.end, cut.end);
    else result.push({ ...cut });
  }
  return result;
}

export function retainedSegments(duration: number, settings: EditorSettings) {
  const start = Math.max(0, Math.min(duration, settings.trimStart));
  const end = Math.max(start, Math.min(duration, duration - settings.trimEnd));
  const segments: { start: number; end: number }[] = [];
  let cursor = start;
  for (const cut of mergedCuts(settings.cuts ?? [], start, end)) {
    if (cut.start > cursor + 0.001) segments.push({ start: cursor, end: cut.start });
    cursor = cut.end;
  }
  if (end > cursor + 0.001) segments.push({ start: cursor, end });
  return segments;
}

export function preciseTime(seconds: number) {
  const safe = Math.round(Math.max(0, seconds) * 100) / 100;
  const h = Math.floor(safe / 3600);
  const m = Math.floor(safe / 60) % 60;
  const s = (safe % 60).toFixed(2).padStart(5, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
}

export function parseTime(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (/^\d+(?:\.\d{1,3})?$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (/^\d{1,5}:\d{1,2}(?:\.\d{1,3})?$/.test(normalized)) {
    const [minutes, seconds] = normalized.split(":").map(Number);
    return seconds < 60 ? minutes * 60 + seconds : null;
  }
  if (!/^\d{1,3}:\d{1,2}:\d{1,2}(?:\.\d{1,3})?$/.test(normalized)) return null;
  const [hours, minutes, seconds] = normalized.split(":").map(Number);
  if (minutes >= 60 || seconds >= 60) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
