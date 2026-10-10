import { BUILTIN_ASSETS } from '../../builtin/assets';
import { BUILTIN_CLIPS } from '../../builtin/clips';
import { expandAsset } from '../../core/assets/expand';
import { type ExpandedInstance, expandInstances } from '../../core/assets/instances';
import { brickToPiece, type FileSource, mapToLegacyBuild } from '../../core/bridge/legacy-bridge';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { LegacyPiece } from '../../core/legacy/types';
import type { ExecCtx } from '../../core/logic/catalog';
import {
  type Asset,
  type Character,
  type Clip,
  type Gates,
  type Instances,
  type LogicGraph,
  type MapDoc,
  type MapState,
  type Project,
  paths,
  type Variables,
} from '../../core/schema';
import { Animator } from '../character/animator';
import {
  type Controller,
  type Debris,
  type HeroState,
  type LegacyRuntime,
  type LegacyWorldMeta,
  legacyRuntime,
  type Npc,
} from '../legacy/runtime-modules';
import { LogicRuntime } from '../logic/interpreter';
import { ActionRunner } from './actions';
import { chunkKeyOf, inspectPieces } from './pieces';
import { Runtime, type System } from './runtime';

type AssetInstanceId = import('../../core/schema').AssetInstance['id'];

const inBox = (z: { min: number[]; max: number[] }, x: number, y: number, zz: number) =>
  x >= z.min[0]! && x <= z.max[0]! && y >= z.min[1]! && y <= z.max[1]! && zz >= z.min[2]! && zz <= z.max[2]!;

export type BrokenEntry = { id: number; originals: LegacyPiece[]; progress: number };

/** Everything that changes while one map is being played. Built from a frozen project snapshot. */
export type MapWorld = {
  mapId: string;
  doc: MapDoc;
  meta: LegacyWorldMeta;
  pieces: LegacyPiece[];
  broken: BrokenEntry[];
  debris: Debris[];
  npcs: Npc[];
  controller: Controller;
  /** chunk keys whose bricks changed since the renderer last looked */
  dirtyChunks: Set<string>;
  brokenSerial: number;
  /** asset instances of this map (their state changes while playing) */
  instances: PlayInstance[];
};

export type PlayInstance = ExpandedInstance & { state: string };
export type Prompt = { instance: PlayInstance; socket: string; label: string; pos: [number, number, number] };

export type InputState = { keys: Set<string>; jump: boolean; touch: Set<string> };
export type GameEvent = {
  t: number;
  kind: 'start' | 'smash' | 'rebuild' | 'travel' | 'talk' | 'info' | 'cheat' | 'event';
  msg: string;
};

const COLOR_OF = (i: number) => LEGACY_COLORS[i]?.[1] ?? '#ff00ff';
const rgb = (i: number) => [1, 3, 5].map((k) => (parseInt(COLOR_OF(i).slice(k, k + 2), 16) / 255) ** 1.5);

/**
 * Play-in-editor session (P2). Reads a snapshot of the project, never the live store, so Stop simply
 * drops the session and the project is exactly as it was. Movement, collision, NPCs and debris use
 * v68's own modules; smash, rebuild and gate travel are ports of v68's character-game / map-network code.
 */
export class PlaySession {
  readonly L: LegacyRuntime;
  readonly runtime: Runtime<PlaySession>;
  readonly worlds = new Map<string, MapWorld>();
  world!: MapWorld;
  hero: Record<string, unknown>;
  input: InputState = { keys: new Set(), jump: false, touch: new Set() };
  camYaw = 0;
  camPitch = 0.28;
  zoom = 55;
  clock = 0;
  events: GameEvent[] = [];
  message = '';
  messageUntil = 0;
  talking: Npc | null = null;
  rebuildHeld = false;
  rebuildEntry: BrokenEntry | null = null;
  private pendingSmash: { remaining: number; reach: number; id: number | null; group?: string | undefined } | null =
    null;
  private smashCooldown = 0;
  private travelLock: { spawn: string } | null = null;
  readonly listeners = new Set<(e: GameEvent) => void>();
  /** the interaction the hero can use right now (E), shown as a prompt */
  prompt: Prompt | null = null;
  readonly vars = new Map<string, unknown>();
  readonly inventory = new Map<string, number>();
  readonly actions: ActionRunner;
  /** keyframe clips on the hero (emotes, keys 1-4) */
  readonly heroAnim = new Animator();
  /** logic graphs of the project (P4.2) */
  logic!: LogicRuntime;
  /** zones the hero is inside, by zone id */
  private inZones = new Set<string>();
  private spawnSerial = 0;
  onBreak: ((b: NonNullable<LogicRuntime['paused']>) => void) | null = null;
  emotes: Clip[] = [];

