import { useEffect, useState } from 'preact/hooks';
import type { Clip } from '../../../core/schema';
import { rigPose } from '../../../engine/character/animator';
import { sampleParams, sampleTrack } from '../../../engine/character/routine';
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
const waiting = new Map<
  string,
  { profile: Record<string, unknown>; view: ThumbView; pose?: ThumbPose; done: ((url: string) => void)[] }
>();

/** Which part of the character a picture shows: the whole figure, or a close-up of where a choice is worn. */
export type ThumbView = 'full' | 'head' | 'torso' | 'legs' | 'back';
/** P32: the character drawn in a clip's pose at a moment (a clip or gesture picker shows what it does) */
export type ThumbPose = { clip: Pick<Clip, 'tracks' | 'length'> & Partial<Pick<Clip, 'id'>>; time: number };

/** The moment a clip moves the most (furthest from its start): the picture that says what the clip does. */
export function peakTime(clip: Pick<Clip, 'tracks' | 'length'>): number {
  let best = clip.length / 2;
  let most = -1;
  for (let i = 1; i <= 12; i++) {
    const t = (clip.length * i) / 12;
    let d = 0;
    for (const tr of clip.tracks) d += Math.abs(sampleTrack(tr.keys, t) - sampleTrack(tr.keys, 0));
    if (d > most + 1e-6) {
      most = d;
      best = t;
    }
  }
  return best;
}
const VIEWS: Record<ThumbView, { target: [number, number, number]; distance: number; yaw: number; pitch: number }> = {
  full: { target: [0, 1.75, 0], distance: 7, yaw: 0.35, pitch: 0.12 },
  head: { target: [0, 3.95, 0], distance: 3.5, yaw: 0.3, pitch: 0.1 },
  torso: { target: [0, 2.5, 0], distance: 4.2, yaw: 0.35, pitch: 0.1 },
  legs: { target: [0, 1.0, 0], distance: 4.2, yaw: 0.35, pitch: 0.18 },
  back: { target: [0, 2.3, 0], distance: 5.6, yaw: Math.PI - 0.5, pitch: 0.12 },
};
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

function draw(profile: Record<string, unknown>, view: ThumbView, pose?: ThumbPose): string {
  const s = setup();
  if (!s) return '';
  const v = VIEWS[view];
  s.cam.target = [...v.target];
  s.cam.baseDistance = v.distance;
  s.cam.yaw = v.yaw;
  s.cam.pitch = v.pitch;
  const L = legacyRuntime();
  const still = { ...L.StudioAnimations.sample('still', 0, profile).state, heading: 0 };
  const state = pose
    ? {
        ...still,
        studioPose: rigPose(sampleParams(pose.clip, pose.time), pose.clip as Clip),
        studioProgress: 0,
        studioFist: false,
      }
    : still;
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
      url = draw(job.profile, job.view, job.pose);
    } catch {
      /* a look the model cannot draw gets no picture */
    }
    cache.set(key, url);
    for (const f of job.done) f(url);
    if (waiting.size) pump();
  });
}

/** The picture of a character's look ('' while it is being drawn, or if it cannot be). */
export function useCharacterThumb(
  profile: Record<string, unknown>,
  view: ThumbView = 'full',
  pose?: ThumbPose,
): string {
  const key = `${view}|${JSON.stringify(profile)}${pose ? `|${pose.time}|${JSON.stringify(pose.clip.tracks)}` : ''}`;
  const [url, setUrl] = useState(() => cache.get(key) ?? '');
  useEffect(() => {
    const hit = cache.get(key);
    if (hit !== undefined) {
      setUrl(hit);
      return;
    }
    let live = true;
    const job = waiting.get(key) ?? { profile, view, ...(pose ? { pose } : {}), done: [] };
    job.done.push((u) => live && setUrl(u));
    waiting.set(key, job);
    pump();
    return () => {
      live = false;
    };
  }, [key]);
  return url;
}

export function CharacterThumb({
  profile,
  size = 40,
  view = 'full',
  pose,
}: {
  profile: Record<string, unknown>;
  size?: number;
  view?: ThumbView;
  pose?: ThumbPose;
}) {
  const url = useCharacterThumb(profile, view, pose);
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

/**
 * P32: how far a track's picture moves its joint from where it starts, so “+ Track…” shows what each track
 * does (an arm’s z lifts it sideways, an elbow bends…). Values are the rig's own (radians, or studs for the body).
 */
const DEMO: Record<string, number> = {
  'root.height': 1.2,
  'root.forward': 0.8,
  'root.pitch': 0.5,
  'root.turn': 0.9,
  'root.stance': 0.9,
  'hips.turn': 0.7,
  'torso.lean': 0.45,
  'torso.roll': 0.4,
  'head.turn': 0.9,
  'Arm.x': -1.4,
  'Arm.y': 0.9,
  'Arm.z': 1.7,
  'Forearm.bend': -1.7,
  'Leg.x': -1.0,
  'Leg.y': 0.6,
  'Leg.z': 0.5,
  'Shin.bend': 1.3,
};

/** The picture's pose for one track, or null for a track with nothing to show (the prop's grip, “free”). */
export function trackPose(bone: string, prop: string): ThumbPose | null {
  const side = bone.startsWith('left') ? -1 : bone.startsWith('right') ? 1 : 0;
  const part = side ? bone.replace(/^(left|right)/, '') : bone;
  const v = DEMO[`${part}.${prop}`];
  if (v === undefined) return null;
  // sideways turns (y, z) go the other way on the left, like ⇆ Mirror
  const value = side < 0 && (prop === 'y' || prop === 'z') ? -v : v;
  return { clip: { length: 1, tracks: [{ bone, prop, keys: [[0, value, 'linear']] }] }, time: 0 };
}
