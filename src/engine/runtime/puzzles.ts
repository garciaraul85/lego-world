import { MANTLE_RELEASE, MANTLE_SECONDS } from '../../builtin/clips/moves';
import type { Brick } from '../../core/bricks/codec';
import { footprint } from '../../core/bricks/inspect';
import { brickHeight } from '../../core/bricks/map-bricks';
import type { DamageType } from '../../core/combat/damage';
import {
  type DungeonItem,
  dungeonItem,
  type LockDef,
  lockItem,
  lockUses,
  type SwitchDef,
  switchHitBy,
} from '../../core/puzzles/puzzle';
import type { Asset } from '../../core/schema';
import type { HeroState } from '../legacy/runtime-modules';
import { GRAVITY, ICE_ON_GROUND, ICE_ON_ICE } from '../physics/physics';

/**
 * Step 12a: the puzzle parts at play: blocks the hero pushes and pulls square along the floor, switches (stepped
 * on, hit, pressed; they stay on, are held, run on a timer or toggle), locks opened by keys, pickups, and each
 * dungeon's own small keys, boss key, map and compass. Everything here is for this play only (saves keep the
 * moved blocks, the switches' states and the dungeon items).
 */
export type PuzzleObject = {
  inst: { id: string; pos: [number, number, number] | number[]; rot: number; idBase: number };
  def: Asset;
  bricks: Brick[];
  state: string;
};

export type PuzzleHost<T extends PuzzleObject = PuzzleObject> = {
  readonly heroState: HeroState;
  readonly clock: number;
  mapId(): string;
  dungeon(): boolean;
  /** the objects near a point */
  near(x: number, z: number, r: number): readonly T[];
  /** every object on the map (for the bricks a block would run into) */
  pieces(): readonly {
    id?: number | undefined;
    x: number;
    y: number;
    z: number;
    rows: number;
    cols: number;
    turn: number;
    kind: string;
  }[];
  /** the hero is trying to move, in world terms (x across, z deep), length 0–1 */
  moveWish(): { x: number; z: number };
  /** the hero can act (not talking, in a cinematic, building, game over) */
  free(): boolean;
  /** others standing where a block would go (neighbours) */
  someoneAt(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): boolean;
  setState(o: T, state: string): void;
  /** moves a placed object (its bricks, prompts and solidity) to pos */
  moveTo(o: T, pos: [number, number, number]): void;
  /** the hero stands here now (a pull drags the hero back) */
  placeHero(x: number, z: number): void;
  /** the hero can stand there (nothing solid in the way) */
  heroFits(x: number, z: number): boolean;
  /** the hero would fit standing at x, y, z */
  heroClear(x: number, y: number, z: number): boolean;
  /** other things with weight: neighbours and enemies (1), loose objects (1–3 by size); boxes in studs, y0 in plates */
  weighing?(): { kind: 'npc' | 'loose'; x0: number; x1: number; z0: number; z1: number; y0: number; weight: number }[];
  /** the hero is here now, feet at y (a climb) */
  placeHeroAt(x: number, y: number, z: number): void;
  /** step 12c: the move keys as pressed (x: right, z: forward), not turned by the camera */
  moveKeys?(): { x: number; z: number };
  /** step 12c: the game's Climbing is Anything (walls, with stamina), not only ladders and vines */
  climbAnything?(): boolean;
  /** step 12c-2: what the wind does to a placed thing (per second², across and deep: its drag over its mass) */
  windPush?(o: T, vel?: [number, number]): [number, number];
  /** step 12c: the hero's stamina now (0–its most), and some used (climbing, a climb jump) */
  stamina?(): number;
  spendStamina?(n: number): void;
  remove(o: T): void;
  /** an ordinary item (not a dungeon's) to the inventory, as the game always gives */
  give(item: string, count: number): void;
  say(text: string, seconds?: number): void;
  sound(
    id: 'scrape' | 'click' | 'tick' | 'unlock' | 'keyget' | 'secret' | 'itemget' | 'shine',
    at?: [number, number, number],
  ): void;
  /** logic and the event log */
  fire(event: 'switch' | 'pushed' | 'unlocked' | 'pickedUp', o: T, extra: Record<string, unknown>): void;
  log(text: string): void;
};

export type DungeonRecord = { keys: number; boss: boolean; map: boolean; compass: boolean; seen: Set<string> };

/** studs on a side of a cell the minimap reveals (a dungeon without its map shows only these) */
export const SEEN_CELL = 6;
const PUSH_HOLD = 0.3;
const PULL_HOLD = 0.3;
/** seconds a block takes to slide a stud (the hero walks with it) */
const SLIDE_STEP = 0.24;
/**
 * step 12c: an ice block, shoved, sets off this fast (studs a second) and friction slows it (ICE_ON_ICE on an icy
 * floor, ICE_ON_GROUND on anything else: a = μg); it never goes further than ICE_SLIDE_MAX studs. Its bricks rest on
 * whole studs, so at the last it creeps on to the next one.
 */
const ICE_SHOVE = 9;
const ICE_CREEP = 1.2;
const ICE_SLIDE_MAX = 64;
/** a ledge up to this high (world units: 3 bricks, a push block on a switch) is climbed by walking into it */
export const CLIMB_MAX = 3.6;
/** step 12c: climbing a wall: studs a second up and down, and sideways; stamina a second climbing, and holding still */
const WALL_SPEED = 1.8;
/** the hero's middle is this far off the face of the wall it holds (its hands on it) */
const WALL_GAP = 0.85;
const WALL_SIDE = 1.6;
const WALL_DRAIN = 9;
const WALL_HOLD = 2;
/** a climb jump: how high, how long, and what it costs (a quarter of the wheel) */
const WALL_HOP = 2.4;
const WALL_HOP_TIME = 0.35;
const WALL_HOP_COST = 25;
const CLIMB_WAIT = 0.25;
/** what things weigh on a switch: the hero (and each neighbour) 1, a push block 3 */
const HERO_WEIGHT = 1;
const BLOCK_WEIGHT = 3;
/** a climb: hands up onto the top, then the pull up, then over onto it (seconds; the Climb clip is as long) */
const CLIMB_REACH = 0.18;
const CLIMB_UP = 0.62;
const CLIMB_OVER = 0.3;
/** step 12b: climbing a ladder or vines: studs a second up or down; how long the hero leans in on turning a mirror */
const LADDER_SPEED = 2.4;
/**
 * step 12c: where the hands are in the Pull up move (forward and up from the feet, world units), every 0.05 s until
 * they leave the edge (MANTLE_RELEASE). Pulling up over the top of a wall, the body is moved so that the hands stay
 * on the edge, as motion warping does in games (a unit test checks this table against the move itself).
 */
