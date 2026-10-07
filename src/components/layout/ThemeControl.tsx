"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { parseStudio, studioKey, studioSnapshot, subscribeStudio } from "@/lib/studio-preferences";
function subscribeSystem(callback: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function ThemeControl() {
  const [temporary, setTemporary] = useState<boolean | null>(null);
  const preferences = parseStudio(useSyncExternalStore(subscribeStudio, studioSnapshot, () => null));
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia("(prefers-color-scheme: dark)").matches, () => false);
  const dark = temporary ?? (preferences.theme === "dark" || preferences.theme === "system" && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  return <button type="button" title={dark ? "Passer au thème clair" : "Passer au thème sombre"} aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"} className="flex size-10 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600" onClick={() => {
    try { localStorage.setItem(studioKey, JSON.stringify({ ...preferences, theme: dark ? "light" : "dark" })); setTemporary(null); window.dispatchEvent(new Event("edifycut-studio")); } catch { setTemporary(!dark); }
  }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
