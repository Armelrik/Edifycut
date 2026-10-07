import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
export interface AudioSettings { start: number; end: number; speed: number; volume: number; fadeIn: number; fadeOut: number; normalize: boolean; format: "mp3" | "m4a" | "wav"; bitrate: "96" | "128" | "192" | "256" }
export interface AudioSource { duration: number; objectUrl: string }
export async function readAudio(file: File): Promise<AudioSource> {
  if (!file.size || file.size > 512 * 1024 ** 2) throw new Error("Choisissez un fichier non vide de moins de 512 Mo.");
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  return new Promise((resolve, reject) => {
    const finish = (error?: string) => {
      clearTimeout(timer); audio.onloadedmetadata = null; audio.onerror = null;
      const duration = audio.duration; audio.removeAttribute("src"); audio.load();
      if (error || !Number.isFinite(duration) || duration <= 0) { URL.revokeObjectURL(objectUrl); reject(new Error(error || "Durée audio inconnue.")); }
      else resolve({ duration, objectUrl });
    };
    const timer = setTimeout(() => finish("Le fichier audio n'a pas pu être chargé."), 15_000);
    audio.onloadedmetadata = () => finish();
    audio.onerror = () => finish("Ce format audio n'est pas lisible dans ce navigateur.");
    audio.preload = "metadata"; audio.src = objectUrl;
  });
}
export class AudioProcessor {
  private ffmpeg: FFmpeg | null = null;
  terminate() { this.ffmpeg?.terminate(); this.ffmpeg = null; }
  async export(file: File, sourceDuration: number, settings: AudioSettings, progress: (value: number) => void) {
    const { start, end, speed, volume, fadeIn, fadeOut, normalize, format, bitrate } = settings;
    if (![sourceDuration, start, end, speed, volume, fadeIn, fadeOut].every(Number.isFinite) || start < 0 || end > sourceDuration + 0.01 || end - start < 0.05 || speed < 0.5 || speed > 2 || volume < 0 || volume > 2 || fadeIn < 0 || fadeOut < 0 || !["mp3", "m4a", "wav"].includes(format) || !["96", "128", "192", "256"].includes(bitrate)) throw new Error("Vérifiez les limites de coupe et les réglages audio.");
    const ffmpeg = new FFmpeg(); this.ffmpeg = ffmpeg;
    const duration = (end - start) / speed;
    const output = `output.${format}`;
    const update = ({ time }: { time: number }) => progress(Math.min(95, 12 + time / 1e6 / duration * 80));
    try {
      progress(2);
      await ffmpeg.load({ coreURL: "/ffmpeg-core/ffmpeg-core.js", wasmURL: "/ffmpeg-core/ffmpeg-core.wasm" });
      await ffmpeg.writeFile("input", await fetchFile(file)); progress(12);
      const filters = ["aresample=async=1:first_pts=0", "asetpts=PTS-STARTPTS", `atempo=${speed}`];
      if (normalize) filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
      filters.push(`volume=${volume}`);
      if (fadeIn) filters.push(`afade=t=in:st=0:d=${Math.min(fadeIn, duration / 2)}`);
      if (fadeOut) { const fade = Math.min(fadeOut, duration / 2); filters.push(`afade=t=out:st=${duration - fade}:d=${fade}`); }
      filters.push("apad", `atrim=duration=${duration}`);
      ffmpeg.on("progress", update);
      const codec = format === "wav" ? ["-c:a", "pcm_s16le"] : format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", `${bitrate}k`] : ["-c:a", "aac", "-b:a", `${bitrate}k`, "-movflags", "+faststart"];
      const code = await ffmpeg.exec(["-ss", String(start), "-t", String(end - start), "-i", "input", "-map", "0:a:0", "-vn", "-af", filters.join(","), "-ar", "48000", ...codec, output]);
      if (code !== 0) throw new Error("Le traitement audio a échoué. Vérifiez que le fichier contient une piste audio.");
      await ffmpeg.deleteFile("input");
      const data = await ffmpeg.readFile(output);
      if (!(data instanceof Uint8Array)) throw new Error("Sortie audio invalide.");
      const bytes = new Uint8Array(data.length); bytes.set(data);
      const blob = new Blob([bytes.buffer], { type: format === "mp3" ? "audio/mpeg" : format === "m4a" ? "audio/mp4" : "audio/wav" });
      progress(100);
      return { blob, fileName: `edifycut-${file.name.replace(/\.[^.]+$/, "")}.${format}` };
    } finally { ffmpeg.off("progress", update); this.terminate(); }
  }
}
