"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2 } from "lucide-react";
import { formatDuration } from "@/lib/video/duration";
import { Button } from "@/components/ui/button";

export function VideoPlayer({ src, speed }: { src: string; speed: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-stone-950 shadow-sm">
      <video
        ref={videoRef}
        src={src}
        className="aspect-video w-full object-contain"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />
      <div className="space-y-3 bg-stone-950 p-3 text-white">
        <input
          aria-label="Progression video"
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(event) => {
            const next = Number(event.target.value);
            setCurrentTime(next);
            if (videoRef.current) videoRef.current.currentTime = next;
          }}
          className="h-7 w-full accent-amber-600"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Button type="button" onClick={togglePlay} className="size-11 px-0 sm:size-10">
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
            </Button>
            <span className="font-mono text-[11px] text-stone-300 sm:text-xs">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Volume2 size={17} className="text-stone-300" />
            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                if (videoRef.current) videoRef.current.volume = next;
              }}
              className="h-7 w-20 accent-amber-600 sm:w-24"
            />
            <button
              type="button"
              aria-label="Plein ecran"
              onClick={() => videoRef.current?.requestFullscreen()}
              className="flex size-10 items-center justify-center rounded-md hover:bg-white/10"
            >
              <Maximize size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
