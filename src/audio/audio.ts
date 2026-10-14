// Tiny synthesized sound engine (no asset files): whistle, crowd, hits, kicks and chiptune music.

const _ = null;
/** 4-bar loops (16 steps per bar). Numbers are MIDI notes. */
const SONGS: Record<'menu' | 'hub', { bpm: number; lead: (number | null)[]; bass: number[] }> = {
  menu: {
    bpm: 138,
    lead: [
      72, _, 76, _, 79, _, 76, _, 84, _, 79, _, 76, _, 74, _,
      72, _, 76, _, 81, _, 76, _, 72, _, 69, _, 72, _, 76, _,
      77, _, 81, _, 84, _, 81, _, 77, _, 76, _, 74, _, 72, _,
      74, _, 79, _, 83, _, 79, _, 86, _, 83, _, 79, 81, 83, _,
    ],
    bass: [48, 45, 41, 43],
  },
  hub: {
    bpm: 112,
    lead: [
      67, _, _, 72, _, _, 74, _, 76, _, _, _, 74, _, 72, _,
      69, _, _, 72, _, _, 76, _, 74, _, _, _, 72, _, _, _,
      65, _, _, 69, _, _, 72, _, 74, _, _, _, 72, _, 69, _,
      67, _, _, 71, _, _, 74, _, 79, _, _, _, 77, _, 74, _,
    ],
    bass: [48, 45, 41, 43],
  },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  crowdGain: GainNode | null = null;
  enabled = true;
  volume = 0.7;
  private noiseBuf: AudioBuffer | null = null;
  private visHooked = false;
  musicEnabled = true;
  private musicGain: GainNode | null = null;
  private track: 'menu' | 'hub' | null = null;
  private wanted: 'menu' | 'hub' | null = null;
  private seqTimer = 0;
  private step = 0;
  private nextT = 0;

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
      if (this.wanted && !this.track) this.music(this.wanted);
      if (!this.visHooked) {
        this.visHooked = true;
        document.addEventListener('visibilitychange', () => {
          if (!this.ctx) return;
          if (document.hidden) void this.ctx.suspend();
          else void this.ctx.resume();
        });
      }
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number, enabled: boolean, music?: boolean) {
    this.volume = v;
    this.enabled = enabled;
    if (this.master) this.master.gain.value = v;
    if (music !== undefined) {
      this.musicEnabled = music;
      if (!music) this.stopMusic();
      else if (this.wanted && !this.track) this.music(this.wanted);
    }
  }

  /** Start (or switch to) a looping chiptune track; null stops the music. */
  music(name: 'menu' | 'hub' | null) {
    this.wanted = name;
    if (!name || !this.musicEnabled) { this.stopMusic(); return; }
    if (!this.ctx || !this.master) return; // starts after the first user gesture (unlock)
    if (this.track === name) return;
    this.stopMusic();
    this.track = name;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    const song = SONGS[name];
    const stepDur = 60 / song.bpm / 4;
    const tick = () => {
      if (!this.ctx || !this.musicGain || this.track !== name) return;
      while (this.nextT < this.ctx.currentTime + 0.2) {
        const i = this.step % song.lead.length;
        const n = song.lead[i];
        if (n !== null) this.note(n, this.nextT, stepDur * 1.6, 'square', 0.22);
        if (i % 2 === 0) {
          const root = song.bass[Math.floor(i / 16) % song.bass.length];
          this.note(root + (i % 4 === 0 ? 0 : 12), this.nextT, stepDur * 1.8, 'triangle', 0.5);
        }
        if (i % 4 === 0) this.drum(this.nextT, i % 8 === 4);
        this.step++;
        this.nextT += stepDur;
      }
    };
    tick();
    this.seqTimer = window.setInterval(tick, 50);
  }

  stopMusic() {
    window.clearInterval(this.seqTimer);
    this.seqTimer = 0;
    this.track = null;
    if (this.musicGain && this.ctx) {
      const g = this.musicGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      window.setTimeout(() => g.disconnect(), 400);
    }
    this.musicGain = null;
  }

  private note(midi: number, t: number, dur: number, type: OscillatorType, gain: number, dest?: AudioNode) {
    if (!this.ctx) return;
    const out = dest ?? this.musicGain;
    if (!out) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private drum(t: number, snare: boolean) {
    if (!this.ctx || !this.noiseBuf || !this.musicGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = snare ? 'highpass' : 'lowpass';
    f.frequency.value = snare ? 1800 : 180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(snare ? 0.25 : 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (snare ? 0.1 : 0.12));
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(t, Math.random());
    src.stop(t + 0.15);
  }

  /** Short 8-bit fanfare (touchdowns, wins, level ups). */
  jingle(kind: 'td' | 'win' | 'level') {
    if (!this.ctx || !this.master || !this.enabled) return;
    const seq = kind === 'td' ? [60, 64, 67, 72, 67, 72, 76] : kind === 'win' ? [67, 72, 76, 79, 76, 79, 84, 84] : [72, 76, 79, 84];
    const t0 = this.ctx.currentTime + 0.02;
    const d = kind === 'win' ? 0.13 : 0.09;
    seq.forEach((n, i) => this.note(n, t0 + i * d, d * (i === seq.length - 1 ? 4 : 1.4), 'square', 0.12, this.master!));
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
