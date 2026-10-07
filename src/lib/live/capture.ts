import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AccountError } from "@/lib/account/http";
import { normalizeYouTubeUrl } from "@/lib/video/youtube-url";
import { baseArgs, run, classify } from "@/lib/video/ytdlp";
import type { LiveSession } from "@/types/live";

type Job = LiveSession & { owner: string; run: number; busy?: boolean; child?: ChildProcess; closed?: Promise<void>; starting?: Promise<void>; abort?: AbortController; stopping?: boolean };
const root = join(process.cwd(), ".data", "live");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_SECONDS = 6 * 3600;
const MAX_BYTES = 4 * 1024 ** 3;
const RETENTION = 24 * 3600 * 1000;
const globalState = globalThis as typeof globalThis & { edifycutLive?: Map<string, Job>; edifycutLiveChildren?: Set<ChildProcess> };
if (!globalState.edifycutLiveChildren) {
  globalState.edifycutLiveChildren = new Set();
  process.once("exit", () => {
    for (const job of globalState.edifycutLive?.values() || []) job.abort?.abort();
    for (const child of globalState.edifycutLiveChildren || []) child.kill("SIGTERM");
  });
}

function save(job: Job) {
  job.updatedAt = new Date().toISOString();
  const { child, closed, starting, abort, busy, stopping, ...data } = job;
  void child; void closed; void starting; void abort; void busy; void stopping;
  const dir = join(root, job.id);
  writeFileSync(join(dir, "session.tmp"), JSON.stringify(data), { mode: 0o600 });
  renameSync(join(dir, "session.tmp"), join(dir, "session.json"));
}

function jobs() {
  if (!globalState.edifycutLive) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const map = new Map<string, Job>();
    for (const id of readdirSync(root)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      try {
        const job = JSON.parse(readFileSync(join(root, id, "session.json"), "utf8")) as Job;
        if (job.id !== id) continue;
        if (["recording", "starting", "pausing", "merging"].includes(job.status)) {
          job.status = "paused"; job.error = "Capture interrompue par le redémarrage du serveur. Vous pouvez reprendre ou assembler les fragments conservés.";
          save(job);
        }
        map.set(id, job);
      } catch { /* Leave damaged manifests for the administrator to inspect. */ }
    }
    globalState.edifycutLive = map;
  }
  for (const [id, job] of globalState.edifycutLive) {
    if (!job.busy && !job.child && !job.abort && Date.now() - Date.parse(job.updatedAt) > RETENTION) {
      rmSync(join(root, id), { recursive: true, force: true });
      globalState.edifycutLive.delete(id);
    }
  }
  return globalState.edifycutLive;
}

function fragments(job: Job) {
  const dir = join(root, job.id);
  // FFmpeg appends a flat-list entry only after closing the corresponding segment.
  return readdirSync(dir).filter(name => /^run-\d+\.txt$/.test(name)).sort().flatMap(list =>
    readFileSync(join(dir, list), "utf8").split(/\r?\n/).filter(name => /^run-\d+-\d+\.ts$/.test(name)).flatMap(name => {
      try { const bytes = statSync(join(dir, name)).size; return bytes > 0 ? [{ name, bytes }] : []; } catch { return []; }
    }),
  );
}

