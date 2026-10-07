type Binding = { source: MediaElementAudioSourceNode; gain: GainNode; connected: boolean };
export class PreviewAudioMixer {
  private context: AudioContext | null = null;
  private bindings = new WeakMap<HTMLMediaElement, Binding>();
  private connected = new Set<Binding>();
  async resume() {
    if (typeof AudioContext === "undefined") return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }
  setGain(element: HTMLMediaElement, value: number) {
    const volume = Math.max(0, Math.min(1, value));
    if (!this.context) { element.volume = volume; return; }
    let binding = this.bindings.get(element);
    if (!binding) {
      binding = { source: this.context.createMediaElementSource(element), gain: this.context.createGain(), connected: false };
      this.bindings.set(element, binding);
    }
    if (!binding.connected) {
      binding.source.connect(binding.gain); binding.gain.connect(this.context.destination);
      binding.connected = true; this.connected.add(binding);
    }
    element.volume = 1;
    binding.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.008);
  }
  release(element: HTMLMediaElement) {
    const binding = this.bindings.get(element);
    if (binding?.connected) { binding.source.disconnect(); binding.gain.disconnect(); binding.connected = false; this.connected.delete(binding); }
  }
  dispose() {
    for (const binding of this.connected) { binding.source.disconnect(); binding.gain.disconnect(); }
    this.connected.clear(); this.bindings = new WeakMap();
    void this.context?.close().catch(() => {}); this.context = null;
  }
}
