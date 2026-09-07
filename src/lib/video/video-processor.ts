import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { EditorSettings, ExportResult, VideoMetadata } from "@/types/video";
import { estimateExportSize, getEstimatedDuration, getResolutionLabel, readVideoMetadata } from "./video-utils";

export type ExportProgress = {
  stage: "loading" | "preparing" | "processing" | "encoding" | "compressing" | "finalizing";
  progress: number;
  message: string;
};

export interface VideoProcessor {
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

function getScaleFilter(settings: EditorSettings) {
  if (settings.quality === "1080p") return "scale=-2:1080";
  if (settings.quality === "720p") return "scale=-2:720";
  if (settings.quality === "480p") return "scale=-2:480";
  return null;
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

function buildFfmpegArgs(inputPath: string, metadata: VideoMetadata, settings: EditorSettings, includeAudio = true) {
  const retainedDuration = Math.max(0.1, metadata.duration - settings.trimStart - settings.trimEnd);
  const videoFilters = [`setpts=${Number((1 / settings.speed).toFixed(5))}*PTS`];
  const scaleFilter = getScaleFilter(settings);

  if (scaleFilter) videoFilters.push(scaleFilter);

  return [
    ...(settings.trimStart > 0 ? ["-ss", String(settings.trimStart)] : []),
    "-i",
    inputPath,
    "-t",
    String(retainedDuration),
    "-map",
    "0:v:0",
    "-vf",
    videoFilters.join(","),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    ...getCompressionArgs(settings),
    ...(includeAudio
      ? [
          "-map",
          "0:a?",
          "-af",
          getAudioTempoFilter(settings.speed),
          "-c:a",
          "aac",
          "-b:a",
          settings.optimizeForWhatsApp ? "96k" : "128k",
        ]
      : ["-an"]),
    "-movflags",
    "+faststart",
    "-shortest",
    outputName,
  ];
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
    let progressListener: ((event: { progress: number; time: number }) => void) | null = null;

    try {
      onProgress?.({ stage: "preparing", progress: 8, message: "Preparation du fichier..." });
      await ffmpeg.writeFile(currentInputName, await fetchFile(file));

      progressListener = ({ progress }) => {
        const normalized = Math.max(0, Math.min(1, progress || 0));
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
      let exitCode = 1;

      try {
        exitCode = await ffmpeg.exec(buildFfmpegArgs(currentInputName, metadata, settings, true));
      } catch {
        exitCode = 1;
      }

      if (exitCode !== 0) {
        await Promise.allSettled([ffmpeg.deleteFile(outputName)]);
        onProgress?.({ stage: "encoding", progress: 54, message: "Nouvel essai sans piste audio..." });
        exitCode = await ffmpeg.exec(buildFfmpegArgs(currentInputName, metadata, settings, false));
      }

      if (exitCode !== 0) {
        throw new Error("FFmpeg n'a pas pu terminer l'export. Essayez une resolution plus basse.");
      }

      onProgress?.({ stage: "finalizing", progress: 96, message: "Finalisation..." });
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const outputBytes = new Uint8Array(bytes.byteLength);
      outputBytes.set(bytes);
      const blob = new Blob([outputBytes.buffer], { type: "video/mp4" });

      return {
        fileName: `edifycut-${file.name.replace(/\.[^/.]+$/, "")}.mp4`,
        blob,
        objectUrl: URL.createObjectURL(blob),
        duration: getEstimatedDuration(metadata, settings),
        size: blob.size || estimateExportSize(metadata, settings),
        resolution: getResolutionLabel(metadata, settings.quality),
        speed: settings.speed,
      };
    } finally {
      if (progressListener) ffmpeg.off("progress", progressListener);
      await Promise.allSettled([ffmpeg.deleteFile(currentInputName), ffmpeg.deleteFile(outputName)]);
    }
  }

  terminate() {
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loadPromise = null;
  }
}

export const videoProcessor = new FfmpegVideoProcessor();
