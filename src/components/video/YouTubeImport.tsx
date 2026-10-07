"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Search, X, Video, Scissors, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeYouTubeUrl } from "@/lib/video/youtube-url";
import type { YouTubeProgress } from "@/lib/video/youtube-progress";

type SaveHandle = {
  name: string;
  createWritable(): Promise<{
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
  getFile(): Promise<File>;
};
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
};
type SavedDownload = {
  name: string;
  size: number;
  video: boolean;
  handle?: SaveHandle;
  file?: File;
  objectUrl?: string;
};

function saveLink(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

type MediaType = "video" | "audio";

type VideoInfo = {
  id: string;
  title: string;
  uploader: string | null;
  duration: number;
  thumbnail: string | null;
  videoOptions: {
    height: number;
    fps: number | null;
    approxBytes: number | null;
  }[];
  audio: { available: boolean; sourceKbps: number | null };
};

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `~${(mb / 1024).toFixed(1)} Go` : `~${Math.round(mb)} Mo`;
};

const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

/** Message d'erreur lisible, à partir de la réponse du serveur ({ error, code }) ou du statut HTTP. */
async function errorFromResponse(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (body?.error) return body.error;
  switch (response.status) {
    case 404:
      return "Le service d'import est introuvable (route /api/youtube absente ?).";
    case 413:
      return "La vidéo est trop volumineuse. Choisissez une qualité plus basse.";
    case 429:
      return "Trop de demandes en peu de temps. Patientez quelques instants.";
    case 502:
    case 503:
      return "Le service d'import est momentanément indisponible. Réessayez dans quelques minutes.";
    case 504:
      return "Le serveur a mis trop de temps à répondre. Essayez une qualité plus basse.";
    default:
      return `L'import YouTube a échoué (erreur ${response.status}).`;
  }
}

function errorFromException(
  error: unknown,
  stage: "analyze" | "download" | "import",
) {
  if (stage === "import")
    return `Le fichier a été téléchargé mais n'a pas pu être ajouté à l'éditeur${
      error instanceof Error && error.message ? ` : ${error.message}` : "."
    }`;
  if (error instanceof TypeError)
    return stage === "download"
      ? "La connexion a été interrompue pendant le transfert. Vérifiez votre réseau et réessayez."
      : "Impossible de joindre le serveur. Vérifiez votre connexion.";
  return error instanceof Error && error.message
    ? error.message
    : "Une erreur inattendue est survenue.";
}

