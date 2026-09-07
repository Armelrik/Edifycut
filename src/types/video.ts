export type ExportQuality = "original" | "1080p" | "720p" | "480p";

export type ProjectStatus = "Demo" | "Brouillon" | "Pret" | "Export";

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

export interface DemoProject {
  id: string;
  title: string;
  duration: number;
  modifiedAt: string;
  size: string;
  status: ProjectStatus;
  accent: string;
}

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
