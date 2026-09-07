import { EditorSettings, ExportQuality, VideoMetadata } from "@/types/video";

const qualityPixels: Record<ExportQuality, number> = {
  original: 1,
  "1080p": 1920 * 1080,
  "720p": 1280 * 720,
  "480p": 854 * 480,
};

export function isSupportedVideo(file: File) {
  return ["video/mp4", "video/quicktime", "video/webm"].includes(file.type);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function getEstimatedDuration(metadata: Pick<VideoMetadata, "duration"> | null, settings: EditorSettings) {
  if (!metadata) return 0;
  const retained = Math.max(0, metadata.duration - settings.trimStart - settings.trimEnd);
  return retained / settings.speed;
}

export function estimateExportSize(metadata: VideoMetadata | null, settings: EditorSettings) {
  if (!metadata) return 0;
  const durationRatio = metadata.duration > 0 ? getEstimatedDuration(metadata, settings) / metadata.duration : 1;
  const sourcePixels = Math.max(1, metadata.width * metadata.height);
  const qualityRatio = settings.quality === "original" ? 1 : Math.min(1, qualityPixels[settings.quality] / sourcePixels);
  const compressionRatio = settings.optimizeForWhatsApp ? 0.42 : settings.quality === "480p" ? 0.48 : 0.68;

  return Math.max(1024 * 1024, metadata.size * durationRatio * qualityRatio * compressionRatio);
}

export function getResolutionLabel(metadata: VideoMetadata | null, quality: ExportQuality) {
  if (quality !== "original") return quality;
  if (!metadata?.width || !metadata.height) return "Originale";
  return `${metadata.width}x${metadata.height}`;
}

export function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024 * 1024) {
      reject(new Error("Ce fichier depasse la limite de 2 Go pour le MVP."));
      return;
    }

    if (!isSupportedVideo(file)) {
      reject(new Error("Format non supporte. Utilisez un fichier MP4, MOV ou WebM."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      resolve({
        name: file.name,
        size: file.size,
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        objectUrl,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de lire cette video. Elle est peut-etre corrompue."));
    };

    video.src = objectUrl;
  });
}
