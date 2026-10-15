import "server-only";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { database } from "@/lib/account/database";
import { AccountError } from "@/lib/account/http";
import type { ZoomCapture } from "@/types/zoom";
const root = join(process.cwd(), ".data", "zoom");
type Job = { child: ChildProcess; busy: boolean; timer: ReturnType<typeof setTimeout> };
const globalState = globalThis as typeof globalThis & { edifycutZoom?: Map<string, Job> };
const jobs = globalState.edifycutZoom ??= new Map();
const requireModule = createRequire(join(process.cwd(), "package.json"));
function db() {
  const value = database();
  value.exec("CREATE TABLE IF NOT EXISTS zoom_captures (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL)");
  return value;
}
function save(capture: ZoomCapture) {
  capture.updatedAt = new Date().toISOString();
  db().prepare("INSERT INTO zoom_captures VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(capture.id, capture.owner, JSON.stringify(capture));
}
function records() { return (db().prepare("SELECT data FROM zoom_captures").all() as { data: string }[]).map(row => JSON.parse(row.data) as ZoomCapture); }
function parts(id: string) {
  const directory = join(root, id);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => /^run-\d+\.txt$/.test(name)).sort().flatMap(name => readFileSync(join(directory, name), "utf8").split(/\r?\n/).filter(name => /^run-\d+-\d+\.wav$/.test(name)).flatMap(name => {
    try { const bytes = statSync(join(directory, name)).size; return bytes > 44 ? [{ name, bytes }] : []; } catch { return []; }
  }));
}
export function zoomAvailability() {
  if (process.env.VERCEL) return { available: false, reason: "La capture Zoom exige un serveur persistant ; elle n’est pas disponible dans les fonctions Vercel." };
  if (!process.env.ZM_RTMS_CLIENT || !process.env.ZM_RTMS_SECRET || !process.env.ZM_RTMS_WEBHOOK_SECRET || !process.env.ZOOM_ACCOUNT_ID || !process.env.ZOOM_CAPTURE_OWNER_ID) return { available: false, reason: "L’intégration Zoom RTMS doit être configurée par l’administrateur." };
  if (Number(process.versions.node.split(".")[0]) < 22 || !(process.platform === "linux" && process.arch === "x64" || process.platform === "darwin" && process.arch === "arm64")) return { available: false, reason: "Le récepteur Zoom requiert Node.js 22+ sur Linux x64 ou Mac Apple Silicon." };
  try { requireModule.resolve("@zoom/rtms"); } catch { return { available: false, reason: "Le SDK optionnel @zoom/rtms n’est pas installé sur le serveur." }; }
  return { available: true, reason: "" };
}
export function listZoom(owner: string) {
  const now = Date.now();
  return records().filter(capture => capture.owner === owner).flatMap(capture => {
    capture.fragments = parts(capture.id);
    if (!jobs.has(capture.id) && ["starting", "recording", "paused", "merging"].includes(capture.status)) { capture.status = "error"; capture.error = "Le serveur a été redémarré ou la capture interrompue. Les fragments restent disponibles."; save(capture); }
    if (capture.status === "waiting" && now - Date.parse(capture.createdAt) > 2 * 3600_000) { capture.status = "error"; capture.error = "Aucun flux Zoom autorisé reçu dans les deux heures."; save(capture); }
    if (!jobs.has(capture.id) && capture.status !== "waiting" && now - Date.parse(capture.updatedAt) > 24 * 3600_000) { rmSync(join(root, capture.id), { recursive: true, force: true }); db().prepare("DELETE FROM zoom_captures WHERE id = ?").run(capture.id); return []; }
    return [capture];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function ownedZoom(id: string, owner: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new AccountError("Capture introuvable.", 404);
  const capture = listZoom(owner).find(item => item.id === id);
  if (!capture) throw new AccountError("Capture introuvable.", 404);
  return capture;
}
export function createZoom(owner: string, meeting: unknown, title: unknown, consent: unknown) {
  const availability = zoomAvailability();
  if (!availability.available) throw new AccountError(availability.reason, 503);
  if (owner !== process.env.ZOOM_CAPTURE_OWNER_ID) throw new AccountError("Ce compte n’est pas associé à l’intégration Zoom.", 403);
  if (consent !== true) throw new AccountError("Confirmez l’autorisation d’enregistrer la réunion.");
  if (typeof meeting !== "string") throw new AccountError("Numéro de réunion invalide.");
  const meetingId = meeting.replace(/[ -]/g, "");
  if (!/^\d{9,11}$/.test(meetingId)) throw new AccountError("Saisissez le numéro Zoom (9 à 11 chiffres), pas le lien ou le mot de passe.");
  if (listZoom(owner).some(capture => ["waiting", "starting", "recording", "paused", "merging"].includes(capture.status))) throw new AccountError("Terminez la capture Zoom en cours avant d’en préparer une autre.", 409);
  const capture: ZoomCapture = { id: randomUUID(), owner, meetingId, title: typeof title === "string" && title.trim() ? title.trim().slice(0, 100) : "Réunion Zoom", status: "waiting", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), seconds: 0, bytes: 0, fragments: [], mergedFragments: 0, output: null, error: null };
  mkdirSync(join(root, capture.id), { recursive: true, mode: 0o700 }); save(capture); return capture;
}
function startWorker(capture: ZoomCapture, payload?: Record<string, unknown>) {
  if (jobs.has(capture.id)) return;
  const child = fork(/* turbopackIgnore: true */ join(process.cwd(), "scripts", "zoom-recorder.mjs"), [join(root, capture.id)], { execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, ZM_RTMS_LOG_ENABLED: "false" } });
  const job: Job = { child, busy: false, timer: setTimeout(() => { if (child.connected) child.send({ action: "stop" }); }, 6 * 3600_000) };
  jobs.set(capture.id, job);
  child.on("message", (message: unknown) => {
    if (!message || typeof message !== "object") return;
    const update = message as Record<string, unknown>;
    if (typeof update.seconds === "number" && Number.isFinite(update.seconds)) capture.seconds = update.seconds;
    if (typeof update.bytes === "number" && Number.isFinite(update.bytes)) capture.bytes = update.bytes;
    if (["starting", "recording", "paused", "merging", "completed", "error"].includes(String(update.status))) capture.status = update.status as ZoomCapture["status"];
    if (typeof update.error === "string") capture.error = update.error.slice(0, 400);
    if (update.output === true) { capture.output = "audio.m4a"; capture.mergedFragments = parts(capture.id).length; }
    if (update.ready === true) job.busy = false;
    capture.fragments = parts(capture.id); save(capture);
  });
  child.on("error", () => { clearTimeout(job.timer); jobs.delete(capture.id); capture.status = "error"; capture.error = "Impossible de lancer le récepteur Zoom sur ce serveur."; save(capture); });
  child.on("exit", () => {
    clearTimeout(job.timer); jobs.delete(capture.id);
    if (!["completed", "error"].includes(capture.status)) { capture.status = "error"; capture.error = "Le récepteur Zoom s’est arrêté. Les fragments finalisés sont conservés."; save(capture); }
  });
  child.send({ action: payload ? "join" : "prepare", payload, seconds: capture.seconds, bytes: capture.bytes });
}
export function zoomCommand(id: string, owner: string, action: unknown) {
  const capture = ownedZoom(id, owner), job = jobs.get(id);
  if (typeof action !== "string" || !["pause", "resume", "merge", "stop", "delete"].includes(action)) throw new AccountError("Commande inconnue.");
  if (job?.busy) throw new AccountError("Une commande est déjà en cours.", 409);
  if (action === "delete") {
    if (job) throw new AccountError("Terminez la capture avant de la supprimer.", 409);
    rmSync(join(root, id), { recursive: true, force: true }); db().prepare("DELETE FROM zoom_captures WHERE id = ?").run(id); return null;
  }
  if (action === "stop" && capture.status === "waiting") { capture.status = "completed"; save(capture); return capture; }
  if (action === "resume" && (!job || capture.status !== "paused")) throw new AccountError("La reprise nécessite un flux Zoom toujours connecté.", 409);
  if (action === "pause" && (!job || !["starting", "recording"].includes(capture.status))) throw new AccountError("Aucune capture active à mettre en pause.", 409);
  if (!job) {
    if (!["merge", "stop"].includes(String(action)) || !parts(id).length) throw new AccountError("Aucun fragment à assembler.", 409);
    startWorker(capture);
  }
  const worker = jobs.get(id)!; worker.busy = true; capture.error = null;
  if (["merge", "stop"].includes(String(action))) capture.status = "merging";
  save(capture);
  worker.child.send({ action }); return capture;
}
export function zoomFile(id: string, owner: string, fragment: string | null) {
  const capture = ownedZoom(id, owner);
  const name = fragment || capture.output;
  if (!name || fragment && !capture.fragments.some(part => part.name === fragment)) throw new AccountError("Fichier introuvable.", 404);
  if (!fragment && capture.status === "merging") throw new AccountError("Assemblage en cours.", 409);
  const path = join(root, id, name);
  if (!existsSync(path)) throw new AccountError("Fichier introuvable.", 404);
  return { path, size: statSync(path).size, name: fragment ? "edifycut-zoom-" + fragment : "edifycut-zoom-" + id + ".m4a", type: fragment ? "audio/wav" : "audio/mp4" };
}
export function receiveZoom(event: string, payload: Record<string, unknown>) {
  if (process.env.VERCEL) throw new AccountError("Le récepteur Zoom nécessite un serveur persistant.", 503);
  if (payload.account_id !== process.env.ZOOM_ACCOUNT_ID) throw new AccountError("Compte Zoom non autorisé.", 403);
  const object = payload.object && typeof payload.object === "object" ? payload.object as Record<string, unknown> : payload;
  const streamId = object.rtms_stream_id;
  if (typeof streamId !== "string" || !streamId) throw new AccountError("Flux Zoom invalide.");
  const sessions = records();
  if (event === "meeting.rtms_stopped") {
    const capture = sessions.find(item => item.streamId === streamId);
    const job = capture && jobs.get(capture.id);
    if (job && job.child.connected) { job.busy = true; job.child.send({ action: "stop" }); }
    return;
  }
  if (event !== "meeting.rtms_started" || sessions.some(item => item.streamId === streamId)) return;
  const capture = sessions.find(item => item.owner === process.env.ZOOM_CAPTURE_OWNER_ID && item.meetingId === String(object.meeting_id) && item.status === "waiting" && Date.now() - Date.parse(item.createdAt) < 2 * 3600_000);
  if (!capture) return;
  const availability = zoomAvailability(); if (!availability.available) throw new AccountError(availability.reason, 503);
  if (typeof object.meeting_uuid !== "string" || typeof object.server_urls !== "string") throw new AccountError("Paramètres RTMS incomplets.");
  const url = new URL(object.server_urls);
  if (url.protocol !== "wss:" || url.username || url.password || url.port && url.port !== "443" || !(url.hostname.endsWith(".zoom.us") || url.hostname.endsWith(".zoom.com"))) throw new AccountError("Serveur RTMS non autorisé.");
  capture.streamId = streamId; capture.status = "starting"; save(capture);
  startWorker(capture, object);
}
