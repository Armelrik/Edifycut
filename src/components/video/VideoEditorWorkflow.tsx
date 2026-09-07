"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileVideo, Share2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExportPanel } from "@/components/video/ExportPanel";
import { ExportProgress } from "@/components/video/ExportProgress";
import { PresetSelector } from "@/components/video/PresetSelector";
import { SpeedSelector } from "@/components/video/SpeedSelector";
import { TrimControls } from "@/components/video/TrimControls";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoTimeline } from "@/components/video/VideoTimeline";
import { formatDuration } from "@/lib/video/duration";
import { videoProcessor, ExportProgress as ExportProgressType } from "@/lib/video/video-processor";
import { formatFileSize, getEstimatedDuration, readVideoMetadata } from "@/lib/video/video-utils";
import { cn } from "@/lib/utils";
import { EditorSettings, ExportResult, VideoMetadata, VideoPresetId } from "@/types/video";

const initialSettings: EditorSettings = {
  speed: 1,
  trimStart: 0,
  trimEnd: 0,
  quality: "720p",
  optimizeForWhatsApp: true,
};

const steps = ["Importer", "Modifier", "Exporter"];

export function VideoEditorWorkflow() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [activePreset, setActivePreset] = useState<VideoPresetId | null>("whatsapp");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressType | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [shareFallback, setShareFallback] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (metadata?.objectUrl) URL.revokeObjectURL(metadata.objectUrl);
      if (exportResult?.objectUrl) URL.revokeObjectURL(exportResult.objectUrl);
    };
  }, [metadata?.objectUrl, exportResult?.objectUrl]);

  const estimatedDuration = useMemo(() => getEstimatedDuration(metadata, settings), [metadata, settings]);

  const handleFile = async (nextFile: File | undefined) => {
    if (!nextFile) return;
    setIsLoading(true);
    setError(null);
    setExportResult(null);
    setExportProgress(null);
    setShareFallback(null);

    try {
      if (metadata?.objectUrl) URL.revokeObjectURL(metadata.objectUrl);
      const nextMetadata = await readVideoMetadata(nextFile);
      setFile(nextFile);
      setMetadata(nextMetadata);
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue pendant l'import.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void handleFile(event.dataTransfer.files[0]);
  };

  const resetVideo = () => {
    if (metadata?.objectUrl) URL.revokeObjectURL(metadata.objectUrl);
    if (exportResult?.objectUrl) URL.revokeObjectURL(exportResult.objectUrl);
    setFile(null);
    setMetadata(null);
    setExportResult(null);
    setExportProgress(null);
    setShareFallback(null);
    setStep(0);
  };

  const handleExport = async () => {
    if (!file || !metadata) return;
    setError(null);
    setExportResult(null);
    setShareFallback(null);
    setStep(2);

    try {
      const result = await videoProcessor.exportVideo(file, metadata, settings, setExportProgress);
      setExportProgress({ stage: "finalizing", progress: 100, message: "Votre video est prete." });
      setExportResult(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "L'export a echoue. Essayez une qualite plus basse ou liberez de la memoire.",
      );
    }
  };

  const downloadExport = () => {
    if (!exportResult) return;
    const link = document.createElement("a");
    link.href = exportResult.objectUrl;
    link.download = exportResult.fileName;
    link.click();
  };

  const shareExport = async () => {
    if (!exportResult) return;
    const exportedFile = new File([exportResult.blob], exportResult.fileName, { type: "video/mp4" });
    setShareFallback(null);

    if (navigator.share) {
      try {
        if (!navigator.canShare || navigator.canShare({ files: [exportedFile] })) {
          await navigator.share({
            title: "Video EdifyCut",
            text: "Video preparee avec EdifyCut.",
            files: [exportedFile],
          });
          return;
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setShareFallback("Le partage direct n'a pas abouti. Vous pouvez telecharger la video puis la partager.");
        return;
      }
    }

    setShareFallback("Le partage direct n'est pas disponible dans ce navigateur. Telechargez la video puis partagez-la.");
  };

  const chooseFile = () => {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-28 sm:space-y-6 sm:pb-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Nouveau projet</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Importer, modifier, exporter.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
            Le fichier reste temporairement dans votre navigateur. Aucun upload automatique n&apos;est effectue.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-lg border border-stone-200 bg-white p-1 sm:w-auto sm:gap-2">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={index > step && !metadata}
              onClick={() => setStep(index)}
              className={cn(
                "rounded-md px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm",
                step === index ? "bg-stone-950 text-white" : "text-stone-500 hover:bg-stone-100",
              )}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {step === 0 && (
        <Card
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={chooseFile}
          className="flex min-h-[420px] cursor-pointer flex-col items-center justify-center border-dashed bg-white/80 p-5 text-center active:bg-amber-50 sm:min-h-[460px] sm:p-6"
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-800 sm:size-20">
            <Upload size={30} />
          </div>
          <h2 className="mt-6 text-xl font-bold sm:text-2xl">Deposez votre video ici</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-stone-500 sm:max-w-none sm:text-base">
            MP4, MOV, WebM - jusqu&apos;a 2 Go. Sur mobile, choisissez une video depuis vos fichiers.
          </p>
          <Button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              chooseFile();
            }}
            disabled={isLoading}
            className="mt-6 h-12 w-full max-w-xs sm:w-auto"
          >
            <FileVideo size={18} />
            {isLoading ? "Lecture du fichier..." : "Choisir une video"}
          </Button>
        </Card>
      )}

      {step > 0 && metadata && (
        <div className="space-y-6">
          <Card className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800">
                <FileVideo size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold sm:text-base">{metadata.name}</h2>
                <p className="text-xs leading-5 text-stone-500 sm:text-sm">
                  {formatFileSize(metadata.size)} · {formatDuration(metadata.duration)} · {metadata.width}x
                  {metadata.height}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={resetVideo} className="text-red-700">
              <Trash2 size={16} /> Supprimer
            </Button>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="space-y-5 sm:space-y-6">
              <VideoPlayer src={metadata.objectUrl} speed={settings.speed} />
              <VideoTimeline metadata={metadata} settings={settings} />
              {exportResult && (
                <Card className="space-y-4 border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 size={21} />
                    <h2 className="font-bold">Votre video est prete.</h2>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-4">
                    <span>Duree : {formatDuration(exportResult.duration)}</span>
                    <span>Taille : ~{formatFileSize(exportResult.size)}</span>
                    <span>Resolution : {exportResult.resolution}</span>
                    <span>Vitesse : {exportResult.speed}x</span>
                  </div>
                  {shareFallback && (
                    <p className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
                      {shareFallback}
                    </p>
                  )}
                  <div className="grid gap-2 sm:flex sm:flex-row">
                    <Button type="button" variant="secondary" onClick={() => window.open(exportResult.objectUrl, "_blank")}>
                      Lire la video
                    </Button>
                    <Button type="button" onClick={downloadExport}>
                      Telecharger
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void shareExport()}>
                      <Share2 size={16} /> Partager
                    </Button>
                    {shareFallback && (
                      <Button type="button" variant="secondary" onClick={downloadExport}>
                        Telecharger la video
                      </Button>
                    )}
                    <Button type="button" variant="ghost" onClick={resetVideo}>
                      Creer un nouvel extrait
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            <aside className="space-y-5">
              <Card className="space-y-5 p-4">
                <SpeedSelector
                  value={settings.speed}
                  onChange={(speed) => {
                    setActivePreset(null);
                    setSettings({ ...settings, speed });
                  }}
                />
                <TrimControls
                  label="Couper au debut"
                  kind="start"
                  value={settings.trimStart}
                  onChange={(trimStart) => setSettings({ ...settings, trimStart })}
                />
                <TrimControls
                  label="Couper a la fin"
                  kind="end"
                  value={settings.trimEnd}
                  onChange={(trimEnd) => setSettings({ ...settings, trimEnd })}
                />
                <PresetSelector
                  activePreset={activePreset}
                  onApply={(presetSettings, presetId) => {
                    setActivePreset(presetId);
                    setSettings({ ...settings, ...presetSettings });
                  }}
                />
              </Card>
              <ExportPanel
                metadata={metadata}
                settings={settings}
                disabled={!estimatedDuration || Boolean(exportProgress && !exportResult)}
                onSettingsChange={(nextSettings) => {
                  setActivePreset(null);
                  setSettings(nextSettings);
                }}
                onExport={() => void handleExport()}
              />
              <ExportProgress progress={exportProgress} />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