  constructor(
    readonly snapshot: FileSource,
    opts: { mapId?: string; spawnId?: string | null } = {},
  ) {
    this.L = legacyRuntime();
    this.actions = new ActionRunner({
      setState: (state, target, self) => this.setInstanceState(target ?? self, state),
      teleport: (spawn) => {
        const sp = this.world.doc.spawns.find((x) => x.id === spawn);
        if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
      },
      travel: (map, spawn) => this.travel(map, spawn),
      log: (kind, msg) => this.emit(kind === 'event' ? 'event' : 'info', msg),
      custom: (event) => this.logic.fire({ type: 'event.onCustom', match: { event } }),
      vars: this.vars,
      inventory: this.inventory,
    });
    const project = snapshot.get(paths.project) as Project;
    const heroChr = project.hero ? (snapshot.get(paths.character(project.hero)) as Character | undefined) : undefined;
    this.hero = this.L.CharacterCatalog.validate({ ...this.L.CharacterCatalog.defaults, ...(heroChr?.profile ?? {}) });
    this.emotes = this.resolveEmotes(heroChr);
    const mapId = opts.mapId ?? project.entry.map;
    this.world = this.loadWorld(mapId);
    const spawn =
      this.world.doc.spawns.find((s) => s.id === (opts.spawnId ?? project.entry.spawn)) ?? this.world.doc.spawns[0];
    if (spawn) this.placeAt(spawn.pos as [number, number, number], spawn.yaw);
    // Starting on a gate's spawn must not travel at once (v68 locks arrival the same way).
    this.travelLock = spawn ? { spawn: spawn.id } : null;
    this.camYaw = this.world.controller.state.heading + Math.PI;
    this.logic = this.makeLogic();
    this.runtime = new Runtime<PlaySession>(this, this.systems());
    this.logic.fire({ type: 'event.onStart' });
    this.emit(
      'start',
      `Playing ${this.world.doc.name}${spawn ? ` from ${spawn.name}` : ''}. WASD moves, Space jumps, F smashes, hold E rebuilds, T talks.`,
    );
  }

  // ---------- worlds ----------

  private loadWorld(mapId: string): MapWorld {
    const cached = this.worlds.get(mapId);
    if (cached) return cached;
    const doc = this.snapshot.get(paths.map(mapId)) as MapDoc;
    const build = mapToLegacyBuild(this.snapshot, mapId);
    const meta = (build.world ?? null) as LegacyWorldMeta;
    const pieces = build.pieces.map((p) => ({ ...p }));
    const state = (this.snapshot.get(paths.state(mapId)) as MapState | undefined) ?? { broken: [], player: null };
    const controller = new this.L.GamePhysics.Controller(pieces, meta);
    const inst = this.snapshot.get(paths.instances(mapId)) as Instances | undefined;
    const npcs = build.npcs
      ? this.L.NPCWorld.restore(build.npcs, pieces, meta)
      : pieces.length
        ? this.L.NPCWorld.populate(pieces, meta, controller.state)
        : [];
    void inst;
    this.L.NPCWorld.connect(npcs, controller);
    const w: MapWorld = {
      mapId,
      doc,
      meta,
      pieces,
      broken: state.broken.map((b) => ({ id: b.id, originals: b.originals.map((p) => ({ ...p })), progress: 0 })),
      debris: [],
      npcs,
      controller,
      dirtyChunks: new Set(),
      brokenSerial: Math.max(0, ...state.broken.map((b) => b.id)) + 1,
      instances: expandInstances(this.snapshot, mapId).map((e) => ({
        ...e,
        state: e.inst.state ?? e.def.initialState,
      })),
    };
    this.worlds.set(mapId, w);
    return w;
  }

  /** Put the hero at a spawn (v68 arrival: keep clear of scenery, fall back to the map's safe spawn). */
  placeAt(pos: [number, number, number], heading: number) {
    const c = this.world.controller;
    Object.assign(c.state, {
      x: pos[0],
      y: pos[1],
      z: pos[2],
      heading,
      vy: 0,
      grounded: true,
      speed: 0,
      attack: 0,
      building: false,
    });
    c.repairPosition();
    if (!c.clear(c.state.x, c.state.y, c.state.z)) {
      c.spawn();
      this.say('That spawn point is blocked, so you start on the nearest safe ground.', 3);
    }
  }

  get heroState(): HeroState {
    return this.world.controller.state;
  }

  // ---------- events ----------

  emit(kind: GameEvent['kind'], msg: string) {
    const e = { t: Math.round(this.clock * 10) / 10, kind, msg };
    this.events.push(e);
    if (this.events.length > 500) this.events.shift();
    for (const l of this.listeners) l(e);
  }

  say(msg: string, seconds = 2.5) {
    this.message = msg;
    this.messageUntil = this.clock + seconds;
  }