export const MANTLE_HANDS: [number, number][] = [
  [1.09, 4.17],
  [1.09, 4.17],
  [1.09, 4.17],
  [1.09, 4.17],
  [1.12, 4.13],
  [1.17, 4.02],
  [1.18, 3.84],
  [1.09, 3.64],
  [0.94, 3.47],
  [0.79, 3.37],
  [0.73, 3.34],
  [0.97, 3.04],
  [1.01, 2.35],
  [0.88, 2.09],
  [0.77, 1.73],
  [0.48, 1.37],
];
/** the hands in the Pull up move at t seconds (forward, up) */
export function mantleHands(t: number): [number, number] {
  const k = Math.max(0, Math.min(MANTLE_HANDS.length - 1, t / 0.05));
  const i = Math.min(MANTLE_HANDS.length - 2, Math.floor(k));
  const a = MANTLE_HANDS[i]!;
  const b = MANTLE_HANDS[i + 1]!;
  const u = k - i;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
/** the hands go this far in past the edge of the top (onto it) */
const EDGE_IN = 0.12;
/** at the start of the pull up the body settles into hanging from the edge (seconds) */
const MANTLE_SETTLE = 0.15;
const TURN_POSE = 0.8;

type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** the bricks' box: x, z in studs, y in plates */
export function boxOf(bricks: readonly Brick[]): Box | null {
  if (!bricks.length) return null;
  const b: Box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const k of bricks) {
    const [w, d] = footprint(k);
    b.x0 = Math.min(b.x0, k.x);
    b.x1 = Math.max(b.x1, k.x + w);
    b.z0 = Math.min(b.z0, k.z);
    b.z1 = Math.max(b.z1, k.z + d);
    b.y0 = Math.min(b.y0, k.y);
    b.y1 = Math.max(b.y1, k.y + brickHeight(k.type));
  }
  return b;
}

/** a block's box resting on a switch's box (over it by more than half a stud each way, on its top) */
const rests = (q: Box | null, b: Box) =>
  !!q &&
  q.x0 < b.x1 - 0.5 &&
  q.x1 > b.x0 + 0.5 &&
  q.z0 < b.z1 - 0.5 &&
  q.z1 > b.z0 + 0.5 &&
  Math.abs(q.y0 - b.y1) <= 1.5;

const pieceBox = (p: { x: number; y: number; z: number; rows: number; cols: number; turn: number; kind: string }) => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return { x0: p.x, x1: p.x + w, z0: p.z, z1: p.z + d, y0: p.y, y1: p.y + (p.kind === 'brick' ? 3 : 1) };
};

export class Puzzles<T extends PuzzleObject = PuzzleObject> {
  readonly dungeons = new Map<string, DungeonRecord>();
  /** the block held for pulling (Action held) */
  grab: {
    id: string;
    t: number;
    lean: 'push' | 'pull' | 'hold';
    fresh: boolean;
    /** the way a push goes (square to the grid) */
    dx: number;
    dz: number;
  } | null = null;
  /** a slide under way: n studs, done of them moved (the bricks), t seconds in, the hero's part of it */
  private slide: {
    o: T;
    dx: number;
    dz: number;
    n: number;
    done: number;
    t: number;
    pulled: boolean;
    hero?: number;
    /** step 12c: an ice block: it slides on by itself, and the hero stays where it pushed from */
    ice?: boolean;
    /** an ice block's speed (studs a second) and how far it has gone (studs) */
    v?: number;
    at?: number;
  } | null = null;
  /** timed switches: when each goes back off, and the last tick */
  private timers = new Map<string, { ends: number; tick: number; o: T }>();
  /** switches held down last step */
  private held = new Set<string>();

  constructor(private readonly h: PuzzleHost<T>) {}

  record(map = this.h.mapId()): DungeonRecord {
    let r = this.dungeons.get(map);
    if (!r) {
      r = { keys: 0, boss: false, map: false, compass: false, seen: new Set() };
      this.dungeons.set(map, r);
    }
    return r;
  }

  /** how many of a dungeon item the hero has here (null: not a dungeon item) */
  count(item: string): number | null {
    const d = dungeonItem(item);
    if (!d) return null;
    const r = this.dungeons.get(this.h.mapId());
    if (!r) return 0;
    return d === 'Small key' ? r.keys : r[d === 'Boss key' ? 'boss' : d === 'Dungeon map' ? 'map' : 'compass'] ? 1 : 0;
  }

  /** a dungeon item given here (true), or not a dungeon item (false: the game gives it as usual) */
  give(item: string, n: number): boolean {
    const d = dungeonItem(item);
    if (!d) return false;
    const r = this.record();
    if (d === 'Small key') r.keys = Math.max(0, r.keys + n);
    else r[d === 'Boss key' ? 'boss' : d === 'Dungeon map' ? 'map' : 'compass'] = n > 0;
    if (n > 0) {
      this.h.sound(d === 'Small key' || d === 'Boss key' ? 'keyget' : 'itemget');
      this.h.say(this.gotLine(d, r), 2.5);
      this.h.log(`Got ${n} × ${d} (this map)`);
    }
    return true;
  }

  /** a dungeon item taken (true: it was one) */
  take(item: string, n: number): boolean {
    const d = dungeonItem(item);
    if (!d) return false;
    const r = this.record();
    if (d === 'Small key') r.keys = Math.max(0, r.keys - n);
    else r[d === 'Boss key' ? 'boss' : d === 'Dungeon map' ? 'map' : 'compass'] = false;
    return true;
  }

  private gotLine(d: DungeonItem, r: DungeonRecord): string {
    if (d === 'Small key') return `A small key! (${r.keys})`;
    if (d === 'Boss key') return 'The boss key! It opens the big door.';
    if (d === 'Dungeon map') return 'The dungeon map! The whole floor shows on the minimap.';
    return 'The compass! Chests and the boss show on the minimap.';
  }

  /** the HUD's line for the dungeon items here (empty outside dungeons and before any is found) */
  hudLine(): string {
    const r = this.dungeons.get(this.h.mapId());
    if (!r && !this.h.dungeon()) return '';
    const parts = [`🗝 ${r?.keys ?? 0}`];
    if (r?.boss) parts.push('Boss key');
    if (r?.map) parts.push('Map');
    if (r?.compass) parts.push('Compass');
    return parts.join(' · ');
  }

  // ---------- each step ----------

  step(dt: number) {
    const s = this.h.heroState;
    if (this.h.dungeon()) this.record().seen.add(`${Math.floor(s.x / SEEN_CELL)},${Math.floor(s.z / SEEN_CELL)}`);
    this.stepSlide(dt);
    this.stepWindShoves();
    if (this.turnPose) {
      this.turnPose.t -= dt;
      if (this.turnPose.t <= 0) this.turnPose = null;
    }
    if (!this.slide && !this.climbing && !this.ladder && !this.wall && this.h.free()) {
      this.stepGrab(dt);
      this.stepClimbStart(dt);
    } else this.climbTry = null;
    this.stepSwitches();
    this.stepTimers();
    this.stepPickups();
  }

  // ---------- push and pull ----------

