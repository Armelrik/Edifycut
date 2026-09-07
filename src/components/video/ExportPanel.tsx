"use client";

import { Download, MessageCircle } from "lucide-react";
import { EditorSettings, ExportQuality, VideoMetadata } from "@/types/video";
import { formatDuration } from "@/lib/video/duration";
import { estimateExportSize, formatFileSize, getEstimatedDuration } from "@/lib/video/video-utils";
import { Button } from "@/components/ui/button";

export function ExportPanel({
  metadata,
  settings,
  onSettingsChange,
  onExport,
  disabled,
}: {
  metadata: VideoMetadata | null;
  settings: EditorSettings;
  onSettingsChange: (settings: EditorSettings) => void;
  onExport: () => void;
  disabled?: boolean;
}) {
  const qualities: ExportQuality[] = ["original", "1080p", "720p", "480p"];

  return (
    <section className="sticky bottom-3 z-10 space-y-4 rounded-lg border border-stone-200 bg-white p-3 shadow-xl sm:p-4 lg:static lg:shadow-sm">
      <div>
        <h2 className="font-semibold">Exporter votre video</h2>
        <p className="text-sm text-stone-500">MP4 · H.264/AAC · traitement local dans le navigateur.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-stone-500">Video originale</dt>
          <dd className="font-semibold">{formatDuration(metadata?.duration || 0)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Video finale estimee</dt>
          <dd className="font-semibold">{formatDuration(getEstimatedDuration(metadata, settings))}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Vitesse</dt>
          <dd className="font-semibold">{settings.speed}x</dd>
        </div>
        <div>
          <dt className="text-stone-500">Taille estimee</dt>
          <dd className="font-semibold">~{formatFileSize(estimateExportSize(metadata, settings))}</dd>
        </div>
      </dl>
      <label className="space-y-2 text-sm font-medium">
        Qualite
        <select
          value={settings.quality}
          onChange={(event) => onSettingsChange({ ...settings, quality: event.target.value as ExportQuality })}
          className="h-12 w-full rounded-md border border-stone-200 bg-white px-3 text-base sm:h-10 sm:text-sm"
        >
          {qualities.map((quality) => (
            <option key={quality} value={quality}>
              {quality === "original" ? "Original" : quality}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm font-medium">
        <span className="flex items-center gap-2">
          <MessageCircle size={17} className="text-amber-800" />
          Optimiser pour WhatsApp
        </span>
        <input
          type="checkbox"
          checked={settings.optimizeForWhatsApp}
          onChange={(event) => onSettingsChange({ ...settings, optimizeForWhatsApp: event.target.checked })}
          className="size-5 accent-amber-700"
        />
      </label>
      {settings.optimizeForWhatsApp && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Optimise pour un partage mobile
        </p>
      )}
      <Button type="button" disabled={disabled || !metadata} onClick={onExport} className="h-12 w-full">
        <Download size={17} /> Exporter la video
      </Button>
    </section>
  );
}
