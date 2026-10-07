import type { EditorSettings } from "@/types/video";
import type { MediaReference, MontageClip, MontageSettings } from "@/types/montage";
type Base = { id: string; name: string; updatedAt: string; version: 1 };
export type StudioProject = Base & ({ kind: "video"; media: MediaReference; settings: EditorSettings } | { kind: "montage"; clips: MontageClip[]; settings: MontageSettings });
const key = "edifycut-projects-v1";
export function reference(file: File): MediaReference { return { name: file.name, size: file.size, lastModified: file.lastModified }; }
export function matches(file: File, media: MediaReference) { return file.name === media.name && file.size === media.size && file.lastModified === media.lastModified; }
export function projectSnapshot() { try { return localStorage.getItem(key); } catch { return null; } }
function mediaValid(value: MediaReference) { return value && typeof value.name === "string" && value.name.length <= 512 && Number.isFinite(value.size) && value.size >= 0 && Number.isFinite(value.lastModified); }
function validProject(project: StudioProject) {
  if (!project || project.version !== 1 || typeof project.id !== "string" || typeof project.name !== "string" || project.name.length > 100 || !Number.isFinite(Date.parse(project.updatedAt)) || !project.settings) return false;
  if (project.kind === "video") {
    const s = project.settings;
    return mediaValid(project.media) && [s.speed, s.trimStart, s.trimEnd].every(Number.isFinite) && s.speed > 0 && s.speed <= 4 && s.trimStart >= 0 && s.trimEnd >= 0 && ["original", "1080p", "720p", "480p"].includes(s.quality) && typeof s.optimizeForWhatsApp === "boolean" && (!s.effects || Object.values(s.effects).every(value => typeof value === "number" && Number.isFinite(value))) && (!s.cuts || Array.isArray(s.cuts) && s.cuts.length <= 5000 && s.cuts.every(cut => cut && typeof cut.id === "string" && [cut.start, cut.end].every(Number.isFinite) && cut.start >= 0 && cut.end > cut.start && typeof cut.enabled === "boolean" && ["manual", "silence"].includes(cut.source)));
  }
  if (project.kind !== "montage") return false;
  const s = project.settings;
  const audioValid = !s.audioTracks || Array.isArray(s.audioTracks) && s.audioTracks.length <= 4 && s.audioTracks.every(track => track && typeof track.id === "string" && mediaValid(track.media) && [track.sourceDuration, track.start, track.end, track.offset, track.volume, track.fadeIn, track.fadeOut].every(Number.isFinite) && typeof track.muted === "boolean");
  return audioValid && (s.originalVolume === undefined || Number.isFinite(s.originalVolume) && s.originalVolume >= 0 && s.originalVolume <= 1) && ["1080p", "720p", "480p"].includes(s.resolution) && ["landscape", "portrait", "square"].includes(s.aspect) && ["contain", "cover"].includes(s.fit) && typeof s.compress === "boolean" && Array.isArray(project.clips) && project.clips.length <= 12 && project.clips.every(clip => clip && typeof clip.id === "string" && mediaValid(clip.media) && ["video", "photo"].includes(clip.kind) && [clip.sourceDuration, clip.start, clip.end, clip.volume, clip.transitionDuration].every(Number.isFinite) && ["none", "fade", "wipeleft", "slideleft"].includes(clip.transition));
}
export function parseProjects(raw: string | null): StudioProject[] {
  try {
    const data = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(validProject).slice(0, 50);
  } catch { return []; }
}
export function readProject(id: string) { return parseProjects(projectSnapshot()).find(project => project.id === id); }
export function saveProject(project: StudioProject) {
  if (!validProject(project)) throw new Error("Les réglages de ce projet ne sont pas valides.");
  const data = [project, ...parseProjects(projectSnapshot()).filter(item => item.id !== project.id)].slice(0, 50);
  const serialized = JSON.stringify(data);
  if (serialized.length > 2_000_000) throw new Error("La bibliothèque de réglages est pleine.");
  localStorage.setItem(key, serialized); window.dispatchEvent(new Event("edifycut-projects"));
}
export function deleteProject(id: string) {
  localStorage.setItem(key, JSON.stringify(parseProjects(projectSnapshot()).filter(item => item.id !== id)));
  window.dispatchEvent(new Event("edifycut-projects"));
}
export function subscribeProjects(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("edifycut-projects", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("edifycut-projects", callback); }; }
