// Sound effects for everything the mascot does: steps, jumps, bites, gulps, glass, lighter, punches, key clicks…
// All synthesised with WebAudio from noise and oscillators, so there are no sound files and nothing to license.
// `play(name)` is safe to call any time: unknown names are reported once, a missing audio device is ignored.

/** Quiet on purpose: the effects sit softly under the phrases, just audible. */
const MASTER_GAIN = 0.18;
const NOISE_SECONDS = 2;

/** Every sound by name: a recipe of noise bursts and tones (see `noise` / `tone` below). Times in seconds. */
const RECIPES = {
  step: (s) => s.noise({ type: 'lowpass', f: 320, dur: 0.06, gain: 0.10 }),
  jump: (s) => { s.noise({ type: 'bandpass', f: 400, f2: 1500, q: 1.2, dur: 0.18, gain: 0.12 }); s.tone({ f: 220, f2: 420, dur: 0.12, type: 'triangle', gain: 0.05 }); },
  land: (s) => { s.tone({ f: 120, f2: 50, dur: 0.16, gain: 0.32 }); s.noise({ type: 'lowpass', f: 260, dur: 0.08, gain: 0.2 }); },
  thud: (s) => { s.tone({ f: 100, f2: 45, dur: 0.2, gain: 0.35 }); s.noise({ type: 'lowpass', f: 400, dur: 0.1, gain: 0.22 }); },
  stomp: (s) => { s.tone({ f: 90, f2: 40, dur: 0.14, gain: 0.3 }); s.noise({ type: 'lowpass', f: 500, dur: 0.06, gain: 0.18 }); },
  whoosh: (s) => s.noise({ type: 'bandpass', f: 300, f2: 2200, q: 1.4, dur: 0.32, gain: 0.24, attack: 0.08 }),
  swish: (s) => s.noise({ type: 'bandpass', f: 900, f2: 2600, q: 2, dur: 0.13, gain: 0.16, attack: 0.03 }),
  bonk: (s) => { s.tone({ f: 320, f2: 120, dur: 0.16, type: 'triangle', gain: 0.22 }); s.tone({ f: 90, f2: 45, dur: 0.15, gain: 0.25 }); },
  grab: (s) => { s.tone({ f: 900, dur: 0.04, type: 'triangle', gain: 0.1 }); s.tone({ f: 1350, dur: 0.05, type: 'triangle', gain: 0.08, at: 0.04 }); },
  click: (s) => s.noise({ type: 'highpass', f: 3000, dur: 0.015, gain: 0.25 }),
  pop: (s) => { s.noise({ type: 'highpass', f: 1500, dur: 0.03, gain: 0.35 }); s.tone({ f: 900, f2: 280, dur: 0.07, gain: 0.2 }); },
  gulp: (s) => { s.tone({ f: 190, f2: 90, dur: 0.12, gain: 0.3, attack: 0.02 }); s.tone({ f: 240, f2: 120, dur: 0.1, gain: 0.18, at: 0.06 }); },
  brr: (s) => { for (let i = 0; i < 10; i++) s.tone({ f: 140 - i * 4, dur: 0.04, type: 'triangle', gain: 0.12, at: i * 0.045 }); },
  vomit: (s) => {
    s.noise({ type: 'lowpass', f: 600, f2: 200, q: 4, dur: 1.4, gain: 0.3, attack: 0.1 });
    for (let i = 0; i < 6; i++) s.tone({ f: 140 + 90 * s.random(), f2: 90, dur: 0.12, gain: 0.12, at: 0.15 + i * 0.2 });
  },
  shatter: (s) => {
    s.noise({ type: 'highpass', f: 2500, dur: 0.4, gain: 0.35 });
    s.tone({ f: 110, f2: 50, dur: 0.12, gain: 0.25 });
    for (let i = 0; i < 9; i++) s.tone({ f: 2500 + 3500 * s.random(), dur: 0.1 + 0.1 * s.random(), gain: 0.05, at: 0.18 * s.random() });
  },
  hawk: (s) => s.noise({ type: 'bandpass', f: 350, f2: 280, q: 3, dur: 0.26, gain: 0.25, attack: 0.04 }),
  ptoo: (s) => { s.tone({ f: 520, f2: 200, dur: 0.07, gain: 0.2 }); s.noise({ type: 'bandpass', f: 1300, dur: 0.08, gain: 0.25 }); },
  splat: (s) => s.noise({ type: 'lowpass', f: 900, f2: 300, dur: 0.12, gain: 0.28 }),
  flick: (s) => { s.noise({ type: 'highpass', f: 3500, dur: 0.02, gain: 0.3 }); s.noise({ type: 'bandpass', f: 2500, q: 0.8, dur: 0.3, gain: 0.07, at: 0.03 }); },
  inhale: (s) => s.noise({ type: 'bandpass', f: 800, f2: 1500, q: 2, dur: 0.8, gain: 0.07, attack: 0.35 }),
  exhale: (s) => s.noise({ type: 'bandpass', f: 1200, f2: 450, q: 1, dur: 1.0, gain: 0.1, attack: 0.05 }),
  sizzle: (s) => {
    s.noise({ type: 'highpass', f: 4000, dur: 0.7, gain: 0.16 });
    for (let i = 0; i < 6; i++) s.noise({ type: 'highpass', f: 2500, dur: 0.012, gain: 0.2, at: 0.6 * s.random() });
  },
  bubble: (s) => s.tone({ f: 280 + 120 * s.random(), f2: 700, dur: 0.06, gain: 0.14 }),
  snore: (s) => { s.noise({ type: 'lowpass', f: 320, q: 6, dur: 1.0, gain: 0.2, attack: 0.45 }); s.tone({ f: 70, dur: 0.9, type: 'sawtooth', gain: 0.04, attack: 0.45 }); },
  clap: (s) => s.noise({ type: 'bandpass', f: 1500, q: 0.8, dur: 0.06, gain: 0.32 }),
  puff: (s) => s.noise({ type: 'bandpass', f: 700, q: 1, dur: 0.18, gain: 0.08, attack: 0.03 }),
  crunch: (s) => {
    [0, 0.03, 0.07, 0.11].forEach((at) => s.noise({ type: 'highpass', f: 1800, dur: 0.03, gain: 0.25, at }));
    s.noise({ type: 'lowpass', f: 500, dur: 0.1, gain: 0.2 });
  },
  chew: (s) => s.noise({ type: 'lowpass', f: 650, dur: 0.07, gain: 0.12 }),
  clack: (s) => { s.tone({ f: 1800, dur: 0.03, gain: 0.22 }); s.noise({ type: 'highpass', f: 3000, dur: 0.015, gain: 0.25 }); },
  strain: (s) => s.noise({ type: 'bandpass', f: 600, q: 8, dur: 0.4, gain: 0.1, attack: 0.1 }),
  flap: (s) => s.noise({ type: 'lowpass', f: 1300, f2: 400, dur: 0.11, gain: 0.3 }),
  punch: (s) => { s.noise({ type: 'lowpass', f: 900, dur: 0.07, gain: 0.35 }); s.tone({ f: 160, f2: 60, dur: 0.1, gain: 0.35 }); },
  key: (s) => { s.noise({ type: 'highpass', f: 2200, dur: 0.02, gain: 0.15 }); s.tone({ f: 1100 + 200 * s.random(), dur: 0.012, gain: 0.04 }); },
  zap: (s) => {
    s.tone({ f: 120, dur: 0.45, type: 'sawtooth', gain: 0.12 });
    s.tone({ f: 243, dur: 0.45, type: 'square', gain: 0.06 });
    s.noise({ type: 'highpass', f: 3000, dur: 0.4, gain: 0.15 });
  },
  chime: (s) => { s.tone({ f: 880, dur: 0.25, gain: 0.12 }); s.tone({ f: 1320, dur: 0.3, gain: 0.1, at: 0.06 }); },
  scrape: (s) => s.noise({ type: 'bandpass', f: 520, q: 2, dur: 0.3, gain: 0.12, attack: 0.05 }),
  boing: (s) => s.tone({ f: 300, f2: 950, dur: 0.25, gain: 0.2 }),
  hop: (s) => s.tone({ f: 330, f2: 520, dur: 0.08, type: 'triangle', gain: 0.07 }),
};

