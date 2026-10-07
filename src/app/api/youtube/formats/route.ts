import { NextResponse } from "next/server";
import {
  MAX_DURATION_S,
  YtError,
  assertYouTubeUrl,
  baseArgs,
  classify,
  formatDuration,
  run,
  toErrorBody,
} from "@/lib/video/ytdlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RawFormat = {
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  abr?: number | null;
};

const size = (f: RawFormat) => f.filesize ?? f.filesize_approx ?? 0;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const url = assertYouTubeUrl(body?.url);

    const { code, stdout, stderr } = await run(
      [...baseArgs(), "-J", "--skip-download", url],
      { timeoutMs: 45_000, signal: request.signal },
    );
    if (code !== 0) throw classify(stderr);

    let info: {
      id: string;
      title?: string;
      uploader?: string;
      duration?: number;
      thumbnail?: string;
      is_live?: boolean;
      live_status?: string;
      formats?: RawFormat[];
    };
    try {
      info = JSON.parse(stdout);
    } catch {
      throw new YtError(
        502,
        "unknown",
        "Réponse illisible de YouTube. Réessayez.",
      );
    }

    if (
      info.is_live ||
      info.live_status === "is_live" ||
      info.live_status === "is_upcoming"
    )
      throw new YtError(
        422,
        "live_stream",
        "Les directs et les premières à venir ne peuvent pas être importés. Réessayez une fois la diffusion terminée.",
      );

    const duration = info.duration ?? 0;
    if (MAX_DURATION_S > 0 && duration > MAX_DURATION_S)
      throw new YtError(
        422,
        "too_long",
        `La vidéo dure ${formatDuration(duration)} : la limite est de ${formatDuration(MAX_DURATION_S)}.`,
      );

    const formats = info.formats ?? [];
    const videos = formats.filter(
      (f) => f.vcodec && f.vcodec !== "none" && f.height,
    );
    const audios = formats.filter(
      (f) =>
        f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"),
    );
    const bestAudioSize = Math.max(0, ...audios.map(size));
    const bestAbr = Math.max(0, ...audios.map((a) => a.abr ?? 0));

    const heights = [...new Set(videos.map((f) => f.height as number))].sort(
      (a, b) => b - a,
    );
    const videoOptions = heights.map((h) => {
      const same = videos.filter((f) => f.height === h);
      return {
        height: h,
        fps: Math.max(...same.map((f) => f.fps ?? 0)) || null,
        approxBytes: Math.max(...same.map(size)) + bestAudioSize || null,
      };
    });

    if (videoOptions.length === 0 && audios.length === 0)
      throw new YtError(
        422,
        "format_unavailable",
        "Aucun format téléchargeable n'a été trouvé pour cette vidéo.",
      );

    return NextResponse.json({
      id: info.id,
      title: info.title ?? info.id,
      uploader: info.uploader ?? null,
      duration,
      thumbnail: info.thumbnail ?? null,
      videoOptions,
      audio: {
        available: audios.length > 0,
        sourceKbps: Math.round(bestAbr) || null,
      },
    });
  } catch (e) {
    const { status, body } = toErrorBody(e);
    return NextResponse.json(body, { status });
  }
}
