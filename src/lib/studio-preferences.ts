export interface StudioPreferences { accent: "indigo" | "cyan" | "rose"; density: "comfortable" | "compact"; reducedMotion: boolean; showBanner: boolean; autosave: boolean; photoDuration: number; transition: "none" | "fade" | "wipeleft" | "slideleft" }
export const studioDefaults: StudioPreferences = { accent: "indigo", density: "comfortable", reducedMotion: false, showBanner: true, autosave: true, photoDuration: 5, transition: "fade" };
export const studioKey = "edifycut-studio-preferences";
export function studioSnapshot() { try { return localStorage.getItem(studioKey); } catch { return null; } }
export function parseStudio(raw: string | null): StudioPreferences {
  try {
    const value = JSON.parse(raw || "null");
    if (!value) return studioDefaults;
    return { accent: ["indigo", "cyan", "rose"].includes(value.accent) ? value.accent : "indigo", density: value.density === "compact" ? "compact" : "comfortable", reducedMotion: value.reducedMotion === true, showBanner: value.showBanner !== false, autosave: value.autosave !== false, photoDuration: Number.isFinite(value.photoDuration) ? Math.min(60, Math.max(1, value.photoDuration)) : 5, transition: ["none", "fade", "wipeleft", "slideleft"].includes(value.transition) ? value.transition : "fade" };
  } catch { return studioDefaults; }
}
export function readStudio() { return parseStudio(studioSnapshot()); }
export function subscribeStudio(callback: () => void) { window.addEventListener("storage", callback); window.addEventListener("edifycut-studio", callback); return () => { window.removeEventListener("storage", callback); window.removeEventListener("edifycut-studio", callback); }; }