  /** the push block right in front of the hero, the way the hero faces (square to the grid), or null */
  facing(range = 1.1): { o: T; dx: number; dz: number } | null {
    const s = this.h.heroState;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    let dx = 0;
    let dz = 0;
    if (Math.abs(fx) > 0.75) dx = Math.sign(fx);
    else if (Math.abs(fz) > 0.75) dz = Math.sign(fz);
    else return null;
    const px = s.x + dx * range;
    const pz = s.z + dz * range;
    const feet = s.y / 0.4;
    for (const o of this.h.near(s.x, s.z, 12)) {
      // a push block, or (step 12b) a mirror the hero turns by pushing it round
      if (!o.def.push && !(o.def.mirror && o.def.mirror.turns !== false)) continue;
      const b = boxOf(o.bricks);
      if (!b) continue;
      if (px < b.x0 - 0.05 || px > b.x1 + 0.05 || pz < b.z0 - 0.05 || pz > b.z1 + 0.05) continue;
      // its bottom about level with the hero's feet (it may sit on a switch), its top above them
      if (feet + 3 < b.y0 || feet > b.y1 - 1) continue;
      return { o, dx, dz };
    }
    return null;
  }

  /** the Action button (Grab) can take hold of a push block in front */
  canGrab(): boolean {
    return !!this.facing() && !this.slide && !this.climbing;
  }

  /** Action held (true) or let go: pushing and pulling both need a hold on the block */
  setGrab(down: boolean) {
    if (!down) {
      this.grab = null;
      return;
    }
    const f = this.facing();
    if (f) this.grab = { id: f.o.inst.id, t: 0, lean: 'hold', fresh: true, dx: f.dx, dz: f.dz };
  }

  /** holding on: forward pushes it, back pulls it (a pullable block), each after a moment */
  private stepGrab(dt: number) {
    const g = this.grab;
    if (!g) return;
    const f = this.facing(1.4);
    if (!f || f.o.inst.id !== g.id) {
      this.grab = null;
      return;
    }
    const want = this.h.moveWish();
    const along = want.x * f.dx + want.z * f.dz;
    const dir = along > 0.6 ? 1 : along < -0.6 ? -1 : 0;
    // a block that came to rest on a switch stays there until the stick is let go and pressed again
    if (!dir) g.fresh = true;
    if (!dir || !g.fresh) {
      g.t = 0;
      g.lean = dir > 0 ? 'push' : 'hold';
      return;
    }
    g.lean = dir > 0 ? 'push' : 'pull';
    // step 12b: a mirror held and pushed (or pulled) turns round to lean the other way, once per push
    if (f.o.def.mirror) {
      g.t += dt;
      if (g.t < PUSH_HOLD) return;
      g.t = 0;
      g.fresh = false;
      this.turnMirror(f.o);
      return;
    }
    if (dir < 0 && !f.o.def.push?.pull) {
      if (g.t === 0) this.h.say('It only moves when pushed.', 1.2);
      g.t = -Infinity;
      return;
    }
    g.t += dt;
    if (g.t < (dir > 0 ? PUSH_HOLD : PULL_HOLD)) return;
    g.t = 0;
    this.tryMove(f.o, f.dx * dir, f.dz * dir, dir < 0);
  }

  /** the studs a shove moves it */
  private stepOf(o: T, dx: number): number {
    const b = boxOf(o.bricks)!;
    return o.def.push?.step ?? (dx ? b.x1 - b.x0 : b.z1 - b.z0);
  }

  /** starts a slide if the block can go there; false (and a word) when something is in the way */
  /**
   * step 12c-2: an ice block in a strong enough wind slides off by itself, the way the wind blows (its stronger
   * way, square to the grid), once the wind's push beats its friction on what it rests on
   */
  private stepWindShoves() {
    if (this.slide || !this.h.windPush) return;
    const s = this.h.heroState;
    for (const o of this.h.near(s.x, s.z, 40)) {
      if (!o.def.ice?.slides || !o.def.push) continue;
      const [ax, az] = this.h.windPush(o);
      const mu = (this.onIce(o) ? ICE_ON_ICE : ICE_ON_GROUND) * GRAVITY;
      const along = Math.abs(ax) >= Math.abs(az) ? ax : az;
      if (Math.abs(along) <= mu) continue;
      const dx = Math.abs(ax) >= Math.abs(az) ? Math.sign(ax) : 0;
      const dz = dx ? 0 : Math.sign(az);
      if (this.tryMove(o, dx, dz, false, ICE_CREEP)) {
        this.h.log(`${o.def.name}: the wind pushed it`);
        return;
      }
    }
  }

  tryMove(o: T, dx: number, dz: number, pulled: boolean, shove = ICE_SHOVE): boolean {
    if (this.slide) return false;
    // step 12c: a block of ice, pushed, slides on until something stops it (a wall, a block, an edge)
    const ice = !!o.def.ice?.slides && !pulled;
    let n = ice ? ICE_SLIDE_MAX : this.stepOf(o, dx);
    for (let i = 1; i <= n; i++)
      if (this.landing(o, dx * i, dz * i) === null) {
        if (i === 1) {
          this.h.log(`${o.def.name}: blocked`);
          return false;
        }
        if (ice) n = i - 1;
        break;
      }
    if (ice) {
      this.slide = { o, dx, dz, n, done: 0, t: 0, pulled: false, ice: true, v: shove, at: 0 };
      this.h.sound('scrape', this.centre(o));
      return true;
    }
    if (pulled) {
      // the hero steps back first: there must be room behind
      const s = this.h.heroState;
      if (!this.h.heroFits(s.x + dx * n, s.z + dz * n)) {
        this.h.say('No room to step back.', 1.2);
        return false;
      }
    }
    this.slide = { o, dx, dz, n, done: 0, t: 0, pulled };
    this.h.sound('scrape', this.centre(o));
    return true;
  }

  /** where the block would rest moved by (dx, dz) studs: its new height in plates, or null (in the way) */
  private landing(o: T, dx: number, dz: number): number | null {
    const b = boxOf(o.bricks);
    if (!b) return null;
    const lo = o.inst.idBase;
    const hi = lo + o.def.bricks.length;
    const x0 = b.x0 + dx;
    const x1 = b.x1 + dx;
    const z0 = b.z0 + dz;
    const z1 = b.z1 + dz;
    const h = b.y1 - b.y0;
    // what stands in its way and what it would rest on
    let floor = -Infinity;
    const under: Box[] = [];
    for (const p of this.h.pieces()) {
      if (p.id !== undefined && p.id >= lo && p.id < hi) continue;
      const q = pieceBox(p);
      if (q.x1 <= x0 || q.x0 >= x1 || q.z1 <= z0 || q.z0 >= z1) continue;
      if (q.y0 >= b.y1) continue;
      under.push(q);
      floor = Math.max(floor, q.y1);
    }
    // nothing under it: the ground
    const y = Number.isFinite(floor) ? floor : 0;
    // a step up of more than 2 plates is a wall; a drop of more than a brick is an edge it will not go over
    if (y > b.y0 + 2 || y < b.y0 - 3) return null;
    for (const q of under) if (q.y1 > y && q.y0 < y + h) return null;
    if (this.h.someoneAt(x0, z0, x1, z1, y * 0.4, (y + h) * 0.4)) return null;
    return y;
  }

