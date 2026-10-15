import { useEffect, useState } from 'preact/hooks';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { OrbitCamera } from '../../../engine/render/camera';
import { Renderer } from '../../../engine/render/renderer';
import { FRAGMENT } from '../../../engine/render/shaders';

/**
 * P32: small pictures of characters (presets and your own), for the Character studio's pick lists. One hidden
 * 3D view draws them one at a time and keeps each picture, so a list of twenty characters still uses a single
 * drawing context.
 */
const W = 96;
const H = 120;
const cache = new Map<string, string>();
const waiting = new Map<string, { profile: Record<string, unknown>; done: ((url: string) => void)[] }>();
let shared: {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  chars: { begin(...a: unknown[]): void; draw(...a: unknown[]): void };
  cam: OrbitCamera;
} | null = null;
let failed = false;
let busy = false;

function setup() {
  if (shared || failed) return shared;
  try {
    const canvas = document.createElement('canvas');
    // the renderer sizes the picture from the canvas's size on the page: keep it there, out of sight
    Object.assign(canvas.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${W}px`,
      height: `${H}px`,
      pointerEvents: 'none',
    });
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const renderer = new Renderer(canvas);
    const L = legacyRuntime();
    renderer.floor = true;
    renderer.skySample = L.SkyCycle.sample('day', 0, false, false);
    const chars = L.CharacterModel.create(renderer.gl, FRAGMENT);
    const cam = new OrbitCamera();
    cam.target = [0, 1.75, 0];
    cam.baseDistance = 7;
    cam.pitch = 0.12;
    cam.yaw = 0.35;
    cam.fov = 0.8;
    shared = { canvas, renderer, chars, cam };
  } catch {
    failed = true;
  }
  return shared;
}

function draw(profile: Record<string, unknown>): string {
  const s = setup();
  if (!s) return '';
  const L = legacyRuntime();
  const state = { ...L.StudioAnimations.sample('still', 0, profile).state, heading: 0 };
  s.renderer.render(s.cam.frame(), s.cam.target, [], [], [], (mvp, eye) => {
    s.chars.begin(mvp, eye, s.renderer.skySample);
    s.chars.draw(profile, state, true, false);
  });
  // read in the same task as the drawing, before the browser clears it
  return s.canvas.toDataURL('image/png');
}

/** Draws the waiting pictures one per frame, so opening a long list never stalls the editor. */
function pump() {
  if (busy) return;
  busy = true;
  requestAnimationFrame(() => {
    busy = false;
    const next = waiting.entries().next().value;
    if (!next) return;
    const [key, job] = next;
    waiting.delete(key);
    let url = '';
    try {
      url = draw(job.profile);
    } catch {
      /* a look the model cannot draw gets no picture */
    }
    cache.set(key, url);
    for (const f of job.done) f(url);
    if (waiting.size) pump();
  });
}

/** The picture of a character's look ('' while it is being drawn, or if it cannot be). */
export function useCharacterThumb(profile: Record<string, unknown>): string {
  const key = JSON.stringify(profile);
  const [url, setUrl] = useState(() => cache.get(key) ?? '');
  useEffect(() => {
    const hit = cache.get(key);
    if (hit !== undefined) {
      setUrl(hit);
      return;
    }
    let live = true;
    const job = waiting.get(key) ?? { profile, done: [] };
    job.done.push((u) => live && setUrl(u));
    waiting.set(key, job);
    pump();
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}

export function CharacterThumb({ profile, size = 40 }: { profile: Record<string, unknown>; size?: number }) {
  const url = useCharacterThumb(profile);
  return (
    <span
      class="char-thumb"
      aria-hidden="true"
      style={{ width: `${size}px`, height: `${Math.round((size * H) / W)}px` }}
    >
      {url ? <img src={url} alt="" /> : null}
    </span>
  );
}
