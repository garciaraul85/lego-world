/**
 * Tiny offline synthesizer for the built-in audio pack (P5.2). Every built-in sound and music loop is
 * a recipe rendered to samples on first use, so the pack costs a few KB of code instead of audio files
 * and is CC0 by construction (see CREDITS.md).
 */

export type Wave = 'sine' | 'square' | 'saw' | 'tri' | 'noise';

export type Tone = {
  wave: Wave;
  /** start / end frequency in Hz (noise: f0 is the low-pass cutoff) */
  f0: number;
  f1?: number;
  /** start time and length in seconds */
  at?: number;
  dur: number;
  attack?: number;
  gain?: number;
  /** optional one-pole low-pass cutoff in Hz */
  lp?: number;
  /** tremolo: [rate Hz, depth 0..1] */
  trem?: [number, number];
};

export type SfxRecipe = { kind: 'sfx'; tones: Tone[]; seed?: number };
export type Track = {
  wave: Wave;
  gain: number;
  octave?: number;
  lp?: number;
  notes: Array<number | null>;
  len?: number;
};
/** 16 steps per bar; each note is a MIDI number held `len` steps (default 1) */
export type MusicRecipe = { kind: 'music'; bpm: number; bars: number; tracks: Track[] };
export type Recipe = SfxRecipe | MusicRecipe;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0x100000000) * 2 - 1;
  };
}

function osc(wave: Wave, phase: number, noise: () => number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(p * 2 * Math.PI);
    case 'square':
      return p < 0.5 ? 0.6 : -0.6;
    case 'saw':
      return (2 * p - 1) * 0.7;
    case 'tri':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'noise':
      return noise();
  }
}

function addTone(out: Float32Array, sr: number, t: Tone, noise: () => number) {
  const start = Math.floor((t.at ?? 0) * sr);
  const n = Math.floor(t.dur * sr);
  const attack = Math.max(1, Math.floor((t.attack ?? 0.005) * sr));
  const gain = t.gain ?? 0.5;
  const f1 = t.f1 ?? t.f0;
  const a = t.lp ? 1 - Math.exp((-2 * Math.PI * t.lp) / sr) : 1;
  let phase = 0;
  let y = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const k = i / n;
    const f = t.f0 * (f1 / t.f0) ** k;
    phase += f / sr;
    let v = osc(t.wave, phase, noise);
    if (t.wave === 'noise' && !t.lp) {
      // noise f0 is its brightness
      const na = 1 - Math.exp((-2 * Math.PI * f) / sr);
      y += (v - y) * na;
      v = y * 1.6;
    } else if (t.lp) {
      y += (v - y) * a;
      v = y;
    }
    const env = Math.min(1, i / attack) * (1 - k) ** 2;
    const trem = t.trem ? 1 - t.trem[1] * (0.5 + 0.5 * Math.sin((2 * Math.PI * t.trem[0] * i) / sr)) : 1;
    out[start + i]! += v * env * gain * trem;
  }
}

function renderMusic(r: MusicRecipe, sr: number): Float32Array {
  const stepSec = 60 / r.bpm / 4;
  const steps = r.bars * 16;
  const loopLen = Math.round(steps * stepSec * sr);
  const out = new Float32Array(loopLen + sr * 2);
  const noise = rng(7);
  for (const tr of r.tracks) {
    for (let s = 0; s < steps; s++) {
      const m = tr.notes[s % tr.notes.length];
      if (m === null || m === undefined) continue;
      const hz = midiHz(m + 12 * (tr.octave ?? 0));
      addTone(
        out,
        sr,
        {
          wave: tr.wave,
          f0: hz,
          at: s * stepSec,
          dur: stepSec * (tr.len ?? 1) * 0.98,
          attack: 0.01,
          gain: tr.gain,
          ...(tr.lp ? { lp: tr.lp } : {}),
        },
        noise,
      );
    }
  }
  // wrap the tail of notes that ring past the end back to the start, so the loop is seamless
  const loop = out.slice(0, loopLen);
  for (let i = loopLen; i < out.length; i++) loop[i - loopLen]! += out[i]!;
  return loop;
}

/** Renders a recipe to mono samples in [-1, 1]. Deterministic for a given sample rate. */
export function renderRecipe(r: Recipe, sr: number): Float32Array {
  if (r.kind === 'music') return normalize(renderMusic(r, sr), 0.7);
  const len = Math.max(...r.tones.map((t) => (t.at ?? 0) + t.dur));
  const out = new Float32Array(Math.ceil(len * sr) + 1);
  const noise = rng(r.seed ?? 1);
  for (const t of r.tones) addTone(out, sr, t, noise);
  return normalize(out, 0.85);
}

function normalize(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > peak) {
    const k = peak / m;
    for (let i = 0; i < x.length; i++) x[i]! *= k;
  }
  return x;
}

/** 16-bit PCM WAV of mono samples (for "Export sound" and tests). */
export function encodeWav(samples: Float32Array, sr: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 32767, true);
  return out;
}
