import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { expandInstances } from '../../core/assets/instances';
import { footprint } from '../../core/bricks/inspect';
import type { Conversation } from '../../core/dialogue/schema';
import type { Effect } from '../../core/effects/schema';
import type { ScreenEffect } from '../../core/effects/screen';
import type { ProjectStore } from '../../core/project/store';
import type { Screen } from '../../core/schema';
import { BRICK_STRIDE, type Chunk, chunkRows, paths } from '../../core/schema';
import { ParticleSystem } from '../../engine/effects/particles';
import { ScreenFx, screenEffectLength } from '../../engine/effects/screen';
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

const mapCache = new Map<string, { files: unknown[]; url: string }>();
const shadeHex = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c.join(',')})`;
};

/** A map seen from above: the colour of the top brick on every stud, higher ground lighter. Cached per change. */
/**
 * A map seen from above: each pixel shows the colour of the highest brick in it, lighter when higher.
 * P27 part 3c: drawn straight from the packed chunks into a pixel grid (a million bricks in tens of ms), and
 * kept until one of the map's own files changes (not every edit anywhere in the project).
 */
export function drawMap(store: ProjectStore, mapId: string, size: number, _rev?: number): string {
  const files = mapFiles(store, mapId);
  const key = `${mapId}|${size}`;
  const hit = mapCache.get(key);
  if (hit && hit.files.length === files.length && hit.files.every((f, i) => f === files[i])) return hit.url;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#2b3a2f';
  ctx.fillRect(0, 0, size, size);
  // the area the bricks cover, from the chunk keys (whole chunks) and the placed copies
  const chunks = store.list(paths.chunkDir(mapId));
  const extra = expandInstances(store, mapId).flatMap((e) => e.bricks);
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const p of chunks) {
    const c = store.get<Chunk>(p)!;
    x0 = Math.min(x0, c.cx * 32);
    x1 = Math.max(x1, c.cx * 32 + 32);
    z0 = Math.min(z0, c.cz * 32);
    z1 = Math.max(z1, c.cz * 32 + 32);
  }
  for (const b of extra) {
    x0 = Math.min(x0, b.x);
    x1 = Math.max(x1, b.x + 8);
    z0 = Math.min(z0, b.z);
    z1 = Math.max(z1, b.z + 8);
  }
  if (Number.isFinite(x0)) {
    const span = Math.max(x1 - x0, z1 - z0, 8);
    const k = size / span;
    const top = new Int16Array(size * size).fill(-1);
    const col = new Int32Array(size * size);
    let ymax = 1;
    const put = (x: number, z: number, w: number, d: number, y: number, rgb: number) => {
      const px0 = Math.floor((x - x0) * k);
      const pz0 = Math.floor((z - z0) * k);
      const px1 = Math.max(px0 + 1, Math.ceil((x + w - x0) * k));
      const pz1 = Math.max(pz0 + 1, Math.ceil((z + d - z0) * k));
      for (let px = px0; px < px1 && px < size; px++)
        for (let pz = pz0; pz < pz1 && pz < size; pz++) {
          const i = pz * size + px;
          if (y >= top[i]!) {
            top[i] = y;
            col[i] = rgb;
          }
        }
      if (y > ymax) ymax = y;
    };
    const hexRgb = (h: string) => Number.parseInt(h.slice(1), 16);
    for (const p of chunks) {
      const c = store.get<Chunk>(p)!;
      const r = chunkRows(c);
      const dims = c.palette.types.map((t) => {
        const m = /(\d+)x(\d+)$/.exec(t)!;
        return [Number(m[1]), Number(m[2]), t.startsWith('brick') ? 3 : 1] as const;
      });
      const colors = c.palette.colors.map(hexRgb);
      for (let o = 0; o < r.length; o += BRICK_STRIDE) {
        const [rows, cols, h] = dims[r[o]!]!;
        const turned = r[o + 4]! % 2 === 1;
        put(r[o + 1]!, r[o + 3]!, turned ? rows : cols, turned ? cols : rows, r[o + 2]! + h, colors[r[o + 5]!]!);
      }
    }
    for (const b of extra) {
      const [w, d] = footprint(b);
      put(b.x, b.z, w, d, b.y + (b.type.startsWith('brick') ? 3 : 1), hexRgb(b.color));
    }
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < size * size; i++) {
      if (top[i]! < 0) continue;
      const f = 0.7 + (0.45 * top[i]!) / ymax;
      const c = col[i]!;
      img.data[i * 4] = Math.min(255, ((c >> 16) & 255) * f);
      img.data[i * 4 + 1] = Math.min(255, ((c >> 8) & 255) * f);
      img.data[i * 4 + 2] = Math.min(255, (c & 255) * f);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const url = cv.toDataURL();
  mapCache.set(key, { files, url });
  return url;
}

/** the files a map's picture depends on (the same objects: unchanged, since files change by replacement) */
function mapFiles(store: ProjectStore, mapId: string): unknown[] {
  const out: unknown[] = [store.get(paths.instances(mapId))];
  for (const p of store.list(paths.chunkDir(mapId))) out.push(store.get(p));
  return out;
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

// ---------- screen effects ----------

/**
 * A screen effect's picture: a tiny scene (sky, ground, a brick and a ball rolling across) that the effect plays
 * on while the pointer is over it (or `play` is set): it shakes, flashes, fades; the ball stops for a hit-stop
 * and slows down in slow motion.
 */
export function ScreenEffectThumb({
  effect,
  width = 48,
  play = false,
  reduce = false,
}: {
  effect: ScreenEffect;
  width?: number;
  play?: boolean;
  /** as the player sees it with Reduce motion on */
  reduce?: boolean;
}) {
  const scene = useRef<HTMLSpanElement>(null);
  const ball = useRef<HTMLSpanElement>(null);
  const cover = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const on = hover || play;
  const h = Math.round((width * 9) / 16);
  useEffect(() => {
    const sc = scene.current;
    const b = ball.current;
    const cv = cover.current;
    if (!sc || !b || !cv) return;
    const reset = () => {
      sc.style.transform = '';
      cv.style.background = 'transparent';
      b.style.left = '30%';
      if (box.current) box.current.dataset.moving = '';
    };
    if (!on) {
      reset();
      return;
    }
    const fx = new ScreenFx();
    fx.reduceMotion = reduce;
    let x = 0.1;
    let raf = 0;
    let last = performance.now();
    let age = 0;
    const len = screenEffectLength(effect) + 0.6;
    fx.play(effect);
    if (box.current) box.current.dataset.moving = 'true';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      age += dt;
      if (age > len) {
        age = 0;
        fx.clear();
        fx.play(effect);
      }
      fx.step(dt);
      x = (x + dt * 0.45 * fx.speed()) % 1;
      const [dx, dy, r] = fx.shake();
      const k = width / 12;
      sc.style.transform = `translate(${dx * k}px, ${-dy * k}px) rotate(${r}rad)`;
      b.style.left = `${8 + x * 80}%`;
      const ls = fx.layers();
      const top = ls[ls.length - 1];
      cv.style.background = top ? top.color : 'transparent';
      cv.style.opacity = String(top ? Math.max(...ls.map((l) => l.alpha)) : 0);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      reset();
    };
  }, [effect, on, reduce]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointing at the picture plays it; it is only a picture (hidden from readers)
    <span
      ref={box}
      class={`sce-thumb ${on ? 'moving' : ''}`}
      aria-hidden="true"
      style={{ width: `${width}px`, height: `${h}px` }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <span ref={scene} class="sce-scene">
        <span class="sce-brick" />
        <span ref={ball} class="sce-ball" />
      </span>
      <span ref={cover} class="sce-cover" />
    </span>
  );
}
