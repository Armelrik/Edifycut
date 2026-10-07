import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const localBinary = join(
  process.cwd(), ".tools", "yt-dlp",
  process.platform === "win32" ? "Scripts/yt-dlp.exe" : "bin/yt-dlp",
);
export const YTDLP = process.env.YTDLP_PATH || (existsSync(localBinary) ? localBinary : "yt-dlp");
/** 0 = pas de limite */
export const MAX_DURATION_S = Number(process.env.YT_MAX_DURATION_S ?? 3 * 3600);
export const MAX_BYTES = Number(process.env.YT_MAX_BYTES ?? 2 * 1024 ** 3);

export class YtError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Arguments communs à toutes les commandes yt-dlp. */
export function baseArgs(): string[] {
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    "--socket-timeout",
    "20",
    "--retries",
    "3",
    "--js-runtimes",
    `node:${process.execPath}`,
    "--extractor-args",
    "youtube:player_client=default,web_embedded",
  ];
  if (process.env.FFMPEG_PATH)
    args.push("--ffmpeg-location", process.env.FFMPEG_PATH);
  if (process.env.YTDLP_COOKIES)
    args.push("--cookies", process.env.YTDLP_COOKIES);
  if (process.env.YTDLP_PROXY) args.push("--proxy", process.env.YTDLP_PROXY);
  if (process.env.YTDLP_EXTRA_ARGS)
    args.push(...process.env.YTDLP_EXTRA_ARGS.split(" ").filter(Boolean));
  return args;
}

export function run(
  args: string[],
  opts: { timeoutMs: number; signal?: AbortSignal; onStdout?: (chunk: string) => void },
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(new YtError(499, "aborted", "Téléchargement annulé."));
        return;
      }
      const child = spawn(/* turbopackIgnore: true */ YTDLP, args, {
        stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const stop = () => {
        if (!child.pid) return;
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* Process already exited. */ }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        stop();
      }, opts.timeoutMs);
      const onAbort = stop;
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      if (opts.signal?.aborted) onAbort();
      child.stdout.on("data", (d: string) => {
        if (opts.onStdout) opts.onStdout(d);
        else stdout += d;
      });
      child.stderr.on("data", (d: string) => { stderr = (stderr + d).slice(-32_000); });
      child.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (err.code === "ENOENT")
          reject(
            new YtError(
              500,
              "ytdlp_missing",
              "yt-dlp n'est pas installé sur le serveur (ou YTDLP_PATH est incorrect).",
            ),
          );
        else reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (opts.signal?.aborted)
          reject(new YtError(499, "aborted", "Téléchargement annulé."));
        else if (timedOut)
          reject(
            new YtError(
              504,
              "timeout",
              "Le traitement a pris trop de temps. Essayez une qualité plus basse.",
            ),
          );
        else resolve({ code, stdout, stderr });
      });
    },
  );
}

