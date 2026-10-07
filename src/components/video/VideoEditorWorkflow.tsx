"use client";

import { DragEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, FileVideo, Share2, Trash2, Upload, Scissors, WandSparkles, Undo2, RotateCcw, X, Flag, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExportPanel } from "@/components/video/ExportPanel";
import { ExportProgress } from "@/components/video/ExportProgress";
import { PresetSelector } from "@/components/video/PresetSelector";
import { SpeedSelector } from "@/components/video/SpeedSelector";
import { TrimControls } from "@/components/video/TrimControls";
import { VideoPlayer, type SeekRequest } from "@/components/video/VideoPlayer";
import { EffectsPanel } from "@/components/video/EffectsPanel";
import { SilencePanel } from "@/components/video/SilencePanel";
import { VideoTimeline } from "@/components/video/VideoTimeline";
import { YouTubeImport } from "@/components/video/YouTubeImport";
import { formatDuration } from "@/lib/video/duration";
import { videoProcessor, NoAudioTrackError, ExportProgress as ExportProgressType } from "@/lib/video/video-processor";
import { formatFileSize, getEstimatedDuration, readVideoMetadata } from "@/lib/video/video-utils";
import { cn } from "@/lib/utils";
import { readPreferences } from "@/lib/video/preferences";
import { neutralEffects, preciseTime, retainedSegments } from "@/lib/video/editing";
import { EditorSettings, ExportResult, VideoMetadata, VideoPresetId, SilenceOptions } from "@/types/video";
import { saveProject, readProject, reference, matches, projectSnapshot, parseProjects, subscribeProjects } from "@/lib/projects";
import { readStudio } from "@/lib/studio-preferences";

const initialSettings: EditorSettings = {
  speed: 1,
  trimStart: 0,
  trimEnd: 0,
  quality: "720p",
  optimizeForWhatsApp: true,
};

const steps = ["Importer", "Modifier", "Exporter"];

