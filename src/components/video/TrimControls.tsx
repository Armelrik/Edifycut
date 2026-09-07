"use client";

import { hmsToSeconds, splitSeconds, formatShortDuration } from "@/lib/video/duration";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TrimControlsProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  kind: "start" | "end";
};

export function TrimControls({ label, value, onChange, kind }: TrimControlsProps) {
  const parts = splitSeconds(value);

  const setPart = (part: "hours" | "minutes" | "seconds", nextValue: number) => {
    const next = { ...parts, [part]: Math.max(0, nextValue || 0) };
    onChange(hmsToSeconds(next.hours, next.minutes, next.seconds));
  };

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{label}</h2>
      <div className="grid grid-cols-3 gap-2">
        {(["hours", "minutes", "seconds"] as const).map((part) => (
          <label key={part} className="space-y-1 text-xs font-medium text-stone-500">
            {part === "hours" ? "Heures" : part === "minutes" ? "Minutes" : "Secondes"}
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={parts[part]}
              className="h-12 text-base sm:h-10 sm:text-sm"
              onChange={(event) => setPart(part, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <p className="text-sm text-stone-500">
        {kind === "start" ? "Les" : "Les"} {formatShortDuration(value)}{" "}
        {kind === "start" ? "premieres secondes seront supprimees." : "dernieres secondes seront supprimees."}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[60, 300, 600, 900].map((seconds) => (
          <Button
            key={seconds}
            type="button"
            variant="secondary"
            className="h-10 px-2 text-xs sm:h-9 sm:text-sm"
            onClick={() => onChange(seconds)}
          >
            {seconds / 60} min
          </Button>
        ))}
      </div>
    </section>
  );
}
