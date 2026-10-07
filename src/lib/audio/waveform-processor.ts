import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
export class WaveformProcessor {
  private worker: FFmpeg | null = null;
  terminate() { this.worker?.terminate(); this.worker = null; }
  async analyze(file: File): Promise<number[]> {
    const worker = new FFmpeg(); this.worker = worker;
    try {
      await worker.load({ coreURL: "/ffmpeg-core/ffmpeg-core.js", wasmURL: "/ffmpeg-core/ffmpeg-core.wasm" });
      await worker.writeFile("source", await fetchFile(file));
      const code = await worker.exec(["-i", "source", "-map", "0:a:0", "-vn", "-t", "1800", "-ac", "1", "-ar", "1000", "-c:a", "pcm_s16le", "-f", "s16le", "wave.raw"]);
      if (code !== 0) throw new Error("Cette piste audio n'a pas pu être analysée.");
      await worker.deleteFile("source");
      const data = await worker.readFile("wave.raw");
      if (!(data instanceof Uint8Array) || data.length < 2) throw new Error("Cette piste audio est vide.");
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const count = Math.floor(data.length / 2), bins = Math.min(1200, Math.max(80, Math.ceil(count / 100)));
      const peaks = Array.from({ length: bins }, () => 0);
      for (let i = 0; i < count; i++) { const bin = Math.min(bins - 1, Math.floor(i / count * bins)); peaks[bin] = Math.max(peaks[bin], Math.abs(view.getInt16(i * 2, true)) / 32768); }
      return peaks;
    } finally { this.terminate(); }
  }
}