  // ---------- actions (keyboard / touch / cheats) ----------

  smash() {
    const s = this.heroState;
    if (this.smashCooldown > 0 || s.building || this.talking) return;
    const w = this.L.GameWeapons.get(this.hero.held);
    Object.assign(s, { attack: w.duration, attackDuration: w.duration, attackWeapon: this.hero.held });
    delete (s as Record<string, unknown>).attackImpact;
    this.smashCooldown = w.duration + 0.02;
    const hit = this.world.controller.target(w.reach);
    this.pendingSmash = hit
      ? { id: hit.id, group: hit.group, remaining: w.contact, reach: w.reach }
      : { id: null, remaining: w.contact, reach: w.reach };
  }

  talk() {
    if (this.talking) {
      this.talking = null;
      return;
    }
    const npc = this.L.NPCWorld.nearest(this.world.npcs, this.heroState);
    if (!npc) {
      this.say('Nobody close enough to talk to.', 1.5);
      return;
    }
    this.talking = npc;
    const r = this.L.NPCWorld.reply(
      npc,
      'hello',
      this.world.meta,
      { time: this.world.doc.sky.time },
      this.world.broken.length,
    );
    const text = typeof r === 'string' ? r : (r?.text ?? '…');
    this.emit('talk', `${npc.profile.name}: ${text}`);
    this.say(`${npc.profile.name}: ${text}`, 5);
  }

  // ---------- systems ----------

  private systems(): System<PlaySession>[] {
    return [
      { id: 'hero', fixed: (g, dt) => g.moveHero(dt) },
      { id: 'combat', fixed: (g, dt) => g.stepSmash(dt) },
      { id: 'rebuild', fixed: (g, dt) => g.stepRebuild(dt) },
      { id: 'debris', fixed: (g, dt) => g.stepDebris(dt) },
      { id: 'npc', fixed: (g, dt) => g.stepNpcs(dt) },
      { id: 'gates', fixed: (g) => g.stepGates() },
      { id: 'interact', fixed: (g) => g.stepInteract() },
      { id: 'anim', fixed: (g, dt) => g.stepAnim(dt) },
      { id: 'zones', fixed: (g) => g.stepZones() },
      { id: 'logic', fixed: (g) => g.logic.step(g.clock) },
      {
        id: 'clock',
        fixed: (g, dt) => {
          g.clock += dt;
        },
      },
    ];
  }

  private inputVector() {
    const k = this.input.keys;
    const t = this.input.touch;
    const has = (...names: string[]) => names.some((n) => k.has(n) || t.has(n));
    return {
      x: (has('d', 'arrowright', 'right') ? 1 : 0) - (has('a', 'arrowleft', 'left') ? 1 : 0),
      z: (has('w', 'arrowup', 'forward') ? 1 : 0) - (has('s', 'arrowdown', 'back') ? 1 : 0),
      run: has('shift', 'run'),
      jump: this.input.jump,
      vertical: 0,
    };
  }

  moveHero(dt: number) {
    this.smashCooldown = Math.max(0, this.smashCooldown - dt);
    const input = this.talking ? { x: 0, z: 0, run: false, jump: false, vertical: 0 } : this.inputVector();
    this.input.jump = false;
    // v68 heroMovement without powers: the controller does walking, running, jumping and collision.
    this.world.controller.step(
      { ...input, speedScale: 1, jumpSpeed: this.hero.power === 'Super jumping' ? 19 : 9.5 },
      dt,
      this.camYaw,
    );
    if (this.heroState.y < -15) {
      this.world.controller.spawn();
      this.say('Back on solid ground.', 2);
    }
  }

  stepSmash(dt: number) {
    const strike = this.pendingSmash;
    if (!strike) return;
    strike.remaining -= dt;
    if (strike.remaining > 1e-6) return;
    this.pendingSmash = null;
    const hit = this.world.controller.target(strike.reach);
    if (!hit || (strike.id !== null && hit.id !== strike.id && (!strike.group || hit.group !== strike.group))) return;
    this.breakHit(hit, { heading: this.heroState.heading, impulse: 2, mass: 1 });
  }

