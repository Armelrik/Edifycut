"use client";
import { useEffect, useRef } from "react";
export function Waveform({ peaks, start, end, duration, muted = false }: { peaks?: number[]; start: number; end: number; duration: number; muted?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const width = Math.min(2048, Math.max(1, element.clientWidth * devicePixelRatio));
      element.width = width; element.height = 64;
      const context = element.getContext("2d"); if (!context) return;
      context.clearRect(0, 0, width, 64);
      if (!peaks?.length || duration <= 0) return;
      context.fillStyle = muted ? "#a1a1aa" : "#0891b2";
      const ceiling = Math.max(0.001, ...peaks);
      for (let x = 0; x < width; x += 4) {
        const position = (start + (end - start) * x / width) / duration;
        const index = Math.max(0, Math.min(peaks.length - 1, Math.floor(position * peaks.length)));
        const height = Math.max(1, peaks[index] / ceiling * 56);
        context.fillRect(x, (64 - height) / 2, 2, height);
      }
    };
    const observer = new ResizeObserver(draw); observer.observe(element); draw();
    return () => observer.disconnect();
  }, [peaks, start, end, duration, muted]);
  return <canvas ref={canvas} aria-label="Forme d'onde audio" role="img" className="block h-8 w-full" />;
}
