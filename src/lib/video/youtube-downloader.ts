import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, open, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BYTES = 512 * 1024 * 1024;
let busy = false;

export class YouTubeDownloadError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export async function downloadYouTube(url: string, signal: AbortSignal) {
  if (busy) throw new YouTubeDownloadError("Un import YouTube est deja en cours. Reessayez ensuite.", 429);
  busy = true;
  let directory: string | undefined;
  const cleanup = async () => {
    try {
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      busy = false;
    }
  };

  try {
    signal.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), "edifycut-youtube-"));
    const output = join(directory, "video.%(ext)s");
    const workDirectory = directory;
    await new Promise<void>((resolve, reject) => {
      const localBinary = join(process.cwd(), ".tools", "yt-dlp", process.platform === "win32" ? "Scripts/yt-dlp.exe" : "bin/yt-dlp");
      const binary = process.env.YTDLP_PATH || (existsSync(localBinary) ? localBinary : "yt-dlp");
      const child = spawn(/* turbopackIgnore: true */ binary, [
        "--ignore-config", "--no-playlist", "--no-progress", "--no-warnings",
        "--no-cache-dir", "--no-overwrites", "--socket-timeout", "30",
        "--retries", "2", "--fragment-retries", "2",
        "--js-runtimes", `node:${process.execPath}`,
        "--max-filesize", String(MAX_BYTES),
        "--match-filters", "!is_live & duration <= 3600",
        "-f", "bv[height<=720][vcodec^=avc1]+ba[ext=m4a]/b[height<=720][ext=mp4][vcodec^=avc1]",
        "--merge-output-format", "mp4", "--remux-video", "mp4",
        ...(process.env.FFMPEG_PATH ? ["--ffmpeg-location", process.env.FFMPEG_PATH] : []),
        "-o", output, "--", url,
      ], { stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32" });
      let stderr = "";
      let failure: Error | undefined;
      const stop = (error: Error) => {
        failure ??= error;
        if (child.pid) {
          try {
            // Stop FFmpeg and other subprocesses along with yt-dlp.
            if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
            else child.kill("SIGKILL");
          } catch { /* The process may have already exited. */ }
        }
      };
      const abort = () => stop(new YouTubeDownloadError("Import annule.", 499));
      const timer = setTimeout(() => stop(new YouTubeDownloadError("Le telechargement a depasse 10 minutes. Reessayez avec une video plus courte.", 504)), 600_000);
      const monitor = setInterval(() => {
        void readdir(workDirectory).then(async (names) => {
          const sizes = await Promise.all(names.map(async (name) => (await stat(join(workDirectory, name)).catch(() => null))?.size ?? 0));
          if (sizes.reduce((total, size) => total + size, 0) > MAX_BYTES * 2) {
            stop(new YouTubeDownloadError("Video trop volumineuse pour cet import (512 Mo maximum).", 413));
          }
        }).catch(() => {});
      }, 1000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
      child.on("error", (error: NodeJS.ErrnoException) => {
        failure = new YouTubeDownloadError(error.code === "ENOENT"
          ? "yt-dlp est absent du serveur. Installez yt-dlp et FFmpeg."
          : "Impossible de demarrer yt-dlp.", 503);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        clearInterval(monitor);
        signal.removeEventListener("abort", abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(new YouTubeDownloadError(
          /ffmpeg/i.test(stderr) ? "FFmpeg est indisponible ou la fusion MP4 a echoue."
            : "YouTube n'a pas permis le telechargement. Verifiez le lien et la version de yt-dlp ; la video doit etre accessible sans connexion.",
        ));
        else resolve();
      });
    });
    signal.throwIfAborted();
    const path = join(directory, "video.mp4");
    const info = await stat(path).catch(() => null);
    if (!info?.size) throw new YouTubeDownloadError("Video indisponible : direct, duree superieure a une heure, taille excessive ou format MP4 absent.", 422);
    if (info.size > MAX_BYTES) throw new YouTubeDownloadError("La video depasse 512 Mo.", 413);

    const file = await open(path, "r");
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      signal.removeEventListener("abort", onAbort);
      await file.close().finally(cleanup);
    };
    const onAbort = () => { void close(); };
    signal.addEventListener("abort", onAbort, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          signal.throwIfAborted();
          const buffer = new Uint8Array(256 * 1024);
          const { bytesRead } = await file.read(buffer);
          if (bytesRead) controller.enqueue(buffer.subarray(0, bytesRead));
          else { await close(); controller.close(); }
        } catch (error) {
          await close();
          controller.error(error);
        }
      },
      cancel: close,
    });
    return { stream, size: info.size };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
