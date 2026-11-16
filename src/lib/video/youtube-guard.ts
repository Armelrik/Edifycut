import "server-only";
import { currentUser } from "@/lib/account/session";
import { AccountError, checkOrigin } from "@/lib/account/http";
import { YtError } from "./ytdlp";

const PER_USER = Math.max(1, Number(process.env.YT_MAX_PER_USER) || 2);
const GLOBAL = Math.max(1, Number(process.env.YT_MAX_CONCURRENT) || 4);

const state = globalThis as typeof globalThis & { edifycutYouTubeSlots?: Map<string, number> };
const slots = (state.edifycutYouTubeSlots ??= new Map());

/** Exige un compte connecté (et une requête de même origine pour les POST). */
export async function requireYouTubeUser(request: Request, { mutating = true } = {}) {
  if (mutating) {
    try { checkOrigin(request); } catch (error) {
      if (error instanceof AccountError) throw new YtError(error.status, "forbidden", error.message);
      throw error;
    }
  }
  const user = await currentUser();
  if (!user) throw new YtError(401, "unauthorized", "Connectez-vous pour importer depuis YouTube.");
  return user;
}

/**
 * Réserve un créneau de téléchargement. Limite par compte et par serveur pour éviter qu’un
 * seul utilisateur (ou un script) ne sature le CPU, le disque ou la bande passante.
 * Retourne une fonction de libération idempotente.
 */
export function acquireYouTubeSlot(userId: string) {
  const total = [...slots.values()].reduce((sum, count) => sum + count, 0);
  if ((slots.get(userId) ?? 0) >= PER_USER) throw new YtError(429, "too_many", `Vous avez déjà ${PER_USER} téléchargements en cours. Attendez qu’ils se terminent.`);
  if (total >= GLOBAL) throw new YtError(503, "busy", "Le serveur traite déjà plusieurs téléchargements. Réessayez dans un instant.");
  slots.set(userId, (slots.get(userId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (slots.get(userId) ?? 1) - 1;
    if (next > 0) slots.set(userId, next); else slots.delete(userId);
  };
}
