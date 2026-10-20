import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { footprint } from '../../core/bricks/inspect';
import { allBricks } from '../../core/commands/handlers/assets';
import type { Conversation } from '../../core/dialogue/schema';
import type { Effect } from '../../core/effects/schema';
import type { ProjectStore } from '../../core/project/store';
import type { Screen } from '../../core/schema';
import { ParticleSystem } from '../../engine/effects/particles';
import { screenScale } from '../../engine/ui/layout';
import { ScreenView } from '../../engine/ui/ScreenRenderer';
import type { EditorState } from '../state';
import { artFont, artUrl } from '../workspaces/screens/art/render';
import { SAMPLE } from '../workspaces/screens/model';

/**
 * P23 previews: small pictures for the game's things wherever they are listed or picked — an effect that
 * plays when the pointer is over it, a screen drawn small, a map seen from above. Pictures are aria-hidden
 * (the name next to them is what is read out) and never take clicks.
 */

// ---------- effects ----------

const seeded = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** iso projection of a particle position, studs → canvas units (y up) */
const iso = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.87, (x + z) * 0.5 - y];

/** how far into its life an effect looks most like itself (a burst just after it breaks, a stream once full) */
const peakOf = (e: Effect) => (e.mode === 'burst' ? Math.min(0.5, e.life[1] * 0.3) : Math.min(1.5, e.life[1]));

/** Draws the effect's particles at time `t` onto a 2D canvas, framed to fit. */
export function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, t: number, size: number, seed = 7) {
  const fx = new ParticleSystem(600, seeded(seed));
  fx.play(e, [0, 0, 0], { forward: [1, 0, 0] });
  const dt = 1 / 30;
  for (let s = 0; s < t; s += dt) fx.step(dt, (_x, y) => y < -0.01);
  drawSystem(ctx, fx, e, size);
  return fx.count;
}

/**
 * An effect's picture: still (at its most typical moment) until the pointer is over it or `play` is set,
 * then it plays over and over.
 */
export function EffectThumb({ effect, size = 32, play = false }: { effect: Effect; size?: number; play?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const on = hover || play;
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const px = size * 2;
    if (!on) {
      try {
        drawEffect(ctx, effect, peakOf(effect), px);
      } catch {
        /* an effect mid-edit draws nothing */
      }
      cv.dataset.moving = '';
      return;
    }
    // playing: one particle system stepped frame by frame, started again a moment after it is over
    let fx = new ParticleSystem(600, seeded(7));
    let raf = 0;
    let last = performance.now();
    let rest = 0;
    const start = () => {
      fx = new ParticleSystem(600, seeded(7));
      fx.play(effect, [0, 0, 0], { forward: [1, 0, 0] });
    };
    start();
    const loopFor = effect.mode === 'stream' ? Math.min(3, effect.duration || 3) : effect.life[1] + 0.3;
    let age = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      age += dt;
      if (age > loopFor) {
        rest += dt;
        if (rest > 0.35) {
          rest = 0;
          age = 0;
          start();
        }
      }
      fx.step(dt, (_x, y) => y < -0.01);
      try {
        drawSystem(ctx, fx, effect, px);
      } catch {
        /* keep the last picture */
      }
      cv.dataset.particles = String(fx.count);
    };
    raf = requestAnimationFrame(frame);
    cv.dataset.moving = 'true';
    return () => cancelAnimationFrame(raf);
  }, [effect, on, size]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointing at the picture plays it; it is only a picture (hidden from readers)
    <span
      class={`fx-thumb ${on ? 'moving' : ''}`}
      aria-hidden="true"
      style={{ width: `${size}px`, height: `${size}px` }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: `${size}px`, height: `${size}px` }} />
    </span>
  );
}

/** draws a running particle system the way drawEffect frames it */
function drawSystem(ctx: CanvasRenderingContext2D, fx: ParticleSystem, e: Effect, size: number) {
  ctx.clearRect(0, 0, size, size);
  const reach = Math.max(1.2, Math.min(9, (e.speed[1] * e.life[1] * 0.55) / (1 + e.drag * 0.6) + e.radius + 0.4));
  const k = (size * 0.42) / reach;
  const cy = e.direction === 'down' ? size * 0.18 : e.gravity < 0 || e.direction === 'up' ? size * 0.78 : size * 0.55;
  for (const b of fx.batches()) {
    for (let i = 0; i < b.count; i++) {
      const o = i * 6;
      const [px, py] = iso(b.data[o]!, b.data[o + 1]!, b.data[o + 2]!);
      const rgb = [b.data[o + 3]!, b.data[o + 4]!, b.data[o + 5]!].map((v) =>
        Math.round(Math.max(0, Math.min(1, v)) * 255),
      );
      const s = Math.max(2.5, b.size * k * 1.8);
      ctx.fillStyle = `rgb(${rgb.join(',')})`;
      ctx.fillRect(size / 2 + px * k - s / 2, cy + py * k - s / 2, s, s);
    }
  }
}

