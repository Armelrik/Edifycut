export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatShortDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds}s`;
  return `${seconds}s`;
}

export function hmsToSeconds(hours: number, minutes: number, seconds: number) {
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export function splitSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  return {
    hours: Math.floor(safeSeconds / 3600),
    minutes: Math.floor((safeSeconds % 3600) / 60),
    seconds: safeSeconds % 60,
  };
}
