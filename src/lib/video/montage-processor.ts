import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { clipDuration, overlap, montageTimeline, audioDuration, type MontageClip, type MontageSettings } from "@/types/montage";
export class MontageProcessor {
  private worker: FFmpeg | null = null;
  terminate() { this.worker?.terminate(); this.worker = null; }
  async export(clips: MontageClip[], files: Map<string, File>, settings: MontageSettings, progress: (value: number, message: string) => void) {
    if (!clips.length || clips.length > 12) throw new Error("Ajoutez entre 1 et 12 médias.");
    for (const clip of clips) {
      if (!files.has(clip.id)) throw new Error(`Resélectionnez le fichier ${clip.media.name}.`);
      if (![clip.start, clip.end, clip.volume, clip.transitionDuration].every(Number.isFinite) || clip.start < 0 || clipDuration(clip) < 0.1 || (clip.kind === "photo" && clip.end > 120) || clip.volume < 0 || clip.volume > 1 || clip.transitionDuration < 0 || clip.transitionDuration > 3 || (clip.kind === "video" && clip.end > clip.sourceDuration + 0.01) || !["none", "fade", "wipeleft", "slideleft"].includes(clip.transition)) throw new Error(`Réglages invalides : ${clip.media.name}.`);
    }
    const montageDuration = montageTimeline(clips).at(-1)!.end;
    const tracks = settings.audioTracks || [], originalVolume = settings.originalVolume ?? 1;
    if (tracks.length > 4 || !Number.isFinite(originalVolume) || originalVolume < 0 || originalVolume > 1) throw new Error("Réglages de mixage invalides.");
    for (const track of tracks) {
      if (![track.sourceDuration, track.start, track.end, track.offset, track.volume, track.fadeIn, track.fadeOut].every(Number.isFinite) || track.start < 0 || track.end > track.sourceDuration + 0.01 || audioDuration(track) < 0.1 || track.offset < 0 || track.volume < 0 || track.volume > 1 || track.fadeIn < 0 || track.fadeOut < 0 || typeof track.muted !== "boolean") throw new Error(`Réglages audio invalides : ${track.media.name}.`);
      if (!track.muted && track.volume > 0 && (track.offset >= montageDuration || !files.has(track.id))) throw new Error(`Replacez ou resélectionnez la piste audio ${track.media.name}.`);
    }
    const activeTracks = tracks.filter(track => !track.muted && track.volume > 0 && track.offset < montageDuration);
    const height = settings.resolution === "1080p" ? 1080 : settings.resolution === "480p" ? 480 : 720;
    const [w, h] = settings.aspect === "square" ? [height, height] : settings.aspect === "portrait" ? [height, Math.round(height * 16 / 9 / 2) * 2] : [Math.round(height * 16 / 9 / 2) * 2, height];
    const ffmpeg = new FFmpeg(); this.worker = ffmpeg;
    const temp = new Set<string>();
    const encoding = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", settings.compress ? "30" : "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", settings.compress ? "96k" : "128k", "-ar", "48000", "-ac", "2"];
    let step = 0, stepDuration = 1;
    const videoSteps = clips.length * 2 - 1;
    const needsMix = activeTracks.length > 0 || originalVolume !== 1;
    const steps = videoSteps + activeTracks.length + (needsMix ? 1 : 0);
    const update = ({ time }: { time: number }) => progress(Math.min(95, 8 + (step + Math.max(0, Math.min(1, time / 1e6 / stepDuration))) / steps * 86), step < clips.length ? `Préparation du média ${step + 1}/${clips.length}` : step < videoSteps ? "Assemblage et transitions" : "Mixage des pistes audio");
    const execute = async (args: string[]) => {
      const code = await ffmpeg.exec(["-filter_complex_threads", "1", ...args]);
      if (code !== 0) throw new Error("Le montage n'a pas pu être exporté. Essayez une résolution plus basse ou des fichiers plus courts.");
    };
    try {
      progress(2, "Chargement du moteur de montage");
      await ffmpeg.load({ coreURL: "/ffmpeg-core/ffmpeg-core.js", wasmURL: "/ffmpeg-core/ffmpeg-core.wasm" });
      ffmpeg.on("progress", update);
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]; const file = files.get(clip.id)!; step = i; stepDuration = clipDuration(clip);
        const input = `source-${i}.${file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin"}`;
        const output = `clip-${i}.mp4`; temp.add(input); temp.add(output);
        await ffmpeg.writeFile(input, await fetchFile(file));
        let hasAudio = false;
        if (clip.kind === "video") {
          const logs: string[] = []; const log = ({ message }: { message: string }) => { if (logs.length < 150) logs.push(message); };
          ffmpeg.on("log", log);
          try { const code = await ffmpeg.exec(["-i", input, "-map", "0:a:0", "-t", "0.01", "-f", "null", "-"]); hasAudio = code === 0; if (code !== 0 && !/matches no streams|does not contain any stream/i.test(logs.join("\n"))) throw new Error(`Fichier vidéo illisible : ${file.name}`); }
          finally { ffmpeg.off("log", log); }
        }
        const fit = settings.fit === "cover" ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}` : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
        const args = clip.kind === "photo" ? ["-loop", "1", "-framerate", "30", "-i", input] : ["-ss", String(clip.start), "-t", String(stepDuration), "-i", input];
        if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
        args.push("-t", String(stepDuration), "-map", "0:v:0", "-map", hasAudio ? "0:a:0" : "1:a:0", "-vf", `${fit},setsar=1,fps=30,settb=1/30,setpts=N`, "-af", `aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS,volume=${clip.volume},apad,atrim=duration=${stepDuration}`, ...encoding, output);
        await execute(args); await ffmpeg.deleteFile(input); temp.delete(input);
      }
      let current = "clip-0.mp4", duration = clipDuration(clips[0]);
      // Pairwise joins bound the number of simultaneous decoders and release consumed media.
      for (let i = 1; i < clips.length; i++) {
        step = clips.length + i - 1;
        const transition = overlap(clips[i - 1], clips[i]);
        stepDuration = duration + clipDuration(clips[i]) - transition;
        const next = `clip-${i}.mp4`, output = `montage-${i}.mp4`; temp.add(output);
        if (transition > 0) {
          const filters = `[0:v]settb=1/30,setpts=PTS-STARTPTS[v0];[1:v]settb=1/30,setpts=PTS-STARTPTS[v1];[v0][v1]xfade=transition=${clips[i - 1].transition}:duration=${transition}:offset=${Math.max(0, duration - transition)}[v];[0:a][1:a]acrossfade=d=${transition}:c1=tri:c2=tri[a]`;
          await execute(["-i", current, "-i", next, "-filter_complex", filters, "-map", "[v]", "-map", "[a]", "-t", String(stepDuration), ...encoding, output]);
        } else {
          const list = `join-${i}.txt`; temp.add(list);
          await ffmpeg.writeFile(list, new TextEncoder().encode(`file '${current}'\nfile '${next}'\n`));
          await execute(["-f", "concat", "-safe", "1", "-i", list, "-c", "copy", output]);
          await ffmpeg.deleteFile(list); temp.delete(list);
        }
        await ffmpeg.deleteFile(current); temp.delete(current); await ffmpeg.deleteFile(next); temp.delete(next);
        current = output; duration = stepDuration;
      }
      const normalizedAudio: string[] = [];
      for (let i = 0; i < activeTracks.length; i++) {
        const track = activeTracks[i], input = `audio-source-${i}`, output = `audio-${i}.m4a`;
        const length = Math.min(audioDuration(track), duration - track.offset);
        step = videoSteps + i; stepDuration = length;
        temp.add(input); temp.add(output);
        await ffmpeg.writeFile(input, await fetchFile(files.get(track.id)!));
        const fadeIn = Math.min(track.fadeIn, length / 2), fadeOut = Math.min(track.fadeOut, length / 2);
        const filters = ["aresample=async=1:first_pts=0", "asetpts=PTS-STARTPTS", `volume=${track.volume}`];
        if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn}`);
        if (fadeOut > 0) filters.push(`afade=t=out:st=${length - fadeOut}:d=${fadeOut}`);
        filters.push("apad", `atrim=duration=${length}`);
        await execute(["-ss", String(track.start), "-t", String(length), "-i", input, "-map", "0:a:0", "-vn", "-af", filters.join(","), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", output]);
        await ffmpeg.deleteFile(input); temp.delete(input); normalizedAudio.push(output);
      }
      if (needsMix) {
        step = steps - 1; stepDuration = duration;
        const args = ["-i", current, ...normalizedAudio.flatMap(input => ["-i", input])];
        const filters = [`[0:a]volume=${originalVolume},apad,atrim=duration=${duration}[base]`];
        activeTracks.forEach((track, i) => filters.push(`[${i + 1}:a]adelay=${Math.round(track.offset * 48000)}S:all=1,apad,atrim=duration=${duration}[a${i}]`));
        filters.push(`[base]${activeTracks.map((_, i) => `[a${i}]`).join("")}amix=inputs=${activeTracks.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1,atrim=duration=${duration}[audio]`);
        temp.add("mixed.mp4");
        await execute([...args, "-filter_complex", filters.join(";"), "-map", "0:v:0", "-map", "[audio]", "-c:v", "copy", "-c:a", "aac", "-b:a", settings.compress ? "96k" : "128k", "-ar", "48000", "-ac", "2", "-t", String(duration), "mixed.mp4"]);
        for (const input of [current, ...normalizedAudio]) { await ffmpeg.deleteFile(input); temp.delete(input); }
        current = "mixed.mp4";
      }
      ffmpeg.off("progress", update);
      progress(96, "Finalisation du MP4");
      temp.add("final.mp4"); await execute(["-i", current, "-c", "copy", "-movflags", "+faststart", "final.mp4"]);
      await ffmpeg.deleteFile(current); temp.delete(current);
      const data = await ffmpeg.readFile("final.mp4");
      if (!(data instanceof Uint8Array)) throw new Error("Le fichier exporté est invalide.");
      const bytes = new Uint8Array(data.length); bytes.set(data);
      progress(100, "Montage prêt");
      return new Blob([bytes.buffer], { type: "video/mp4" });
    } finally {
      ffmpeg.off("progress", update);
      await Promise.allSettled([...temp].map(path => ffmpeg.deleteFile(path)));
      this.terminate();
    }
  }
}