  /** Port of v68 breakHit: the hit brick (or its whole group) plus anything it was holding up. */
  breakHit(hit: LegacyPiece, impact?: { heading: number; impulse: number; mass: number }) {
    const w = this.world;
    const owner = this.instanceOfPiece(hit.id);
    if (owner && !owner.def.smash.enabled) {
      this.say(`The ${owner.def.name.toLowerCase()} can’t be smashed.`, 1.5);
      return 0;
    }
    const ids = new Set(
      w.pieces.filter((p) => p.y > 0 && (p.id === hit.id || (hit.group && p.group === hit.group))).map((p) => p.id!),
    );
    let remaining = w.pieces.filter((p) => !ids.has(p.id!));
    let check = inspectPieces(remaining);
    if (!check.ok && check.connected) {
      remaining.forEach((p, i) => {
        if (!check.connected!.has(i)) ids.add(p.id!);
      });
      remaining = w.pieces.filter((p) => !ids.has(p.id!));
      check = inspectPieces(remaining);
    }
    if (!check.ok) {
      this.say(check.reason ?? 'That can’t break.', 2);
      return 0;
    }
    const originals = w.pieces.filter((p) => ids.has(p.id!)).map((p) => ({ ...p }));
    if (!originals.length) return 0;
    const entry: BrokenEntry = { id: w.brokenSerial++, originals, progress: 0 };
    for (const p of originals) w.dirtyChunks.add(chunkKeyOf(p));
    w.pieces = remaining;
    w.broken.push(entry);
    this.makeDebris(entry, impact);
    w.controller.replace(w.pieces, w.meta);
    this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
    this.emit(
      'smash',
      `${originals.length} brick${originals.length === 1 ? '' : 's'} smashed${hit.group ? ` (${hit.group})` : ''}`,
    );
    this.logic.fire({
      type: 'event.onSmash',
      match: { asset: owner?.def.id ?? '' },
      payload: { target: owner?.inst.id ?? hit.group ?? String(hit.id), bricks: originals.length },
    });
    this.say(
      `${originals.length} ${originals.length === 1 ? 'brick' : 'bricks'} smashed into loose pieces. Hold E nearby to put them back.`,
      2.5,
    );
    return originals.length;
  }

  private makeDebris(entry: BrokenEntry, impact?: { heading: number; impulse: number; mass: number }) {
    const w = this.world;
    const ps = entry.originals;
    const count = Math.min(36, Math.max(12, ps.length * 3));
    for (let i = 0; i < count; i++) {
      const p = ps[i % ps.length]!;
      const b = this.L.GamePhysics.bounds(p);
      const x = b.x0 + (b.x1 - b.x0) * (0.2 + 0.6 * Math.random());
      const y = b.y0 + (b.y1 - b.y0) * Math.random();
      const z = b.z0 + (b.z1 - b.z0) * (0.2 + 0.6 * Math.random());
      const angle = i * 2.39996;
      const d: Debris = {
        entryId: entry.id,
        x,
        y,
        z,
        ox: x,
        oy: y,
        oz: z,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: 4 + Math.random() * 5,
        vz: Math.sin(angle) * (2 + Math.random() * 3),
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        rz: 0,
        color: rgb(p.color),
        scale: 0.48 + Math.random() * 0.24,
        age: 0,
      };
      if (impact) {
        d.vx += Math.sin(impact.heading) * impact.impulse;
        d.vz += Math.cos(impact.heading) * impact.impulse;
        d.vy += Math.min(1.8, impact.mass * 0.3);
      }
      w.debris.push(d);
    }
    for (const d of w.debris) this.L.GamePhysics.confineDebris(d, w.controller);
    if (w.debris.length > 220) w.debris.splice(0, w.debris.length - 220);
  }

  stepDebris(dt: number) {
    const w = this.world;
    for (const d of w.debris) {
      if (this.rebuildEntry?.id === d.entryId) {
        const t = this.rebuildEntry.progress;
        d.age += dt;
        d.sleeping = false;
        d.x += (d.ox - d.x) * dt * (3 + t * 8);
        d.y += (d.oy - d.y) * dt * (3 + t * 8);
        d.z += (d.oz - d.z) * dt * (3 + t * 8);
        this.L.GamePhysics.confineDebris(d, w.controller);
        continue;
      }
      this.L.GamePhysics.stepDebrisPiece(d, dt, w.controller);
    }
  }

