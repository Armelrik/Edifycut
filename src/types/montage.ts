export type Transition = "none" | "fade" | "wipeleft" | "slideleft";
export interface MediaReference { name: string; size: number; lastModified: number }
export interface MontageClip {
  id: string;
  media: MediaReference;
  kind: "video" | "photo";
  sourceDuration: number;
  start: number;
  end: number;
  volume: number;
  transition: Transition;
  transitionDuration: number;
}
export interface MontageAudioClip {
  id: string;
  media: MediaReference;
  sourceDuration: number;
  start: number;
  end: number;
  offset: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
}
export interface MontageResource { file: File; url: string; thumbnail?: string; waveform?: number[] }
export interface MontageSettings { resolution: "1080p" | "720p" | "480p"; aspect: "landscape" | "portrait" | "square"; fit: "contain" | "cover"; compress: boolean; audioTracks?: MontageAudioClip[]; originalVolume?: number }
export const defaultMontage: MontageSettings = { resolution: "720p", aspect: "landscape", fit: "contain", compress: false };
export function clipDuration(clip: MontageClip) { return Number.isFinite(clip.end - clip.start) ? Math.max(0, Math.round((clip.end - clip.start) * 30) / 30) : 0; }
export function overlap(left: MontageClip, right: MontageClip) { return left.transition === "none" ? 0 : Math.floor(Math.min(left.transitionDuration, clipDuration(left) / 2, clipDuration(right) / 2) * 30) / 30; }
export function montageTimeline(clips: MontageClip[]) {
  let time = 0;
  return clips.map((clip, index) => { const start = time; const duration = clipDuration(clip); time += duration - (index < clips.length - 1 ? overlap(clip, clips[index + 1]) : 0); return { clip, start, end: start + duration }; });
}
export function audioDuration(clip: MontageAudioClip) { return Math.max(0, clip.end - clip.start); }
export function audioGain(clip: MontageAudioClip, time: number, montageDuration: number) {
  const duration = Math.min(audioDuration(clip), montageDuration - clip.offset), local = time - clip.offset;
  if (clip.muted || local < 0 || local >= duration || duration <= 0) return 0;
  const fadeIn = Math.min(clip.fadeIn, duration / 2), fadeOut = Math.min(clip.fadeOut, duration / 2);
  return clip.volume * (fadeIn > 0 ? Math.min(1, local / fadeIn) : 1) * (fadeOut > 0 ? Math.min(1, (duration - local) / fadeOut) : 1);
}
