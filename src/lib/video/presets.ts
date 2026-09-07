import { EditorSettings, VideoPresetId } from "@/types/video";

export const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export const presets: Array<{
  id: VideoPresetId;
  name: string;
  description: string;
  settings: Pick<EditorSettings, "speed" | "quality" | "optimizeForWhatsApp">;
}> = [
  {
    id: "original",
    name: "Original",
    description: "Vitesse 1x, qualite source",
    settings: { speed: 1, quality: "original", optimizeForWhatsApp: false },
  },
  {
    id: "fast",
    name: "Rapide",
    description: "Vitesse 1.5x, export 720p",
    settings: { speed: 1.5, quality: "720p", optimizeForWhatsApp: false },
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Mobile, 720p, compression optimisee",
    settings: { speed: 1.25, quality: "720p", optimizeForWhatsApp: true },
  },
  {
    id: "compact",
    name: "Compact",
    description: "Vitesse 1.5x, 480p, compression forte",
    settings: { speed: 1.5, quality: "480p", optimizeForWhatsApp: true },
  },
];
