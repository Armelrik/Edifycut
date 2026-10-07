"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioProcessor } from "@/lib/audio/audio-processor";
export function AudioRecorder({ disabled, onReady, onActive }: { disabled: boolean; onReady: (file: File) => Promise<void>; onActive: (active: boolean) => void }) {
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "paused" | "processing">("idle");
  const [seconds, setSeconds] = useState(0), [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), worker = useRef<AudioProcessor | null>(null);
  const chunks = useRef<Blob[]>([]), bytes = useRef(0), elapsed = useRef(0), since = useRef(0), alive = useRef(true);
  const duration = () => elapsed.current + (since.current ? (performance.now() - since.current) / 1000 : 0);
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => { if (since.current) { const value = duration(); setSeconds(value); if (value >= 1800) recorder.current?.stop(); } }, 200);
    return () => { alive.current = false; clearInterval(timer); if (recorder.current?.state !== "inactive") recorder.current?.stop(); stream.current?.getTracks().forEach(track => track.stop()); worker.current?.terminate(); chunks.current = []; };
  }, []);
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Le microphone nécessite HTTPS ou localhost et un navigateur compatible."); return; }
    setState("requesting"); setError(""); onActive(true);
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!alive.current) { audio.getTracks().forEach(track => track.stop()); return; }
      stream.current = audio;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(audio, mimeType ? { mimeType } : undefined); recorder.current = capture;
      audio.getAudioTracks().forEach(track => { track.onended = () => { if (capture.state !== "inactive") capture.stop(); }; });
      chunks.current = []; bytes.current = 0; elapsed.current = 0; setSeconds(0);
      capture.ondataavailable = event => { if (event.data.size) { chunks.current.push(event.data); bytes.current += event.data.size; if (bytes.current >= 128 * 1024 ** 2 && capture.state !== "inactive") capture.stop(); } };
      capture.onerror = () => { if (alive.current) setError("Le microphone a interrompu l'enregistrement."); if (capture.state !== "inactive") capture.stop(); };
      capture.onstop = async () => {
        const length = Math.max(0.1, duration()); elapsed.current = length; since.current = 0;
        audio.getTracks().forEach(track => track.stop()); stream.current = null;
        if (!alive.current) { chunks.current = []; return; }
        setSeconds(length); setState("processing");
        const processor = new AudioProcessor(); worker.current = processor;
        const type = capture.mimeType || "audio/webm";
        const file = new File(chunks.current, `prise.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, { type }); chunks.current = [];
        try {
          if (!file.size) throw new Error("Aucun son n'a été enregistré.");
          const result = await processor.export(file, length, { start: 0, end: length, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, normalize: false, format: "m4a", bitrate: "192" }, () => {});
          if (alive.current) await onReady(new File([result.blob], `enregistrement-${new Date().toISOString().replace(/[:.]/g, "-")}.m4a`, { type: "audio/mp4" }));
        } catch (error) { if (alive.current) setError((error as Error).message); }
        finally { worker.current = null; if (alive.current) { setState("idle"); onActive(false); } }
      };
      capture.start(1000); since.current = performance.now(); setState("recording");
    } catch (error) { stream.current?.getTracks().forEach(track => track.stop()); if (alive.current) { setState("idle"); onActive(false); setError((error as Error).name === "NotAllowedError" ? "Autorisez l'accès au microphone pour enregistrer." : "Le microphone est indisponible."); } }
  }
  return <section className="space-y-3 border-y border-zinc-200 py-4"><div className="flex flex-wrap items-center gap-3">
    {state === "idle" ? <Button variant="secondary" disabled={disabled} onClick={start}><Mic size={18} />Enregistrer au microphone</Button> : <><span className="flex items-center gap-2 text-sm font-medium text-red-600">{state === "processing" || state === "requesting" ? <LoaderCircle size={17} className="animate-spin" /> : <Mic size={17} />}{state === "processing" ? "Préparation de la prise" : state === "requesting" ? "Accès au microphone" : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`}</span>{(state === "recording" || state === "paused") && <><Button variant="secondary" onClick={() => { if (state === "recording") { elapsed.current = duration(); since.current = 0; recorder.current?.pause(); setState("paused"); } else { since.current = performance.now(); recorder.current?.resume(); setState("recording"); } }}>{state === "recording" ? <Pause size={17} /> : <Play size={17} />}{state === "recording" ? "Pause" : "Reprendre"}</Button><Button onClick={() => recorder.current?.stop()}><Square size={17} />Terminer la prise</Button></>}</>}
  </div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</section>;
}
