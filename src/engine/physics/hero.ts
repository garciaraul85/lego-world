import type { HeroState, MoveInput } from '../legacy/runtime-modules';
import type { PhysicsWorld } from './physics';

/**
 * Milestone 2b, 10b part 3: the hero walked by the physics engine. The same walking, running, jumping and
 * landing as v68's controller (the same speeds, jump, gravity, coyote time and jump buffer, the same animation
 * blends), but the physics engine moves the body: bricks block it, it steps up a plate, it pushes loose things,
 * stands on them and rides them (a crate floating down a river).
 *
 * The hero's state stays v68's (the game, the camera and the animations read it); this only moves it.
 */

/** v68: the hero's gravity (bricks and loose things fall at the world's) */
export const HERO_GRAVITY = 22;
/** v68: the hero's body against bricks (a capsule 0.4 across and 4.02 high, times the character's size) */
export const HERO_RADIUS = 0.4;
export const HERO_HEIGHT = 4.02;

export type WalkOptions = {
  /** the character's size (v68 scaleOf) */
  scale: number;
  /** a swing in progress slows and steers like v68 (from the weapon: inertia 0–1, mass) */
  weapon?: { inertia?: number; mass: number; duration: number } | null;
};

export function walkHero(
  ph: PhysicsWorld,
  s: HeroState,
  input: MoveInput & { speedScale?: number; jumpSpeed?: number },
  dt0: number,
  yaw: number,
  opt: WalkOptions,
): void {
  const dt = Math.max(0, Math.min(0.06, dt0));
  const st = s as HeroState & Record<string, number | boolean | undefined>;
  st.landing = Math.max(0, Number(st.landing ?? 0) - dt);
  st.coyote = s.grounded ? 0.1 : Math.max(0, Number(st.coyote ?? 0) - dt);
  st.jumpBuffer = input.jump ? 0.12 : Math.max(0, Number(st.jumpBuffer ?? 0) - dt);
  let mx = input.x || 0;
  let mz = input.z || 0;
  const l = Math.hypot(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  // v68: right and forward of the camera
  const dx = Math.cos(yaw) * mx - Math.sin(yaw) * mz;
  const dz = -Math.sin(yaw) * mx - Math.cos(yaw) * mz;
  const w = s.attack > 0 ? (opt.weapon ?? null) : null;
  const progress = w ? 1 - s.attack / (Number(st.attackDuration) || w.duration) : 0;
  const moveScale = w?.inertia ? 1 - w.inertia * Math.sin(Math.PI * progress) : 1;
  s.running = !!input.run;
  const travel = (s.running ? 7.8 : 4) * (input.speedScale || 1);
  s.speed = Math.hypot(dx, dz) * travel * moveScale;
  if (s.speed > 0.01) {
    const heading = Math.atan2(dx, dz);
    if (w?.inertia) {
      const delta = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
      const limit = (10 - w.mass) * dt;
      s.heading += Math.max(-limit, Math.min(limit, delta));
    } else s.heading = heading;
  }
  const jump = () => {
    s.vy = input.jumpSpeed || 9.5;
    s.grounded = false;
    st.airTime = 0;
    st.landing = 0;
    st.jumpBuffer = 0;
    st.coyote = 0;
  };
  if (Number(st.jumpBuffer) > 0 && (s.grounded || Number(st.coyote) > 0)) jump();
  // gravity, then one move through the world
  const vy0 = s.vy;
  s.vy -= HERO_GRAVITY * dt;
  const r = ph.walk(
    { x: s.x, y: s.y, z: s.z },
    { x: dx * travel * moveScale * dt, y: ((vy0 + s.vy) / 2) * dt, z: dz * travel * moveScale * dt },
    HERO_RADIUS * opt.scale,
    HERO_HEIGHT * opt.scale,
  );
  s.x = r.x;
  s.z = r.z;
  s.y = Math.min(320, r.y);
  if (r.blockedUp && s.vy > 0) s.vy = 0;
  if (r.grounded && s.vy <= 0) {
    if (!s.grounded && s.vy < -2) {
      st.landing = 0.24;
      st.airTime = 0;
    }
    s.vy = 0;
    s.grounded = true;
    // a jump pressed just before landing
    if (Number(st.jumpBuffer) > 0) jump();
  } else if (!r.grounded) s.grounded = false;
  if (!s.grounded) st.airTime = Number(st.airTime ?? 0) + dt;
  // v68's blends for the animations
  st.buildBlend = Math.max(0, Math.min(1, Number(st.buildBlend ?? 0) + (s.building ? dt * 3.5 : -dt * 3.5)));
  st.buildTime = Number(st.buildBlend) > 0 ? Number(st.buildTime ?? 0) + dt : 0;
  const blend = 1 - Math.exp(-dt * 12);
  const gait = Number(st.gaitSpeed ?? 0);
  st.gaitSpeed = gait + (s.speed - gait) * blend;
  const mb = Number(st.moveBlend ?? 0);
  st.moveBlend = mb + ((s.speed > 0.01 ? 1 : 0) - mb) * blend;
  const rb = Number(st.runBlend ?? 0);
  st.runBlend = rb + ((s.running && s.speed > 0.01 ? 1 : 0) - rb) * blend;
  st.phase = Number(st.phase ?? 0) + Math.min(12, Number(st.gaitSpeed)) * dt * 1.85;
  s.attack = Math.max(0, s.attack - dt);
}
