export const PRO_PRICE = "5,99 €";
export const FREE_SECONDS = 60;
export function hasPro(until: string | null | undefined) { return !!until && Date.parse(until) > Date.now(); }
export type ExportRequest = { kind: "video" | "audio"; duration: number; quality?: string; format?: string; bitrate?: string };
export function exportRestriction(request: ExportRequest) {
  if (!Number.isFinite(request.duration) || request.duration <= 0) return "Vérifiez la durée de l’export.";
  if (request.duration > FREE_SECONDS + 0.001) return "L’export gratuit est limité à 60 secondes.";
  if (request.kind === "video" && !["720p", "480p"].includes(request.quality || "")) return "Le 1080p et la qualité originale sont réservés à Pro.";
  if (request.kind === "audio" && (request.format !== "mp3" || Number(request.bitrate) > 128)) return "L’export audio gratuit est disponible en MP3, jusqu’à 128 kb/s.";
  return null;
}