  /**
   * A slide glides: the hero walks with the block at an even pace (SLIDE_STEP a stud). Its bricks move a whole stud
   * at a time — ahead of the hero when pushed, into the room the hero left when pulled — and are drawn where the
   * glide has them (slideView).
   */
  private stepSlide(dt: number) {
    const sl = this.slide;
    if (!sl) return;
    sl.t += dt;
    const vis = sl.ice ? this.glide(sl, dt) : Math.min(sl.n, sl.t / SLIDE_STEP);
    // the hero comes along (pushing: behind it; pulling: stepping back first)
    const s = this.h.heroState;
    const moved = vis - (sl.hero ?? 0);
    if (!sl.ice && moved > 0 && this.h.heroFits(s.x + sl.dx * moved, s.z + sl.dz * moved)) {
      this.h.placeHero(s.x + sl.dx * moved, s.z + sl.dz * moved);
      sl.hero = vis;
    }
    const due = Math.min(sl.n, sl.pulled ? Math.floor(vis + 1e-6) : Math.ceil(vis + 1e-6));
    while (sl.done < due) {
      const y = this.landing(sl.o, sl.dx, sl.dz);
      const b = boxOf(sl.o.bricks);
      if (y === null || !b) {
        sl.n = sl.done;
        break;
      }
      const p = sl.o.inst.pos;
      this.h.moveTo(sl.o, [Number(p[0]) + sl.dx, Number(p[1]) + (y - b.y0), Number(p[2]) + sl.dz]);
      sl.done++;
    }
    if (sl.done >= sl.n && (sl.ice ? (sl.at ?? 0) >= sl.n : sl.t >= sl.n * SLIDE_STEP)) this.endSlide(sl);
  }

  /** an ice block glides on, slowed by friction (less on ice than off it): how far it has gone now (studs) */
  private glide(sl: NonNullable<Puzzles<T>['slide']>, dt: number): number {
    const mu = this.onIce(sl.o) ? ICE_ON_ICE : ICE_ON_GROUND;
    // step 12c-2: a wind along the way it slides pushes it on (or holds it back)
    const w = this.h.windPush?.(sl.o, [(sl.v ?? 0) * sl.dx, (sl.v ?? 0) * sl.dz]) ?? [0, 0];
    let v = (sl.v ?? 0) + (w[0] * sl.dx + w[1] * sl.dz) * dt - mu * GRAVITY * dt;
    // too slow to reach another stud: it creeps on to rest on the next whole one
    if (v < ICE_CREEP) {
      sl.n = Math.min(sl.n, Math.max(1, Math.ceil((sl.at ?? 0) - 1e-6)));
      v = ICE_CREEP;
    }
    sl.v = v;
    sl.at = Math.min(sl.n, (sl.at ?? 0) + v * dt);
    return sl.at;
  }

  /** a block resting on an icy floor (something else marked Ice with Slippery floor, just under it) */
  private onIce(o: T): boolean {
    const b = boxOf(o.bricks);
    if (!b) return false;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    return this.h.near(cx, cz, 12).some((q) => {
      if (q === o || !q.def.ice || q.def.ice.floor === false) return false;
      const c = boxOf(q.bricks);
      return !!c && cx > c.x0 && cx < c.x1 && cz > c.z0 && cz < c.z1 && Math.abs(c.y1 - b.y0) < 0.5;
    });
  }

  private endSlide(sl: NonNullable<Puzzles<T>['slide']>) {
    this.slide = null;
    if (this.grab) {
      this.grab.t = 0;
      // come to rest on a switch: no shove past it without letting go first
      if (this.onSwitch(sl.o)) this.grab.fresh = false;
    }
    this.h.fire('pushed', sl.o, { pulled: sl.pulled });
    this.h.log(`${sl.o.def.name} ${sl.pulled ? 'pulled' : 'pushed'}`);
  }

