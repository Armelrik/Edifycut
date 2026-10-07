export function normalizeYouTubeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("Indiquez une URL YouTube valide.");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Indiquez une URL YouTube valide.");
  }
  const host = url.hostname.toLowerCase();
  const youtubeHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"];
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Utilisez un lien HTTPS YouTube.");
  }
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  if (youtubeHosts.includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error("Utilisez le lien d'une video YouTube (watch, Shorts ou youtu.be).");
  }
  return `https://www.youtube.com/watch?v=${id}`;
}
