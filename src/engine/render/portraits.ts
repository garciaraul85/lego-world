import type { ResolvedBody } from '../../core/character/resolve';
import { bodyBounds, bodyOverlays, bodyPose, bodyWorld } from '../character/body-anim';
import { legacyRuntime } from '../legacy/runtime-modules';
import { OrbitCamera } from './camera';
import { Renderer } from './renderer';
import { V68_FRAGMENT } from './shaders';

/**
 * P22 part 4: dialogue portraits — the speaker's own head, with the face of the line's mood, drawn once in a
 * hidden view and kept as a picture. A request that is not drawn yet returns null (the box shows the plain
 * brick face meanwhile) and is drawn on the next frame.
 */
const SIZE = 128;
const cache = new Map<string, string>();
const waiting = new Map<string, { profile: Record<string, unknown>; body: ResolvedBody | null }>();
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
    Object.assign(canvas.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      pointerEvents: 'none',
    });
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const renderer = new Renderer(canvas);
    const L = legacyRuntime();
    renderer.floor = false;
    renderer.skySample = L.SkyCycle.sample('day', 0, false, false);
    const chars = L.CharacterModel.create(renderer.gl, V68_FRAGMENT);
    const cam = new OrbitCamera();
    cam.fov = 0.7;
    shared = { canvas, renderer, chars, cam };
  } catch {
    failed = true;
  }
  return shared;
}

function draw(profile: Record<string, unknown>, body: ResolvedBody | null): string {
  const s = setup();
  if (!s) return '';
  if (body) {
    const { min, max } = bodyBounds(body);
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    s.cam.target = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    s.cam.baseDistance = Math.max(3, size * 1.6);
    s.cam.yaw = 0.5;
    s.cam.pitch = 0.2;
    s.renderer.render(
      s.cam.frame(),
      s.cam.target,
      bodyOverlays(body, bodyPose(body, null), bodyWorld(body, { x: 0, y: 0, z: 0, heading: 0 }, null)),
    );
    return s.canvas.toDataURL('image/png');
  }
  const L = legacyRuntime();
  s.cam.target = [0, 3.95, 0];
  s.cam.baseDistance = 3.2;
  s.cam.yaw = 0.25;
  s.cam.pitch = 0.08;
  const state = { ...L.StudioAnimations.sample('still', 0, profile).state, heading: 0 };
  s.renderer.render(s.cam.frame(), s.cam.target, [], [], [], (mvp, eye) => {
    s.chars.begin(mvp, eye, s.renderer.skySample);
    s.chars.draw(profile, state, true, false);
  });
  return s.canvas.toDataURL('image/png');
}

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
      url = draw(job.profile, job.body);
    } catch {
      /* a look the model cannot draw gets no portrait */
    }
    cache.set(key, url);
    if (waiting.size) pump();
  });
}

/** The portrait of this look (a minifig profile, or a body plan): its picture, or null until it is drawn. */
export function portrait(profile: Record<string, unknown>, body: ResolvedBody | null = null): string | null {
  const key = body ? `b|${JSON.stringify(body)}` : `m|${JSON.stringify(profile)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit || null;
  if (typeof document === 'undefined') return null;
  if (!waiting.has(key)) {
    if (cache.size > 120) cache.delete(cache.keys().next().value!);
    waiting.set(key, { profile, body });
  }
  pump();
  return null;
}