  /** the block rests on a step switch */
  private onSwitch(k: T): boolean {
    const q = boxOf(k.bricks);
    if (!q) return false;
    return this.h
      .near((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, 8)
      .some((o) => o.def.switch?.by === 'step' && o !== k && rests(q, boxOf(o.bricks)!));
  }

  /** a block sliding with the hero behind it (an ice block slides away by itself: the hero is free) */
  get sliding(): boolean {
    return !!this.slide && !this.slide.ice;
  }

  /** the block held: which way pushes, whether it pulls, and what the hero is doing with it (for the arrows) */
  grabView(): { o: T; dx: number; dz: number; pull: boolean; lean: 'push' | 'pull' | 'hold' } | null {
    const g = this.grab;
    if (!g) return null;
    const o = this.h.near(this.h.heroState.x, this.h.heroState.z, 6).find((x) => x.inst.id === g.id);
    if (!o) return null;
    const sl = this.slide;
    const lean = sl ? (sl.pulled ? 'pull' : 'push') : g.lean;
    return { o, dx: g.dx, dz: g.dz, pull: !!o.def.push?.pull, lean };
  }

  /** where the sliding block is drawn, from where its bricks are: its id and the offset in studs */
  slideView(): { id: string; dx: number; dz: number } | null {
    const sl = this.slide;
    if (!sl) return null;
    const off = (sl.ice ? Math.min(sl.n, sl.at ?? 0) : Math.min(sl.n, sl.t / SLIDE_STEP)) - sl.done;
    return { id: sl.o.inst.id, dx: sl.dx * off, dz: sl.dz * off };
  }

  /** how the hero stands: climbing, leaning into a block (push), holding or pulling one, or neither */
  get pose(): 'push' | 'pull' | 'climb' | null {
    if (this.climbing) return 'climb';
    // step 12b: turning a mirror: a shove one way, a tug back the other
    if (this.turnPose) return this.turnPose.kind;
    const sl = this.slide;
    if (sl && !sl.ice) return sl.pulled ? 'pull' : 'push';
    if (this.grab) return this.grab.lean === 'push' ? 'push' : 'pull';
    return null;
  }

  // ---------- climbing ----------

  /** step 12b: leaning into a mirror to turn it (push) or tugging it back (pull), for a moment */
  private turnPose: { kind: 'push' | 'pull'; t: number } | null = null;

  /** step 12b: on a ladder or vines: what, and where the hero holds on (x, z), facing it */
  ladder: { o: T; x: number; z: number; heading: number; y0: number } | null = null;

  /** the climbable thing right in front of the hero (a ladder, vines), or null */
  private climbableAhead(fx: number, fz: number): T | null {
    const s = this.h.heroState;
    const ax = s.x + fx * 0.9;
    const az = s.z + fz * 0.9;
    for (const o of this.h.near(ax, az, 8)) {
      if (!o.def.climbable) continue;
      const b = boxOf(o.bricks);
      if (!b || b.y1 * 0.4 <= s.y + 0.6) continue;
      // just ahead, or the hero already in among it (between a ladder's rails, in the vines)
      const inside = (x: number, z: number, m: number) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
      if (inside(ax, az, 0.35) || inside(s.x, s.z, 0)) return o;
    }
    return null;
  }

  /** onto a ladder: the hero holds on where it stands, facing it */
  private grabLadder(o: T) {
    const s = this.h.heroState;
    this.ladder = { o, x: s.x, z: s.z, heading: s.heading, y0: s.y };
    this.h.sound('scrape');
    this.h.log(`Climbing the ${o.def.name.toLowerCase()}`);
  }

  /**
   * On a ladder: forward climbs up, back climbs down (off at the bottom); at the top the hero climbs over onto
   * what is there; jumping lets go. The game holds the hero meanwhile.
   */
  stepLadder(dt: number, jump: boolean) {
    const l = this.ladder;
    if (!l) return;
    const s = this.h.heroState;
    // burnt away, or gone
    if (!this.h.near(l.x, l.z, 8).includes(l.o) || jump) {
      this.ladder = null;
      return;
    }
    const fx = Math.sin(l.heading);
    const fz = Math.cos(l.heading);
    const want = this.h.moveWish();
    const along = want.x * fx + want.z * fz;
    const b = boxOf(l.o.bricks)!;
    const top = b.y1 * 0.4;
    let y = s.y + along * LADDER_SPEED * dt;
    // at the bottom (where it got on, or on something solid), climbing down steps off
    if (along < 0 && (y <= l.y0 || !this.h.heroClear(l.x, y - 0.05, l.z))) {
      this.ladder = null;
      this.h.placeHeroAt(l.x - fx * 0.2, Math.max(l.y0, Math.min(s.y, y)), l.z - fz * 0.2);
      return;
    }
    // hands over the top: climb over onto it (or onto what is beyond it), else hold at the top
    if (y >= top - 1.2) {
      for (const d of [0.95, 1.6, 2.3])
        for (let h = top; h <= top + 1.2 + 1e-6; h += 0.4) {
          const tx = l.x + fx * d;
          const tz = l.z + fz * d;
          if (!this.h.heroClear(tx, h, tz)) continue;
          this.ladder = null;
          this.climbing = { from: [l.x, y, l.z], to: [tx, h, tz], t: CLIMB_REACH };
          return;
        }
      y = Math.min(y, top - 1.2);
    }
    this.h.placeHeroAt(l.x, Math.max(y, s.y - 1), l.z);
    s.heading = l.heading;
  }

  // ---------- step 12c: climbing anything (Breath of the Wild) ----------

  /** on a wall: facing it, where it got on (feet), and a climb jump under way (seconds left) */
  wall: { heading: number; y0: number; hop: number } | null = null;

  /** a placed thing marked Not climbable there */
  private noClimbAt(x: number, y: number, z: number): boolean {
    return this.h.near(x, z, 8).some((o) => {
      if (!o.def.noClimb) return false;
      const b = boxOf(o.bricks);
      return !!b && x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4 && y < b.y1 * 0.4 + 0.5;
    });
  }

  /** a brick there (not the edge of the world, which also stops the hero) */
  private brickAt(x: number, y: number, z: number): boolean {
    const py = y / 0.4;
    for (const p of this.h.pieces()) {
      const q = pieceBox(p);
      if (x > q.x0 - 0.5 && x < q.x1 + 0.5 && z > q.z0 - 0.5 && z < q.z1 + 0.5 && py >= q.y0 - 1 && py <= q.y1 + 1)
        return true;
    }
    return false;
  }

  /** something solid ahead of the hero at this height (the wall it holds) */
  private solidAhead(x: number, y: number, z: number, fx: number, fz: number): boolean {
    const d = WALL_GAP + 0.3;
    return this.solidAt(x + fx * d, y, z + fz * d);
  }

  /** a brick right there (a point inside it) */
  private solidAt(x: number, y: number, z: number): boolean {
    const py = y / 0.4;
    for (const p of this.h.pieces()) {
      const q = pieceBox(p);
      if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && py >= q.y0 && py <= q.y1) return true;
    }
    return false;
  }

  /** how far ahead the wall's face is (at chest height), or null */
  private faceAhead(x: number, y: number, z: number, fx: number, fz: number): number | null {
    for (let d = 0; d <= 2; d += 0.05) if (this.solidAt(x + fx * d, y, z + fz * d)) return d;
    return null;
  }

  /**
   * On a wall (Climbing: Anything): forward climbs up, back down (off at the bottom), sideways along it; each second
   * of climbing uses stamina (a little holding still), and Jump is a climb jump (a quick hop up, a quarter of the
   * wheel). Out of stamina the hero lets go and falls. Hands over the top: it pulls itself up onto it.
   */
  stepWall(dt: number, jump: boolean) {
    const w = this.wall;
    if (!w) return;
    const s = this.h.heroState;
    const fx = Math.sin(w.heading);
    const fz = Math.cos(w.heading);
    // the hero's right, facing the wall (its heading h faces (sin h, cos h); its right is (-cos h, sin h))
    const rx = -Math.cos(w.heading);
    const rz = Math.sin(w.heading);
    // on a wall the keys are the wall's own: up and down, left and right as the hero faces it (wherever the camera is)
    const keys = this.h.moveKeys?.();
    const want = this.h.moveWish();
    const along = keys ? keys.z : want.x * fx + want.z * fz;
    const side = keys ? keys.x : want.x * rx + want.z * rz;
    // jumping backward (away from the wall) lets go; jumping otherwise is a climb jump
    if (jump && along < -0.5) return this.letGo();
    if (jump && w.hop <= 0 && (this.h.stamina?.() ?? 0) > 0) {
      w.hop = WALL_HOP_TIME;
      this.h.spendStamina?.(WALL_HOP_COST);
    }
    const moving = Math.abs(along) > 0.2 || Math.abs(side) > 0.2 || w.hop > 0;
    this.h.spendStamina?.((moving ? WALL_DRAIN : WALL_HOLD) * dt);
    if ((this.h.stamina?.() ?? 1) <= 0) {
      this.h.say('Out of stamina!', 1.2);
      return this.letGo();
    }
    let y = s.y + along * WALL_SPEED * dt;
    if (w.hop > 0) {
      const d = Math.min(w.hop, dt);
      w.hop -= d;
      y = Math.max(y, s.y + (WALL_HOP / WALL_HOP_TIME) * d);
    }
    // at the bottom: climbing down steps off
    if (along < 0 && (y <= w.y0 || !this.h.heroClear(s.x, y - 0.05, s.z))) {
      this.wall = null;
      this.h.placeHeroAt(s.x - fx * 0.2, Math.max(w.y0, Math.min(s.y, y)), s.z - fz * 0.2);
      return;
    }
    // sideways along the wall, while there is wall to hold and room
    let x = s.x;
    let z = s.z;
    // is there room for the body here (tested a little back from the wall: the hands are on it)
    const room = (px: number, py: number, pz: number) => this.h.heroClear(px - fx * 0.45, py, pz - fz * 0.45);
    if (Math.abs(side) > 0.2) {
      const nx = s.x + rx * side * WALL_SIDE * dt;
      const nz = s.z + rz * side * WALL_SIDE * dt;
      if (room(nx, y, nz) && this.solidAhead(nx, y + 1.5, nz, fx, fz) && !this.noClimbAt(nx + fx, y + 1.5, nz + fz)) {
        x = nx;
        z = nz;
      }
    }
    // the top of the wall within reach of the hands: going up, pull up over it (hands on the edge all the way)
    const face = this.faceAhead(x, Math.min(y + 1.5, s.y + 1.5), z, fx, fz) ?? WALL_GAP;
    const top = this.topInReach(x, y, z, fx, fz, face);
    if (top !== null) {
      const hang = top - MANTLE_HANDS[0]![1];
      const stand = this.standOnTop(x, z, fx, fz, face, top);
      if (stand && (along > 0.2 || w.hop > 0)) {
        this.wall = null;
        this.climbing = {
          from: [x, Math.min(y, hang + 0.3), z],
          to: [stand[0], top, stand[1]],
          t: 0,
          mantle: { top, edge: face + EDGE_IN, fx, fz, s: 0 },
        };
        this.h.sound('scrape');
        this.h.log('Over the top of the wall');
        return;
      }
      // no room to stand up there: the hands stop at the edge
      if (y > hang && y > s.y) y = Math.max(s.y, hang);
    }
    // nothing to hold and nothing to climb onto: let go
    if (!this.solidAhead(x, y + 0.6, z, fx, fz)) return this.letGo();
    if (!room(x, y, z)) y = s.y;
    this.h.placeHeroAt(x, y, z);
    s.heading = w.heading;
  }

