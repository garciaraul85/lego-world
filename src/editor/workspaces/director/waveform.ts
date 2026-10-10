import { BUILTIN_MEDIA, RECIPES, renderRecipe } from '../../../builtin/audio';
import type { AudioEngine } from '../../../engine/audio/AudioEngine';

const cache = new Map<string, Float32Array | null>();
const N = 64;

function peaks(samples: Float32Array): Float32Array {
  const out = new Float32Array(N);
  const step = Math.max(1, Math.floor(samples.length / N));
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(samples[j]!));
    out[i] = m;
  }
  return out;
}

/**
 * Peaks of a media file for timeline thumbnails (P6.3 waveform rows). Built-ins render instantly;
 * imported files decode through the audio engine and appear once ready (`onReady`).
 */
export function waveform(ref: string, audio: AudioEngine, onReady: () => void): Float32Array | null {
  if (cache.has(ref)) return cache.get(ref)!;
  const name = BUILTIN_MEDIA.get(ref as `sha256:${string}`);
  if (name) {
    const p = peaks(renderRecipe(RECIPES[name]!, 4000));
    cache.set(ref, p);
    return p;
  }
  cache.set(ref, null);
  if (audio.init())
    void audio.buffer(ref).then((b) => {
      if (!b) return;
      cache.set(ref, peaks(b.getChannelData(0)));
      onReady();
    });
  return null;
}

export function drawWave(canvas: HTMLCanvasElement, p: Float32Array, color: string) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  const bw = w / p.length;
  for (let i = 0; i < p.length; i++) {
    const a = Math.max(1, p[i]! * h * 0.9);
    g.fillRect(i * bw, (h - a) / 2, Math.max(1, bw - 1), a);
  }
}