// ---------- screens ----------

/** A screen drawn small, with sample values in its texts ({hp} shows 2), so lists show what each one looks like. */
export function ScreenThumb({ ed, screen, width = 64 }: { ed: EditorState; screen: Screen; width?: number }) {
  const h = Math.round((width * 9) / 16);
  const scale = screenScale(width, h);
  return (
    <span class="scr-thumb" aria-hidden="true" inert style={{ width: `${width}px`, height: `${h}px` }}>
      <ScreenView
        screen={screen}
        scale={scale}
        host={{
          lookup: (n) => SAMPLE[n] ?? `{${n}}`,
          run: () => {},
          sound: () => {},
          media: (ref) => ed.media?.url(ref),
          art: (id) => artUrl(ed, id),
          font: (ref) => artFont(ed, ref),
          touch: false,
        }}
      />
    </span>
  );
}

// ---------- maps ----------

const mapCache = new Map<string, string>();
const shadeHex = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c.join(',')})`;
};

/** A map seen from above: the colour of the top brick on every stud, higher ground lighter. Cached per change. */
export function drawMap(store: ProjectStore, mapId: string, size: number, rev: number): string {
  const key = `${mapId}|${size}|${rev}`;
  const hit = mapCache.get(key);
  if (hit !== undefined) return hit;
  const bricks = allBricks(store, mapId);
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#2b3a2f';
  ctx.fillRect(0, 0, size, size);
  if (bricks.length) {
    const top = new Map<string, { y: number; c: string }>();
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let ymax = 1;
    for (const b of bricks) {
      const [w, d] = footprint(b);
      const y = b.y + (b.type.startsWith('brick') ? 3 : 1);
      ymax = Math.max(ymax, y);
      for (let i = 0; i < w; i++)
        for (let j = 0; j < d; j++) {
          const k = `${b.x + i},${b.z + j}`;
          const cur = top.get(k);
          if (!cur || cur.y < y) top.set(k, { y, c: b.color });
        }
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x + w);
      z0 = Math.min(z0, b.z);
      z1 = Math.max(z1, b.z + d);
    }
    const span = Math.max(x1 - x0, z1 - z0, 8);
    const k = size / span;
    const ox = (size - (x1 - x0) * k) / 2;
    const oz = (size - (z1 - z0) * k) / 2;
    for (const [p, v] of top) {
      const [x, z] = p.split(',').map(Number) as [number, number];
      ctx.fillStyle = shadeHex(v.c, 0.7 + (0.45 * v.y) / ymax);
      ctx.fillRect(ox + (x - x0) * k, oz + (z - z0) * k, Math.ceil(k), Math.ceil(k));
    }
  }
  const url = cv.toDataURL();
  mapCache.set(key, url);
  return url;
}

export function MapThumb({
  store,
  mapId,
  size = 48,
  rev = 0,
}: {
  store: ProjectStore;
  mapId: string;
  size?: number;
  rev?: number;
}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    // drawn after the first paint: a big map takes a moment
    const t = setTimeout(() => setUrl(drawMap(store, mapId, size * 2, rev)), 0);
    return () => clearTimeout(t);
  }, [mapId, size, rev]);
  return (
    <span class="map-thumb" aria-hidden="true" style={{ width: `${size}px`, height: `${size}px` }}>
      {url ? <img src={url} alt="" width={size} height={size} /> : null}
    </span>
  );
}

// ---------- conversations ----------

/** The first lines of a conversation, as a short preview text (“Old Tom: Hello there! …”). */
export function conversationPreview(doc: Conversation | undefined, nameOf: (who: string) => string, max = 90): string {
  const lines = (doc?.sections ?? []).flatMap((s) => s.steps).filter((x) => x.k === 'line');
  const text = lines
    .slice(0, 2)
    .map((l) => (l.who ? `${nameOf(l.who)}: ${l.text}` : l.text))
    .join(' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// ---------- music ----------

/** the music being auditioned from a list (one at a time), so its ▶ turns into ■ */
const auditioning = signal<string | null>(null);

/** ▶ plays a music (it keeps playing: music loops), ■ stops it; another ▶ switches to that one. */
export function MusicListen({ ed, id, name }: { ed: EditorState; id: string; name: string }) {
  const on = auditioning.value === id;
  return (
    <button
      type="button"
      class={`btn icon listen ${on ? 'on' : ''}`}
      aria-label={on ? `Stop ${name}` : `Listen to ${name}`}
      aria-pressed={on}
      data-tip={on ? `Stop ${name}` : `Listen to ${name}`}
      onClick={(e) => {
        e.preventDefault();
        auditioning.value = on ? null : id;
        ed.audio.previewMusic(on ? null : id);
      }}
    >
      {on ? '■' : '▶'}
    </button>
  );
}