  /** the top of the wall ahead, where the hands are or below them (the face at `face`), or null */
  private topInReach(x: number, y: number, z: number, fx: number, fz: number, face: number): number | null {
    const px = x + fx * (face + 0.15);
    const pz = z + fz * (face + 0.15);
    const reach = y + MANTLE_HANDS[0]![1] + 0.1;
    for (let h = y + 1.0; h <= reach + 1e-6; h += 0.05) {
      if (this.solidAt(px, h, pz)) continue;
      if (!this.solidAt(px, h - 0.05, pz)) return null;
      // on the plates' grid (bricks are 3 plates, plates 0.4 high)
      const g = Math.round(h / 0.4) * 0.4;
      return Math.abs(g - h) < 0.08 ? g : h;
    }
    return null;
  }

  /** where the hero stands up on top of the wall after pulling up (a brick under the feet, room for the body) */
  private standOnTop(x: number, z: number, fx: number, fz: number, face: number, top: number): [number, number] | null {
    for (const d of [face + 0.6, face + 1.0, face + 1.4]) {
      const tx = x + fx * d;
      const tz = z + fz * d;
      if (this.solidAt(tx, top - 0.2, tz) && this.h.heroClear(tx, top + 0.02, tz)) return [tx, tz];
    }
    return null;
  }

  /** off the wall: the hero falls from where it is */
  private letGo() {
    this.wall = null;
    const s = this.h.heroState;
    s.vy = 0;
    s.grounded = false;
    this.h.placeHeroAt(s.x - Math.sin(s.heading) * 0.3, s.y, s.z - Math.cos(s.heading) * 0.3);
    s.grounded = false;
  }

  /** climbing onto a ledge: from, to, seconds so far */
  climbing: {
    from: [number, number, number];
    to: [number, number, number];
    t: number;
    /**
     * step 12c: pulling up over the top of a wall (the Pull up move): the top's height, how far ahead of where it
     * started the hands hold the edge, which way it faces, and how far forward the feet have come
     */
    mantle?: { top: number; edge: number; fx: number; fz: number; s: number };
  } | null = null;
  private climbTry: { x: number; z: number; t: number } | null = null;

  /** walking into a ledge up to CLIMB_MAX high (a push block, a crate, a low wall) for a moment climbs onto it */
  private stepClimbStart(dt: number) {
    const s = this.h.heroState;
    const want = this.h.moveWish();
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    if (!s.grounded || this.grab || Math.hypot(want.x, want.z) < 0.5 || want.x * fx + want.z * fz < 0.7) {
      this.climbTry = null;
      return;
    }
    // step 12b: a ladder or vines in front: hold on and climb
    const lad = this.climbableAhead(fx, fz);
    if (lad) {
      const c0 = this.climbTry;
      if (!c0 || Math.hypot(s.x - c0.x, s.z - c0.z) > 0.15) this.climbTry = { x: s.x, z: s.z, t: 0 };
      else {
        c0.t += dt;
        if (c0.t >= CLIMB_WAIT * 0.5) {
          this.climbTry = null;
          this.grabLadder(lad);
        }
      }
      return;
    }
    const c = this.climbTry;
    // walking freely: not against anything
    if (!c || Math.hypot(s.x - c.x, s.z - c.z) > 0.15) {
      this.climbTry = { x: s.x, z: s.z, t: 0 };
      return;
    }
    c.t += dt;
    if (c.t < CLIMB_WAIT) return;
    this.climbTry = null;
    const ax = s.x + fx * 0.95;
    const az = s.z + fz * 0.95;
    // step 12c: with Climbing: Anything, a wall too tall to climb onto is climbed (while stamina lasts)
    let ledge = false;
    for (let h = 0.4; h <= CLIMB_MAX + 1e-6; h += 0.4) if (this.h.heroClear(ax, s.y + h, az)) ledge = true;
    if (!ledge && this.h.climbAnything?.() && this.brickAt(ax, s.y + 1.5, az)) {
      if (this.noClimbAt(ax, s.y + 1.5, az)) {
        this.h.say('Too smooth to climb.', 1.4);
        return;
      }
      if ((this.h.stamina?.() ?? 1) <= 0) return;
      // hold on facing the wall square, the body a little off its face (the hands on it)
      const heading = Math.round(s.heading / (Math.PI / 2)) * (Math.PI / 2);
      const hx = Math.sin(heading);
      const hz = Math.cos(heading);
      const face = this.faceAhead(s.x, s.y + 1.5, s.z, hx, hz);
      if (face === null) return;
      const nx = s.x + hx * (face - WALL_GAP);
      const nz = s.z + hz * (face - WALL_GAP);
      if (this.h.heroClear(nx - hx * 0.3, s.y + 0.1, nz - hz * 0.3)) this.h.placeHeroAt(nx, s.y, nz);
      s.heading = heading;
      this.wall = { heading, y0: s.y, hop: 0 };
      this.h.sound('scrape');
      this.h.log('Climbing the wall');
      return;
    }
    // the lowest height ahead with room to stand, a ledge (not a step the hero walks up anyway)
    for (let h = 0.4; h <= CLIMB_MAX + 1e-6; h += 0.4) {
      if (!this.h.heroClear(ax, s.y + h, az)) continue;
      if (h < 0.8 || !this.h.heroClear(s.x, s.y + h, s.z)) return;
      // a placed object (a block, a crate, a chest), not the land itself
      const top = (s.y + h) / 0.4;
      const thing = this.h.near(ax, az, 8).some((o) => {
        const b = boxOf(o.bricks);
        return (
          !!b &&
          ax > b.x0 - 0.3 &&
          ax < b.x1 + 0.3 &&
          az > b.z0 - 0.3 &&
          az < b.z1 + 0.3 &&
          b.y1 <= top + 0.5 &&
          b.y1 >= top - 1.5
        );
      });
      if (!thing) return;
      this.climbing = { from: [s.x, s.y, s.z], to: [ax, s.y + h, az], t: 0 };
      this.h.sound('scrape');
      return;
    }
  }