export function view(job: Job): LiveSession {
  const parts = fragments(job);
  return { id: job.id, title: job.title, url: job.url, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, seconds: job.seconds,
    bytes: parts.reduce((sum, part) => sum + part.bytes, 0), fragments: parts, mergedFragments: job.mergedFragments, output: job.output, error: job.error };
}
export function listLive(owner: string) { return [...jobs().values()].filter(job => job.owner === owner).map(view).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function ownedLive(id: string, owner: string) {
  const job = jobs().get(id);
  if (!job || job.owner !== owner) throw new AccountError("Capture introuvable.", 404);
  return job;
}

async function capture(job: Job) {
  job.status = "starting"; job.error = null; job.stopping = false;
  const controller = new AbortController(); job.abort = controller; save(job);
  try {
    const result = await run([...baseArgs(), "--dump-single-json", "--skip-download", "-f", "best[protocol^=m3u8][height<=720]/best[height<=720]", "--", job.url], { timeoutMs: 60_000, signal: controller.signal });
    if (result.code !== 0) throw classify(result.stderr);
    const info = JSON.parse(result.stdout);
    if (!info.is_live) throw new Error("Ce lien ne diffuse pas un direct en cours. Utilisez l'import YouTube pour un replay.");
    const stream = new URL(info.url);
    if (stream.protocol !== "https:" || !/(^|\.)googlevideo\.com$/.test(stream.hostname)) throw new Error("Adresse de diffusion YouTube non reconnue.");
    if (controller.signal.aborted) return;
    job.title = String(info.title || "Direct YouTube").slice(0, 160);
    delete job.abort;
    const prefix = `run-${String(++job.run).padStart(4, "0")}`;
    const child = spawn(/* turbopackIgnore: true */ FFMPEG, ["-hide_banner", "-y", "-rw_timeout", "20000000", "-live_start_index", "-1", "-i", stream.href,
      "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-threads", "2", "-g", "60", "-sc_threshold", "0", "-force_key_frames", "expr:gte(t,n_forced*30)",
      "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-af", "aresample=async=1:first_pts=0", "-t", String(Math.max(1, MAX_SECONDS - job.seconds)),
      "-progress", "pipe:1", "-nostats", "-f", "segment", "-segment_time", "30", "-reset_timestamps", "1", "-segment_list", `${prefix}.txt`, "-segment_list_type", "flat", `${prefix}-%06d.ts`],
      { cwd: join(root, job.id), stdio: ["pipe", "pipe", "pipe"] });
    globalState.edifycutLiveChildren!.add(child);
    child.once("close", () => globalState.edifycutLiveChildren!.delete(child));
    child.stdin?.on("error", () => { /* FFmpeg may close stdin before the stop command. */ });
    job.child = child; job.status = "recording"; save(job);
    const initialSeconds = job.seconds;
    let stderr = "", progressBuffer = "", forced = false;
    let interruptTimer: ReturnType<typeof setTimeout> | undefined;
    const interrupt = () => {
      if (job.stopping) return;
      job.stopping = true; child.stdin?.write("q\n"); child.kill("SIGTERM");
      interruptTimer = setTimeout(() => { forced = true; child.kill("SIGKILL"); }, 25_000);
    };
    const monitor = setInterval(() => {
      try {
        const bytes = readdirSync(join(root, job.id)).filter(name => name.endsWith(".ts")).reduce((sum, name) => sum + statSync(join(root, job.id, name)).size, 0);
        if (bytes >= MAX_BYTES) { job.error = "Limite de 4 Go atteinte ; capture arrêtée."; interrupt(); }
        save(job);
      } catch { job.error = "Le stockage de la capture est indisponible."; interrupt(); }
    }, 5000);
    child.stdout?.on("data", (chunk: Buffer) => {
      progressBuffer += chunk.toString();
      const lines = progressBuffer.split("\n"); progressBuffer = lines.pop() || "";
      for (const line of lines) if (line.startsWith("out_time_us=")) {
        const seconds = Number(line.slice(12)) / 1e6;
        if (Number.isFinite(seconds)) job.seconds = initialSeconds + Math.max(0, seconds);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    job.closed = new Promise<void>(resolve => {
      let spawnError = false;
      child.on("error", () => { spawnError = true; });
      child.on("close", (code, signal) => {
        clearInterval(monitor); clearTimeout(interruptTimer); delete job.child;
        if (job.stopping && !forced && signal !== "SIGKILL") job.status = "paused";
        else if (code === 0) job.status = "completed";
        else { job.status = "error"; job.error = spawnError ? "FFmpeg est introuvable sur le serveur." : forced ? "Arrêt forcé : le dernier fragment incomplet n'est pas assemblé." : "La diffusion a été interrompue. Reprenez la capture ou assemblez les fragments déjà reçus."; console.error("[live] capture failed", stderr.slice(-800)); }
        save(job); resolve();
        if (!job.busy && fragments(job).length) {
          job.busy = true;
          void merge(job).catch(error => { job.status = "error"; job.error = error.message; save(job); }).finally(() => { job.busy = false; });
        }
      });
    });
  } catch (error) {
    job.status = controller.signal.aborted ? "paused" : "error";
    job.error = controller.signal.aborted ? null : error instanceof Error ? error.message : "Impossible de démarrer la capture.";
    save(job);
  } finally { delete job.abort; }
}

async function stop(job: Job) {
  job.abort?.abort();
  await job.starting;
  if (job.child) {
    job.status = "pausing"; job.stopping = true; job.child.stdin?.write("q\n"); save(job);
    const grace = setTimeout(() => job.child?.kill("SIGTERM"), 5000);
    const timer = setTimeout(() => job.child?.kill("SIGKILL"), 25_000);
    try { await job.closed; } finally { clearTimeout(timer); clearTimeout(grace); }
  }
}

async function merge(job: Job) {
  const parts = fragments(job);
  if (!parts.length) throw new AccountError("Aucun fragment complet à assembler.", 409);
  const previous = job.status;
  job.status = "merging"; save(job);
  const dir = join(root, job.id);
  writeFileSync(join(dir, "concat.txt"), parts.map(part => `file '${part.name}'`).join("\n"), { mode: 0o600 });
  const output = `merged-${randomUUID()}.mp4`;
  try { await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ FFMPEG, ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "1", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", output], { cwd: dir, stdio: "ignore" });
    globalState.edifycutLiveChildren!.add(child);
    child.once("close", () => globalState.edifycutLiveChildren!.delete(child));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("FFmpeg est indisponible pour l'assemblage.")); });
    child.on("close", code => { clearTimeout(timer); if (code === 0) resolve(); else { rmSync(join(dir, output), { force: true }); reject(new Error("L'assemblage a échoué. Les fragments sont conservés.")); } });
  }); } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "L'assemblage a échoué.";
    save(job);
    throw new AccountError(job.error, 502);
  }
  if (job.output) { try { rmSync(join(dir, job.output), { force: true }); } catch { /* Open downloads can delay cleanup on Windows. */ } }
  job.output = output; job.mergedFragments = parts.length; job.status = previous === "completed" || previous === "error" ? previous : "paused"; save(job);
}

