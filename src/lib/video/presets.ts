import { EditorSettings, VideoPresetId } from "@/types/video";

export const speedOptions = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export const presets: Array<{
  id: VideoPresetId;
  name: string;
  description: string;
  settings: Pick<EditorSettings, "quality" | "optimizeForWhatsApp">;
}> = [
  {
    id: "original",
    name: "Original",
    description: "Qualité source, vitesse inchangée",
    settings: { quality: "original", optimizeForWhatsApp: false },
  },
  {
    id: "fast",
    name: "Équilibré",
    description: "720p, qualité et poids équilibrés",
    settings: { quality: "720p", optimizeForWhatsApp: false },
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "720p, compression pour le partage",
    settings: { quality: "720p", optimizeForWhatsApp: true },
  },
  {
    id: "compact",
    name: "Compact",
    description: "480p, fichier plus léger",
    settings: { quality: "480p", optimizeForWhatsApp: true },
  },
];