export function VideoEditorWorkflow({ projectId }: { projectId?: string }) {
  const savedId = useRef(projectId || "");
  const savedName = useRef("");
  const projectsRaw = useSyncExternalStore(subscribeProjects, projectSnapshot, () => null);
  const resumed = parseProjects(projectsRaw).find(project => project.id === projectId && project.kind === "video");
  const [restorationComplete, setRestorationComplete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const alive = useRef(true);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [settings, setSettings] = useState<EditorSettings>(initialSettings);
  const [activePreset, setActivePreset] = useState<VideoPresetId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgressType | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [previewOnly, setPreviewOnly] = useState(true);
  const [cutMarker, setCutMarker] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [silenceOptions, setSilenceOptions] = useState<SilenceOptions>({ threshold: -40, minDuration: 1, padding: 0.2 });
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<EditorSettings[]>([]);
  const cancelled = useRef(false);
  const busy = isExporting || isAnalyzing;
  useEffect(() => {
    if (!file || !metadata || !readStudio().autosave) return;
    const timer = setTimeout(() => {
      try { if (!savedId.current) savedId.current = crypto.randomUUID(); saveProject({ version: 1, id: savedId.current, name: savedName.current || file.name.replace(/\.[^.]+$/, "").slice(0, 100), updatedAt: new Date().toISOString(), kind: "video", media: reference(file), settings }); }
      catch { setEditMessage("Sauvegarde des réglages indisponible sur cet appareil."); }
    }, 700);
    return () => clearTimeout(timer);
  }, [file, metadata, settings]);
  const getCurrentTime = () => playerRef.current?.currentTime ?? currentTime;

  const changeSettings = (patch: Partial<EditorSettings>) => {
    if (busy) return;
    setHistory(previous => [...previous.slice(-29), settings]);
    setSettings({ ...settings, ...patch });
    setExportResult(null); setExportProgress(null); setShareFallback(null); setActivePreset(null);
  };
  const seekTo = (time: number, play = false, stopAt?: number) => {
    if (metadata) setCurrentTime(Math.max(0, Math.min(metadata.duration, time)));
    setSeekRequest({ id: Date.now() + Math.random(), time, play, stopAt });
  };
  const changeBounds = (start: number, end: number) => {
    if (!metadata) return;
    changeSettings({ trimStart: Math.max(0, start), trimEnd: Math.max(0, metadata.duration - end) });
  };
  const cutHere = () => {
    const time = getCurrentTime();
    if (cutMarker === null) { setCutMarker(time); return; }
    const start = Math.min(cutMarker, time);
    const end = Math.max(cutMarker, time);
    if (end - start < 0.05) { setEditMessage("Placez la lecture à la fin du passage à retirer."); return; }
    changeSettings({ cuts: [...(settings.cuts ?? []), { id: crypto.randomUUID(), start, end, enabled: true, source: "manual" }] });
    setCutMarker(null); setEditMessage(`Coupe ajoutée : ${preciseTime(start)} → ${preciseTime(end)}.`);
  };

  const analyzeSilences = async (automatic = false) => {
    if (!file || !metadata || busy) return;
    cancelled.current = false;
    setIsAnalyzing(true); setError(null); setAnalysisProgress(null); setEditMessage(null);
    const options = automatic ? { threshold: -40, minDuration: 1.5, padding: 0.25 } : silenceOptions;
    try {
      let noAudio = false;
      const found = await videoProcessor.detectSilences(file, metadata, { ...options, start: settings.trimStart, end: metadata.duration - settings.trimEnd }, progress => setAnalysisProgress(progress.progress)).catch(error => {
        if (automatic && error instanceof NoAudioTrackError) { noAudio = true; return []; }
        throw error;
      });
      if (cancelled.current || !alive.current) return;
      let next: EditorSettings = { ...settings, cuts: [...(settings.cuts ?? []).filter(c => c.source === "manual"), ...found] };
      if (!retainedSegments(metadata.duration, next).length) next = { ...next, cuts: next.cuts?.map(c => c.source === "silence" ? { ...c, enabled: false } : c) };
      if (automatic) {
        next = { ...next, quality: metadata.height >= 720 ? "720p" : "original", optimizeForWhatsApp: true, effects: { ...neutralEffects, ...settings.effects, fadeIn: settings.effects?.fadeIn || 0.2, fadeOut: settings.effects?.fadeOut || 0.2 } };
        setSilenceOptions(options);
        setPreviewOnly(true);
      }
      setHistory(previous => [...previous.slice(-29), settings]);
      setSettings(next); setExportResult(null); setExportProgress(null); setActivePreset(null);
      const saved = Math.max(0, getEstimatedDuration(metadata, settings) - getEstimatedDuration(metadata, next));
      setEditMessage(`${automatic ? "Optimisations appliquées. " : ""}${noAudio ? "Aucune piste audio : optimisations vidéo uniquement." : `${found.length} silence(s) détecté(s), ${saved.toFixed(1)} s retirées. Les coupes restent modifiables.`}`);
    } catch (caught) {
      console.error("[VideoProcessor] analysis failed", caught);
      if (!cancelled.current) setError(caught instanceof Error && caught.message ? caught.message : "L'analyse audio a échoué.");
    } finally { setIsAnalyzing(false); videoProcessor.terminate(); }
  };

  useEffect(() => {
    return () => {
      if (metadata?.objectUrl) URL.revokeObjectURL(metadata.objectUrl);
    };
  }, [metadata?.objectUrl]);

  useEffect(() => {
    return () => {
      if (exportResult?.objectUrl) URL.revokeObjectURL(exportResult.objectUrl);
    };
  }, [exportResult?.objectUrl]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; videoProcessor.terminate(); };
  }, []);

  const estimatedDuration = useMemo(() => getEstimatedDuration(metadata, settings), [metadata, settings]);
  const trimExceedsDuration = Boolean(metadata && settings.trimStart + settings.trimEnd >= metadata.duration);

  const handleFile = async (nextFile: File | undefined) => {
    if (!nextFile || busy) return;
    setIsLoading(true);
    setError(null);
    setExportResult(null);
    setExportProgress(null);
    setShareFallback(null);

    try {
      const saved = projectId && !restorationComplete ? readProject(projectId) : undefined;
      if (saved?.kind === "video" && !matches(nextFile, saved.media)) throw new Error(`Resélectionnez le fichier original ${saved.media.name} pour restaurer ce projet.`);
      const nextMetadata = await readVideoMetadata(nextFile);
      if (!alive.current) { URL.revokeObjectURL(nextMetadata.objectUrl); return; }
      setFile(nextFile);
      setMetadata(nextMetadata);
      setCurrentTime(0); setSeekRequest(null); setCutMarker(null); setPreviewOnly(true); setEditMessage(null); setHistory([]);
      const preferences = readPreferences();
      savedId.current = saved?.kind === "video" ? saved.id : crypto.randomUUID();
      savedName.current = saved?.name || nextFile.name.replace(/\.[^.]+$/, "").slice(0, 100);
      setRestorationComplete(true);
      setSettings(saved?.kind === "video" ? saved.settings : preferences);
      setActivePreset(preferences.optimizeForWhatsApp && preferences.quality === "720p" ? "whatsapp" : null);
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
    if (busy) return;
    if (metadata?.objectUrl) URL.revokeObjectURL(metadata.objectUrl);
    if (exportResult?.objectUrl) URL.revokeObjectURL(exportResult.objectUrl);
    setFile(null);
    savedId.current = "";
    setRestorationComplete(true);
    setMetadata(null);
    setExportResult(null);
    setExportProgress(null);
    setShareFallback(null);
    setCurrentTime(0); setCutMarker(null); setSeekRequest(null); setEditMessage(null); setHistory([]);
    videoProcessor.terminate();
    setStep(0);
  };

  const handleExport = async () => {
    if (!file || !metadata || busy || estimatedDuration <= 0) return;
    cancelled.current = false;
    setError(null);
    setExportResult(null);
    setShareFallback(null);
    setIsExporting(true);
    setStep(2);

    try {
      const result = await videoProcessor.exportVideo(file, metadata, settings, setExportProgress);
      if (cancelled.current || !alive.current) { URL.revokeObjectURL(result.objectUrl); return; }
      setExportProgress({ stage: "finalizing", progress: 100, message: "Votre video est prete." });
      setExportResult(result);
    } catch (caught) {
      if (!cancelled.current) setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "L'export a echoue. Essayez une qualite plus basse ou liberez de la memoire.",
      );
    } finally {
      setIsExporting(false);
      videoProcessor.terminate();
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
          <p className="eyebrow">Nouveau projet</p>
          <h1 className="mt-2 text-2xl font-bold tracking-normal sm:text-3xl">Importer, modifier, exporter.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
            Le fichier reste temporairement dans votre navigateur. Aucun upload automatique n&apos;est effectue.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-white p-1 sm:w-auto sm:gap-2">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={busy || (index > step && !metadata)}
              onClick={() => { setStep(index); if (index === 2) requestAnimationFrame(() => document.getElementById("export-options")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}
              className={cn(
                "rounded-md px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm",
                step === index ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100",
              )}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}
      {resumed?.kind === "video" && !metadata && !restorationComplete && <p className="text-sm text-indigo-700">Reprise de {resumed.name} · resélectionnez {resumed.media.name}.</p>}
      {file && metadata && <Button variant="secondary" disabled={busy} onClick={() => { try { if (!savedId.current) savedId.current = crypto.randomUUID(); saveProject({ version: 1, id: savedId.current, name: savedName.current || file.name.replace(/\.[^.]+$/, "").slice(0, 100), updatedAt: new Date().toISOString(), kind: "video", media: reference(file), settings }); setEditMessage("Réglages du projet enregistrés dans Mes vidéos."); } catch { setError("Impossible d'enregistrer ce projet."); } }}><Save size={17} />Enregistrer le projet</Button>}

      {trimExceedsDuration && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">
          La coupe debut + fin depasse la duree de la video. Reduisez une des deux valeurs avant l&apos;export.
        </div>
      )}
      {busy && <Button type="button" variant="secondary" onClick={() => { cancelled.current = true; videoProcessor.terminate(); setEditMessage("Traitement annulé."); }}><X size={16} /> Annuler le traitement</Button>}

      {step === 0 && (
        <div className="space-y-5">
        <Card
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onClick={chooseFile}
          className="flex min-h-[420px] cursor-pointer flex-col items-center justify-center border-dashed bg-white/80 p-5 text-center active:bg-indigo-50 sm:min-h-[460px] sm:p-6"
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div className="flex size-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-800 sm:size-20">
            <Upload size={30} />
          </div>
          <h2 className="mt-6 text-xl font-bold sm:text-2xl">Deposez votre video ici</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-500 sm:max-w-none sm:text-base">
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
        <YouTubeImport onImport={handleFile} disabled={isLoading} />
        </div>
      )}

      {step > 0 && metadata && (
        <div className="space-y-6">
          <Card className="flex flex-col gap-4 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-800">
                <FileVideo size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold sm:text-base">{metadata.name}</h2>
                <p className="text-xs leading-5 text-zinc-500 sm:text-sm">
                  {formatFileSize(metadata.size)} · {formatDuration(metadata.duration)} · {metadata.width}x
                  {metadata.height}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={resetVideo} disabled={busy} className="text-red-700">
              <Trash2 size={16} /> Supprimer
            </Button>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="space-y-5 sm:space-y-6">
              <VideoPlayer key={metadata.objectUrl} elementRef={playerRef} src={metadata.objectUrl} duration={metadata.duration} settings={settings} currentTime={currentTime} onTimeChange={setCurrentTime} previewOnly={previewOnly} onPreviewChange={setPreviewOnly} seekRequest={seekRequest} />
              <fieldset disabled={busy} className="flex min-w-0 flex-wrap gap-2 disabled:opacity-60">
                <Button type="button" variant="secondary" onClick={() => changeBounds(Math.min(getCurrentTime(), metadata.duration - settings.trimEnd - 0.05), metadata.duration - settings.trimEnd)}><Flag size={16} /> Couper avant ici</Button>
                <Button type="button" variant="secondary" onClick={() => changeBounds(settings.trimStart, Math.max(settings.trimStart + 0.05, getCurrentTime()))}><Flag size={16} /> Couper après ici</Button>
                <Button type="button" onClick={cutHere}><Scissors size={16} />{cutMarker === null ? "Couper ici" : "Terminer la coupe ici"}</Button>
                {cutMarker !== null && <button type="button" aria-label="Annuler le repère de coupe" title="Annuler le repère de coupe" onClick={() => setCutMarker(null)} className="flex size-11 items-center justify-center rounded-md border border-zinc-200"><X size={16} /></button>}
                <Button type="button" variant="ghost" disabled={!history.length} onClick={() => { const previous = history[history.length - 1]; if (previous) { setHistory(history.slice(0, -1)); setSettings(previous); setExportResult(null); setExportProgress(null); setCutMarker(null); setActivePreset(null); setEditMessage("Dernière modification annulée."); } }}><Undo2 size={16} /> Annuler</Button>
              </fieldset>
              {cutMarker !== null && <p className="text-sm text-red-700">Début de coupe : {preciseTime(cutMarker)}</p>}
              <fieldset disabled={busy} className="min-w-0"><VideoTimeline metadata={metadata} settings={settings} currentTime={currentTime} onSeek={seekTo} onBoundsChange={changeBounds} cutMarker={cutMarker} /></fieldset>
              <SilencePanel options={silenceOptions} onOptions={next => { setSilenceOptions(next); changeSettings({ cuts: (settings.cuts ?? []).filter(c => c.source === "manual") }); setEditMessage("Réglages modifiés. Relancez la détection des silences."); }} cuts={settings.cuts ?? []} onCuts={cuts => changeSettings({ cuts })} onDetect={() => void analyzeSilences()} onListen={(start, end) => { setPreviewOnly(false); seekTo(Math.max(0, start - 0.3), true, Math.min(metadata.duration, end + 0.3)); }} message={editMessage} busy={busy} progress={analysisProgress} />
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
                    <p className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-900">
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
              <Button type="button" onClick={() => void analyzeSilences(true)} disabled={busy || trimExceedsDuration} className="h-auto min-h-12 w-full whitespace-normal py-3"><WandSparkles size={18} className="shrink-0" /> Appliquer les optimisations auto</Button>
              <fieldset disabled={busy} className="min-w-0"><Card className="space-y-5 p-4">
                <SpeedSelector
                  value={settings.speed}
                  onChange={(speed) => {
                    changeSettings({ speed });
                  }}
                />
                <TrimControls
                  label="Commencer à"
                  kind="start"
                  value={settings.trimStart}
                  min={0} max={metadata.duration - settings.trimEnd - 0.05} currentTime={currentTime}
                  getCurrentTime={getCurrentTime}
                  onChange={(trimStart) => {
                    changeSettings({ trimStart });
                  }}
                />
                <TrimControls
                  label="Terminer à"
                  kind="end"
                  value={metadata.duration - settings.trimEnd}
                  min={settings.trimStart + 0.05} max={metadata.duration} currentTime={currentTime}
                  getCurrentTime={getCurrentTime}
                  onChange={(end) => {
                    changeSettings({ trimEnd: metadata.duration - end });
                  }}
                />
                <EffectsPanel effects={{ ...neutralEffects, ...settings.effects }} onChange={effects => changeSettings({ effects })} />
                <PresetSelector
                  activePreset={activePreset}
                  onApply={(presetSettings, presetId) => {
                    changeSettings(presetSettings);
                    setActivePreset(presetId);
                  }}
                />
                <Button type="button" variant="ghost" onClick={() => { changeSettings({ trimStart: 0, trimEnd: 0, speed: 1, cuts: [], effects: { ...neutralEffects } }); setCutMarker(null); setEditMessage("Coupes, vitesse et effets réinitialisés."); }}><RotateCcw size={16} /> Réinitialiser le montage</Button>
              </Card></fieldset>
              <ExportPanel
                metadata={metadata}
                settings={settings}
                disabled={!estimatedDuration || trimExceedsDuration || busy || cutMarker !== null}
                onSettingsChange={(nextSettings) => {
                  changeSettings(nextSettings);
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
