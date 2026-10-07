export type ExportQuality = "original" | "1080p" | "720p" | "480p";

export type VideoPresetId = "original" | "fast" | "whatsapp" | "compact";

export type ExportStage =
  | "idle"
  | "preparing"
  | "processing"
  | "encoding"
  | "compressing"
  | "finalizing"
  | "done"
  | "error";

export interface VideoMetadata {
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  objectUrl: string;
}

export interface EditorSettings {
  speed: number;
  trimStart: number;
  trimEnd: number;
  quality: ExportQuality;
  optimizeForWhatsApp: boolean;
  effects?: VideoEffects;
  cuts?: VideoCut[];
}

export interface VideoEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface VideoCut {
  id: string;
  start: number;
  end: number;
  enabled: boolean;
  source: "manual" | "silence";
}

export interface SilenceOptions {
  threshold: number;
  minDuration: number;
  padding: number;
  start?: number;
  end?: number;
}

export interface ExportResult {
  fileName: string;
  blob: Blob;
  objectUrl: string;
  duration: number;
  size: number;
  resolution: string;
  speed: number;
}