export function createLive(owner: string, raw: unknown) {
  let url: string;
  try { url = normalizeYouTubeUrl(raw); } catch (error) { throw new AccountError((error as Error).message); }
  const map = jobs();
  if (map.size >= 20) throw new AccountError("Le stockage a atteint sa limite de 20 sessions. Supprimez des captures inutilisées.", 429);
  if ([...map.values()].filter(job => job.owner === owner).length >= 5) throw new AccountError("Supprimez une ancienne capture avant d'en créer une nouvelle.", 429);
  if ([...map.values()].filter(job => job.child || job.abort || job.busy).length >= 2) throw new AccountError("Deux captures sont déjà actives sur ce serveur.", 429);
  const now = new Date().toISOString();
  const job: Job = { id: randomUUID(), owner, url, title: "Direct YouTube", status: "starting", createdAt: now, updatedAt: now, seconds: 0, bytes: 0, fragments: [], mergedFragments: 0, output: null, error: null, run: 0 };
  mkdirSync(join(root, job.id), { mode: 0o700 }); map.set(job.id, job); save(job);
  job.starting = capture(job);
  return view(job);
}

export async function controlLive(id: string, owner: string, action: unknown) {
  const job = ownedLive(id, owner);
  if (job.busy) throw new AccountError("Une opération est déjà en cours.", 409);
  if (!["pause", "resume", "stop", "merge", "delete"].includes(String(action))) throw new AccountError("Commande inconnue.");
  job.busy = true;
  try {
    if (action === "resume") {
      if (job.child || job.abort || job.status === "completed") throw new AccountError("Cette capture ne peut pas être reprise.", 409);
      if (job.seconds >= MAX_SECONDS || view(job).bytes >= MAX_BYTES) throw new AccountError("La limite de capture est atteinte.", 409);
      if ([...jobs().values()].filter(other => other !== job && (other.child || other.abort || other.busy)).length >= 2) throw new AccountError("Le serveur a déjà deux captures actives.", 429);
      job.starting = capture(job);
    } else {
      await stop(job);
      if (action === "delete") { rmSync(join(root, id), { recursive: true, force: true }); jobs().delete(id); return null; }
      if (action === "stop") job.status = "completed";
      if (action === "merge" || (action === "stop" && fragments(job).length)) await merge(job);
      save(job);
    }
    return view(job);
  } finally { job.busy = false; }
}

export function liveFile(id: string, owner: string, name: string | null) {
  const job = ownedLive(id, owner);
  const selected = name || job.output;
  if (!selected || (selected !== job.output && !fragments(job).some(part => part.name === selected))) throw new AccountError("Fichier indisponible.", 404);
  const path = join(root, id, selected);
  if (!existsSync(path)) throw new AccountError("Fichier introuvable.", 404);
  return { path, name: selected, bytes: statSync(path).size };
}
