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
  remove(o: T): void;
  /** an ordinary item (not a dungeon's) to the inventory, as the game always gives */
  give(item: string, count: number): void;
  say(text: string, seconds?: number): void;
  sound(
    id: 'scrape' | 'click' | 'tick' | 'unlock' | 'keyget' | 'secret' | 'itemget',
    at?: [number, number, number],
  ): void;
  /** logic and the event log */
  fire(event: 'switch' | 'pushed' | 'unlocked' | 'pickedUp', o: T, extra: Record<string, unknown>): void;
  log(text: string): void;
};

export type DungeonRecord = { keys: number; boss: boolean; map: boolean; compass: boolean; seen: Set<string> };

/** studs on a side of a cell the minimap reveals (a dungeon without its map shows only these) */
export const SEEN_CELL = 6;
const PUSH_HOLD = 0.4;
const PULL_HOLD = 0.3;
const SLIDE_STEP = 0.08;

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

const pieceBox = (p: { x: number; y: number; z: number; rows: number; cols: number; turn: number; kind: string }) => {
  const [w, d] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
  return { x0: p.x, x1: p.x + w, z0: p.z, z1: p.z + d, y0: p.y, y1: p.y + (p.kind === 'brick' ? 3 : 1) };
};

export class Puzzles<T extends PuzzleObject = PuzzleObject> {
  readonly dungeons = new Map<string, DungeonRecord>();
  private pushing: { id: string; dx: number; dz: number; t: number } | null = null;
  /** seconds the hero keeps leaning after a shove, while it walks up to the block again */
  private leanFor = 0;
  /** the block held for pulling (Action held) */
  grab: { id: string; t: number } | null = null;
  private slide: { o: T; dx: number; dz: number; left: number; t: number; pulled: boolean } | null = null;
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
    this.leanFor = Math.max(0, this.leanFor - dt);
    const s = this.h.heroState;
    if (this.h.dungeon()) this.record().seen.add(`${Math.floor(s.x / SEEN_CELL)},${Math.floor(s.z / SEEN_CELL)}`);
    this.stepSlide(dt);
    if (!this.slide && this.h.free()) {
      this.stepPush(dt);
      this.stepPull(dt);
    } else this.pushing = null;
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
      if (!o.def.push) continue;
      const b = boxOf(o.bricks);
      if (!b) continue;
      if (px < b.x0 - 0.05 || px > b.x1 + 0.05 || pz < b.z0 - 0.05 || pz > b.z1 + 0.05) continue;
      // its bottom about level with the hero's feet (it may sit on a switch), its top above them
      if (feet + 3 < b.y0 || feet > b.y1 - 1) continue;
      return { o, dx, dz };
    }
    return null;
  }

  private stepPush(dt: number) {
    const want = this.h.moveWish();
    if (this.grab || Math.hypot(want.x, want.z) < 0.5) {
      this.pushing = null;
      return;
    }
    const f = this.facing();
    // pushing: walking into it, the way the hero faces
    if (!f || want.x * f.dx + want.z * f.dz < 0.6) {
      this.pushing = null;
      return;
    }
    if (!this.pushing || this.pushing.id !== f.o.inst.id || this.pushing.dx !== f.dx || this.pushing.dz !== f.dz)
      this.pushing = { id: f.o.inst.id, dx: f.dx, dz: f.dz, t: 0 };
    this.pushing.t += dt;
    if (this.pushing.t < PUSH_HOLD) return;
    this.pushing = null;
    this.tryMove(f.o, f.dx, f.dz, false);
  }

  /** the Action button can grab a pullable block in front */
  canGrab(): boolean {
    const f = this.facing();
    return !!f?.o.def.push?.pull && !this.slide;
  }

  /** Action held (true) or let go */
  setGrab(down: boolean) {
    if (!down) {
      this.grab = null;
      return;
    }
    const f = this.facing();
    if (f?.o.def.push?.pull) this.grab = { id: f.o.inst.id, t: 0 };
  }

  private stepPull(dt: number) {
    const g = this.grab;
    if (!g) return;
    const f = this.facing(1.4);
    if (!f || f.o.inst.id !== g.id) {
      this.grab = null;
      return;
    }
    const want = this.h.moveWish();
    const along = want.x * f.dx + want.z * f.dz;
    if (along > -0.6) {
      g.t = 0;
      // pushing while holding on works as a push
      if (along > 0.6) {
        g.t = -1;
        this.tryMove(f.o, f.dx, f.dz, false);
      }
      return;
    }
    g.t += dt;
    if (g.t < PULL_HOLD) return;
    g.t = 0;
    this.tryMove(f.o, -f.dx, -f.dz, true);
  }

  /** the studs a shove moves it */
  private stepOf(o: T, dx: number): number {
    const b = boxOf(o.bricks)!;
    return o.def.push?.step ?? (dx ? b.x1 - b.x0 : b.z1 - b.z0);
  }

  /** starts a slide if the block can go there; false (and a word) when something is in the way */
  tryMove(o: T, dx: number, dz: number, pulled: boolean): boolean {
    if (this.slide) return false;
    const n = this.stepOf(o, dx);
    for (let i = 1; i <= n; i++)
      if (this.landing(o, dx * i, dz * i) === null) {
        if (i === 1) {
          this.h.log(`${o.def.name}: blocked`);
          return false;
        }
        break;
      }
    if (pulled) {
      // the hero steps back first: there must be room behind
      const s = this.h.heroState;
      if (!this.h.heroFits(s.x + dx * n, s.z + dz * n)) {
        this.h.say('No room to step back.', 1.2);
        return false;
      }
    }
    this.slide = { o, dx, dz, left: n, t: 0, pulled };
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

  private stepSlide(dt: number) {
    const sl = this.slide;
    if (!sl) return;
    sl.t += dt;
    if (sl.t < SLIDE_STEP) return;
    sl.t = 0;
    const y = this.landing(sl.o, sl.dx, sl.dz);
    const b = boxOf(sl.o.bricks);
    if (y === null || !b) {
      this.endSlide(sl);
      return;
    }
    const p = sl.o.inst.pos;
    // pulled: the hero steps back first, then the block follows into where the hero stood
    if (sl.pulled) {
      const s = this.h.heroState;
      this.h.placeHero(s.x + sl.dx, s.z + sl.dz);
    }
    this.h.moveTo(sl.o, [Number(p[0]) + sl.dx, Number(p[1]) + (y - b.y0), Number(p[2]) + sl.dz]);
    sl.left--;
    if (sl.left <= 0) this.endSlide(sl);
  }

  private endSlide(sl: NonNullable<Puzzles<T>['slide']>) {
    this.slide = null;
    if (!sl.pulled) this.leanFor = 0.6;
    if (this.grab) this.grab.t = 0;
    this.h.fire('pushed', sl.o, { pulled: sl.pulled });
    this.h.log(`${sl.o.def.name} ${sl.pulled ? 'pulled' : 'pushed'}`);
  }

  get sliding(): boolean {
    return !!this.slide;
  }

  /** how the hero stands: holding a block (pull), leaning into one (push), or neither */
  get pose(): 'push' | 'pull' | null {
    if (this.grab) return 'pull';
    if (this.pushing || (this.slide && !this.slide.pulled)) return 'push';
    // still walking on after a shove: no flicker into a walk between two shoves
    const w = this.h.moveWish();
    if (this.leanFor > 0 && Math.hypot(w.x, w.z) > 0.5) return 'push';
    return null;
  }

  // ---------- switches ----------

  private isOn(o: T): boolean {
    return o.state === o.def.states[1];
  }

  /** turns a switch on or off (its first two states), with its sound, timer and events */
  turn(o: T, on: boolean, why = '') {
    const sw = o.def.switch;
    if (!sw || o.def.states.length < 2 || this.isOn(o) === on) return;
    this.h.setState(o, o.def.states[on ? 1 : 0]!);
    if (this.isOn(o) !== on) return;
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

  /** a hit on an object: a switch that answers this kind of hit is used (true) */
  hit(o: T, type: DamageType): boolean {
    const sw = o.def.switch;
    if (sw?.by !== 'hit') return false;
    if (!switchHitBy(sw, type)) {
      this.h.say(`Nothing happens: it needs ${sw.hitBy?.join(' or ')}.`, 1.8);
      return true;
    }
    this.use(o, sw, type);
    return true;
  }

  /** Action at an object: a press switch is used, a lock tries its key (true: handled) */
  press(o: T): boolean {
    const sw = o.def.switch;
    if (sw?.by === 'press') {
      this.use(o, sw, 'pressed');
      return true;
    }
    if (o.def.lock && o.state === o.def.states[0]) return this.unlock(o, o.def.lock);
    return false;
  }

  private stepSwitches() {
    const s = this.h.heroState;
    const now = new Set<string>();
    const near = this.h.near(s.x, s.z, 24);
    const blocks = near.filter((o) => o.def.push);
    for (const o of near) {
      const sw = o.def.switch;
      if (sw?.by !== 'step') continue;
      const b = boxOf(o.bricks);
      if (!b) continue;
      const heavy = sw.heavy ?? 'any';
      const feet = s.y / 0.4;
      const hero =
        heavy !== 'block' &&
        s.x > b.x0 - 0.2 &&
        s.x < b.x1 + 0.2 &&
        s.z > b.z0 - 0.2 &&
        s.z < b.z1 + 0.2 &&
        feet >= b.y1 - 1.5 &&
        feet <= b.y1 + 1.5;
      const block =
        heavy !== 'hero' &&
        blocks.some((k) => {
          const q = boxOf(k.bricks);
          return (
            !!q &&
            q.x0 < b.x1 - 0.5 &&
            q.x1 > b.x0 + 0.5 &&
            q.z0 < b.z1 - 0.5 &&
            q.z1 > b.z0 + 0.5 &&
            Math.abs(q.y0 - b.y1) <= 1.5
          );
        });
      if (!hero && !block) continue;
      now.add(o.inst.id);
      // stepped on now (not still standing on it)
      if (!this.held.has(o.inst.id)) this.use(o, sw, block ? 'block' : 'hero');
    }
    // held switches come back up when nothing stands on them
    for (const id of this.held)
      if (!now.has(id)) {
        const o = near.find((x) => x.inst.id === id);
        if (o?.def.switch?.stays === 'held') this.turn(o, false, 'let go');
      }
    this.held = now;
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
      if (s.x < b.x0 - 0.6 || s.x > b.x1 + 0.6 || s.z < b.z0 - 0.6 || s.z > b.z1 + 0.6) continue;
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
    this.leanFor = 0;
    for (const [id, r] of Object.entries(d ?? {})) this.dungeons.set(id, { ...r, seen: new Set(r.seen) });
  }
}
