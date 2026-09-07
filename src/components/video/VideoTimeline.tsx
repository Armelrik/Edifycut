"use client";

import { EditorSettings, VideoMetadata } from "@/types/video";
import { formatDuration } from "@/lib/video/duration";
import { getEstimatedDuration } from "@/lib/video/video-utils";

export function VideoTimeline({ metadata, settings }: { metadata: VideoMetadata | null; settings: EditorSettings }) {
  const duration = metadata?.duration || 0;
  const startPercent = duration ? Math.min(100, (settings.trimStart / duration) * 100) : 0;
  const endPercent = duration ? Math.min(100, (settings.trimEnd / duration) * 100) : 0;
  const selectedWidth = Math.max(0, 100 - startPercent - endPercent);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <h2 className="font-semibold">Timeline</h2>
        <div className="text-xs leading-5 text-stone-500 sm:text-sm">
          Duree originale : {formatDuration(duration)}
          <span className="hidden sm:inline"> · </span>
          <br className="sm:hidden" />
          Duree estimee : {formatDuration(getEstimatedDuration(metadata, settings))}
        </div>
      </div>
      <div className="relative h-20 overflow-hidden rounded-md bg-stone-900 sm:h-24">
        <div className="absolute inset-0 grid grid-cols-10 opacity-70">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className={`border-r border-white/10 ${index % 2 === 0 ? "bg-amber-200/20" : "bg-stone-100/10"}`}
            />
          ))}
        </div>
        <div className="absolute inset-y-0 bg-black/50" style={{ left: 0, width: `${startPercent}%` }} />
        <div className="absolute inset-y-0 bg-black/50" style={{ right: 0, width: `${endPercent}%` }} />
        <div
          className="absolute inset-y-3 rounded border-2 border-amber-400 bg-amber-300/20"
          style={{ left: `${startPercent}%`, width: `${selectedWidth}%` }}
        />
        <div className="absolute bottom-2 left-2 text-[11px] font-medium text-white/80 sm:left-3 sm:text-xs">
          {formatDuration(settings.trimStart)}
        </div>
        <div className="absolute bottom-2 right-2 text-[11px] font-medium text-white/80 sm:right-3 sm:text-xs">
          -{formatDuration(settings.trimEnd)}
        </div>
      </div>
    </section>
  );
}