export const SOUND_NAMES = Object.keys(RECIPES);

export class Sfx {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
    this.failed = false;
    this.warned = new Set();
  }

  /** Plays sound `name` now (`gain` scales it). Does nothing while disabled or without an audio device. */
  play(name, { gain = 1 } = {}) {
    if (!this.enabled || this.failed) return;
    const recipe = RECIPES[name];
    if (!recipe) {
      if (!this.warned.has(name)) { this.warned.add(name); console.error(`Unknown sound "${name}"`); }
      return;
    }
    if (!this.#ready()) return;
    const out = this.ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master);
    recipe(this.#voice(out, this.ctx.currentTime + 0.005));
  }

  #ready() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      const length = this.ctx.sampleRate * NOISE_SECONDS;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (err) {
      this.failed = true;
      console.error('Sound effects are off: no audio', err);
      return false;
    }
  }

  /** The building blocks a recipe gets: `noise` (filtered noise burst) and `tone` (oscillator), both with a decay. */
  #voice(out, start) {
    const ctx = this.ctx;
    const envelope = (node, { at = 0, dur, gain, attack = 0.005 }) => {
      const g = ctx.createGain(), t0 = start + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(attack, dur * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      node.connect(g).connect(out);
      return t0;
    };
    return {
      random: this.random,
      noise: ({ type = 'bandpass', f = 1000, f2 = f, q = 1, ...env }) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        src.connect(filter);
        const t0 = envelope(filter, env);
        filter.frequency.setValueAtTime(f, t0);
        filter.frequency.exponentialRampToValueAtTime(f2, t0 + env.dur);
        src.start(t0, this.random() * (NOISE_SECONDS - env.dur - 0.1));
        src.stop(t0 + env.dur + 0.02);
      },
      tone: ({ f, f2 = f, type = 'sine', ...env }) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        const t0 = envelope(osc, env);
        osc.frequency.setValueAtTime(f, t0);
        osc.frequency.exponentialRampToValueAtTime(f2, t0 + env.dur);
        osc.start(t0);
        osc.stop(t0 + env.dur + 0.02);
      },
    };
  }
}

/** Recipes run against a recorder instead of WebAudio: for tests (every recipe must be valid). */
export function recordRecipe(name) {
  const calls = [];
  const voice = { random: () => 0.5, noise: (o) => calls.push({ kind: 'noise', ...o }), tone: (o) => calls.push({ kind: 'tone', ...o }) };
  RECIPES[name](voice);
  return calls;
}
