import { z } from 'zod';

/**
 * Step 11b (P13 swimming, moved before the puzzles): what water does to a character. Water is a box whose top is
 * the surface (a map's water items). A character whose feet are deeper than about half its height swims: it
 * floats with its head out, or dives under. Under the surface it holds its breath; with no air left it loses a
 * heart every two seconds until it comes up. Shallower water only slows it (wading).
 */
export type WaterBox = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** studs a second, across and deep */
  current: [number, number];
};

/** the game's swimming (Project › Movement): can the hero swim, and how long a breath lasts */
export const Swimming = z.strictObject({
  /** false: the hero sinks and walks along the bottom (the old way) */
  can: z.boolean(),
  /** seconds of air under water */
  breath: z.number().min(3).max(300),
});
export type Swimming = z.infer<typeof Swimming>;
export const SWIM_DEFAULTS: Swimming = { can: true, breath: 20 };

/** studs a second: on the surface, under it, and how fast it rises or sinks when told to */
export const SWIM_SPEED = 3.2;
export const DIVE_SPEED = 2.8;
export const RISE_SPEED = 3.4;
/** under water with nothing pressed it drifts up slowly */
export const DRIFT_UP = 1.6;
/** how deep (in body heights) water must reach before a character swims, and where it floats */
export const SWIM_DEPTH = 0.55;
export const FLOAT_DEPTH = 0.72;
/** water deeper than this (in body heights) slows walking */
export const WADE_DEPTH = 0.2;
/** seconds between hearts lost with no air */
export const DROWN_EVERY = 2;
/** a breath refills this many times faster than it runs out */
export const REFILL = 4;

/** the water box a point is in (the highest surface first), or null */
export function waterAt(list: readonly WaterBox[], x: number, y: number, z: number): WaterBox | null {
  let best: WaterBox | null = null;
  for (const w of list) {
    if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1 || y < w.y0 - 0.01 || y > w.y1) continue;
    if (!best || w.y1 > best.y1) best = w;
  }
  return best;
}

export type WaterMode = 'none' | 'wade' | 'swim';

/** what a character standing with its feet at y (height h) does in this water */
export function waterMode(w: WaterBox | null, feetY: number, h: number, can: boolean): WaterMode {
  if (!w) return 'none';
  const depth = w.y1 - feetY;
  if (depth <= WADE_DEPTH * h) return 'none';
  if (can && depth >= SWIM_DEPTH * h) return 'swim';
  return 'wade';
}

/** the feet's height when floating with the head out */
export const floatY = (w: WaterBox, h: number) => w.y1 - FLOAT_DEPTH * h;
/** the head is under the surface */
export const headUnder = (w: WaterBox | null, feetY: number, h: number) => !!w && feetY + 0.88 * h < w.y1;

export type Breath = { air: number; drownIn: number };

/** one step of holding breath: air runs out under water and comes back above it; no air hurts every few seconds */
export function breathe(b: Breath, under: boolean, max: number, dt: number): { breath: Breath; hearts: number } {
  if (!under) return { breath: { air: Math.min(max, b.air + REFILL * dt), drownIn: DROWN_EVERY }, hearts: 0 };
  const air = Math.max(0, b.air - dt);
  if (air > 0) return { breath: { air, drownIn: DROWN_EVERY }, hearts: 0 };
  const drownIn = b.drownIn - dt;
  return drownIn <= 0 ? { breath: { air, drownIn: DROWN_EVERY }, hearts: 1 } : { breath: { air, drownIn }, hearts: 0 };
}

/**
 * how a swimmer moves this step: across from the stick (camera-turned), up from Space, down from the dive key,
 * floating at the surface when neither, drifting up slowly under it; the current carries it
 */
export function swimStep(
  pos: { x: number; y: number; z: number },
  input: { x: number; z: number; up: boolean; down: boolean; speed?: number },
  w: WaterBox,
  h: number,
  yaw: number,
  dt: number,
): { dx: number; dy: number; dz: number; heading: number | null; speed: number; diving: boolean } {
  let mx = input.x || 0;
  let mz = input.z || 0;
  const l = Math.hypot(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  const ax = Math.cos(yaw) * mx - Math.sin(yaw) * mz;
  const az = -Math.sin(yaw) * mx - Math.cos(yaw) * mz;
  const top = floatY(w, h);
  const atSurface = pos.y >= top - 0.15;
  const speed = (atSurface ? SWIM_SPEED : DIVE_SPEED) * (input.speed ?? 1);
  let dy: number;
  if (input.down) dy = -RISE_SPEED * dt;
  else if (input.up) dy = Math.min(RISE_SPEED * dt, top - pos.y);
  else if (atSurface) dy = Math.max(-0.5 * dt, Math.min(2 * dt, top - pos.y));
  else dy = Math.min(DRIFT_UP * dt, top - pos.y);
  // never above the floating height, never below the bottom of the water
  const y = Math.max(w.y0, Math.min(top, pos.y + dy));
  return {
    dx: (ax * speed + w.current[0]) * dt,
    dy: y - pos.y,
    dz: (az * speed + w.current[1]) * dt,
    heading: Math.hypot(ax, az) > 0.01 ? Math.atan2(ax, az) : null,
    speed: Math.hypot(ax, az) * speed,
    diving: !atSurface || input.down,
  };
}