  /** the climb itself: up first, then over onto the top (the game holds the hero meanwhile) */
  stepClimb(dt: number) {
    const c = this.climbing;
    if (!c) return;
    c.t += dt;
    if (c.mantle) return this.stepMantle(c as typeof c & { mantle: NonNullable<typeof c.mantle> });
    const up = Math.max(0, Math.min(1, (c.t - CLIMB_REACH) / (CLIMB_UP - CLIMB_REACH)));
    const over = Math.max(0, Math.min(1, (c.t - CLIMB_UP) / CLIMB_OVER));
    const ease = (k: number) => k * k * (3 - 2 * k);
    this.h.placeHeroAt(
      c.from[0] + (c.to[0] - c.from[0]) * ease(over),
      c.from[1] + (c.to[1] - c.from[1]) * ease(up),
      c.from[2] + (c.to[2] - c.from[2]) * ease(over),
    );
    if (c.t >= CLIMB_UP + CLIMB_OVER) {
      this.climbing = null;
      this.h.log('Climbed up');
    }
  }

  /**
   * Pulling up over the top of a wall: until the hands let go, the body goes where the Pull up move puts it with the
   * hands on the edge (never back from the wall: the hands may slide in onto the top); then it steps up onto the top.
   */
  private stepMantle(
    c: NonNullable<Puzzles['climbing']> & { mantle: NonNullable<NonNullable<Puzzles['climbing']>['mantle']> },
  ) {
    const m = c.mantle;
    const ease = (k: number) => k * k * (3 - 2 * k);
    const t = Math.min(c.t, MANTLE_RELEASE);
    const [hz, hy] = mantleHands(t);
    const w = ease(Math.min(1, t / MANTLE_SETTLE));
    m.s = Math.max(m.s, (m.edge - hz) * w);
    const y = c.from[1] + (m.top - hy - c.from[1]) * w;
    const at = (sv: number, yv: number) => this.h.placeHeroAt(c.from[0] + m.fx * sv, yv, c.from[2] + m.fz * sv);
    if (c.t <= MANTLE_RELEASE) {
      at(m.s, y);
      return;
    }
    // the hands let go: up onto the top and stand
    const k = ease(Math.min(1, (c.t - MANTLE_RELEASE) / (MANTLE_SECONDS - MANTLE_RELEASE)));
    const sx = c.from[0] + m.fx * m.s;
    const sz = c.from[2] + m.fz * m.s;
    this.h.placeHeroAt(sx + (c.to[0] - sx) * k, y + (c.to[1] - y) * k, sz + (c.to[2] - sz) * k);
    if (c.t >= MANTLE_SECONDS) {
      this.climbing = null;
      const s = this.h.heroState;
      s.vy = 0;
      s.grounded = true;
      this.h.log('Climbed up');
    }
  }

  // ---------- switches ----------

  isOn(o: T): boolean {
    return o.state === o.def.states[1];
  }

  /** turns a switch on or off (its first two states), with its sound, timer and events */
  turn(o: T, on: boolean, why = '') {
    const sw = o.def.switch;
    if (!sw || o.def.states.length < 2 || this.isOn(o) === on) return;
    const was = boxOf(o.bricks);
    this.h.setState(o, o.def.states[on ? 1 : 0]!);
    if (this.isOn(o) !== on) return;
    if (sw.by === 'step') this.settleOn(o, was);
    this.h.sound('click', this.centre(o));
    if (on && sw.stays === 'timed')
      this.timers.set(o.inst.id, { ends: this.h.clock + (sw.seconds ?? 10), tick: this.h.clock, o });
    if (!on) this.timers.delete(o.inst.id);
    this.h.fire('switch', o, { on, by: why });
    this.h.log(`${o.def.name} ${on ? 'on' : 'off'}${why ? ` (${why})` : ''}`);
  }

  /** a switch used: stepped on, hit or pressed */
  private use(o: T, sw: SwitchDef, why: string) {
    if (sw.stays === 'toggle') this.turn(o, !this.isOn(o), why);
    else if (sw.stays === 'timed' && this.isOn(o)) {
      // hit again while running: the clock starts over
      const t = this.timers.get(o.inst.id);
      if (t) t.ends = this.h.clock + (sw.seconds ?? 10);
    } else this.turn(o, true, why);
  }

  /** a hit on an object: a switch that answers this kind of hit is used (true); quiet: no word when it does not */
  hit(o: T, type: DamageType, quiet = false): boolean {
    const sw = o.def.switch;
    if (sw?.by !== 'hit') return false;
    if (!switchHitBy(sw, type)) {
      if (!quiet) this.h.say(`Nothing happens: it needs ${sw.hitBy?.join(' or ')}.`, 1.8);
      return true;
    }
    this.use(o, sw, type);
    return true;
  }

  /** step 12c-2: a pinwheel the wind reaches (true: it turns) or no longer reaches */
  blow(o: T, on: boolean) {
    const sw = o.def.switch;
    if (sw?.by !== 'wind') return;
    if (on) {
      this.use(o, sw, 'the wind');
    } else if (sw.stays === 'held') this.turn(o, false, 'wind gone');
  }

  /** step 12b: a light sensor lit by a beam (true) or left dark */
  light(o: T, lit: boolean) {
    const sw = o.def.switch;
    if (sw?.by !== 'light') return;
    if (lit) {
      this.h.sound('shine', this.centre(o));
      this.use(o, sw, 'beam');
    } else if (sw.stays === 'held') this.turn(o, false, 'beam gone');
  }

  /** Action at an object: a press switch is used, a lock tries its key, a mirror turns (true: handled) */
  press(o: T): boolean {
    const sw = o.def.switch;
    if (sw?.by === 'press') {
      this.use(o, sw, 'pressed');
      return true;
    }
    // step 12b: a mirror is turned by holding it (Grab) and pushing it round, not with a press
    if (o.def.lock && o.state === o.def.states[0]) return this.unlock(o, o.def.lock);
    return false;
  }

  /** step 12b: a mirror turned round to lean the other way (the hero holding it shoves it: the Push pose) */
  turnMirror(o: T): boolean {
    if (!o.def.mirror || o.def.mirror.turns === false || o.def.states.length < 2) return false;
    const i = Math.max(0, o.def.states.indexOf(o.state));
    this.h.setState(o, o.def.states[i === 0 ? 1 : 0]!);
    this.turnPose = { kind: 'push', t: TURN_POSE };
    this.h.sound('scrape', this.centre(o));
    this.h.log(`${o.def.name} turned`);
    return true;
  }

