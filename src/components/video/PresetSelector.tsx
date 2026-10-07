"use client";

import { presets } from "@/lib/video/presets";
import { cn } from "@/lib/utils";
import { EditorSettings, VideoPresetId } from "@/types/video";

export function PresetSelector({
  activePreset,
  onApply,
}: {
  activePreset: VideoPresetId | null;
  onApply: (settings: Pick<EditorSettings, "quality" | "optimizeForWhatsApp">, id: VideoPresetId) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Presets d&apos;export</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.settings, preset.id)}
            className={cn(
              "rounded-md border p-3 text-left transition",
              activePreset === preset.id ? "border-indigo-700 bg-indigo-50" : "border-zinc-200 bg-white hover:bg-zinc-100",
            )}
          >
            <span className="block text-sm font-semibold">{preset.name}</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">{preset.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
