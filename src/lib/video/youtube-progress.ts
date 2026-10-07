export type YouTubeProgress = {
  percent: number | null;
  stage: "preparing" | "downloading" | "converting";
  track: string | null;
};

const state = globalThis as typeof globalThis & {
  edifycutDownloads?: Map<string, YouTubeProgress & { expires: number }>;
};
const downloads = state.edifycutDownloads ??= new Map();

export function setDownloadProgress(id: string, progress: YouTubeProgress) {
  for (const [key, value] of downloads) {
    if (value.expires < Date.now()) downloads.delete(key);
  }
  downloads.set(id, { ...progress, expires: Date.now() + 20 * 60_000 });
}

export function getDownloadProgress(id: string) {
  const value = downloads.get(id);
  if (!value || value.expires < Date.now()) return null;
  return { percent: value.percent, stage: value.stage, track: value.track };
}

export function removeDownloadProgress(id: string) {
  downloads.delete(id);
}