  private damagedBounds(entry: BrokenEntry) {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const p of entry.originals) {
      const c = this.L.GamePhysics.bounds(p);
      b.x0 = Math.min(b.x0, c.x0);
      b.y0 = Math.min(b.y0, c.y0);
      b.z0 = Math.min(b.z0, c.z0);
      b.x1 = Math.max(b.x1, c.x1);
      b.y1 = Math.max(b.y1, c.y1);
      b.z1 = Math.max(b.z1, c.z1);
    }
    return b;
  }

  nearestBroken(): BrokenEntry | null {
    const s = this.heroState;
    let best: BrokenEntry | null = null;
    let dist = Infinity;
    for (const e of this.world.broken) {
      const owner = this.instanceOfPiece(e.originals[0]?.id);
      if (owner && !owner.def.smash.rebuild) continue;
      const b = this.damagedBounds(e);
      const d = Math.hypot(Math.max(b.x0 - s.x, 0, s.x - b.x1), Math.max(b.z0 - s.z, 0, s.z - b.z1));
      if (d <= 3.4 && b.y0 < s.y + 4.5 && d < dist) {
        dist = d;
        best = e;
      }
    }
    return best;
  }

  private cancelRebuild() {
    if (this.rebuildEntry) this.rebuildEntry.progress = 0;
    this.rebuildEntry = null;
    this.heroState.building = false;
  }

  /** Port of v68 rebuildStep: hold E still and near a smashed object for 1.35 s. */
  stepRebuild(dt: number) {
    const held = this.rebuildHeld || this.input.keys.has('e');
    const entry = held ? (this.rebuildEntry ?? this.nearestBroken()) : null;
    const s = this.heroState;
    if (!entry || !s.grounded || s.speed > 0.01) return this.cancelRebuild();
    const w = this.world;
    const safe =
      !entry.originals.some((p) => this.L.GamePhysics.overlapsPlayer(p, s)) &&
      !this.L.GamePhysics.rebuildTraps(w.controller, entry.originals, s.x, s.z, s.y);
    if (!safe) return this.cancelRebuild();
    if (this.rebuildEntry !== entry) {
      this.cancelRebuild();
      this.rebuildEntry = entry;
      this.pendingSmash = null;
      s.attack = 0;
    }
    s.building = true;
    const b = this.damagedBounds(entry);
    const heading = Math.atan2((b.x0 + b.x1) / 2 - s.x, (b.z0 + b.z1) / 2 - s.z);
    const turn = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
    s.heading += turn * (1 - Math.exp(-dt * 12));
    entry.progress = Math.min(1, entry.progress + dt / 1.35);
    this.say(`Rebuilding ${entry.originals.length} bricks… ${Math.round(entry.progress * 100)}%`, 0.2);
    if (entry.progress < 1) return;
    const restored = [...w.pieces, ...entry.originals.map((p) => ({ ...p }))];
    const check = inspectPieces(restored);
    if (!check.ok) {
      this.cancelRebuild();
      this.rebuildHeld = false;
      this.input.keys.delete('e');
      this.say(`Rebuild blocked: ${check.reason}`, 3);
      return;
    }
    w.pieces = restored;
    for (const p of entry.originals) w.dirtyChunks.add(chunkKeyOf(p));
    w.broken = w.broken.filter((x) => x !== entry);
    w.debris = w.debris.filter((d) => d.entryId !== entry.id);
    w.controller.replace(w.pieces, w.meta);
    this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
    this.cancelRebuild();
    const owner = this.instanceOfPiece(entry.originals[0]?.id);
    this.emit('rebuild', `Rebuilt ${entry.originals.length} bricks${owner ? ` (${owner.def.name})` : ''}`);
    if (owner) this.emit('event', `Event “onRebuildFinished” · ${owner.def.name}`);
    this.logic.fire({
      type: 'event.onRebuildFinished',
      match: { asset: owner?.def.id ?? '' },
      payload: { target: owner?.inst.id ?? entry.originals[0]?.group ?? '' },
    });
    this.say('Rebuilt! Every original brick is back in place.', 2);
  }

  // ---------- logic (P4.2) ----------

  private makeLogic(): LogicRuntime {
    const graphs: LogicGraph[] = [];
    for (const path of this.snapshot.keys())
      if (/^logic\/lg_[0-9a-z]{10}\.json$/.test(path)) graphs.push(this.snapshot.get(path) as LogicGraph);
    const host: ExecCtx = {
      getVar: () => undefined,
      setVar: () => {},
      log: (m) => this.emit('info', `Logic: ${m}`),
      emit: (e) => this.emit('event', `Event “${e}”`),
      random: Math.random,
      setState: (target, state) => {
        if (target) this.setInstanceState(target, state);
        else this.emit('info', `Set state ${state}: no target wired`);
      },
      teleport: (spawn) => {
        const sp = this.world.doc.spawns.find((x) => x.id === spawn);
        if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
      },
      travel: (map, spawn) => {
        if (this.snapshot.get(paths.map(map))) this.travel(map, spawn);
      },
      give: (item, count) => {
        const n = (this.inventory.get(item) ?? 0) + count;
        this.inventory.set(item, n);
        this.emit('info', `Got ${count} × ${item} (${n} in total)`);
        this.say(`+${count} ${item}`, 1.5);
      },
      spawn: (asset, at) => this.spawnAsset(asset, at),
      despawn: (target) => this.despawn(target),
      media: (kind, id, extra) => {
        const what: Record<string, string> = {
          sound: `♪ sound ${id}`,
          music: `♪ music ${id}`,
          stopMusic: '♪ music stops',
          show: `Show screen ${id}`,
          hide: `Hide screen ${id}`,
          setText: `Screen ${id}: ${JSON.stringify(extra)}`,
          cinematic: `Cinematic ${id}`,
          stopCinematic: 'Cinematic stops',
        };
        this.emit('info', `${what[kind]} (arrives in Phase ${kind.includes('inematic') ? 6 : 5})`);
        if (kind === 'setText') this.say(String((extra as { text?: unknown })?.text ?? ''), 3);
        if (kind === 'cinematic') this.logic.fire({ type: 'event.onCinematicDone', match: { cinematic: id } });
      },
      inZone: (zone) => {
        const z = this.world.doc.zones.find((x) => x.id === zone);
        if (!z) return [];
        const out: string[] = [];
        const s = this.heroState;
        if (inBox(z, s.x, s.y + 1, s.z)) out.push('hero');
        for (const i of this.world.instances) {
          let cx = 0;
          let cy = 0;
          let cz = 0;
          for (const b of i.bricks) {
            cx += b.x;
            cy += b.y * 0.4;
            cz += b.z;
          }
          const n = Math.max(1, i.bricks.length);
          if (inBox(z, cx / n + 0.5, cy / n, cz / n + 0.5)) out.push(i.inst.id);
        }
        return out;
      },
    };
    const rt = new LogicRuntime(graphs, this.snapshot.get(paths.variables) as Variables | undefined, host);
    rt.onProblem = (p) => this.emit('info', `Logic problem in ${p.graph}${p.node ? ` · ${p.node}` : ''}: ${p.message}`);
    rt.onBreak = (b) => {
      this.runtime.paused = true;
      this.emit('info', `Breakpoint at ${b.node} (${b.graph})`);
      this.onBreak?.(b);
    };
    return rt;
  }

  /** Continue after a logic breakpoint. */
  continueLogic() {
    this.runtime.paused = false;
    this.logic.continue();
  }

  /** Zones: enter/exit events and the zone's own action lists (P4, zones from Phase 5 tools). */
  stepZones() {
    const s = this.heroState;
    for (const z of this.world.doc.zones) {
      const inside = inBox(z, s.x, s.y + 1, s.z);
      const was = this.inZones.has(z.id);
      if (inside === was) continue;
      if (inside) {
        this.inZones.add(z.id);
        if (z.onEnter?.length) this.actions.run(z.onEnter, this.clock);
        this.logic.fire({ type: 'event.onEnterZone', match: { zone: z.id }, payload: { who: 'hero' } });
      } else {
        this.inZones.delete(z.id);
        if (z.onExit?.length) this.actions.run(z.onExit, this.clock);
        this.logic.fire({ type: 'event.onExitZone', match: { zone: z.id }, payload: { who: 'hero' } });
      }
    }
  }

  /** world.spawn: a copy of an asset at a spawn point, for this play only. */
  spawnAsset(assetId: string, at: string): string | null {
    const def =
      (this.snapshot.get(paths.asset(assetId)) as Asset | undefined) ?? BUILTIN_ASSETS.find((a) => a.id === assetId);
    const sp = this.world.doc.spawns.find((x) => x.id === at);
    if (!def || !sp) {
      this.emit('info', 'Spawn: that asset or spawn point is missing.');
      return null;
    }
    const w = this.world;
    const idBase =
      Math.max(0, ...w.pieces.map((p) => p.id ?? 0), ...w.broken.flatMap((b) => b.originals.map((p) => p.id ?? 0))) + 1;
    const inst = {
      id: `ins_play${String(++this.spawnSerial).padStart(6, '0')}` as AssetInstanceId,
      kind: 'asset' as const,
      asset: def.id,
      pos: [
        Math.round(sp.pos[0] - def.footprint[0] / 2),
        Math.round(sp.pos[1] / 0.4),
        Math.round(sp.pos[2] - def.footprint[1] / 2),
      ] as [number, number, number],
      rot: 0,
      idBase,
    };
    const exp = expandAsset(def, inst);
    const pieces = [...w.pieces, ...exp.bricks.map(brickToPiece)];
    const check = inspectPieces(pieces);
    if (!check.ok) {
      this.emit('info', `Spawn ${def.name}: ${check.reason}`);
      return null;
    }
    w.pieces = pieces;
    for (const b of exp.bricks) w.dirtyChunks.add(chunkKeyOf(brickToPiece(b)));
    w.instances.push({ inst, def, ...exp, state: def.initialState });
    w.controller.replace(w.pieces, w.meta);
    this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
    return inst.id;
  }

  /** world.despawn: removes a placed asset for this play (refused if others stand on it). */
  despawn(target: string) {
    const w = this.world;
    const inst = w.instances.find((i) => i.inst.id === target);
    if (!inst) return;
    const lo = inst.inst.idBase;
    const hi = lo + inst.def.bricks.length;
    const pieces = w.pieces.filter((p) => p.id! < lo || p.id! >= hi);
    const check = inspectPieces(pieces);
    if (!check.ok) {
      this.emit('info', `Remove ${inst.def.name}: ${check.reason}`);
      return;
    }
    for (const p of w.pieces) if (p.id! >= lo && p.id! < hi) w.dirtyChunks.add(chunkKeyOf(p));
    w.pieces = pieces;
    w.instances = w.instances.filter((i) => i !== inst);
    w.controller.replace(w.pieces, w.meta);
    this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
  }

  // ---------- clips (P3.5): emotes on keys 1-4 ----------

  private resolveEmotes(hero: Character | undefined): Clip[] {
    const find = (id: string) =>
      (this.snapshot.get(`clips/${id}.json`) as Clip | undefined) ?? BUILTIN_CLIPS.find((c) => c.id === id);
    const own = (hero?.emotes ?? []).map(find).filter((c): c is Clip => !!c);
    if (own.length) return own;
    const named = ['Jumping jacks', 'Squats', 'Tree · balance', 'Push-ups'];
    return named.map((n) => BUILTIN_CLIPS.find((c) => c.name === n)).filter((c): c is Clip => !!c);
  }

  /** Plays the hero's n-th emote (standing still); pressing it again stops it. */
  emote(n: number) {
    const clip = this.emotes[n];
    if (!clip) return;
    if (this.heroAnim.clip?.id === clip.id) {
      this.heroAnim.stop();
      return;
    }
    const s = this.heroState;
    if (!s.grounded || s.building || this.talking) return;
    this.heroAnim.play(clip);
    this.emit('info', `Emote: ${clip.name ?? clip.id}`);
  }

  stepAnim(dt: number) {
    const a = this.heroAnim;
    if (!a.clip) {
      a.step(dt);
      return;
    }
    const v = this.inputVector();
    const s = this.heroState;
    if (v.x || v.z || v.jump || !s.grounded || (s.attack as number) > 0 || s.building) {
      a.stop();
      return;
    }
    for (const e of a.step(dt)) {
      if ('emit' in e) this.emit('event', `Event “${e.emit}” · ${a.clip?.name ?? 'clip'}`);
      else this.emit('info', `♪ ${e.sound} (audio arrives in Phase 5)`);
    }
  }

  // ---------- asset instances: interactions and states (P3.1) ----------

  instanceOfPiece(id: number | undefined): PlayInstance | null {
    if (id === undefined) return null;
    return this.world.instances.find((i) => id >= i.inst.idBase && id < i.inst.idBase + i.def.bricks.length) ?? null;
  }

  /** Nearest interact/sign socket within 2 studs of the hero (plus a little for big heroes). */
  stepInteract() {
    const s = this.heroState;
    let best: Prompt | null = null;
    let bestD = 2 + 0.4 * this.L.GamePhysics.scaleOf(s);
    for (const inst of this.world.instances) {
      if (!inst.def.interactions.length) continue;
      const smashed = this.world.broken.some((b) => b.originals.some((p) => this.instanceOfPiece(p.id) === inst));
      if (smashed) continue;
      for (const so of inst.sockets) {
        if (so.kind !== 'interact' && so.kind !== 'sign') continue;
        if (!inst.def.interactions.some((i) => i.socket === so.id && (!i.when || i.when.state === inst.state)))
          continue;
        const d = Math.hypot(so.world[0] - s.x, so.world[2] - s.z);
        if (d < bestD && Math.abs(so.world[1] - (s.y + 1)) < 3) {
          bestD = d;
          best = { instance: inst, socket: so.id, label: so.prompt ?? inst.def.name, pos: so.world };
        }
      }
    }
    this.prompt = best;
    this.actions.step(this.clock);
  }

  /** E pressed: use the prompted interaction. Returns false when there is nothing to use. */
  interact(): boolean {
    const p = this.prompt;
    if (!p || this.talking) return false;
    const list = p.instance.def.interactions.filter(
      (i) => i.socket === p.socket && (!i.when || i.when.state === p.instance.state),
    );
    if (!list.length) return false;
    this.emit('info', `${p.label} · ${p.instance.def.name}`);
    for (const i of list.slice(0, 1)) this.actions.run(i.do, this.clock, p.instance.inst.id);
    this.logic.fire({
      type: 'event.onInteract',
      match: { asset: p.instance.def.id },
      payload: { target: p.instance.inst.id, socket: p.socket },
    });
    this.stepInteract();
    return true;
  }

  /** Changes an instance's state in play: its state-only bricks swap (refused if they would not fit). */
  setInstanceState(instanceId: string | undefined, state: string) {
    const w = this.world;
    const inst = w.instances.find((i) => i.inst.id === instanceId);
    if (!inst || !inst.def.states.includes(state) || inst.state === state) return;
    const lo = inst.inst.idBase;
    const hi = lo + inst.def.bricks.length;
    const next = expandAsset(inst.def, { ...inst.inst, state });
    const pieces = [...w.pieces.filter((p) => p.id! < lo || p.id! >= hi), ...next.bricks.map(brickToPiece)];
    const check = inspectPieces(pieces);
    if (!check.ok) {
      this.say(`Something is in the way: ${check.reason}`, 2);
      return;
    }
    for (const p of w.pieces) if (p.id! >= lo && p.id! < hi) w.dirtyChunks.add(chunkKeyOf(p));
    for (const b of next.bricks) w.dirtyChunks.add(chunkKeyOf(brickToPiece(b)));
    w.pieces = pieces.sort((a, b) => a.id! - b.id!);
    inst.state = state;
    inst.bricks = next.bricks;
    w.controller.replace(w.pieces, w.meta);
    this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
    this.emit('info', `${inst.def.name} is now ${state}`);
  }

  stepNpcs(dt: number) {
    const w = this.world;
    if (!w.npcs.length) return;
    this.L.NPCWorld.step(w.npcs, dt, this.heroState, this.talking?.id ?? null);
    if (
      this.talking &&
      Math.hypot(this.talking.state.x - this.heroState.x, this.talking.state.z - this.heroState.z) > 4.5
    )
      this.talking = null;
  }

  /** Gates that leave the current map: [spawn here, destination map, destination spawn]. */
  outbound(): { gate: string; from: string; toMap: string; toSpawn: string }[] {
    const gates = (this.snapshot.get(paths.gates) as Gates | undefined)?.gates ?? [];
    const here = this.world.mapId;
    const out: { gate: string; from: string; toMap: string; toSpawn: string }[] = [];
    for (const g of gates) {
      if (g.from.map === here) out.push({ gate: g.id, from: g.from.spawn, toMap: g.to.map, toSpawn: g.to.spawn });
      if (g.twoWay && g.to.map === here)
        out.push({ gate: g.id, from: g.to.spawn, toMap: g.from.map, toSpawn: g.from.spawn });
    }
    return out;
  }

  stepGates() {
    const s = this.heroState;
    const near = (spawnId: string, r: number) => {
      const sp = this.world.doc.spawns.find((x) => x.id === spawnId);
      return !!sp && Math.hypot(sp.pos[0] - s.x, sp.pos[2] - s.z) <= r && Math.abs(sp.pos[1] - s.y) < 2.5;
    };
    if (this.travelLock) {
      if (near(this.travelLock.spawn, 2.5)) return;
      this.travelLock = null;
    }
    const scale = this.L.GamePhysics.scaleOf(s);
    const hit = this.outbound().find((o) => near(o.from, 1.2 + 0.4 * scale));
    if (hit) this.travel(hit.toMap, hit.toSpawn);
  }

  /** Switch to another map (each map keeps its own damage while playing, as in v68). */
  travel(mapId: string, spawnId: string) {
    const from = this.world;
    const keep = { ...this.heroState };
    this.cancelRebuild();
    this.pendingSmash = null;
    this.talking = null;
    this.world = this.loadWorld(mapId);
    const sp = this.world.doc.spawns.find((x) => x.id === spawnId) ?? this.world.doc.spawns[0];
    Object.assign(this.world.controller.state, { ...keep, vy: 0 });
    if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
    this.travelLock = sp ? { spawn: sp.id } : null;
    this.camYaw = this.heroState.heading + Math.PI;
    this.emit('travel', `${from.doc.name} → ${this.world.doc.name}${sp ? ` (${sp.name})` : ''}`);
    this.say(`Welcome to ${this.world.doc.name}`, 2);
  }

  // ---------- cheats (P2.4) ----------

  cheat(kind: 'respawn' | 'rebuildAll' | 'teleport' | 'held', arg?: string) {
    const w = this.world;
    if (kind === 'respawn') w.controller.spawn();
    if (kind === 'teleport' && arg) {
      const sp = w.doc.spawns.find((s) => s.id === arg);
      if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
    }
    if (kind === 'rebuildAll' && w.broken.length) {
      const restored = [...w.pieces, ...w.broken.flatMap((e) => e.originals.map((p) => ({ ...p })))];
      if (inspectPieces(restored).ok) {
        for (const e of w.broken) for (const p of e.originals) w.dirtyChunks.add(chunkKeyOf(p));
        w.pieces = restored;
        w.broken = [];
        w.debris = [];
        w.controller.replace(w.pieces, w.meta);
      }
    }
    if (kind === 'held' && arg) this.hero = this.L.CharacterCatalog.validate({ ...this.hero, held: arg });
    this.emit('cheat', `Cheat: ${kind}${arg ? ` ${arg}` : ''}`);
  }
}
