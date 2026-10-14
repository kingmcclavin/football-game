// Tiny synthesized sound engine (no asset files): whistle, crowd, hits, kicks.
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  crowdGain: GainNode | null = null;
  enabled = true;
  volume = 0.7;
  private noiseBuf: AudioBuffer | null = null;

  unlock() {
    if (!this.enabled || typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number, enabled: boolean) {
    this.volume = v;
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? v : 0;
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master || !this.noiseBuf || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slide = 0) {
    if (!this.ctx || !this.master || !this.enabled) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whistle() {
    if (!this.ctx) return;
    this.tone(2900, 0.35, 0.12, 'square');
    this.tone(3050, 0.35, 0.06, 'sine');
  }
  hit(big = false) {
    this.noise(big ? 0.35 : 0.2, big ? 180 : 260, 1.2, big ? 0.9 : 0.55, 'lowpass');
    this.tone(big ? 70 : 95, 0.15, 0.4, 'sine', 0.5);
  }
  catch() {
    this.noise(0.08, 1200, 2, 0.4);
  }
  kick() {
    this.noise(0.12, 500, 1, 0.8, 'lowpass');
    this.tone(120, 0.12, 0.5, 'sine', 0.4);
  }
  snap() {
    this.noise(0.06, 900, 3, 0.3);
  }
  click() {
    this.tone(880, 0.05, 0.08, 'triangle');
  }
  cheer(intensity = 1) {
    this.noise(1.6 * intensity, 1100, 0.6, 0.35 * intensity);
    this.noise(1.2 * intensity, 600, 0.8, 0.25 * intensity);
  }
  groan() {
    this.noise(0.9, 350, 0.9, 0.25);
  }
  startCrowd() {
    if (!this.ctx || !this.master || !this.noiseBuf || this.crowdGain || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.crowdGain = g;
    (this as unknown as { crowdSrc: AudioBufferSourceNode }).crowdSrc = src;
  }
  stopCrowd() {
    const s = (this as unknown as { crowdSrc?: AudioBufferSourceNode }).crowdSrc;
    try { s?.stop(); } catch { /* already stopped */ }
    this.crowdGain = null;
  }
}

export const audio = new AudioEngine();
