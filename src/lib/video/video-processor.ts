import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { EditorSettings, ExportResult, VideoMetadata, SilenceOptions, VideoCut } from "@/types/video";
import { neutralEffects, retainedSegments } from "./editing";
import { getEstimatedDuration, readVideoMetadata } from "./video-utils";

export type ExportProgress = {
  stage: "loading" | "preparing" | "processing" | "encoding" | "compressing" | "finalizing";
  progress: number;
  message: string;
};

export class NoAudioTrackError extends Error {
  constructor() { super("Cette vidéo ne contient pas de piste audio à analyser."); }
}

export interface VideoProcessor {
  detectSilences(file: File, metadata: VideoMetadata, options: SilenceOptions, onProgress?: (progress: ExportProgress) => void): Promise<VideoCut[]>;
  loadVideo(file: File, onProgress?: (progress: ExportProgress) => void): Promise<File>;
  trimVideo(file: File, trimStart: number, trimEnd: number): Promise<File>;
  changeSpeed(file: File, speed: number): Promise<File>;
  compressVideo(file: File, settings: EditorSettings): Promise<File>;
  exportVideo(
    file: File,
    metadata: VideoMetadata,
    settings: EditorSettings,
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<ExportResult>;
  terminate(): void;
}

const inputName = "input-video";
const outputName = "edifycut-output.mp4";

function getInputExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  return "mp4";
}

function getScaleFilter(settings: EditorSettings, metadata: VideoMetadata) {
  const height = settings.quality === "original" ? metadata.height : Math.min(metadata.height, Number(settings.quality.replace("p", "")));
  return `scale=-2:${Math.max(2, Math.floor(height / 2) * 2)}`;
}

function getAudioTempoFilter(speed: number) {
  const filters: string[] = [];
  let remaining = speed;

  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  filters.push(`atempo=${Number(remaining.toFixed(3))}`);
  return filters.join(",");
}

function getCompressionArgs(settings: EditorSettings) {
  if (settings.optimizeForWhatsApp) return ["-crf", "30", "-preset", "veryfast", "-maxrate", "1600k", "-bufsize", "3200k"];
  if (settings.quality === "480p") return ["-crf", "31", "-preset", "veryfast", "-maxrate", "1200k", "-bufsize", "2400k"];
  if (settings.quality === "720p") return ["-crf", "28", "-preset", "veryfast", "-maxrate", "2500k", "-bufsize", "5000k"];
  if (settings.quality === "1080p") return ["-crf", "26", "-preset", "veryfast", "-maxrate", "4500k", "-bufsize", "9000k"];
  return ["-crf", "24", "-preset", "veryfast"];
}

