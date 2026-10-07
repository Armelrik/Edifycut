import type { EditorSettings } from "@/types/video";

export const preferencesKey = "edifycut-export-preferences";
export const defaultPreferences: EditorSettings = { speed: 1, trimStart: 0, trimEnd: 0, quality: "720p", optimizeForWhatsApp: true };

export function parsePreferences(raw: string | null): EditorSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value) return defaultPreferences;
    return {
      ...defaultPreferences,
      speed: [1, 1.25, 1.5, 2].includes(value.speed) ? value.speed : 1,
      quality: ["original", "1080p", "720p", "480p"].includes(value.quality) ? value.quality : "720p",
      optimizeForWhatsApp: typeof value.optimizeForWhatsApp === "boolean" ? value.optimizeForWhatsApp : true,
    };
  } catch { return defaultPreferences; }
}

export function getPreferencesSnapshot() {
  try { return localStorage.getItem(preferencesKey); }
  catch { return null; }
}
export function readPreferences() { return parsePreferences(getPreferencesSnapshot()); }
export function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("edifycut-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("edifycut-preferences", callback);
  };
}
