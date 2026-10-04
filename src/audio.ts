import { SOUND_FILES, type SoundId } from './data/config';

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** Quick tone with a pitch sweep and fade. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): Synth {
  return (ctx, out, t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };
}

/** Burst of filtered noise (explosions, chomps). */
function noise(dur: number, vol: number, cutoff: number): Synth {
  return (ctx, out, t) => {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  };
}

/** Long rush of noise whose filter sweeps up then down (wind, storms). */
function whoosh(dur: number, vol: number, low: number, high: number): Synth {
  return (ctx, out, t) => {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(low, t);
    filter.frequency.exponentialRampToValueAtTime(high, t + dur * 0.5);
    filter.frequency.exponentialRampToValueAtTime(low, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(out);
    src.start(t);
  };
}

function seq(...parts: [number, Synth][]): Synth {
  return (ctx, out, t) => { for (const [delay, s] of parts) s(ctx, out, t + delay); };
}

const SYNTHS: Record<SoundId, Synth> = {
  laser: tone('sawtooth', 1400, 300, 0.09, 0.05),
  cryo: tone('triangle', 2200, 900, 0.12, 0.06),
  place: seq([0, tone('square', 300, 600, 0.08, 0.08)], [0.06, tone('square', 600, 900, 0.08, 0.06)]),
  sell: seq([0, tone('square', 800, 500, 0.08, 0.06)], [0.07, tone('square', 500, 300, 0.1, 0.05)]),
  chomp: noise(0.08, 0.25, 900),
  zombieDie: seq([0, tone('square', 400, 60, 0.25, 0.08)], [0, noise(0.15, 0.15, 2000)]),
  plantDie: tone('triangle', 500, 80, 0.3, 0.12),
  structureHit: noise(0.12, 0.25, 400),
  structureDie: seq([0, noise(0.8, 0.5, 600)], [0, tone('sawtooth', 200, 30, 0.8, 0.15)]),
  orbital: seq([0, tone('sawtooth', 120, 40, 0.6, 0.2)], [0, noise(0.6, 0.6, 1500)]),
  hyperSun: seq(
    [0, tone('triangle', 400, 800, 0.15, 0.1)],
    [0.12, tone('triangle', 600, 1200, 0.15, 0.1)],
    [0.24, tone('triangle', 800, 1600, 0.25, 0.1)],
  ),
  waveStart: seq([0, tone('square', 220, 220, 0.15, 0.08)], [0.18, tone('square', 330, 330, 0.25, 0.08)]),
  waveClear: seq(
    [0, tone('triangle', 523, 523, 0.12, 0.1)],
    [0.12, tone('triangle', 659, 659, 0.12, 0.1)],
    [0.24, tone('triangle', 784, 784, 0.25, 0.1)],
  ),
  win: seq(
    [0, tone('triangle', 523, 523, 0.15, 0.12)], [0.15, tone('triangle', 659, 659, 0.15, 0.12)],
    [0.3, tone('triangle', 784, 784, 0.15, 0.12)], [0.45, tone('triangle', 1047, 1047, 0.5, 0.12)],
  ),
  lose: seq(
    [0, tone('sawtooth', 300, 280, 0.3, 0.1)], [0.3, tone('sawtooth', 250, 230, 0.3, 0.1)],
    [0.6, tone('sawtooth', 200, 100, 0.8, 0.1)],
  ),
  bossRoar: seq(
    [0, tone('sawtooth', 90, 55, 1.4, 0.25)],
    [0, tone('square', 140, 70, 1.2, 0.08)],
    [0, noise(1.2, 0.35, 500)],
  ),
  stomp: seq([0, tone('sine', 70, 30, 0.35, 0.5)], [0, noise(0.25, 0.4, 250)]),
  bossDie: seq(
    [0, noise(1.6, 0.6, 700)],
    [0, tone('sawtooth', 160, 25, 1.8, 0.2)],
    [0.5, tone('triangle', 523, 523, 0.15, 0.12)], [0.65, tone('triangle', 659, 659, 0.15, 0.12)],
    [0.8, tone('triangle', 784, 784, 0.4, 0.12)],
  ),
  bossIntro: seq(
    [0, tone('sine', 60, 28, 1.6, 0.6)],
    [0, noise(1, 0.6, 350)],
    [0, tone('sawtooth', 110, 98, 1.8, 0.1)],
    [0, tone('sawtooth', 165, 147, 1.8, 0.07)],
  ),
  crumble: seq(
    [0, noise(1.6, 0.5, 700)],
    [0, tone('sine', 55, 30, 1.2, 0.35)],
    [0.25, noise(0.2, 0.3, 1800)], [0.5, noise(0.15, 0.25, 2200)],
    [0.8, noise(0.2, 0.2, 1600)], [1.1, noise(0.12, 0.15, 2400)],
  ),
  slowMo: seq([0, tone('sine', 320, 50, 1.4, 0.18)], [0, whoosh(1.4, 0.25, 200, 900)]),
  thunder: seq([0, noise(0.15, 0.6, 3000)], [0.05, noise(2.6, 0.7, 260)], [0, tone('sine', 50, 28, 2, 0.3)]),
  wind: whoosh(4, 0.3, 250, 1100),
  click: tone('square', 900, 900, 0.03, 0.04),
  error: tone('square', 160, 120, 0.15, 0.08),
};

/** Minimum seconds between repeats so a swarm of lasers doesn't deafen anyone. */
const THROTTLE: Partial<Record<SoundId, number>> = { laser: 0.06, cryo: 0.08, chomp: 0.15, zombieDie: 0.05, stomp: 0.4, thunder: 0.8, crumble: 0.5 };

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private files = new Map<SoundId, AudioBuffer>();
  private last = new Map<SoundId, number>();
  muted = false;

  /** Must be called from a tap/click (browsers block sound until then). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    for (const [id, path] of Object.entries(SOUND_FILES) as [SoundId, string][]) {
      fetch(path)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => this.files.set(id, buf))
        .catch(() => console.warn(`Could not load sound ${path}`));
    }
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const gap = THROTTLE[id];
    if (gap && now - (this.last.get(id) ?? -1) < gap) return;
    this.last.set(id, now);
    const file = this.files.get(id);
    if (file) {
      const src = ctx.createBufferSource();
      src.buffer = file;
      src.connect(this.master);
      src.start(now);
    } else {
      SYNTHS[id](ctx, this.master, now);
    }
  }
}
