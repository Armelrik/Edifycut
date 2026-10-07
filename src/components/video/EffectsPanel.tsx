"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { neutralEffects, visualPresets } from "@/lib/video/editing";
import type { VideoEffects } from "@/types/video";

export function EffectsPanel({ effects, onChange }: { effects: VideoEffects; onChange: (effects: VideoEffects) => void }) {
  const sliders: { key: keyof VideoEffects; label: string; min: number; max: number; step: number; unit?: string }[] = [
    { key: "brightness", label: "Luminosité", min: -0.25, max: 0.25, step: 0.01 },
    { key: "contrast", label: "Contraste", min: 0.5, max: 1.5, step: 0.01 },
    { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.01 },
    { key: "volume", label: "Volume", min: 0, max: 1, step: 0.01 },
    { key: "fadeIn", label: "Fondu d'entrée", min: 0, max: 3, step: 0.1, unit: "s" },
    { key: "fadeOut", label: "Fondu de sortie", min: 0, max: 3, step: 0.1, unit: "s" },
  ];
  return <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal size={17} /> Effets</h2><button type="button" aria-label="Réinitialiser les effets" title="Réinitialiser les effets" onClick={() => onChange({ ...neutralEffects })} className="flex size-10 items-center justify-center rounded-md hover:bg-zinc-100"><RotateCcw size={17} /></button></div>
    <label className="field-label">Style visuel<select aria-label="Style visuel" className="h-11 rounded-md border border-zinc-200 bg-white px-3" value={visualPresets.find(preset => preset.effects.brightness === effects.brightness && preset.effects.contrast === effects.contrast && preset.effects.saturation === effects.saturation)?.id ?? "custom"} onChange={event => { const preset = visualPresets.find(item => item.id === event.target.value); if (preset) onChange({ ...effects, brightness: preset.effects.brightness, contrast: preset.effects.contrast, saturation: preset.effects.saturation }); }}><option value="custom" disabled>Personnalisé</option>{visualPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
    {sliders.map(slider => <label key={slider.key} className="block space-y-2 text-sm"><span className="flex justify-between gap-2"><span>{slider.label}</span><span className="font-mono text-xs text-zinc-500">{slider.unit ? effects[slider.key].toFixed(1) + " s" : Math.round(effects[slider.key] * 100) + " %"}</span></span><input aria-label={slider.label} type="range" min={slider.min} max={slider.max} step={slider.step} value={effects[slider.key]} onChange={event => onChange({ ...effects, [slider.key]: Number(event.target.value) })} className="h-6 w-full accent-indigo-600" /></label>)}
  </section>;
}
