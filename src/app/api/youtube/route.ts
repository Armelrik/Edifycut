import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  getDownloadProgress,
  removeDownloadProgress,
  setDownloadProgress,
} from "@/lib/video/youtube-progress";
import {
  MAX_BYTES,
  YtError,
  assertYouTubeUrl,
  baseArgs,
  classify,
  run,
  toErrorBody,
} from "@/lib/video/ytdlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("progress") ?? "";
  const progress = getDownloadProgress(id);
  return NextResponse.json(
    progress ?? { stage: "preparing", percent: null, track: null },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

function buildArgs(type: string, format: string, quality: number) {
  if (type === "video") {
    if (format !== "mp4" && format !== "webm")
      throw new YtError(400, "bad_request", "Format vidéo invalide.");
    const h = Math.min(Math.max(Math.round(quality) || 720, 144), 4320);
    const selector =
      format === "mp4"
        ? `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`
        : `bv*[height<=${h}][ext=webm]+ba[ext=webm]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
    return ["-f", selector, "--merge-output-format", format];
  }
  if (type === "audio") {
    if (format === "mp3") {
      const kbps = Math.min(Math.max(Math.round(quality) || 192, 32), 320);
      return [
        "-f",
        "ba/b",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        `${kbps}K`,
      ];
    }
    if (format === "m4a")
      return ["-f", "ba[ext=m4a]/ba/b", "-x", "--audio-format", "m4a"];
    throw new YtError(400, "bad_request", "Format audio invalide.");
  }
  throw new YtError(400, "bad_request", "Type invalide (video ou audio).");
}

export async function POST(request: Request) {
  let dir: string | null = null;
  let downloadId: string | null = null;
  const cleanup = () => {
    if (dir) void rm(dir, { recursive: true, force: true }).catch(() => {});
    dir = null;
    if (downloadId) removeDownloadProgress(downloadId);
  };

  try {
    const body = await request.json().catch(() => null);
    const url = assertYouTubeUrl(body?.url);
    const type = String(body?.type ?? "video");
    const format = String(body?.format ?? "mp4");
    const quality = Number(body?.quality);
    const formatArgs = buildArgs(type, format, quality);
    if (
      typeof body?.downloadId === "string" &&
      /^[a-f0-9-]{36}$/i.test(body.downloadId)
    ) {
      const id: string = body.downloadId;
      downloadId = id;
      setDownloadProgress(id, {
        stage: "preparing",
        percent: null,
        track: null,
      });
    }

    dir = await mkdtemp(path.join(tmpdir(), "yt-"));
    const args = [
      ...baseArgs(),
      ...formatArgs,
      "--progress",
      "--newline",
      "--progress-delta",
      "0.5",
      "--progress-template",
      'download:EDIFYCUT_PROGRESS:{"downloaded_bytes":%(progress.downloaded_bytes)j,"total_bytes":%(progress.total_bytes)j,"total_bytes_estimate":%(progress.total_bytes_estimate)j,"vcodec":%(info.vcodec)j}',
      "--progress-template",
      "postprocess:EDIFYCUT_CONVERTING",
      "--no-part",
      "--no-mtime",
      "--restrict-filenames",
      ...(MAX_BYTES > 0 ? ["--max-filesize", String(MAX_BYTES)] : []),
      "-o",
      path.join(dir, "media.%(ext)s"),
      url,
    ];

    let pending = "";
    const { code, stderr } = await run(args, {
      timeoutMs: 15 * 60_000,
      signal: request.signal,
      onStdout(chunk) {
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (!downloadId) return;
        for (const line of lines) {
          if (line.startsWith("EDIFYCUT_CONVERTING")) {
            setDownloadProgress(downloadId, {
              stage: "converting",
              percent: null,
              track: null,
            });
          } else if (line.startsWith("EDIFYCUT_PROGRESS:")) {
            try {
              const progress = JSON.parse(
                line.slice("EDIFYCUT_PROGRESS:".length),
              );
              const total = Number(
                progress.total_bytes || progress.total_bytes_estimate,
              );
              const downloaded = Number(progress.downloaded_bytes);
              setDownloadProgress(downloadId, {
                stage: "downloading",
                percent:
                  total > 0 && Number.isFinite(downloaded)
                    ? Math.min(100, Math.round((downloaded / total) * 100))
                    : null,
                track: progress.vcodec === "none" ? "audio" : "vidéo",
              });
            } catch {
              /* Ignore incomplete upstream progress records. */
            }
          }
        }
      },
    });

    if (code !== 0) {
      if (/larger than max-filesize|file is larger/i.test(stderr))
        throw new YtError(
          413,
          "too_large",
          "La vidéo dépasse la taille maximale autorisée. Choisissez une qualité plus basse.",
        );
      throw classify(stderr);
    }

    const files = (await readdir(/* turbopackIgnore: true */ dir)).filter(
      (f) => !f.endsWith(".part") && !f.endsWith(".ytdl"),
    );
    const name = files.find((f) => f.endsWith(`.${format}`)) ?? files[0];
    if (!name)
      throw new YtError(
        502,
        "empty",
        "Le téléchargement s'est terminé mais aucun fichier n'a été produit.",
      );
    const filePath = path.join(/* turbopackIgnore: true */ dir, name);
    const { size } = await stat(/* turbopackIgnore: true */ filePath);
    if (size === 0)
      throw new YtError(
        502,
        "empty",
        "Le fichier produit est vide. Essayez un autre format.",
      );
    if (MAX_BYTES > 0 && size > MAX_BYTES)
      throw new YtError(
        413,
        "too_large",
        "La vidéo dépasse la taille maximale autorisée. Choisissez une qualité plus basse.",
      );

    const ext = path.extname(name).slice(1) || format;
    if (downloadId)
      setDownloadProgress(downloadId, {
        stage: "converting",
        percent: null,
        track: null,
      });
    const nodeStream = createReadStream(/* turbopackIgnore: true */ filePath);
    const abortStream = () => nodeStream.destroy();
    nodeStream.on("close", () =>
      request.signal.removeEventListener("abort", abortStream),
    );
    nodeStream.on("close", cleanup);
    nodeStream.on("error", cleanup);
    request.signal.addEventListener("abort", abortStream, {
      once: true,
    });
    if (request.signal.aborted) nodeStream.destroy();

    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="media.${ext}"`,
        "X-Media-Ext": ext,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    cleanup();
    const { status, body } = toErrorBody(e);
    return NextResponse.json(body, { status });
  }
}