function buildFfmpegArgs(inputPath: string, metadata: VideoMetadata, settings: EditorSettings, segment: { start: number; end: number }, output: string, includeAudio: boolean, first: boolean, last: boolean) {
  const duration = (segment.end - segment.start) / settings.speed;
  const effects = { ...neutralEffects, ...settings.effects };
  const videoFilters = [`setpts=(PTS-STARTPTS)/${settings.speed}`, getScaleFilter(settings, metadata), `eq=brightness=${effects.brightness}:contrast=${effects.contrast}:saturation=${effects.saturation}`];
  const audioFilters = ["aresample=async=1:first_pts=0", "asetpts=PTS-STARTPTS", getAudioTempoFilter(settings.speed), `volume=${effects.volume}`];
  const fadeIn = first ? Math.min(effects.fadeIn, duration / 2) : 0;
  const fadeOut = last ? Math.min(effects.fadeOut, duration / 2) : 0;
  if (fadeIn > 0) { videoFilters.push(`fade=t=in:st=0:d=${fadeIn}`); audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`); }
  if (fadeOut > 0) { videoFilters.push(`fade=t=out:st=${duration - fadeOut}:d=${fadeOut}`); audioFilters.push(`afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`); }
  return ["-ss", String(segment.start), "-t", String(segment.end - segment.start), "-i", inputPath,
    "-t", String(duration), "-map", "0:v:0", "-vf", videoFilters.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p",
    ...getCompressionArgs(settings),
    ...(includeAudio ? ["-map", "0:a:0", "-af", [...audioFilters, "apad", `atrim=duration=${duration}`].join(","), "-c:a", "aac", "-b:a", settings.optimizeForWhatsApp ? "96k" : "128k"] : ["-an"]),
    "-movflags", "+faststart", output];
}

export class FfmpegVideoProcessor implements VideoProcessor {
  private ffmpeg: FFmpeg | null = null;
  private loadPromise: Promise<void> | null = null;

  private async getFfmpeg(onProgress?: (progress: ExportProgress) => void) {
    if (!this.ffmpeg) this.ffmpeg = new FFmpeg();
    if (this.ffmpeg.loaded) return this.ffmpeg;

    if (!this.loadPromise) {
      onProgress?.({ stage: "loading", progress: 3, message: "Chargement du moteur video..." });
      this.loadPromise = this.ffmpeg
        .load({
          coreURL: "/ffmpeg-core/ffmpeg-core.js",
          wasmURL: "/ffmpeg-core/ffmpeg-core.wasm",
        })
        .then(() => undefined)
        .catch((error) => {
          this.loadPromise = null;
          throw error;
        });
    }

    await this.loadPromise;
    return this.ffmpeg;
  }

  async loadVideo(file: File, onProgress?: (progress: ExportProgress) => void) {
    await this.getFfmpeg(onProgress);
    return file;
  }

  private async hasAudio(ffmpeg: FFmpeg, input: string) {
    const logs: string[] = [];
    const log = ({ message }: { message: string }) => { logs.push(message); };
    ffmpeg.on("log", log);
    try {
      // Probe through FFmpeg because ffprobe is not implemented by every core build.
      const code = await ffmpeg.exec(["-i", input, "-map", "0:a:0", "-t", "0.01", "-f", "null", "-"]);
      if (code === 0) return true;
      if (/matches no streams|does not contain any stream/i.test(logs.join("\n"))) return false;
      throw new Error("Impossible d'analyser les pistes de cette vidéo.");
    } catch (error) {
      console.error("[VideoProcessor] audio probe failed", String(error), logs.slice(-8).join("\n"));
      throw error;
    } finally { ffmpeg.off("log", log); }
  }

  async detectSilences(file: File, metadata: VideoMetadata, options: SilenceOptions, onProgress?: (progress: ExportProgress) => void): Promise<VideoCut[]> {
    const ffmpeg = await this.getFfmpeg(onProgress);
    const input = `${inputName}.${getInputExtension(file)}`;
    const analysisStart = options.start ?? 0;
    const analysisEnd = options.end ?? metadata.duration;
    const analysisDuration = analysisEnd - analysisStart;
    const results: VideoCut[] = [];
    let start: number | null = null;
    const add = (end: number) => {
      if (start === null) return;
      const from = Math.max(analysisStart, start + options.padding);
      const to = Math.min(analysisEnd, end - options.padding);
      if (to > from + 0.05) results.push({ id: crypto.randomUUID(), start: from, end: to, enabled: true, source: "silence" });
      start = null;
    };
    const log = ({ message }: { message: string }) => {
      const begin = /silence_start:\s*(-?[\d.]+)/.exec(message);
      const end = /silence_end:\s*(-?[\d.]+)/.exec(message);
      if (begin) start = Number(begin[1]) + analysisStart;
      if (end) add(Number(end[1]) + analysisStart);
    };
    const progress = ({ time }: { time: number }) => onProgress?.({ stage: "processing", progress: Math.min(95, 10 + Math.round(time / 1_000_000 / analysisDuration * 85)), message: "Détection des silences..." });
    try {
      onProgress?.({ stage: "preparing", progress: 5, message: "Préparation de l'analyse audio..." });
      await ffmpeg.writeFile(input, await fetchFile(file));
      if (!await this.hasAudio(ffmpeg, input)) throw new NoAudioTrackError();
      ffmpeg.on("log", log); ffmpeg.on("progress", progress);
      const code = await ffmpeg.exec(["-ss", String(analysisStart), "-t", String(analysisDuration), "-i", input, "-vn", "-map", "0:a:0", "-af", `aresample=async=1:first_pts=0,silencedetect=noise=${options.threshold}dB:d=${options.minDuration}`, "-f", "null", "-"]);
      if (code !== 0) throw new Error("L'analyse des silences n'a pas abouti.");
      add(analysisEnd);
      onProgress?.({ stage: "finalizing", progress: 100, message: `${results.length} silence(s) détecté(s).` });
      return results;
    } finally {
      ffmpeg.off("log", log); ffmpeg.off("progress", progress);
      await ffmpeg.deleteFile(input).catch(() => {});
    }
  }

  async trimVideo(file: File, trimStart: number, trimEnd: number) {
    const metadata = await readVideoMetadata(file);
    try {
      const result = await this.exportVideo(file, metadata, {
        speed: 1,
        trimStart,
        trimEnd,
        quality: "original",
        optimizeForWhatsApp: false,
      });
      URL.revokeObjectURL(result.objectUrl);
      return new File([result.blob], result.fileName, { type: "video/mp4" });
    } finally {
      URL.revokeObjectURL(metadata.objectUrl);
    }
  }

  async changeSpeed(file: File, speed: number) {
    const metadata = await readVideoMetadata(file);
    try {
      const result = await this.exportVideo(file, metadata, {
        speed,
        trimStart: 0,
        trimEnd: 0,
        quality: "original",
        optimizeForWhatsApp: false,
      });
      URL.revokeObjectURL(result.objectUrl);
      return new File([result.blob], result.fileName, { type: "video/mp4" });
    } finally {
      URL.revokeObjectURL(metadata.objectUrl);
    }
  }

  async compressVideo(file: File, settings: EditorSettings) {
    const metadata = await readVideoMetadata(file);
    try {
      const result = await this.exportVideo(file, metadata, settings);
      URL.revokeObjectURL(result.objectUrl);
      return new File([result.blob], result.fileName, { type: "video/mp4" });
    } finally {
      URL.revokeObjectURL(metadata.objectUrl);
    }
  }

  async exportVideo(
    file: File,
    metadata: VideoMetadata,
    settings: EditorSettings,
    onProgress?: (progress: ExportProgress) => void,
  ): Promise<ExportResult> {
    const ffmpeg = await this.getFfmpeg(onProgress);
    const currentInputName = `${inputName}.${getInputExtension(file)}`;
    const segments = retainedSegments(metadata.duration, settings);
    if (!segments.length || !Number.isFinite(settings.speed) || settings.speed <= 0) throw new Error("Conservez au moins un passage et une vitesse positive avant l'export.");
    const temporary: string[] = [];
    let segmentIndex = 0;
    let completedDuration = 0;
    const totalDuration = getEstimatedDuration(metadata, settings);
    let progressListener: ((event: { progress: number; time: number }) => void) | null = null;

    try {
      onProgress?.({ stage: "preparing", progress: 8, message: "Preparation du fichier..." });
      await ffmpeg.writeFile(currentInputName, await fetchFile(file));

      const includeAudio = await this.hasAudio(ffmpeg, currentInputName);
      progressListener = ({ time }) => {
        const partDuration = (segments[segmentIndex].end - segments[segmentIndex].start) / settings.speed;
        const normalized = Math.max(0, Math.min(1, (completedDuration + Math.min(partDuration, time / 1_000_000)) / totalDuration));
        const exportProgress = 18 + Math.round(normalized * 74);
        const stage = exportProgress < 42 ? "processing" : exportProgress < 72 ? "encoding" : "compressing";
        const message =
          stage === "processing"
            ? "Traitement de la video..."
            : stage === "encoding"
              ? "Encodage H.264/AAC..."
              : "Compression...";

        onProgress?.({ stage, progress: exportProgress, message });
      };

      ffmpeg.on("progress", progressListener);
      for (segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
        const output = segments.length === 1 ? outputName : `edifycut-part-${segmentIndex}.mp4`;
        temporary.push(output);
        const code = await ffmpeg.exec(buildFfmpegArgs(currentInputName, metadata, settings, segments[segmentIndex], output, includeAudio, segmentIndex === 0, segmentIndex === segments.length - 1));
        if (code !== 0) throw new Error("FFmpeg n'a pas pu exporter le montage. Essayez une résolution plus basse.");
        completedDuration += (segments[segmentIndex].end - segments[segmentIndex].start) / settings.speed;
      }
      ffmpeg.off("progress", progressListener);
      progressListener = null;
      await ffmpeg.deleteFile(currentInputName);
      if (segments.length > 1) {
        onProgress?.({ stage: "finalizing", progress: 94, message: "Assemblage des passages conservés..." });
        const list = "edifycut-parts.txt";
        temporary.push(list);
        await ffmpeg.writeFile(list, new TextEncoder().encode(temporary.filter(name => name.endsWith(".mp4")).map(name => `file '${name}'`).join("\n")));
        const code = await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", outputName]);
        if (code !== 0) throw new Error("L'assemblage des coupes a échoué.");
        await Promise.allSettled(temporary.map(name => ffmpeg.deleteFile(name)));
      }

      onProgress?.({ stage: "finalizing", progress: 96, message: "Finalisation..." });
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const outputBytes = new Uint8Array(bytes.byteLength);
      outputBytes.set(bytes);
      const blob = new Blob([outputBytes.buffer], { type: "video/mp4" });
      const rendered = await readVideoMetadata(new File([blob], outputName, { type: "video/mp4" }));

      return {
        fileName: `edifycut-${file.name.replace(/\.[^/.]+$/, "")}.mp4`,
        blob,
        objectUrl: rendered.objectUrl,
        duration: rendered.duration,
        size: blob.size,
        resolution: `${rendered.width}x${rendered.height}`,
        speed: settings.speed,
      };
    } finally {
      if (progressListener) ffmpeg.off("progress", progressListener);
      await Promise.allSettled([currentInputName, outputName, ...temporary].map(name => ffmpeg.deleteFile(name)));
    }
  }

  terminate() {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loadPromise = null;
  }
}

export const videoProcessor = new FfmpegVideoProcessor();