export function YouTubeImport({
  onImport,
  disabled,
}: {
  onImport: (file: File) => Promise<void>;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("");
  const [normalizedUrl, setNormalizedUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [type, setType] = useState<MediaType>("video");
  const [format, setFormat] = useState("mp4");
  const [quality, setQuality] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "analyzing" | "choosing" | "preparing" | "transferring" | "importing"
  >("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedDownload | null>(null);
  const [serverProgress, setServerProgress] = useState<YouTubeProgress | null>(null);
  const [nativeSaveAvailable, setNativeSaveAvailable] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => {
    if (saved?.objectUrl) URL.revokeObjectURL(saved.objectUrl);
  }, [saved?.objectUrl]);

  const busy = phase !== "idle";

  const audioQualities =
    format === "mp3"
      ? [
          { value: "192", label: "192 kbit/s (haute)" },
          { value: "128", label: "128 kbit/s (standard)" },
          { value: "64", label: "64 kbit/s (léger)" },
        ]
      : [
          {
            value: "0",
            label: info?.audio.sourceKbps
              ? `Qualité d'origine (~${info.audio.sourceKbps} kbit/s)`
              : "Qualité d'origine",
          },
        ];

  const qualityOptions =
    type === "video"
      ? (info?.videoOptions ?? []).map((o) => ({
          value: String(o.height),
          label:
            `${o.height}p${o.fps && o.fps > 30 ? ` ${Math.round(o.fps)} fps` : ""} ${formatSize(o.approxBytes)}`.trim(),
        }))
      : audioQualities;

  const reset = () => {
    setInfo(null);
    setNormalizedUrl(null);
    setError(null);
    setProgress(null);
    setSaved(null);
    setServerProgress(null);
  };

  const pickDefaults = (next: MediaType, data: VideoInfo, fmt?: string) => {
    if (next === "video") {
      setFormat("mp4");
      const hd =
        data.videoOptions.find((o) => o.height <= 720) ?? data.videoOptions[0];
      setQuality(hd ? String(hd.height) : "");
    } else {
      const f = fmt ?? "mp3";
      setFormat(f);
      setQuality(f === "mp3" ? "192" : "0");
    }
  };

  const analyze = async () => {
    if (abortRef.current) return;
    setNativeSaveAvailable(Boolean((window as SaveWindow).showSaveFilePicker));
    reset();
    let normalized: string;
    try {
      normalized = normalizeYouTubeUrl(url);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Le lien fourni n'est pas une adresse YouTube valide.",
      );
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase("analyzing");
    try {
      const response = await fetch("/api/youtube/formats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(await errorFromResponse(response));
      if (!response.headers.get("Content-Type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new Error("Le service d'analyse a renvoyé un fichier au lieu des informations de la vidéo. Réessayez après avoir actualisé la page.");
      }
      const data = (await response.json()) as VideoInfo;
      const startType: MediaType = data.videoOptions.length ? "video" : "audio";
      setInfo(data);
      setNormalizedUrl(normalized);
      setType(startType);
      pickDefaults(startType, data);
    } catch (e) {
      if (!abort.signal.aborted) setError(errorFromException(e, "analyze"));
    } finally {
      abortRef.current = null;
      setPhase("idle");
    }
  };

  const download = async () => {
    if (abortRef.current || !info || !normalizedUrl) return;
    setError(null);
    setProgress(null);
    setSaved(null);
    setServerProgress(null);
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase("choosing");
    let writer: Awaited<ReturnType<SaveHandle["createWritable"]>> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    try {
      const name = `${info.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120) || info.id}.${format}`;
      const picker = (window as SaveWindow).showSaveFilePicker;
      const handle = picker ? await picker.call(window, {
        suggestedName: name,
        types: [{ description: type === "video" ? "Vidéo" : "Audio", accept: { [MIME[format]]: [`.${format}`] } }],
      }) : undefined;
      abort.signal.throwIfAborted();
      const downloadId = crypto.randomUUID();
      setPhase("preparing");
      let polling = false;
      const updateProgress = async () => {
        if (polling || abort.signal.aborted) return;
        polling = true;
        try {
          const response = await fetch(`/api/youtube?progress=${downloadId}`, { signal: abort.signal, cache: "no-store" });
          if (response.ok && !abort.signal.aborted) setServerProgress(await response.json());
        } catch { /* Download response remains authoritative if polling fails. */ }
        finally { polling = false; }
      };
      poll = setInterval(() => void updateProgress(), 1000);
      const response = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalizedUrl,
          type,
          format,
          quality: Number(quality),
          downloadId,
        }),
        signal: abort.signal,
      });
      clearInterval(poll);
      if (!response.ok) throw new Error(await errorFromResponse(response));
      const contentType = response.headers.get("Content-Type")?.split(";")[0].trim();
      if (!contentType || !Object.values(MIME).includes(contentType)) {
        await response.body?.cancel();
        throw new Error("Le service de téléchargement n'a pas renvoyé un fichier vidéo ou audio. Relancez l'analyse puis réessayez.");
      }
      if (!response.body) throw new Error("Aucune donnée reçue du serveur.");
      setPhase("transferring");
      const total = Number(response.headers.get("Content-Length"));
      const ext = response.headers.get("X-Media-Ext") || format;
      if (handle && ext !== format) {
        await response.body.cancel();
        throw new Error("Le format reçu diffère du format choisi. Essayez un autre format.");
      }
      if (handle) {
        try { writer = await handle.createWritable(); }
        catch (error) { await response.body.cancel(); throw error; }
      }
      const reader = response.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (writer) await writer.write(value);
        else chunks.push(value);
        received += value.byteLength;
        setProgress(
          total > 0
            ? Math.min(100, Math.round((received / total) * 100))
            : null,
        );
      }
      abort.signal.throwIfAborted();
      if (received === 0)
        throw new Error(
          "Le fichier reçu est vide. Essayez un autre format ou une autre qualité.",
        );
      if (total > 0 && received < total)
        throw new Error("Le transfert s'est arrêté avant la fin. Réessayez.");
      if (writer && handle) {
        await writer.close();
        writer = undefined;
        setSaved({ handle, name: handle.name, size: received, video: type === "video" });
      } else {
        const fileName = name.replace(/\.[^.]+$/, `.${ext}`);
        const file = new File(chunks, fileName, { type: MIME[ext] ?? "application/octet-stream" });
        chunks.length = 0;
        const objectUrl = URL.createObjectURL(file);
        saveLink(objectUrl, fileName);
        setSaved({ file, objectUrl, name: fileName, size: received, video: type === "video" });
      }
      setProgress(100);
    } catch (e) {
      const cancelled = abort.signal.aborted || (e instanceof DOMException && e.name === "AbortError");
      await writer?.abort().catch(() => {});
      abort.abort();
      if (!cancelled) setError(errorFromException(e, "download"));
    } finally {
      clearInterval(poll);
      abortRef.current = null;
      setPhase("idle");
    }
  };

  const importSaved = async () => {
    if (!saved || busy || disabled) return;
    setError(null);
    setPhase("importing");
    try {
      const file = saved.handle ? await saved.handle.getFile() : saved.file;
      if (!file) throw new Error("Le fichier n'est plus disponible.");
      await onImport(file);
    } catch (error) {
      setError(errorFromException(error, "import"));
    } finally { setPhase("idle"); }
  };

  const selectClass =
    "h-12 w-full rounded-md border border-zinc-300 bg-white px-3 text-base disabled:opacity-50";

  return (
    <section id="youtube" className="scroll-mt-40 space-y-4 border-t border-zinc-200 pt-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Video size={22} className="text-red-600" /> Importer depuis YouTube
      </h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void analyze();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Lien de la vidéo YouTube</span>
          <Input
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (info) reset();
            }}
            disabled={busy || disabled}
            required
            className="h-12 text-base"
          />
        </label>
        <Button
          type="submit"
          disabled={busy || disabled || !url.trim()}
          className="h-12"
        >
          <Search size={18} /> Analyser
        </Button>
        {busy && phase !== "importing" && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => abortRef.current?.abort()}
            className="h-12"
          >
            <X size={18} /> Annuler
          </Button>
        )}
      </form>

      {info && (
        <div className="space-y-4 rounded-lg border border-zinc-200 p-4">
          <div className="flex gap-3">
            {info.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.thumbnail}
                alt=""
                className="h-16 w-24 shrink-0 rounded object-cover sm:h-20 sm:w-36"
              />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{info.title}</p>
              <p className="text-sm text-zinc-500">
                {[info.uploader, formatDuration(info.duration)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-zinc-600">
              <span>Type</span>
              <select
                className={selectClass}
                value={type}
                disabled={busy || disabled}
                onChange={(event) => {
                  const next = event.target.value as MediaType;
                  setType(next);
                  pickDefaults(next, info);
                }}
              >
                <option value="video" disabled={!info.videoOptions.length}>
                  Vidéo (image + son)
                </option>
                <option value="audio" disabled={!info.audio.available}>
                  Audio uniquement
                </option>
              </select>
            </label>

            <label className="space-y-1 text-sm text-zinc-600">
              <span>Format</span>
              <select
                className={selectClass}
                value={format}
                disabled={busy || disabled}
                onChange={(event) => {
                  const f = event.target.value;
                  setFormat(f);
                  if (type === "audio") setQuality(f === "mp3" ? "192" : "0");
                }}
              >
                {type === "video" ? (
                  <>
                    <option value="mp4">MP4 (compatible partout)</option>
                    <option value="webm">WebM</option>
                  </>
                ) : (
                  <>
                    <option value="mp3">MP3</option>
                    <option value="m4a">M4A (AAC)</option>
                  </>
                )}
              </select>
            </label>

            <label className="space-y-1 text-sm text-zinc-600">
              <span>Qualité</span>
              <select
                className={selectClass}
                value={quality}
                disabled={busy || disabled}
                onChange={(event) => setQuality(event.target.value)}
              >
                {qualityOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button
            type="button"
            onClick={() => void download()}
            disabled={busy || disabled || !quality}
            className="h-12 w-full sm:w-auto"
          >
            <Download size={18} /> Enregistrer sur mon appareil
          </Button>
          {nativeSaveAvailable === false && <p className="text-sm text-zinc-500">L&apos;emplacement dépend des réglages de téléchargement de votre navigateur.</p>}
        </div>
      )}

      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-zinc-600"
        >
          <LoaderCircle size={18} className="shrink-0 animate-spin" />
          {phase === "analyzing" && "Analyse de la vidéo..."}
          {phase === "choosing" && "Choix de l'emplacement..."}
          {phase === "importing" && "Ouverture dans l'éditeur..."}
          {phase === "preparing" && (serverProgress?.stage === "converting"
            ? "Assemblage et conversion du fichier..."
            : serverProgress?.stage === "downloading"
              ? `Téléchargement du flux ${serverProgress.track ?? "YouTube"}${serverProgress.percent !== null ? ` : ${serverProgress.percent} %` : "..."}`
              : "Préparation du téléchargement YouTube...")}
          {phase === "transferring" &&
            (progress === null
              ? "Enregistrement sur votre appareil..."
              : `Enregistrement sur votre appareil : ${progress} %`)}
        </div>
      )}
      {(phase === "preparing" || phase === "transferring") && (
        <progress
          aria-label={phase === "preparing" ? "Téléchargement YouTube" : "Enregistrement local"}
          max={100}
          value={(phase === "transferring" ? progress : serverProgress?.stage === "downloading" ? serverProgress.percent : null) ?? undefined}
          className="h-3 w-full accent-indigo-700"
        />
      )}
      {saved && (
        <div className="space-y-3 border-t border-emerald-200 pt-4">
          <p className="flex items-center gap-2 font-medium text-emerald-800"><CheckCircle2 size={20} className="shrink-0" />{saved.handle ? "Fichier enregistré" : "Fichier prêt, téléchargement lancé"}</p>
          <p className="break-words text-sm text-zinc-600">{saved.name} · {formatSize(saved.size)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {saved.video && <Button type="button" disabled={busy || disabled} onClick={() => void importSaved()}><Scissors size={18} /> Ouvrir dans l&apos;éditeur</Button>}
            {saved.objectUrl && <Button type="button" variant="secondary" disabled={busy} onClick={() => saveLink(saved.objectUrl!, saved.name)}><Download size={18} /> Enregistrer à nouveau</Button>}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
