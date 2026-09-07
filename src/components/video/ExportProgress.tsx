"use client";

import { ExportProgress as ExportProgressType } from "@/lib/video/video-processor";

export function ExportProgress({ progress }: { progress: ExportProgressType | null }) {
  if (!progress) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-4 text-sm font-semibold text-amber-950">
        <span>{progress.message}</span>
        <span>{progress.progress}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-amber-700 transition-all" style={{ width: `${progress.progress}%` }} />
      </div>
    </div>
  );
}
