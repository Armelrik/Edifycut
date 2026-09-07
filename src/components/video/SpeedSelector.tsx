"use client";

import { speedOptions } from "@/lib/video/presets";
import { cn } from "@/lib/utils";

export function SpeedSelector({ value, onChange }: { value: number; onChange: (speed: number) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Vitesse de lecture</h2>
      <div className="grid grid-cols-4 gap-2">
        {speedOptions.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => onChange(speed)}
            className={cn(
              "h-11 rounded-md border text-sm font-semibold transition sm:h-10",
              value === speed
                ? "border-amber-700 bg-amber-700 text-white shadow-sm"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
            )}
          >
            {speed}x
          </button>
        ))}
      </div>
    </section>
  );
}
