export function videoThumbnail(url: string, duration: number): Promise<Blob | null> {
  return new Promise(resolve => {
    const video = document.createElement("video"); video.muted = true; video.preload = "auto";
    const finish = (blob: Blob | null) => { clearTimeout(timer); video.onloadeddata = null; video.onseeked = null; video.onerror = null; video.removeAttribute("src"); video.load(); resolve(blob); };
    const timer = setTimeout(() => finish(null), 5000);
    const capture = () => {
      const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 108;
      const context = canvas.getContext("2d");
      if (!context || !video.videoWidth) return finish(null);
      context.fillStyle = "#09090b"; context.fillRect(0, 0, 192, 108);
      const scale = Math.min(192 / video.videoWidth, 108 / video.videoHeight);
      context.drawImage(video, (192 - video.videoWidth * scale) / 2, (108 - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
      canvas.toBlob(finish, "image/jpeg", 0.75);
    };
    video.onloadeddata = () => { const seek = Math.min(0.5, duration / 3); if (seek > 0) video.currentTime = seek; else capture(); };
    video.onseeked = capture; video.onerror = () => finish(null); video.src = url;
  });
}