  /**
   * Step switches go down under weight: whatever stands on one — the hero, neighbours and enemies, push blocks,
   * loose things the physics engine moves — and weighs at least what it needs (Needs weight, 1 at first).
   */
  private stepSwitches() {
    const s = this.h.heroState;
    const now = new Set<string>();
    const near = this.h.near(s.x, s.z, 24);
    const blocks = near.filter((o) => o.def.push);
    const others = this.h.weighing?.() ?? [];
    for (const o of near) {
      const sw = o.def.switch;
      if (sw?.by !== 'step') continue;
      const b = boxOf(o.bricks);
      if (!b) continue;
      const heavy = sw.heavy ?? 'any';
      const on = (x0: number, x1: number, z0: number, z1: number, y0: number) =>
        x0 < b.x1 - 0.2 &&
        x1 > b.x0 + 0.2 &&
        z0 < b.z1 - 0.2 &&
        z1 > b.z0 + 0.2 &&
        y0 >= b.y1 - 1.5 &&
        y0 <= b.y1 + 1.5;
      let weight = 0;
      let by = '';
      const add = (w: number, who: string) => {
        weight += w;
        by ||= who;
      };
      // the hero (people stand on it with their feet: a narrow footprint)
      if (heavy !== 'block' && on(s.x - 0.3, s.x + 0.3, s.z - 0.3, s.z + 0.3, s.y / 0.4)) add(HERO_WEIGHT, 'hero');
      if (heavy !== 'hero') {
        for (const k of blocks) if (rests(boxOf(k.bricks), b)) add(BLOCK_WEIGHT, 'block');
        for (const t of others)
          if ((heavy === 'any' || t.kind === 'loose') && on(t.x0, t.x1, t.z0, t.z1, t.y0)) add(t.weight, t.kind);
      }
      if (weight < (sw.weight ?? 1)) continue;
      now.add(o.inst.id);
      // stepped on now (not still standing on it)
      if (!this.held.has(o.inst.id)) this.use(o, sw, by);
    }
    // held switches come back up when nothing (or not enough) stands on them
    for (const id of this.held)
      if (!now.has(id)) {
        const o = near.find((x) => x.inst.id === id);
        if (o?.def.switch?.stays === 'held') this.turn(o, false, 'let go');
      }
    this.held = now;
  }

  /** after a switch moved: a push block resting on it sinks (or rises) with its top */
  private settleOn(o: T, was: Box | null) {
    if (!was) return;
    for (const k of this.h.near(...this.centreXZ(o), 6)) {
      if (!k.def.push || !rests(boxOf(k.bricks), was)) continue;
      const y = this.landing(k, 0, 0);
      const q = boxOf(k.bricks);
      if (y === null || !q || y === q.y0) continue;
      const p = k.inst.pos;
      this.h.moveTo(k, [Number(p[0]), Number(p[1]) + (y - q.y0), Number(p[2])]);
    }
  }

  private centreXZ(o: T): [number, number] {
    const b = boxOf(o.bricks);
    return b ? [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2] : [Number(o.inst.pos[0]), Number(o.inst.pos[2])];
  }

  private stepTimers() {
    for (const [id, t] of this.timers) {
      if (this.h.clock >= t.ends) {
        this.timers.delete(id);
        this.turn(t.o, false, 'time up');
        continue;
      }
      // ticks, faster near the end
      const left = t.ends - this.h.clock;
      const every = left < 3 ? 0.25 : 0.5;
      if (this.h.clock - t.tick >= every) {
        t.tick = this.h.clock;
        this.h.sound('tick');
      }
    }
  }

  /** seconds left on a timed switch (null: not running) */
  timeLeft(id: string): number | null {
    const t = this.timers.get(id);
    return t ? Math.max(0, t.ends - this.h.clock) : null;
  }

  // ---------- locks and pickups ----------

  private unlock(o: T, l: LockDef): boolean {
    const item = lockItem(l);
    const have = this.count(item) ?? this.itemCount?.(item) ?? 0;
    if (have <= 0) {
      this.h.say(
        l.key === 'small'
          ? 'Locked. It needs a small key from this place.'
          : l.key === 'boss'
            ? 'A big lock: it needs the boss key.'
            : `Locked. It needs ${/^[aeiou]/i.test(item) ? 'an' : 'a'} ${item}.`,
        2.2,
      );
      return true;
    }
    if (lockUses(l) && !this.take(item, 1)) this.takeItem?.(item, 1);
    this.h.setState(o, o.def.states[1]!);
    this.h.sound('unlock', this.centre(o));
    this.h.fire('unlocked', o, { key: item });
    this.h.log(`${o.def.name} unlocked with ${item}`);
    return true;
  }

  /** the inventory for items that are not a dungeon's (set by the session) */
  itemCount?: (item: string) => number;
  takeItem?: (item: string, n: number) => void;

  private stepPickups() {
    const s = this.h.heroState;
    for (const o of this.h.near(s.x, s.z, 12)) {
      const p = o.def.pickup;
      if (!p) continue;
      const b = boxOf(o.bricks);
      if (!b) continue;
      const feet = s.y / 0.4;
      // touching it: the hero's body (not its middle) reaches a tall pickup it cannot step onto
      if (s.x < b.x0 - 1 || s.x > b.x1 + 1 || s.z < b.z0 - 1 || s.z > b.z1 + 1) continue;
      if (feet > b.y1 + 2 || feet + 10 < b.y0) continue;
      this.h.remove(o);
      const n = p.count ?? 1;
      if (!this.give(p.item, n)) this.h.give(p.item, n);
      this.h.fire('pickedUp', o, { item: p.item, count: n });
    }
  }

  private centre(o: T): [number, number, number] {
    const b = boxOf(o.bricks);
    return b ? [(b.x0 + b.x1) / 2, ((b.y0 + b.y1) / 2) * 0.4, (b.z0 + b.z1) / 2] : [0, 0, 0];
  }

  // ---------- saves ----------

  capture(): Record<string, { keys: number; boss: boolean; map: boolean; compass: boolean; seen: string[] }> {
    const out: Record<string, { keys: number; boss: boolean; map: boolean; compass: boolean; seen: string[] }> = {};
    for (const [id, r] of this.dungeons) out[id] = { ...r, seen: [...r.seen].slice(0, 20000) };
    return out;
  }

  restore(
    d: Record<string, { keys: number; boss: boolean; map: boolean; compass: boolean; seen: string[] }> | undefined,
  ) {
    this.dungeons.clear();
    this.timers.clear();
    this.held.clear();
    this.slide = null;
    this.grab = null;
    this.climbing = null;
    this.climbTry = null;
    this.ladder = null;
    this.turnPose = null;
    for (const [id, r] of Object.entries(d ?? {})) this.dungeons.set(id, { ...r, seen: new Set(r.seen) });
  }
}