const RULES: [RegExp, number, string, string][] = [
  [
    /the page needs to be reloaded/,
    502,
    "youtube_reload",
    "YouTube a refusé la réponse du lecteur. Mettez à jour la version du projet avec npm run setup:youtube, puis réessayez. Si des cookies sont configurés, vérifiez qu'ils sont encore valides.",
  ],
  [
    /no supported javascript runtime|javascript challenge|challenge solving failed|n challenge solving failed|signature solving failed/,
    503,
    "javascript_runtime",
    "Le moteur JavaScript YouTube n'a pas pu résoudre la requête. Utilisez Node.js 22+ et mettez à jour yt-dlp et ses composants avec npm run setup:youtube.",
  ],
  [
    /unsupported url/,
    400,
    "invalid_url",
    "Ce lien n'est pas une vidéo YouTube valide.",
  ],
  [
    /private video/,
    403,
    "private_video",
    "Cette vidéo est privée : impossible de l'importer.",
  ],
  [
    /confirm your age|age-restricted|age restricted|inappropriate for some users/,
    403,
    "age_restricted",
    "Cette vidéo est soumise à une restriction d'âge. Elle n'est accessible qu'avec un compte connecté (fichier de cookies, voir YTDLP_COOKIES).",
  ],
  [
    /not a bot|confirm you.re not a bot/,
    403,
    "bot_check",
    "YouTube demande une vérification anti-robot pour l'adresse IP du serveur. Configurez un fichier de cookies (YTDLP_COOKIES) ou utilisez un autre réseau.",
  ],
  [
    /members-only|members only|join this channel/,
    403,
    "members_only",
    "Cette vidéo est réservée aux membres de la chaîne.",
  ],
  [
    /not available in your country|blocked it in your country|geo.?restrict|who has blocked/,
    451,
    "geo_blocked",
    "Cette vidéo n'est pas disponible dans le pays du serveur.",
  ],
  [
    /copyright/,
    451,
    "copyright",
    "Cette vidéo est bloquée pour des raisons de droits d'auteur.",
  ],
  [
    /live event|is live|premieres in|this live|will begin in/,
    422,
    "live_stream",
    "Les directs et les premières à venir ne peuvent pas être importés. Réessayez une fois la diffusion terminée.",
  ],
  [
    /video unavailable|has been removed|no longer available|account associated .* terminated|does not exist|this video is not available/,
    404,
    "not_found",
    "Cette vidéo est introuvable ou a été supprimée.",
  ],
  [
    /requested format is not available|no video formats|requested formats are incompatible/,
    422,
    "format_unavailable",
    "Ce format ou cette qualité n'existe pas pour cette vidéo. Choisissez-en un autre.",
  ],
  [
    /(ffmpeg|ffprobe).*(not found|not installed)|(not found|not installed).*(ffmpeg|ffprobe)|postprocessing.*ffmpeg/,
    500,
    "ffmpeg_missing",
    "ffmpeg n'est pas installé sur le serveur : la fusion image + son est impossible.",
  ],
  [
    /http error 429|too many requests/,
    429,
    "rate_limited",
    "YouTube limite temporairement les requêtes du serveur. Patientez quelques minutes.",
  ],
  [
    /unable to download|timed out|connection (reset|refused|aborted)|name or service not known|getaddrinfo|network is unreachable/,
    502,
    "network",
    "Le serveur n'a pas réussi à joindre YouTube. Réessayez dans un instant.",
  ],
];

/** Transforme la sortie d'erreur de yt-dlp en erreur lisible. */
export function classify(stderr: string): YtError {
  const s = stderr.toLowerCase();
  for (const [re, status, code, message] of RULES) {
    if (re.test(s)) return new YtError(status, code, message);
  }
  console.error("[youtube] erreur yt-dlp non reconnue :\n", stderr);
  const last =
    stderr
      .split("\n")
      .reverse()
      .find((l) => l.trim().startsWith("ERROR")) ?? "";
  return new YtError(
    502,
    "unknown",
    `YouTube ou yt-dlp a refusé la vidéo${last ? ` (${last.replace(/^ERROR:\s*/, "").slice(0, 200)})` : ""}. Si le problème persiste, mettez à jour la version du projet (npm run setup:youtube).`,
  );
}

export function toErrorBody(e: unknown) {
  if (e instanceof YtError)
    return { status: e.status, body: { error: e.message, code: e.code } };
  console.error("[youtube]", e);
  return {
    status: 500,
    body: {
      error: "Erreur interne du serveur pendant l'import YouTube.",
      code: "internal",
    },
  };
}

export function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function assertYouTubeUrl(raw: unknown): string {
  if (typeof raw !== "string")
    throw new YtError(400, "invalid_url", "Lien manquant.");
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new YtError(
      400,
      "invalid_url",
      "Ce lien n'est pas une adresse valide.",
    );
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new YtError(
      400,
      "invalid_url",
      "Ce lien n'est pas une adresse valide.",
    );
  if (!HOSTS.has(u.hostname.toLowerCase()))
    throw new YtError(
      400,
      "invalid_url",
      "Seuls les liens YouTube sont acceptés.",
    );
  return u.toString();
}
