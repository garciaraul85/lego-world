import { BUILTIN_ASSETS } from '../../builtin/assets';
import { SND } from '../../builtin/audio';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_CLIPS } from '../../builtin/clips';
import { BUILTIN_EFFECTS, DEFAULT_EFFECT_EVENTS, DEFAULT_HITS } from '../../builtin/effects';
import { genreById } from '../../builtin/genres';
import { BUILTIN_SCREEN_EFFECTS, DEFAULT_SCREEN_EVENTS } from '../../builtin/screen-effects';
import { expandAsset } from '../../core/assets/expand';
import { freeGroups } from '../../core/assets/free';
import { type ExpandedInstance, expandInstances } from '../../core/assets/instances';
import { brickToPiece, exactColors, type FileSource, mapToLegacyBuild } from '../../core/bridge/legacy-bridge';
import { moodFace } from '../../core/character/faces';
import { type ResolvedBody, resolveBody } from '../../core/character/resolve';
import { levelOf, xpFor } from '../../core/character/sheet';
import { type AnimState, MOVING_AT } from '../../core/character/states';
import { type AttackHit, type DamageType, damageOf, type Health, heldAttack } from '../../core/combat/damage';
import type { Enemy } from '../../core/combat/enemy';
import type { Effect, EffectEvent } from '../../core/effects/schema';
import { Mood, NO_MOOD, type ScreenEffect, type ScreenEvent } from '../../core/effects/screen';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { LegacyPiece } from '../../core/legacy/types';
import { FOG_PRESET, type Fog, type FogPreset } from '../../core/lighting/atmosphere';
import type { ExecCtx } from '../../core/logic/catalog';
import { maxOf } from '../../core/num';
import {
  AUTO_SLOT,
  DEFAULT_SAVING,
  MemorySaveStore,
  newestSave,
  type SaveGame,
  type SaveStore,
  type Saving,
  slotLine,
  slotName,
} from '../../core/save/save';
import {
  type Asset,
  type Character,
  type Clip,
  type EffectInstance,
  type EmitterInstance,
  type Gates,
  type Instances,
  type LightInstance,
  type LogicGraph,
  type MapDoc,
  type MapState,
  type Project,
  paths,
  type Screen,
  TIMES,
  type UiInstance,
  type Variables,
} from '../../core/schema';
import type { AudioPort, Vec3 } from '../audio/port';
import { RecordingAudio } from '../audio/port';
import { Animator } from '../character/animator';
import { StateMachine } from '../character/states';
import { ParticleSystem, type PlayOptions, type StreamHandle } from '../effects/particles';
import { ScreenFx } from '../effects/screen';
import {
  type Controller,
  type Debris,
  type HeroState,
  type LegacyRuntime,
  type LegacyWorldMeta,
  legacyRuntime,
  type Npc,
} from '../legacy/runtime-modules';
import { type Atmosphere, atmosphere } from '../lighting/atmosphere';
import { findLight, gatherLights, type LightSource, pointLights } from '../lighting/lights';
import { LogicRuntime } from '../logic/interpreter';
import { portrait } from '../render/portraits';
import type { PointLight } from '../render/renderer';
import { CinematicSystem } from '../systems/cinematic';
import { EmitterSystem } from '../systems/emitters';
import { formatValue, interpolate } from '../ui/bindings';
import { ScreenStack } from '../ui/ScreenStack';
import { resolveScreen, screenOfKind } from '../ui/screens';
import { ActionRunner, type GameOp } from './actions';
import { ATTACKS, type AttackKind, Combat, hasShield, LOCK_RELEASE, type LockTarget, MAX_STAMINA } from './combat';
import { Enemies } from './enemies';
import { asDamageType, assetHealth, HealthBook, hurtBy, npcCharacter } from './health';
import { chunkKeyOf, indexByChunk, inspectPieces, piecesAround, WINDOW_RADIUS } from './pieces';
import { isSettingKey, PlayerProgress, type ProgressHost } from './progress';
import { Runtime, type System } from './runtime';
import { applySave, captureSave, loadMessage, type SaveHost } from './saves';
import { afterDefence, movesOf, statsOf, wornProfile } from './sheet';
import { TalkSystem } from './talk';

type AssetInstanceId = import('../../core/schema').AssetInstance['id'];

/** P26: the built-in Saves screen (slot buttons) */
const SAVES_SCREEN = 'scr_saves00000';
/** P26 part 2: the built-in Settings and Achievements screens */
const SETTINGS_SCREEN = 'scr_settings00';
const ACHIEVEMENTS_SCREEN = 'scr_achieve000';

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
  /** bumped when instances are added, removed or change state (the renderer regroups their moving parts) */
  rev: number;
  /** sound emitters and world UI of this map (P5.5, P5.9) */
  emitters: EmitterInstance[];
  /** P23: effects placed on the map */
  effects: EffectInstance[];
  /** P27: lights placed on this map */
  lights: LightInstance[];
  worldUi: UiInstance[];
  /** P26: what the map started with (instance id → state, neighbour ids), so a save keeps only what changed */
  start: { instances: Map<string, string>; npcs: number[] };
  /**
   * P27 part 3: a big map (more than WINDOW_FROM pieces) plays in a window of chunks around the hero: v68's
   * physics and the neighbours see only those pieces, and neighbours outside it sleep.
   */
  big: boolean;
  /** big maps: chunk key → its pieces (rebuilt when pieces change) */
  byChunk: Map<string, LegacyPiece[]> | null;
  /** big maps: the chunk the window is centred on */
  windowAt: string | null;
  /** big maps: the whole map's walkable area (the window's own would fence the hero in) */
  fullArea: unknown;
};

/** P27 part 3: maps with more pieces than this play in a window of chunks around the hero */
export const WINDOW_FROM = 40_000;

/** P32: an item made only of moving parts floats — drawn, but outside the brick rules (a rising sword) */
const floating = (def: Asset) => {
  const moving = new Set((def.parts ?? []).filter((p) => p.pose).flatMap((p) => p.bricks));
  return def.bricks.length > 0 && def.bricks.every((_, i) => moving.has(i));
};

/** `anim`: P32 moving parts — the state it left and when (session clock), while its parts ease to the new pose */
export type PlayInstance = ExpandedInstance & { state: string; anim?: { from: string; since: number } };
export type Prompt = { instance: PlayInstance; socket: string; label: string; pos: [number, number, number] };

export type InputState = { keys: Set<string>; jump: boolean; touch: Set<string> };
export type GameEvent = {
  t: number;
  kind: 'start' | 'smash' | 'rebuild' | 'travel' | 'talk' | 'info' | 'cheat' | 'event' | 'screen';
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
  hero!: Record<string, unknown>;
  input: InputState = { keys: new Set(), jump: false, touch: new Set() };
  camYaw = 0;
  camPitch = 0.28;
  zoom = 55;
  clock = 0;
  events: GameEvent[] = [];
  message = '';
  messageUntil = 0;
  talking: Npc | null = null;
  /** P22: conversations (with neighbours, signs, objects and logic) */
  talks!: TalkSystem;
  /** P22: a sign with a conversation near the hero (E reads it) */
  signPrompt: UiInstance | null = null;
  private talkWasActive = false;
  /** P22 part 2: the hero's character sheet (stats, outfits, moves, animations, voice) */
  heroChr: Character | undefined;
  /** the hero's stamina cap (its sheet's stamina) */
  staminaMax = MAX_STAMINA;
  private idleFor = 0;
  private standing = new Map<number, boolean>();
  /** P22 part 3: bodies other than the minifig, by NPC id ('hero' for the player) */
  private bodies = new Map<number | 'hero', ResolvedBody | null>();
  rebuildHeld = false;
  rebuildEntry: BrokenEntry | null = null;
  private pendingSmash: {
    remaining: number;
    reach: number;
    id: number | null;
    group?: string | undefined;
    kind: AttackKind;
  } | null = null;
  private smashCooldown = 0;
  private travelLock: { spawn: string } | null = null;
  readonly listeners = new Set<(e: GameEvent) => void>();
  /** the interaction the hero can use right now (E), shown as a prompt */
  prompt: Prompt | null = null;
  readonly inventory = new Map<string, number>();
  readonly actions: ActionRunner;
  /** keyframe clips on the hero (emotes, keys 1-4) */
  readonly heroAnim = new Animator();
  /** P23 part 4: the hero's animation state machine (idle, walk, run, jump, attack, hurt), on heroAnim */
  readonly heroStates = new StateMachine(this.heroAnim);
  /** every state the hero has been in this play (the posing course checks the walk) */
  readonly statesSeen = new Set<AnimState>();
  /** when the hero was last hurt (the clock) */
  private heroHurtAt = -Infinity;
  /** P23 part 4: each neighbour's animation state machine (where it was, for its speed; when it was hurt) */
  private npcStates = new Map<number, { sm: StateMachine; x: number; z: number; speed: number; hurtAt: number }>();
  /** logic graphs of the project (P4.2) */
  logic!: LogicRuntime;
  /** zones the hero is inside, by zone id */
  private inZones = new Set<string>();
  private spawnSerial = 0;
  /** P9a: health of the hero, objects and neighbours, for this play */
  readonly health = new HealthBook();
  /** P23: particles (hit sparks, fire on torches, level-up bursts…) */
  readonly effects = new ParticleSystem(2000);
  /** P23 part 2: screen effects (shake, flash, fade, hit-stop, slow motion), on real time */
  readonly screenFx = new ScreenFx();
  /** P23 part 2: the mood logic set for this map while it plays (null: the map's own) */
  moodOverride: Mood | null = null;
  /** the kind of the hero's strike being resolved (a charged or spin hit plays the big-hit screen effect) */
  private strikeKind: AttackKind | null = null;
  /** placed effects: a running stream, or when the next burst is due; and which were started by logic */
  private placed = new Map<string, { stream: StreamHandle | null; next: number; on: boolean }>();
  /** P27: lights switched by logic or actions (instance id → on), and the darkness logic set on this map */
  private lightSwitch = new Map<string, boolean>();
  private darknessNow: number | null = null;
  /** P27 part 2: the time of day logic set (and when), and the fog it set (undefined: the map's; null: none) */
  private timeSet: { time: MapDoc['sky']['time']; at: number } | null = null;
  private fogSet: Fog | null | undefined = undefined;
  private smashedCache: { world: MapWorld; rev: number; ids: Set<string> } | null = null;
  /** P9c: neighbours that fight the hero */
  readonly enemies: Enemies = new Enemies(this);
  /** P9b: attacks, guarding, moves and lock-on */
  readonly combat: Combat = new Combat(this);
  private lastStamina = -1;
  onBreak: ((b: NonNullable<LogicRuntime['paused']>) => void) | null = null;
  emotes: Clip[] = [];
  /** P5: audio, screens and world UI */
  readonly audio: AudioPort;
  readonly screens: ScreenStack;
  /** screen actions run on the UI clock, which keeps going while a screen pauses the game */
  readonly uiActions: ActionRunner;
  uiClock = 0;
  /** texts set by logic (Set screen text), by "screenId:widgetId" */
  readonly screenText = new Map<string, string>();
  dialogue: { speaker: string; text: string } | null = null;
  /** where Retry puts the hero back: the last spawn arrived at, or the last checkpoint touched (P26) */
  checkpoint: { map: string; spawn: string | null; pos?: [number, number, number]; heading?: number };
  /** P26: where saves are kept, how this game saves, the slot in use, and the Saves screen's purpose */
  readonly saves: SaveStore;
  readonly saving: Saving;
  slot = 1;
  saveMenu: 'save' | 'load' | null = null;
  /** seconds played before this session (from a loaded save) */
  private playBase = 0;
  /** Quit to title, then Play: a new game from the start */
  private quitToTitle = false;
  /** P26 part 2: achievements, best scores, times finished and the player's settings */
  progress!: PlayerProgress;
  readonly emitterSystem = new EmitterSystem();
  /** the cinematic playing now, if any (P6.2) */
  readonly cine: CinematicSystem;
  readonly project: Project;
  private shownScreens = new Set<string>();
  private stepTimer = 0;
  private rebuildTick = 0;
  private zoneAmbience = new Set<string>();
  /** game over shown; the hero waits for Retry */
  over = false;

  constructor(
    readonly snapshot: FileSource,
    opts: {
      mapId?: string;
      spawnId?: string | null;
      audio?: AudioPort;
      boot?: 'game' | 'entry';
      /** P26: where saves are kept (default: this session only) */
      saves?: SaveStore;
    } = {},
  ) {
    this.L = legacyRuntime();
    this.saves = opts.saves ?? new MemorySaveStore();
    this.audio = opts.audio ?? new RecordingAudio();
    const self = this;
    const host = {
      setState: (state: string, target: string | undefined, me: string | undefined) =>
        this.setInstanceState(target ? (this.resolveEntity(target)?.inst.id ?? target) : me, state),
      teleport: (spawn: string) => {
        const sp = this.world.doc.spawns.find((x) => x.id === spawn);
        if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
      },
      travel: (map: string, spawn: string) => this.travel(map, spawn),
      log: (kind: 'event' | 'info', msg: string) => this.emit(kind === 'event' ? 'event' : 'info', msg),
      custom: (event: string) => this.logic.fire({ type: 'event.onCustom', match: { event } }),
      get vars() {
        return self.logic.vars;
      },
      setVar: (name: string, value: unknown) => this.logic.setVar(name, value),
      inventory: this.inventory,
      sound: (event: string, me: string | undefined) => this.playSound(event, me),
      music: (music: string | null, fade: number | undefined) => this.audio.music('logic', music, fade),
      stinger: (name: string) => this.audio.stinger(name),
      screen: (op: 'show' | 'hide', screen: string, replace: boolean) => this.screenOp(op, screen, replace),
      game: (op: GameOp) => this.gameOp(op),
      saving: (op: 'save' | 'load' | 'slot' | 'checkpoint', slot: number | undefined) => this.savingOp(op, slot),
      progress: (op: 'achieve' | 'setting', key: string, value?: unknown) => {
        if (op === 'achieve') this.progress.unlock(key);
        else if (isSettingKey(key)) this.progress.setSetting(key, value);
      },
      gave: () => this.audio.play(SND.pickup),
      spawn: (asset: string, at: string) => void this.spawnAsset(asset, at),
      despawn: (target: string) => this.despawn(target),
      message: (text: string, seconds: number) => this.say(text, seconds),
      cinematic: (id: string, once: boolean) => void this.cine.play(id, { once }),
      talk: (conversation: string) => void this.startConversation(conversation, null, 'other'),
      sheet: (op: 'outfit' | 'xp', value: string | number) =>
        op === 'outfit' ? this.setOutfit(String(value)) : this.giveXp(Number(value) || 0),
      effect: (op: 'play' | 'on' | 'off', a: string, at: string | undefined, self: string | undefined) =>
        this.effectOp(op, a, at === 'self' ? self : at),
      screenEffect: (id: string) => this.screenFxOp('play', id),
      light: (op: 'on' | 'off' | 'toggle', name: string, self: string | undefined) => this.lightOp(op, name, self),
    };
    this.actions = new ActionRunner(host);
    this.uiActions = new ActionRunner(host);
    const project = snapshot.get(paths.project) as Project;
    this.project = project;
    this.saving = project.saving ?? genreById(project.genre).saving ?? DEFAULT_SAVING;
    this.talks = new TalkSystem({
      get: (p) => this.snapshot.get(p),
      project,
      genre: genreById(project.genre),
      get vars() {
        return self.logic.vars;
      },
      setVar: (name, value) => this.logic.setVar(name, value),
      inventory: this.inventory,
      run: (actions) => this.actions.run(actions, this.clock),
      text: (t) => interpolate(t, this.lookup),
      // P27 part 2: as the sky is now (the day moves on while the game plays)
      timeOfDay: () => (this.atmosphereNow().sky.night > 0.5 ? 'night' : 'day'),
      objectState: (name) => this.resolveEntity(name)?.state,
      fire: (type, match) => this.logic.fire({ type, match }),
      log: (msg) => this.emit('talk', msg),
      say: (text, seconds) => this.say(text, seconds),
      now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
    });
    this.screens = new ScreenStack((id) => resolveScreen(snapshot, id));
    this.cine = new CinematicSystem({
      snapshot,
      mapId: () => this.world.mapId,
      // P27 part 3: a cinematic on a big map walks its actors through the window around the hero
      pieces: () => (this.world.big ? this.world.controller.pieces : this.world.pieces),
      npcs: () => this.world.npcs,
      bounds: (p) => this.L.GamePhysics.bounds(p),
      heroState: () => this.heroState,
      heroProfile: () => this.hero,
      validateProfile: (p) => this.L.CharacterCatalog.validate({ ...this.L.CharacterCatalog.defaults, ...p }),
      travel: (map) => this.travel(map, ''),
      audio: this.audio,
      emit: (kind, msg) => this.emit(kind, msg),
      logicEvent: (event) => this.logic.fire({ type: 'event.onCustom', match: { event } }),
      screenEffect: (id) => this.playScreenEffect(id),
      setVar: (name, value) => this.logic.setVar(name, value),
      dialogue: (line) => {
        if (!line) return this.endTalk();
        this.dialogue = line;
        const box = screenOfKind(this.snapshot, 'dialogue');
        if (box && !this.screens.has(box.id)) this.screens.push(box.id);
      },
      done: (id) => this.logic.fire({ type: 'event.onCinematicDone', match: { cinematic: id } }),
    });
    const heroChr = project.hero ? (snapshot.get(paths.character(project.hero)) as Character | undefined) : undefined;
    this.setHero(heroChr);
    // P23: the quality setting caps the particles
    const quality = (snapshot.get(paths.settings) as { quality?: string } | undefined)?.quality;
    this.effects.cap = quality === 'low' ? 600 : quality === 'medium' ? 1200 : 2000;
    const mapId = opts.mapId ?? project.entry.map;
    this.world = this.loadWorld(mapId);
    this.forgetBodies();
    const spawn =
      this.world.doc.spawns.find((s) => s.id === (opts.spawnId ?? project.entry.spawn)) ?? this.world.doc.spawns[0];
    if (spawn) this.placeAt(spawn.pos as [number, number, number], spawn.yaw);
    this.checkpoint = { map: this.world.mapId, spawn: spawn?.id ?? null };
    // Starting on a gate's spawn must not travel at once (v68 locks arrival the same way).
    this.travelLock = spawn ? { spawn: spawn.id } : null;
    this.camYaw = this.world.controller.state.heading + Math.PI;
    this.logic = this.makeLogic();
    this.heroVars();
    this.progress = new PlayerProgress(this as unknown as ProgressHost);
    this.progress.onSettings = () => this.applySettings();
    this.applySettings();
    this.runtime = new Runtime<PlaySession>(this, this.systems());
    this.screens.onChange(() => this.screensChanged());
    this.applyMapAudio();
    // P5.8: the player boots through the entry screen (splash → title); Play in the editor starts in the game.
    const entry = project.entry.screen;
    if (opts.boot === 'entry' && entry && this.screens.push(entry)) {
      /* splash / title shown over the paused world */
    } else this.startGame();
    this.logic.fire({ type: 'event.onStart' });
    this.emit(
      'start',
      `Playing ${this.world.doc.name}${spawn ? ` from ${spawn.name}` : ''}. WASD moves, Space jumps, F attacks (hold to charge), Q guards, C rolls, Z locks on, hold E rebuilds, T talks.`,
    );
  }

  // ---------- worlds ----------

  loadWorld(mapId: string): MapWorld {
    const cached = this.worlds.get(mapId);
    if (cached) return cached;
    const doc = this.snapshot.get(paths.map(mapId)) as MapDoc;
    const build = mapToLegacyBuild(this.snapshot, mapId);
    const meta = (build.world ?? null) as LegacyWorldMeta;
    // any-colour bricks keep their exact colour in Play (v68 saves keep the nearest v68 colour)
    const exact = exactColors(this.snapshot, mapId);
    const pieces = build.pieces.map((p) =>
      p.id !== undefined && exact.has(p.id) ? { ...p, hex: exact.get(p.id)! } : { ...p },
    );
    const state = (this.snapshot.get(paths.state(mapId)) as MapState | undefined) ?? { broken: [], player: null };
    // P27 part 3: a big map starts with the window around where the hero arrives
    const big = pieces.length > WINDOW_FROM;
    const byChunk = big ? indexByChunk(pieces) : null;
    const fullArea = big ? this.L.GamePhysics.worldBounds(pieces, meta) : null;
    const [ax, az] = state.player
      ? [Number(state.player.x) || 0, Number(state.player.z) || 0]
      : [doc.spawns[0]?.pos[0] ?? 0, doc.spawns[0]?.pos[2] ?? 0];
    const startKey = big ? `${Math.floor(ax / 32)}_${Math.floor(az / 32)}` : null;
    const near = byChunk && startKey ? piecesAround(byChunk, startKey) : pieces;
    const controller = new this.L.GamePhysics.Controller(near, meta);
    if (big) controller.area = fullArea;
    const inst = this.snapshot.get(paths.instances(mapId)) as Instances | undefined;
    const npcs = build.npcs
      ? this.L.NPCWorld.restore(build.npcs, near, meta)
      : near.length
        ? this.L.NPCWorld.populate(near, meta, controller.state)
        : [];
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
      rev: 0,
      emitters: (inst?.items ?? []).filter((i): i is EmitterInstance => i.kind === 'emitter'),
      effects: (inst?.items ?? []).filter((i): i is EffectInstance => i.kind === 'effect'),
      lights: (inst?.items ?? []).filter((i): i is LightInstance => i.kind === 'light'),
      worldUi: (inst?.items ?? []).filter((i): i is UiInstance => i.kind === 'ui'),
      big,
      byChunk,
      windowAt: startKey,
      fullArea,
      start: { instances: new Map(), npcs: npcs.map((n) => n.id) },
    };
    for (const i of w.instances) w.start.instances.set(i.inst.id, i.state);
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

  /** F (a light attack: the touch button, and what a quick tap of F does) */
  smash() {
    this.strike('light');
  }

  /**
   * P9b: one attack. Light, heavy and charged swing the held item (v68's swing) and land on contact; jump,
   * plunge, bash and spin come from a move and land at once. Spin and plunge hit everything around.
   */
  strike(kind: AttackKind) {
    if (this.cine.active || this.over) return;
    const s = this.heroState;
    const w = this.L.GameWeapons.get(this.hero.held);
    if (kind === 'light' || kind === 'heavy' || kind === 'charged') {
      if (this.smashCooldown > 0 || s.building || this.talking || this.combat.stagger > 0) return;
      const slow = kind === 'light' ? 1 : 1.35;
      Object.assign(s, { attack: w.duration * slow, attackDuration: w.duration * slow, attackWeapon: this.hero.held });
      delete (s as Record<string, unknown>).attackImpact;
      this.smashCooldown = (w.duration * slow) / movesOf(this.heroChr).speed + 0.02;
      const hit = this.world.controller.target(w.reach);
      this.pendingSmash = hit
        ? { id: hit.id, group: hit.group, remaining: w.contact * slow, reach: w.reach, kind }
        : { id: null, remaining: w.contact * slow, reach: w.reach, kind };
      return;
    }
    this.resolveStrike(kind, w.reach, null);
  }

  /** P22 part 2: the hero's look, gear, emotes and sheet (on start, and when the player switches hero) */
  setHero(chr: Character | undefined) {
    this.heroChr = chr;
    this.bodies.delete('hero');
    this.hero = this.L.CharacterCatalog.validate({ ...this.L.CharacterCatalog.defaults, ...wornProfile(chr) });
    // P9b: the off hand (a shield) lives beside v68's profile, which only knows a right-hand item
    this.hero.offHand = chr?.gear?.offHand ?? 'None';
    this.emotes = this.resolveEmotes(chr);
    this.staminaMax = chr?.stats ? statsOf(chr).stamina : MAX_STAMINA;
  }

  /** hearts, stamina, level and experience from the hero's sheet (variables the game defines itself win) */
  private heroVars() {
    const v = this.logic.vars;
    const st = this.heroChr?.stats ? statsOf(this.heroChr) : null;
    // hearts: games without their own hp / maxHp variables get the sheet's health (else 3)
    if (!v.has('maxHp')) v.set('maxHp', st?.health ?? 3);
    if (!v.has('hp')) v.set('hp', v.get('maxHp'));
    // P9b: guarding uses stamina (screens can show it: {stamina} of {maxStamina})
    if (!v.has('maxStamina')) v.set('maxStamina', this.staminaMax);
    if (st && !v.has('level')) {
      v.set('level', st.level);
      v.set('xp', xpFor(st.level, st.xpCurve));
    }
  }

  /** P22 part 2: experience for the hero; reaching a level says so (and plays its victory clip) */
  giveXp(n: number) {
    const st = statsOf(this.heroChr);
    const xp = Math.max(0, Number(this.logic.vars.get('xp') ?? 0) + n);
    this.logic.setVar('xp', xp);
    const before = Number(this.logic.vars.get('level') ?? st.level);
    const level = Math.max(before, levelOf(xp, st.xpCurve));
    if (level > before) {
      this.logic.setVar('level', level);
      this.say(`Level up! Level ${level}`, 3);
      this.audio.play(SND.victory);
      this.playAction('victory');
      this.eventEffect('levelUp', [this.heroState.x, this.heroState.y + 0.5, this.heroState.z]);
      this.screenEvent('levelUp');
      this.logic.fire({ type: 'event.onLevelUp', match: {}, payload: { level } });
    }
  }

  /** P22 part 2: the hero puts on one of its outfits ('' or an unknown name: its own look) */
  setOutfit(name: string) {
    const chr = this.heroChr;
    if (!chr) return;
    const known = chr.outfits?.some((o) => o.name === name);
    const { outfit: _o, ...rest } = chr;
    const next: Character = known ? { ...chr, outfit: name } : (rest as Character);
    const hp = this.logic.vars.get('hp');
    this.setHero(next);
    this.logic.vars.set('hp', hp);
    this.emit('info', known ? `Outfit: ${name}` : 'Own clothes');
  }

  /** P22 part 2: the next hero of the party (H): the look, sheet and emotes change; hearts are shared */
  switchHero() {
    const party = this.project.party ?? [];
    const ids = [...new Set([this.project.hero, ...party].filter((x): x is string => !!x))];
    if (ids.length < 2 || this.talks.active || this.over) return;
    const at = ids.indexOf(this.heroChr?.id ?? '');
    const id = ids[(at + 1) % ids.length]!;
    const chr = this.snapshot.get(paths.character(id)) as Character | undefined;
    if (!chr) return;
    this.setHero(chr);
    const max = statsOf(chr).health;
    if (chr.stats) {
      this.logic.setVar('maxHp', max);
      this.logic.setVar('hp', Math.min(max, Number(this.logic.vars.get('hp') ?? max)));
    }
    this.say(`Playing as ${chr.name}`, 2);
    this.emit('info', `Hero: ${chr.name}`);
  }

  /** the clip the hero's sheet sets for an action (idle, victory, hurt), played if it stands still */
  playAction(action: 'idle' | 'victory' | 'hurt') {
    const id = this.heroChr?.animations?.[action];
    if (!id) return false;
    const clip = (this.snapshot.get(paths.clip(id)) as Clip | undefined) ?? BUILTIN_CLIPS.find((c) => c.id === id);
    if (!clip || !this.heroState.grounded) return false;
    this.heroStates.play(clip);
    return true;
  }

  talk() {
    if (this.cine.active) return;
    // P22: in a conversation T moves it on (Esc or walking away ends it)
    if (this.talks.active) {
      this.dialogueNext();
      return;
    }
    if (this.talking) {
      this.endTalk();
      return;
    }
    // P9b.1: locked on to a neighbour: talk to them, wherever they are within the lock
    const npc = this.combat.lockedNpc() ?? this.L.NPCWorld.nearest(this.world.npcs, this.heroState);
    if (!npc) {
      this.say('Nobody close enough to talk to.', 1.5);
      return;
    }
    // P22: the neighbour's character has conversations: the first whose condition holds plays
    const chr = npcCharacter(this.snapshot, this.world.mapId, npc);
    const conv = chr ? this.talks.pick(chr) : null;
    if (chr && conv) {
      this.talking = npc;
      this.audio.play(SND.talk);
      if (this.startConversation(conv, chr.id, 'npc')) return;
      this.talking = null;
    }
    this.talking = npc;
    this.audio.play(SND.talk);
    const r = this.L.NPCWorld.reply(
      npc,
      'hello',
      this.world.meta,
      { time: this.world.doc.sky.time },
      this.world.broken.length,
    );
    const text = typeof r === 'string' ? r : (r?.text ?? '…');
    this.emit('talk', `${npc.profile.name}: ${text}`);
    this.dialogue = { speaker: String(npc.profile.name ?? ''), text };
    const box = screenOfKind(this.snapshot, 'dialogue');
    if (!box || !this.screens.push(box.id)) this.say(`${npc.profile.name}: ${text}`, 5);
  }

  /** P22: plays a conversation (talker: the character spoken to, for talks, likes and bubbles). */
  startConversation(id: string, talker: string | null, from: 'npc' | 'sign' | 'other'): boolean {
    if (this.over) return false;
    const ok = this.talks.start(id, { talker, from });
    if (!ok && from !== 'npc') this.emit('info', `Conversation ${id}: nothing in it plays now.`);
    return ok;
  }

  /** P22: next line, or pick the highlighted option */
  dialogueNext() {
    this.talks.next();
    if (!this.talks.active) this.endTalk();
  }

  /** P22: pick the option at this position (1 is the first) */
  dialogueChoose(position: number) {
    this.talks.choose(position);
    if (!this.talks.active) this.endTalk();
  }

  endTalk() {
    if (this.talks.active) this.talks.stop();
    this.talking = null;
    this.dialogue = null;
    for (const s of this.screens.screens()) if (s.kind === 'dialogue') this.screens.hide(s.id);
  }

  // ---------- systems ----------

  private systems(): System<PlaySession>[] {
    return [
      { id: 'hero', fixed: (g, dt) => g.moveHero(dt) },
      { id: 'cinematic', fixed: (g, dt) => g.cine.step(dt) },
      { id: 'combat', fixed: (g, dt) => g.stepSmash(dt) },
      { id: 'rebuild', fixed: (g, dt) => g.stepRebuild(dt) },
      { id: 'debris', fixed: (g, dt) => g.stepDebris(dt) },
      { id: 'npc', fixed: (g, dt) => g.stepNpcs(dt) },
      { id: 'gates', fixed: (g) => g.stepGates() },
      { id: 'interact', fixed: (g) => g.stepInteract() },
      { id: 'barks', fixed: (g) => g.runtime.ticks % 30 === 0 && g.stepBarks() },
      {
        id: 'talk',
        frame: (g) => {
          g.talks.tick();
          // a conversation that ended by itself (auto-advance, a jump to the end) lets the hero go
          if (g.talkWasActive && !g.talks.active) g.endTalk();
          g.talkWasActive = g.talks.active;
        },
      },
      { id: 'checkpoints', fixed: (g) => g.stepCheckpoints() },
      { id: 'progress', fixed: (g) => g.runtime.ticks % 30 === 0 && g.progress.stepBests() },
      { id: 'anim', fixed: (g, dt) => g.stepAnim(dt) },
      { id: 'npcAnim', fixed: (g, dt) => g.stepNpcStates(dt) },
      { id: 'zones', fixed: (g) => g.stepZones() },
      { id: 'logic', fixed: (g) => g.logic.step(g.clock) },
      { id: 'emitters', fixed: (g) => g.stepEmitters() },
      { id: 'effects', fixed: (g, dt) => g.stepEffects(dt) },
      { id: 'health', fixed: (g) => g.checkHealth() },
      // screens and audio keep running while a screen pauses the game (frame systems always run)
      { id: 'ui', frame: (g, dt) => g.stepUi(dt) },
      // P23 part 2: screen effects run on real time, so a hit-stop ends even though the game is frozen
      { id: 'screenfx', frame: (g, dt) => g.stepScreenFx(dt) },
      {
        id: 'clock',
        fixed: (g, dt) => {
          g.clock += dt;
        },
      },
    ];
  }

  inputVector() {
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
    // a cinematic holds the hero: cast members are moved by the scene, otherwise no input
    if (this.cine.heroInCast()) {
      this.input.jump = false;
      return;
    }
    const still = this.talking || this.talks.active || this.over || this.cine.active;
    // P9b: guard (Q held), charging, moves and lock-on
    const c = this.combat;
    c.stepGuard(dt, !still && (this.input.keys.has('q') || this.input.touch.has('guard')));
    let input: ReturnType<PlaySession['inputVector']> & { speedScale?: number; jumpSpeed?: number } =
      still || c.stagger > 0 ? { x: 0, z: 0, run: false, jump: false, vertical: 0 } : this.inputVector();
    if (input.jump && c.lockedJump(input.x, input.z)) input = { ...input, jump: false };
    const moving = c.moveInput();
    if (moving) input = moving;
    else if (c.guard || c.charge !== null) input = { ...input, run: false, speedScale: 0.45 };
    this.input.jump = false;
    // P26: a fall off the world comes back to the checkpoint (v68's controller would use its safe spot)
    if (this.heroState.y < -14) return this.fellOff();
    const before = this.heroState;
    const wasGrounded = before.grounded;
    const fallSpeed = before.vy;
    // P27 part 3: a big map's window follows the hero
    this.moveWindow(this.world);
    // v68 heroMovement without powers: the controller does walking, running, jumping and collision.
    this.world.controller.step(
      {
        ...input,
        // P22 part 2: the sheet's speed and jump
        speedScale: (input.speedScale ?? 1) * this.heroStats.speed,
        jumpSpeed:
          (input.jumpSpeed ?? (this.hero.power === 'Super jumping' ? 19 : 9.5)) * Math.sqrt(this.heroStats.jump),
      },
      dt,
      this.camYaw,
    );
    c.stepMove(dt);
    if (this.god) c.stamina = MAX_STAMINA;
    this.keepOutOfParts();
    if (c.target) c.stepLock();
    else c.stepHint();
    const st = Math.round(c.stamina);
    if (st !== this.lastStamina) {
      this.lastStamina = st;
      this.logic.vars.set('stamina', st);
    }
    this.movementSounds(dt, wasGrounded, fallSpeed);
    if (this.heroState.y < -14) this.fellOff();
  }

  /** back on solid ground after a fall: at the checkpoint touched on this map, else the map's safe spot */
  private fellOff() {
    const cp = this.checkpoint;
    if (cp.pos && cp.map === this.world.mapId) this.placeAt(cp.pos, cp.heading ?? this.heroState.heading);
    else this.world.controller.spawn();
    this.say('Back on solid ground.', 2);
    this.hurt(1);
  }

  /** jump, land and footsteps (P5.3: the hero's own sounds) */
  private movementSounds(dt: number, wasGrounded: boolean, fallSpeed: number) {
    const s = this.heroState;
    const pos: Vec3 = [s.x, s.y, s.z];
    if (s.vy > 3 && fallSpeed <= 0.5) this.audio.play(SND.jump, { pos });
    if (!wasGrounded && s.grounded && fallSpeed < -7) this.audio.play(SND.land, { pos });
    // P23 part 2: a landing from high up shakes the screen
    if (!wasGrounded && s.grounded && fallSpeed < -16) this.screenEvent('land');
    if (s.grounded && s.speed > 0.8 && !s.building) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.play(this.heroChr?.voice?.footsteps ?? SND.step, { pos });
        this.stepTimer = s.speed > 7 ? 0.27 : 0.38;
      }
    } else this.stepTimer = 0.12;
  }

  /** lose hearts (falling off the world, logic); at 0 the game is over */
  hurt(n0: number) {
    if (this.god) return;
    // P26: the player's difficulty scales the damage the hero takes (story: half, hard: double)
    const raw = this.progress.damage(n0);
    // P22 part 2: the sheet's defence (and a defensive fighter's guard)
    const n = this.heroChr?.stats ? afterDefence(raw, this.heroStats.defence) : raw;
    if (n <= 0 || this.health.invulnerable.has('hero') || this.over) return;
    const hp = Math.max(0, Number(this.logic.vars.get('hp') ?? 0) - n);
    this.logic.setVar('hp', hp);
    this.audio.play(this.heroChr?.voice?.grunt ?? SND.hurt);
    this.screenEvent(hp > 0 ? 'hurt' : 'death');
    // P23 part 4: the hurt state shows the sheet's hurt clip
    if (hp > 0) this.heroHurtAt = this.clock;
    // P9a: the hero's hearts are its health
    if (hp > 0)
      this.logic.fire({ type: 'event.onDamaged', match: { asset: '' }, payload: { target: 'hero', amount: n, hp } });
    else {
      this.logic.fire({ type: 'event.onDefeated', match: { asset: '' }, payload: { target: 'hero' } });
      this.gameOver();
    }
  }

  /** hp can also drop through logic or actions (addVar hp -1): 0 hearts is game over */
  private lastHp: number | null = null;
  checkHealth() {
    const hp = Number(this.logic.vars.get('hp') ?? 1);
    // P23: hearts back (a potion, logic): the healing effect on the hero
    if (this.lastHp !== null && hp > this.lastHp && !this.over)
      this.eventEffect('heal', [this.heroState.x, this.heroState.y, this.heroState.z]);
    this.lastHp = hp;
    if (!this.over && hp <= 0) this.gameOver();
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    this.emit('screen', 'Game over');
    const go = screenOfKind(this.snapshot, 'gameover');
    if (go) this.screens.push(go.id);
  }

  stepSmash(dt: number) {
    const strike = this.pendingSmash;
    if (!strike) return;
    strike.remaining -= dt;
    if (strike.remaining > 1e-6) return;
    this.pendingSmash = null;
    this.resolveStrike(strike.kind, strike.reach, strike);
  }

  /** where an attack lands: the neighbour or object in front (or everything around, for spin and plunge) */
  private resolveStrike(
    kind: AttackKind,
    reach: number,
    aim: { id: number | null; group?: string | undefined } | null,
  ) {
    this.strikeKind = kind;
    try {
      this.resolveStrikeAt(kind, reach, aim);
    } finally {
      this.strikeKind = null;
    }
  }

  private resolveStrikeAt(
    kind: AttackKind,
    reach: number,
    aim: { id: number | null; group?: string | undefined } | null,
  ) {
    const attack = this.combat.hitOf(kind);
    const how = ATTACKS[kind];
    const push = { knock: how.knock, stun: how.stun };
    const h = this.heroState;
    if (how.around) {
      const r = reach + 1.2;
      let any = false;
      for (const n of [...this.world.npcs])
        if (Math.hypot(n.state.x - h.x, n.state.z - h.z) <= r + 0.6 && this.canHarm(n)) {
          this.hitNpc(n, attack, push);
          any = true;
        }
      for (const i of [...this.world.instances]) {
        if (!i.def.health) continue;
        const c = this.instanceCenter(i);
        if (c && Math.hypot(c[0] - h.x, c[2] - h.z) <= r + Math.max(i.def.footprint[0], i.def.footprint[1]) / 2) {
          this.hitInstance(i, attack);
          any = true;
        }
      }
      if (!any) this.emit('smash', `${kind === 'spin' ? 'Spin attack' : 'Plunge'}: nothing in reach`);
      return;
    }
    // P9a: a neighbour that can be harmed, in front of the hero and in reach, takes the hit first
    const npc = this.npcInReach(reach + 0.8);
    if (npc) {
      this.hitNpc(npc, attack, push);
      return;
    }
    const hit = this.world.controller.target(reach);
    if (!hit || (aim && aim.id !== null && hit.id !== aim.id && (!aim.group || hit.group !== aim.group))) return;
    // P9a: an object with health loses some; it breaks only when its health reaches zero
    const owner = this.instanceOfPiece(hit.id);
    if (owner?.def.health) {
      this.hitInstance(owner, attack, hit);
      return;
    }
    // a shield bash only shoves: it does not break plain bricks
    if (kind === 'bash') return;
    this.breakHit(hit, { heading: this.heroState.heading, impulse: 2 * how.mult, mass: 1 });
  }

  /** a neighbour the hero's hits hurt (its character has Can be harmed on) */
  canHarm(n: Npc): boolean {
    return !!npcCharacter(this.snapshot, this.world.mapId, n)?.harm?.canBeHarmed;
  }

  /** the middle of a placed object, in world units */
  /** P9b.1: the height of the top of a placed object (where the lock-on arrow goes), or null */
  instanceTop(i: PlayInstance): number | null {
    if (!i.bricks.length) return null;
    return Math.max(...i.bricks.map((b) => b.y)) * 0.4 + 1.2;
  }

  instanceCenter(i: PlayInstance): [number, number, number] | null {
    if (!i.bricks.length) return null;
    const xs = i.bricks.map((b) => b.x);
    const zs = i.bricks.map((b) => b.z);
    const ys = i.bricks.map((b) => b.y);
    return [
      (Math.min(...xs) + Math.max(...xs) + 1) / 2,
      ((Math.min(...ys) + Math.max(...ys)) / 2) * 0.4 + 0.6,
      (Math.min(...zs) + Math.max(...zs) + 1) / 2,
    ];
  }

  // ---------- health (P9a) ----------

  /** the nearest neighbour that can be harmed, in front of the hero within reach */
  private npcInReach(reach: number): Npc | null {
    const h = this.heroState;
    let best: Npc | null = null;
    let bd = reach;
    for (const n of this.world.npcs) {
      const dx = n.state.x - h.x;
      const dz = n.state.z - h.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(n.state.y - h.y) > 2) continue;
      const off = Math.abs(((Math.atan2(dx, dz) - h.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > 1 || !this.canHarm(n)) continue;
      best = n;
      bd = d;
    }
    return best;
  }

  /** a hit on a placed object with health: it loses some, and at zero breaks, drops, sends and is defeated */
  hitInstance(owner: PlayInstance, attack: AttackHit, piece?: LegacyPiece) {
    const def = assetHealth(owner.def);
    const name = owner.def.name;
    if (!def) {
      this.say(`The ${name.toLowerCase()} can’t be hurt.`, 1.5);
      return;
    }
    const key = `i:${owner.inst.id}`;
    const before = this.health.peek(key)?.hp ?? def.hp;
    if (before <= 0) return;
    const { dealt, wound } = this.health.hit(key, def, attack);
    const pos: Vec3 = [
      owner.inst.pos[0] + owner.def.footprint[0] / 2,
      owner.inst.pos[1] * 0.4,
      owner.inst.pos[2] + owner.def.footprint[1] / 2,
    ];
    if (dealt <= 0) {
      this.say(
        this.health.invulnerable.has(key)
          ? `The ${name.toLowerCase()} can’t be hurt right now.`
          : `The ${name.toLowerCase()} shrugs it off: only ${hurtBy(def)} hurts it.`,
        2,
      );
      return;
    }
    this.emit('smash', `${name}: −${dealt} (${wound.hp} of ${wound.max} left)`);
    // P23: the hit's effect, by its damage type
    this.hitEffect(attack.type, [pos[0], pos[1] + 1, pos[2]]);
    this.bigHitScreen();
    if (wound.hp > 0) {
      this.audio.play(owner.def.smash.sound ?? SND.smash, { pos, volume: 0.6 });
      this.say(`${name}: ${wound.hp} of ${wound.max} left`, 1.2);
      this.logic.fire({
        type: 'event.onDamaged',
        match: { asset: owner.def.id },
        payload: { target: owner.inst.id, amount: dealt, hp: wound.hp },
        self: owner.inst.id,
      });
      return;
    }
    this.defeatInstance(owner, def, piece);
  }

  private defeatInstance(owner: PlayInstance, def: Health, piece?: LegacyPiece) {
    const at = owner.inst.id;
    if (def.atZero.break) {
      const brick = piece ?? this.world.pieces.find((p) => this.instanceOfPiece(p.id) === owner);
      if (brick) this.breakHit(brick, { heading: this.heroState.heading, impulse: 2, mass: 1 }, true);
    }
    if (def.atZero.drop) this.drop(def.atZero.drop, { near: at });
    if (def.atZero.emit) this.logic.fire({ type: 'event.onCustom', match: { event: def.atZero.emit } });
    this.emit('smash', `${owner.def.name} defeated`);
    this.logic.fire({ type: 'event.onDefeated', match: { asset: owner.def.id }, payload: { target: at }, self: at });
  }

  /** a hit on a neighbour that can be harmed */
  hitNpc(npc: Npc, attack: AttackHit, push?: { knock: number; stun: number }) {
    const chr = npcCharacter(this.snapshot, this.world.mapId, npc);
    const name = String(npc.profile.name ?? 'Neighbour');
    if (!chr?.harm?.canBeHarmed) {
      this.say(`${name} can’t be harmed.`, 1.5);
      return;
    }
    const key = `n:${npc.id}`;
    const def = chr.harm.health;
    if ((this.health.peek(key)?.hp ?? def.hp) <= 0) return;
    const { dealt, wound } = this.health.hit(key, def, attack);
    const pos: Vec3 = [npc.state.x, npc.state.y, npc.state.z];
    if (dealt <= 0) {
      this.say(this.health.invulnerable.has(key) ? `${name} can’t be hurt right now.` : `${name} shrugs it off.`, 1.5);
      return;
    }
    this.audio.play(SND.hurt, { pos });
    this.hitEffect(attack.type, [pos[0], pos[1] + 2, pos[2]]);
    this.bigHitScreen();
    this.emit('smash', `${name}: −${dealt} (${wound.hp} of ${wound.max} left)`);
    if (wound.hp > 0) {
      // P9b: knocked back (away from the hero) and stunned for a moment
      if (push) {
        const dx = npc.state.x - this.heroState.x;
        const dz = npc.state.z - this.heroState.z;
        const d = Math.hypot(dx, dz) || 1;
        npc.state.x += (dx / d) * push.knock * 0.5;
        npc.state.z += (dz / d) * push.knock * 0.5;
        this.combat.stunNpc(npc, push.stun);
      }
      // P23 part 4: its hurt state
      const rec = this.npcStates.get(npc.id);
      if (rec) rec.hurtAt = this.clock;
      this.say(`${name}: ${wound.hp} of ${wound.max} left`, 1.2);
      this.logic.fire({
        type: 'event.onDamaged',
        match: { asset: '' },
        payload: { target: name, amount: dealt, hp: wound.hp },
        ...this.npcSelf(npc),
      });
      return;
    }
    // at zero the neighbour leaves this play (puff of bricks where it stood)
    this.world.npcs = this.world.npcs.filter((n) => n !== npc);
    if (this.talking === npc) this.talking = null;
    if (def.atZero.drop) this.drop(def.atZero.drop, { at: pos });
    if (def.atZero.emit) this.logic.fire({ type: 'event.onCustom', match: { event: def.atZero.emit } });
    this.say(`${name} is defeated.`, 2);
    this.eventEffect('defeat', [pos[0], pos[1] + 1.5, pos[2]]);
    this.screenEvent('defeat');
    this.emit('smash', `${name} defeated`);
    this.logic.fire({
      type: 'event.onDefeated',
      match: { asset: '' },
      payload: { target: name },
      ...this.npcSelf(npc),
    });
  }

  /** an item at zero: an asset (by name) put there, else an inventory item given to the hero */
  private drop(d: { item: string; count: number }, where: { near?: string; at?: Vec3 }) {
    const def = this.findAsset(d.item);
    if (def && where.near && this.spawnNear(d.item, where.near)) return;
    if (def && where.at) {
      const p = where.at;
      const [fw, fd] = def.footprint;
      if (this.placeCopy(def, [Math.round(p[0] - fw / 2), Math.round(p[1] / 0.4), Math.round(p[2] - fd / 2)], 0))
        return;
    }
    this.give(d.item, d.count);
  }

  private give(item: string, count: number) {
    const n = (this.inventory.get(item) ?? 0) + count;
    this.inventory.set(item, n);
    this.emit('info', `Got ${count} × ${item} (${n} in total)`);
    if (count > 0) this.eventEffect('coin', [this.heroState.x, this.heroState.y + 3, this.heroState.z]);
    this.say(`+${count} ${item}`, 1.5);
    this.audio.play(SND.pickup);
  }

  /** the neighbour called this (by name, or n:<id>) */
  /**
   * P9c: health bars to draw: objects and neighbours that have been hurt (and are still standing), and enemies
   * in a fight, within 25 studs. k = health left (0–1).
   */
  healthBars(): { pos: Vec3; k: number }[] {
    const h = this.heroState;
    const out: { pos: Vec3; k: number }[] = [];
    const near = (x: number, z: number) => Math.hypot(x - h.x, z - h.z) <= 25;
    for (const i of this.world.instances) {
      const w = this.health.peek(`i:${i.inst.id}`);
      if (!w || w.hp <= 0 || w.hp >= w.max) continue;
      const c = this.instanceCenter(i);
      const top = this.instanceTop(i);
      if (c && top !== null && near(c[0], c[2])) out.push({ pos: [c[0], top + 1.1, c[2]], k: w.hp / w.max });
    }
    for (const n of this.world.npcs) {
      const w = this.health.peek(`n:${n.id}`);
      const fighting = this.enemies.engaged(n);
      if (!fighting && (!w || w.hp >= w.max)) continue;
      if (w && w.hp <= 0) continue;
      if (!near(n.state.x, n.state.z)) continue;
      const max = w?.max ?? npcCharacter(this.snapshot, this.world.mapId, n)?.harm?.health.hp ?? 1;
      out.push({ pos: [n.state.x, n.state.y + 5.8, n.state.z], k: (w?.hp ?? max) / max });
    }
    return out;
  }

  /** P9c: no fighting now (game over, a cinematic, a talk) */
  calm(): boolean {
    return this.over || this.cine.active || !!this.talking || this.talks.active;
  }

  isStunned(n: Npc): boolean {
    return this.combat.isStunned(n);
  }

  /** P9c: an enemy's swing lands on the hero (through guard, parry and dodge) */
  hitHero(n: Npc, power: number, type: DamageType) {
    this.damage('hero', power, type, `n:${n.id}`);
  }

  /** P22 part 2: a neighbour whose sheet says it stands where it was put (a shopkeeper at a counter) */
  /** P22 part 4: the character a dialogue speaker is: its id, or the name of a character of the game */
  private byName: Map<string, Character> | null = null;
  speakerCharacter(who: string): Character | null {
    if (!who) return null;
    if (who.startsWith('chr_')) {
      return (
        (this.snapshot.get(paths.character(who)) as Character | undefined) ??
        BUILTIN_CHARACTERS.find((c) => c.id === who) ??
        null
      );
    }
    if (!this.byName) {
      this.byName = new Map();
      for (const k of this.snapshot.keys())
        if (k.startsWith('characters/')) {
          const c = this.snapshot.get(k) as Character | undefined;
          if (c?.name && !this.byName.has(c.name)) this.byName.set(c.name, c);
        }
    }
    return this.byName.get(who) ?? null;
  }

  /** the face parts a character shows for a mood (only options the minifig has) */
  private faceParts(chr: Character, mood: Parameters<typeof moodFace>[1]): Record<string, string> {
    const f = moodFace(chr.faces, mood);
    const out: Record<string, string> = {};
    const choices = this.L.CharacterCatalog.choices as Record<string, string[]>;
    for (const [k, v] of Object.entries(f)) if (v && choices[k]?.includes(v)) out[k] = v;
    return out;
  }

  /** P22 part 4: the speaker's portrait for a dialogue line (null: not drawn yet, or no such character) */
  portraitOf(who: string, mood: Parameters<typeof moodFace>[1], mouth = 0): string | null {
    const chr = this.speakerCharacter(who);
    if (!chr) return null;
    let body: ResolvedBody | null = null;
    try {
      body = resolveBody(chr.body, (p) => this.snapshot.get(p));
    } catch {
      body = null;
    }
    const profile = body
      ? {}
      : {
          ...this.L.CharacterCatalog.defaults,
          ...wornProfile(chr),
          ...this.faceParts(chr, mood),
          ...(mouth ? { mouthOpen: mouth } : {}),
        };
    return portrait(profile, body);
  }

  /**
   * P22 part 4: while a line plays, its speaker (a neighbour on the map, or the hero) shows the face of the
   * line's mood. Null: no change.
   */
  moodFaceOf(who: Npc | 'hero'): Record<string, string | number> | null {
    const v = this.talks.active ? this.talks.view : null;
    if (!v?.who || v.choices) return null;
    const speaker = this.speakerCharacter(v.who);
    if (!speaker) return null;
    const chr = who === 'hero' ? this.heroChr : npcCharacter(this.snapshot, this.world.mapId, who);
    if (!chr || chr.id !== speaker.id) return null;
    // P23 part 3: and its mouth moves with the words
    const parts: Record<string, string | number> = this.faceParts(chr, v.mood);
    const mouth = this.talks.mouth();
    if (mouth) parts.mouthOpen = mouth;
    return Object.keys(parts).length ? parts : null;
  }

  /** P23 part 3: the face of a character (by id or name) for a mood: a cinematic's extra cast */
  speakerFace(who: string, mood: Parameters<typeof moodFace>[1]): Record<string, string> | null {
    const chr = this.speakerCharacter(who);
    if (!chr) return null;
    const parts = this.faceParts(chr, mood);
    return Object.keys(parts).length ? parts : null;
  }

  /** P23 part 3: a cast member's face in a cinematic (its line's mood, or a Face item); null: its own face */
  castFaceOf(who: Npc | 'hero', mood: Parameters<typeof moodFace>[1] | null): Record<string, string> | null {
    if (!mood) return null;
    const chr = who === 'hero' ? this.heroChr : npcCharacter(this.snapshot, this.world.mapId, who);
    if (!chr) return null;
    const parts = this.faceParts(chr, mood);
    return Object.keys(parts).length ? parts : null;
  }

  // ---------- screen effects (P23 part 2) ----------

  /** a screen effect of the game (its own file) or a built-in one */
  screenEffectDef(id: string): ScreenEffect | null {
    return (
      (this.snapshot.get(paths.screenEffect(id)) as ScreenEffect | undefined) ??
      BUILTIN_SCREEN_EFFECTS.find((e) => e.id === id) ??
      null
    );
  }

  /** Plays a screen effect; false when there is no such effect. */
  playScreenEffect(id: string | null | undefined): boolean {
    if (!id || id === 'none') return false;
    const def = this.screenEffectDef(id);
    if (!def) return false;
    this.screenFx.play(def);
    // a hit-stop holds from this very step
    this.runtime.slow = this.screenFx.speed();
    return true;
  }

  /** the screen effect for something that happens (the game's pick, else the built-in one) */
  screenEvent(ev: ScreenEvent) {
    this.playScreenEffect(this.project.screenEffects?.events?.[ev] ?? DEFAULT_SCREEN_EVENTS[ev]);
  }

  private bigHitScreen() {
    if (this.strikeKind === 'charged' || this.strikeKind === 'spin' || this.strikeKind === 'plunge')
      this.screenEvent('bigHit');
  }

  /** the mood shown now: what logic set for this map, else the map's own */
  get mood(): Mood {
    return this.moodOverride ?? this.world.doc.mood ?? NO_MOOD;
  }

  /** red edges while the hero is low on health (a quarter of its hearts or less; the game can turn them off) */
  lowHealth(): number {
    if (this.project.screenEffects?.lowHealth === false || this.over) return 0;
    const hp = Number(this.logic.vars.get('hp') ?? 0);
    const max = Number(this.logic.vars.get('maxHp') ?? 3);
    return max > 0 && hp > 0 && hp / max <= 0.25 ? 1 : 0;
  }

  /** logic and actions: play a screen effect, set this map's mood while it plays, or clear everything */
  screenFxOp(op: 'play' | 'mood' | 'clear', a?: string | Record<string, unknown>) {
    if (op === 'clear') {
      this.screenFx.clear();
      this.moodOverride = null;
      return;
    }
    if (op === 'play') {
      if (!this.playScreenEffect(String(a ?? ''))) this.emit('info', `Screen effect: no screen effect ${a}.`);
      return;
    }
    const m = (a ?? {}) as Record<string, unknown>;
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);
    const r = Mood.safeParse({
      grade: m.grade ?? 'none',
      vignette: num(m.vignette, 0),
      drift: m.drift ?? 'none',
      amount: num(m.amount, 0.5),
    });
    if (r.success) this.moodOverride = r.data;
    else this.emit('info', 'Set screen mood: not a colour or drift the editor knows.');
  }

  stepScreenFx(realDt: number) {
    // a pause (a menu, the debugger) holds screen effects too
    if (this.runtime.paused) {
      this.runtime.slow = 1;
      return;
    }
    this.screenFx.step(realDt);
    this.runtime.slow = this.screenFx.speed();
  }

  // ---------- effects (P23 part 1) ----------

  /** an effect of the game (its own file) or a built-in one */
  effectDef(id: string): Effect | null {
    return (
      (this.snapshot.get(paths.effect(id)) as Effect | undefined) ?? BUILTIN_EFFECTS.find((e) => e.id === id) ?? null
    );
  }

  /** Plays an effect at a point (world units); a stream keeps going until stopped. */
  playEffect(id: string | null | undefined, at: Vec3, opts: PlayOptions = {}): StreamHandle | null {
    if (!id || id === 'none') return null;
    const def = this.effectDef(id);
    if (!def) return null;
    return this.effects.play(def, at, opts);
  }

  /** the hit effect for a damage type (the game's pick, else the built-in one) */
  hitEffect(type: keyof typeof DEFAULT_HITS, at: Vec3) {
    this.playEffect(this.project.effects?.hits?.[type] ?? DEFAULT_HITS[type], at, {
      forward: [Math.sin(this.heroState.heading), 0, Math.cos(this.heroState.heading)],
    });
  }

  /** the effect for something that happens (level up, healing, treasure, bricks breaking, a defeat) */
  eventEffect(ev: EffectEvent, at: Vec3) {
    this.playEffect(this.project.effects?.events?.[ev] ?? DEFAULT_EFFECT_EVENTS[ev], at);
  }

  /** where an effect plays: the hero (empty), an object or neighbour (by id or name), or a placed effect */
  private effectAt(at: string | undefined): Vec3 | null {
    const s = this.heroState;
    if (!at || at === 'hero') return [s.x, s.y + 1.2, s.z];
    const placed = this.world.effects.find((e) => (e.name ?? e.id) === at || e.id === at);
    if (placed) return [...placed.pos] as Vec3;
    const low = at.trim().toLowerCase();
    const npc = this.world.npcs.find((n) => String(n.profile.name ?? '').toLowerCase() === low);
    if (npc) return [npc.state.x, npc.state.y + 1.5, npc.state.z];
    const inst = this.resolveEntity(at);
    if (inst)
      return [
        inst.inst.pos[0] + inst.def.footprint[0] / 2,
        inst.inst.pos[1] * 0.4 + 1,
        inst.inst.pos[2] + inst.def.footprint[1] / 2,
      ];
    return null;
  }

  /** P23: actions and logic: play an effect somewhere, or start / stop one placed on the map */
  effectOp(op: 'play' | 'on' | 'off', a: string, at?: string) {
    if (op === 'play') {
      const p = this.effectAt(at);
      if (!p) this.emit('info', `Play effect: nothing called “${at}” here.`);
      else if (!this.playEffect(a, p) && !this.effectDef(a)) this.emit('info', `Play effect: no effect ${a}.`);
      return;
    }
    if (!this.setPlacedEffect(a, op === 'on')) this.emit('info', `No effect called “${a}” on this map.`);
  }

  // ---------- P27: lights ----------

  /** asset copies of this map smashed now (their light goes out) */
  private smashedIds(): Set<string> {
    const w = this.world;
    if (this.smashedCache?.world === w && this.smashedCache.rev === w.rev) return this.smashedCache.ids;
    const ids = new Set<string>();
    for (const b of w.broken)
      for (const p of b.originals) {
        const i = this.instanceOfPiece(p.id);
        if (i) ids.add(i.inst.id);
      }
    this.smashedCache = { world: w, rev: w.rev, ids };
    return ids;
  }

  /** every light of this map now: placed lights, assets that give light, glowing effects, and if each is on */
  lightSources(): LightSource[] {
    const w = this.world;
    const gone = this.smashedIds();
    return gatherLights({
      items: [...w.lights, ...w.effects],
      assets: w.instances.map((i) => ({ inst: i.inst, def: i.def, state: i.state, gone: gone.has(i.inst.id) })),
      effectDef: (id) => this.effectDef(id),
      switched: this.lightSwitch,
      effectOn: (e) => this.placed.get(e.id)?.on ?? e.playing,
    });
  }

  /** the lights to draw now (flickering on the game clock; the night-only ones as dark falls) */
  pointLightsNow(): PointLight[] {
    return pointLights(this.lightSources(), this.clock, this.atmosphereNow().sky.night);
  }

  /** P27 part 2: the sky and fog now: the map's start time moved on by the clock at its day length */
  atmosphereNow(): Atmosphere {
    const doc = this.world.doc;
    const t = this.timeSet;
    const fog = this.fogSet === undefined ? doc.fog : (this.fogSet ?? undefined);
    return atmosphere(
      { ...doc, sky: { time: t?.time ?? doc.sky.time }, fog },
      this.clock - (t?.at ?? 0),
      this.L.SkyCycle,
    );
  }

  /** logic: move the sun to a time of day, or change the fog (a preset, 'none' or 'map') */
  skyOp(op: 'time' | 'fog', value: string) {
    if (op === 'time') {
      if (!(TIMES as readonly string[]).includes(value)) return this.emit('info', `No time of day “${value}”.`);
      this.timeSet = { time: value as MapDoc['sky']['time'], at: this.clock };
      return;
    }
    this.fogSet =
      value === 'map'
        ? undefined
        : value === 'none'
          ? null
          : (FOG_PRESET[value as FogPreset]?.fog ?? this.world.doc.fog ?? null);
  }

  /** how dark this map is without its lights (logic's Set darkness while it plays, else the map's) */
  get darkness(): number {
    return this.darknessNow ?? this.world.doc.darkness ?? 0;
  }

  /** actions and logic: switch a light on, off or over (by name, or 'this'), or set the darkness */
  lightOp(op: 'on' | 'off' | 'toggle' | 'darkness', name: string, self?: string, value?: number) {
    if (op === 'darkness') {
      this.darknessNow = Math.max(0, Math.min(1, Number(value) || 0));
      return;
    }
    const key = (name === 'this' || name === 'self') && self ? self : name;
    const l = findLight(this.lightSources(), key);
    if (!l) {
      this.emit('info', `No light called “${name}” on this map.`);
      return;
    }
    this.lightSwitch.set(l.key, op === 'toggle' ? !l.on : op === 'on');
    this.emit('event', `Light ${l.name ?? l.key} ${this.lightSwitch.get(l.key) ? 'on' : 'off'}`);
  }

  /** P23: logic's Play effect / Stop effect on an effect placed on the map (by its name) */
  setPlacedEffect(name: string, on: boolean): boolean {
    const it = this.world.effects.find((e) => (e.name ?? e.id) === name);
    if (!it) return false;
    const st = this.placed.get(it.id) ?? { stream: null, next: 0, on: it.playing };
    st.on = on;
    if (!on) {
      this.effects.stop(st.stream);
      st.stream = null;
    } else {
      const def = this.effectDef(it.effect);
      // a burst plays now, then on its interval
      if (def?.mode === 'burst') {
        this.effects.play(def, it.pos as Vec3, { scale: it.scale, ...(it.tint ? { tint: it.tint } : {}) });
        st.next = this.clock + this.effectWait(it);
      }
    }
    this.placed.set(it.id, st);
    return true;
  }

  private effectWait(it: EffectInstance) {
    const [lo, hi] = it.interval;
    return Math.min(lo, hi) + Math.abs(hi - lo) * Math.random();
  }

  /** bricks particles bounce off (a set of filled cells, rebuilt when bricks break or come back) */
  private cells: { world: MapWorld; rev: number; at: string | null; set: Set<number> } | null = null;
  private solidAt = (x: number, y: number, z: number): boolean => {
    const w = this.world;
    if (y < 0) return true;
    if (!this.cells || this.cells.world !== w || this.cells.rev !== w.rev || this.cells.at !== w.windowAt) {
      const set = new Set<number>();
      // P27 part 3: a big map's particles bounce off the window around the hero
      for (const p of w.big ? w.controller.pieces : w.pieces) {
        const [cw, cd] = p.turn % 2 ? [p.rows, p.cols] : [p.cols, p.rows];
        const h = p.kind === 'brick' ? 3 : 1;
        for (let i = 0; i < cw; i++)
          for (let j = 0; j < cd; j++) for (let k = 0; k < h; k++) set.add(cellKey(p.x + i, p.y + k, p.z + j));
      }
      this.cells = { world: w, rev: w.rev, at: w.windowAt, set };
    }
    return this.cells.set.has(cellKey(Math.floor(x), Math.floor(y / 0.4), Math.floor(z)));
  };

  /** particles move; effects placed on the map play while the hero is near */
  stepEffects(dt: number) {
    const s = this.heroState;
    for (const it of this.world.effects) {
      const st = this.placed.get(it.id) ?? { stream: null, next: this.clock + Math.random() * 0.5, on: it.playing };
      this.placed.set(it.id, st);
      const near = Math.hypot(it.pos[0] - s.x, it.pos[1] - s.y, it.pos[2] - s.z) <= it.maxDistance;
      const def = this.effectDef(it.effect);
      if (!def || !st.on || !near) {
        if (st.stream) {
          this.effects.stop(st.stream);
          st.stream = null;
        }
        continue;
      }
      const opts = { scale: it.scale, ...(it.tint ? { tint: it.tint } : {}) };
      if (def.mode === 'stream') {
        if (!this.effects.running(st.stream)) st.stream = this.effects.start(def, it.pos as Vec3, opts);
      } else if (this.clock >= st.next) {
        this.effects.play(def, it.pos as Vec3, opts);
        st.next = this.clock + this.effectWait(it);
      }
    }
    this.effects.step(dt * this.slowmo, this.solidAt);
  }

  /** NPC ids belong to one map: a new map (or a restart) looks bodies up again */
  private forgetBodies() {
    this.bodies?.clear();
    this.npcStates?.clear();
    // P27: a new map is as dark as it was made, with its own fog
    this.darknessNow = null;
    this.fogSet = undefined;
    this.standing?.clear();
    // P23: a new map starts with no particles; its own effects start again
    this.effects?.clear();
    this.placed?.clear();
    // P23 part 2: a new map has its own mood; screen effects do not carry over
    this.screenFx?.clear();
    this.moodOverride = null;
  }

  /** P22 part 3: the body plan a character wears in Play (null: the minifig) */
  bodyOf(who: Npc | 'hero'): ResolvedBody | null {
    const key = who === 'hero' ? 'hero' : who.id;
    if (!this.bodies.has(key)) {
      const chr = who === 'hero' ? this.heroChr : npcCharacter(this.snapshot, this.world.mapId, who);
      let body: ResolvedBody | null = null;
      try {
        body = resolveBody(chr?.body, (p) => this.snapshot.get(p));
      } catch {
        body = null;
      }
      this.bodies.set(key, body);
    }
    return this.bodies.get(key)!;
  }

  standsStill(n: Npc): boolean {
    if (!this.standing.has(n.id))
      this.standing.set(n.id, npcCharacter(this.snapshot, this.world.mapId, n)?.behaviour?.routine === 'stand');
    return this.standing.get(n.id)!;
  }

  heroMoves() {
    return movesOf(this.heroChr);
  }

  /** the hero's stats with its outfit's bonuses */
  get heroStats() {
    return statsOf(this.heroChr);
  }

  /** P9c: what a neighbour fights with (null: it does not fight) — from its character, looked up once */
  private enemyCache = new Map<number, Enemy | null>();
  enemyOf(n: Npc): Enemy | null {
    if (!this.enemyCache.has(n.id)) {
      const chr = npcCharacter(this.snapshot, this.world.mapId, n);
      this.enemyCache.set(n.id, chr?.enemy ?? null);
    }
    return this.enemyCache.get(n.id) ?? null;
  }

  /** P9c: the instance id of a neighbour (what a script on it is owned by) */
  npcSelf(n: Npc): { self?: string } {
    const inst = this.snapshot.get(paths.instances(this.world.mapId)) as Instances | undefined;
    const item = inst?.items.find((i) => i.kind === 'npc' && i.legacyId === n.id);
    return item ? { self: item.id } : {};
  }

  private npcByRef(ref: string): Npc | null {
    const low = ref.trim().toLowerCase();
    return (
      this.world.npcs.find(
        (n) =>
          `n:${n.id}` === ref || this.npcSelf(n).self === ref || String(n.profile.name ?? '').toLowerCase() === low,
      ) ?? null
    );
  }

  /** logic's Damage: the hero, a placed object (id or asset name) or a neighbour (name) */
  damage(ref: string, amount: number, type: string, from?: string) {
    const attack: AttackHit = { power: amount, type: asDamageType(type) };
    if (!ref || ref === 'hero') {
      if (this.health.invulnerable.has('hero')) return;
      // P9b: the guard blocks (or parries) hits from the front; a dodge roll avoids them
      const src = from ? this.positionOf(from) : null;
      const r = this.combat.defend(attack, src ? [src[0], src[2]] : null);
      if (r.how === 'parry') {
        this.say('Parry!', 1.2);
        this.emit('smash', 'Parried');
        const npc = from ? this.npcByRef(from) : null;
        if (npc) this.combat.stunNpc(npc, 1.2);
      } else if (r.how === 'block') this.say('Blocked', 0.8);
      else if (r.how === 'break') this.say('Your guard broke!', 1.5);
      else if (r.how === 'dodge') this.emit('info', 'Dodged');
      if (r.taken > 0) this.hurt(r.taken);
      return;
    }
    const inst = this.resolveEntity(ref);
    if (inst) return this.hitInstance(inst, attack);
    const npc = this.npcByRef(ref);
    if (npc) return this.hitNpc(npc, attack);
    this.emit('info', `Damage: nothing called “${ref}” here.`);
  }

  /** P9b.1: logic's On locked on (target: the object's id, or the neighbour's name) */
  lockedOn(t: LockTarget) {
    if (t.kind === 'npc') {
      const n = this.world.npcs.find((x) => x.id === t.id);
      if (n) this.say(`${n.profile.name ?? 'Neighbour'} — T to talk`, 2);
      this.logic.fire({
        type: 'event.onLockedOn',
        match: { asset: '' },
        payload: { target: String(n?.profile.name ?? '') },
        ...(n ? this.npcSelf(n) : {}),
      });
      return;
    }
    const i = this.world.instances.find((x) => x.inst.id === t.id);
    if (!i) return;
    this.logic.fire({
      type: 'event.onLockedOn',
      match: { asset: i.def.id },
      payload: { target: i.inst.id },
      self: i.inst.id,
    });
  }

  /** where a thing is: the hero, a placed object (id or asset name) or a neighbour (name) */
  positionOf(ref: string): [number, number, number] | null {
    if (ref === 'hero') return [this.heroState.x, this.heroState.y, this.heroState.z];
    const inst = this.resolveEntity(ref);
    if (inst) return this.instanceCenter(inst);
    const npc = this.npcByRef(ref);
    return npc ? [npc.state.x, npc.state.y, npc.state.z] : null;
  }

  /** logic's Heal (never above the maximum; the hero: hearts) */
  heal(ref: string, amount: number) {
    if (!ref || ref === 'hero') {
      const max = Number(this.logic.vars.get('maxHp') ?? 3);
      this.logic.setVar('hp', Math.min(max, Number(this.logic.vars.get('hp') ?? 0) + Math.max(0, amount)));
      return;
    }
    const inst = this.resolveEntity(ref);
    const def = inst ? assetHealth(inst.def) : null;
    if (inst && def) {
      this.health.heal(`i:${inst.inst.id}`, def, amount);
      return;
    }
    const npc = this.npcByRef(ref);
    const harm = npc ? npcCharacter(this.snapshot, this.world.mapId, npc)?.harm : undefined;
    if (npc && harm) this.health.heal(`n:${npc.id}`, harm.health, amount);
  }

  /** logic's Set invulnerable */
  setInvulnerable(ref: string, on: boolean) {
    const inst = ref && ref !== 'hero' ? this.resolveEntity(ref) : null;
    const npc = ref && ref !== 'hero' && !inst ? this.npcByRef(ref) : null;
    const key = !ref || ref === 'hero' ? 'hero' : inst ? `i:${inst.inst.id}` : npc ? `n:${npc.id}` : null;
    if (!key) return this.emit('info', `Set invulnerable: nothing called “${ref}” here.`);
    if (on) this.health.invulnerable.add(key);
    else this.health.invulnerable.delete(key);
  }

  /** Port of v68 breakHit: the hit brick (or its whole group) plus anything it was holding up. */
  breakHit(hit: LegacyPiece, impact?: { heading: number; impulse: number; mass: number }, force = false) {
    const w = this.world;
    const owner = this.instanceOfPiece(hit.id);
    if (owner && !owner.def.smash.enabled && !force) {
      this.say(`The ${owner.def.name.toLowerCase()} can’t be smashed.`, 1.5);
      return 0;
    }
    const ids = new Set(
      w.pieces.filter((p) => p.y > 0 && (p.id === hit.id || (hit.group && p.group === hit.group))).map((p) => p.id!),
    );
    let check = this.layoutCheck(
      w,
      w.pieces.filter((p) => !ids.has(p.id!)),
      w.pieces.filter((p) => ids.has(p.id!)),
    );
    if (!check.ok && check.connected) {
      const connected = check.connected;
      check.list.forEach((p, i) => {
        if (!connected.has(i)) ids.add(p.id!);
      });
      check = this.layoutCheck(
        w,
        w.pieces.filter((p) => !ids.has(p.id!)),
        w.pieces.filter((p) => ids.has(p.id!)),
      );
    }
    const remaining = w.pieces.filter((p) => !ids.has(p.id!));
    if (!check.ok) {
      this.say(check.reason ?? 'That can’t break.', 2);
      return 0;
    }
    const originals = w.pieces.filter((p) => ids.has(p.id!)).map((p) => ({ ...p }));
    if (!originals.length) return 0;
    const entry: BrokenEntry = { id: w.brokenSerial++, originals, progress: 0 };
    for (const p of originals) w.dirtyChunks.add(chunkKeyOf(p));
    // P23: dust where the bricks break
    {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const p of originals) {
        cx += p.x;
        cy += p.y * 0.4;
        cz += p.z;
      }
      const n = originals.length;
      this.eventEffect('smash', [cx / n + 0.5, cy / n + 0.6, cz / n + 0.5]);
      this.screenEvent('smash');
    }
    w.pieces = remaining;
    w.broken.push(entry);
    this.makeDebris(entry, impact);
    this.syncPhysics(w);
    const hb = this.L.GamePhysics.bounds(hit);
    this.audio.play(owner?.def.smash.sound ?? SND.smash, {
      pos: [(hb.x0 + hb.x1) / 2, (hb.y0 + hb.y1) / 2, (hb.z0 + hb.z1) / 2],
    });
    this.emit(
      'smash',
      `${originals.length} brick${originals.length === 1 ? '' : 's'} smashed${hit.group ? ` (${hit.group})` : ''}`,
    );
    this.logic.fire({
      type: 'event.onSmash',
      match: { asset: owner?.def.id ?? '' },
      payload: { target: owner?.inst.id ?? hit.group ?? String(hit.id), bricks: originals.length },
      ...(owner ? { self: owner.inst.id } : {}),
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

  stepDebris(dt0: number) {
    const dt = dt0 * this.slowmo;
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

  /**
   * P9c: moving parts that are posed away from where they rest (an open chest's lid) take up room: the hero is
   * pushed out of them, so a lid never swings through the player. Their boxes, in world units.
   */
  partBoxes(): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; cx: number; cz: number }[] {
    const w = this.world;
    const list = w.instances.filter(
      (i) => i.def.parts?.some((p) => p.pose) && (i.state !== i.def.initialState || i.anim),
    );
    if (!list.length) return [];
    const now = this.clock;
    const groups = freeGroups(list, (id) => {
      const i = list.find((x) => x.inst.id === id);
      return i?.anim ? { ...i.anim, now } : null;
    });
    const out: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; cx: number; cz: number }[] =
      [];
    for (const g of groups) {
      if (g.part === null) continue;
      const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      for (const b of g.bricks) {
        const piece = this.pieceById(w, b.id);
        if (!piece) continue;
        const r = this.L.GamePhysics.bounds(piece);
        for (const x of [r.x0, r.x1])
          for (const y of [r.y0, r.y1])
            for (const z of [r.z0, r.z1]) {
              const [px, py, pz] = g.t.point([x, y, z]);
              box.x0 = Math.min(box.x0, px);
              box.x1 = Math.max(box.x1, px);
              box.y0 = Math.min(box.y0, py);
              box.y1 = Math.max(box.y1, py);
              box.z0 = Math.min(box.z0, pz);
              box.z1 = Math.max(box.z1, pz);
            }
      }
      // the middle of the whole object: the hero is pushed away from it, never into it
      const owner = list.find((i) => i.inst.id === g.instance);
      const c = owner ? this.instanceCenter(owner) : null;
      if (box.x0 < box.x1)
        out.push({ ...box, cx: c?.[0] ?? (box.x0 + box.x1) / 2, cz: c?.[2] ?? (box.z0 + box.z1) / 2 });
    }
    return out;
  }

  /** P9c: steps the hero out of any posed moving part it stands in (sideways, the shortest way) */
  private keepOutOfParts() {
    const h = this.heroState;
    const r = 0.45;
    for (const b of this.partBoxes()) {
      // under it, or standing on top of it (a closed lid is the chest's top): not in its way
      if (h.y + 3.8 < b.y0 || h.y >= b.y1 - 0.1) continue;
      const cx = Math.max(b.x0, Math.min(h.x, b.x1));
      const cz = Math.max(b.z0, Math.min(h.z, b.z1));
      const dx = h.x - cx;
      const dz = h.z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) {
        h.x = cx + (dx / d) * r;
        h.z = cz + (dz / d) * r;
        continue;
      }
      // inside: out through the nearest side that faces away from the object (not into it)
      const ax = h.x - b.cx;
      const az = h.z - b.cz;
      const sides: [number, number, number][] = [
        [h.x - b.x0, -1, 0],
        [b.x1 - h.x, 1, 0],
        [h.z - b.z0, 0, -1],
        [b.z1 - h.z, 0, 1],
      ];
      const away = sides.filter(([, sx, sz]) => sx * ax + sz * az > 0);
      const [depth, sx, sz] = (away.length ? away : sides).sort((a, c) => a[0] - c[0])[0]!;
      h.x += sx * (depth + r);
      h.z += sz * (depth + r);
    }
  }

  /** P9c: where to stand to rebuild a smashed thing — the nearest spot just outside it, on the hero's side */
  rebuildStand(b: { x0: number; x1: number; y0: number; z0: number; z1: number }): [number, number, number] {
    const h = this.heroState;
    const m = 1.4;
    const x0 = b.x0 - m;
    const x1 = b.x1 + m;
    const z0 = b.z0 - m;
    const z1 = b.z1 + m;
    let x = Math.max(x0, Math.min(h.x, x1));
    let z = Math.max(z0, Math.min(h.z, z1));
    if (x > x0 && x < x1 && z > z0 && z < z1) {
      // the hero is in the ring: the nearest edge
      const d = [x - x0, x1 - x, z - z0, z1 - z];
      const k = d.indexOf(Math.min(...d));
      if (k === 0) x = x0;
      else if (k === 1) x = x1;
      else if (k === 2) z = z0;
      else z = z1;
    }
    return [x, b.y0, z];
  }

  /**
   * P9b.1: smashed things the hero can rebuild, within 30 studs: their bounds, their bricks (drawn as ghosts
   * where they will go back) and whether the hero stands close enough to hold E.
   */
  rebuildSpots(): { entry: BrokenEntry; bounds: ReturnType<PlaySession['damagedBounds']>; near: boolean }[] {
    const s = this.heroState;
    const near = this.nearestBroken();
    const out: { entry: BrokenEntry; bounds: ReturnType<PlaySession['damagedBounds']>; near: boolean }[] = [];
    for (const e of this.world.broken) {
      const owner = this.instanceOfPiece(e.originals[0]?.id);
      if (owner && !owner.def.smash.rebuild) continue;
      const b = this.damagedBounds(e);
      if (Math.hypot((b.x0 + b.x1) / 2 - s.x, (b.z0 + b.z1) / 2 - s.z) > 30) continue;
      out.push({ entry: e, bounds: b, near: e === near });
    }
    return out;
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
    this.rebuildTick = 0;
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
    const tick = Math.floor(entry.progress * 6);
    if (tick > this.rebuildTick && entry.progress < 1) {
      this.rebuildTick = tick;
      this.audio.play(SND.rebuild, { pos: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2] });
    }
    this.say(`Rebuilding ${entry.originals.length} bricks… ${Math.round(entry.progress * 100)}%`, 0.2);
    if (entry.progress < 1) return;
    const back = entry.originals.map((p) => ({ ...p }));
    const restored = [...w.pieces, ...back];
    const check = this.layoutCheck(w, restored, back);
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
    this.syncPhysics(w);
    this.cancelRebuild();
    this.audio.play(SND.rebuilt, { pos: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2] });
    const owner = this.instanceOfPiece(entry.originals[0]?.id);
    this.emit('rebuild', `Rebuilt ${entry.originals.length} bricks${owner ? ` (${owner.def.name})` : ''}`);
    if (owner) this.emit('event', `Event “onRebuildFinished” · ${owner.def.name}`);
    this.logic.fire({
      type: 'event.onRebuildFinished',
      match: { asset: owner?.def.id ?? '' },
      payload: { target: owner?.inst.id ?? entry.originals[0]?.group ?? '' },
      ...(owner ? { self: owner.inst.id } : {}),
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
        const inst = this.resolveEntity(target);
        if (inst) this.setInstanceState(inst.inst.id, state);
        else this.emit('info', `Set state ${state}: ${target ? `nothing called “${target}” here` : 'no target wired'}`);
      },
      teleport: (spawn) => {
        const sp = this.world.doc.spawns.find((x) => x.id === spawn);
        if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
      },
      travel: (map, spawn) => {
        if (this.snapshot.get(paths.map(map))) this.travel(map, spawn);
      },
      give: (item, count) => this.give(item, count),
      damage: (target, amount, type, from) => this.damage(target, amount, type, from),
      heal: (target, amount) => this.heal(target, amount),
      setInvulnerable: (target, on) => this.setInvulnerable(target, on),
      saving: (op, slot) => this.savingOp(op, slot),
      progress: (op, id) => {
        if (op === 'achieve') this.progress.unlock(id);
        else this.gameOp('finish');
      },
      talk: (conversation) => void this.startConversation(conversation, null, 'other'),
      effect: (op, a, at) => this.effectOp(op, a, at),
      screen: (op, a) => this.screenFxOp(op, a),
      light: (op, name, value) => this.lightOp(op, name, undefined, value),
      sky: (op, value) => this.skyOp(op, value),
      sheet: (op, value) =>
        op === 'outfit'
          ? this.setOutfit(String(value))
          : op === 'xp'
            ? this.giveXp(Number(value) || 0)
            : this.switchHero(),
      spawn: (asset, at) => this.spawnAsset(asset, at),
      spawnNear: (item, near) => this.spawnNear(item, near),
      despawn: (target) => {
        const inst = this.resolveEntity(target);
        if (inst) this.despawn(inst.inst.id);
      },
      media: (kind, id, extra) => {
        switch (kind) {
          case 'sound':
            this.playSound(id, undefined);
            break;
          case 'music':
            this.audio.music('logic', id || null);
            break;
          case 'stopMusic':
            this.audio.music('logic', null);
            break;
          case 'show':
          case 'hide':
            this.screenOp(kind, id, false);
            break;
          case 'setText': {
            const e = extra as { element?: unknown; text?: unknown };
            this.screenText.set(`${id}:${String(e?.element ?? '')}`, formatValue(e?.text));
            break;
          }
          case 'cinematic':
            this.cine.play(id, { once: !!(extra as { once?: boolean } | undefined)?.once });
            break;
          case 'stopCinematic':
            this.cine.stop();
            break;
        }
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
      this.zoneAudio();
    }
  }

  /** music zones (innermost wins) and ambience zones (P5.4, P5.5) */
  private zoneAudio() {
    let best: { music: string | null; vol: number } | null = null;
    const amb = new Set<string>();
    for (const z of this.world.doc.zones) {
      if (!this.inZones.has(z.id)) continue;
      if (z.ambience) {
        amb.add(z.id);
        this.audio.loop(`zone:${z.id}`, z.ambience);
      }
      if (z.music === undefined) continue;
      const vol = (z.max[0] - z.min[0]) * (z.max[1] - z.min[1]) * (z.max[2] - z.min[2]);
      if (!best || vol < best.vol) best = { music: z.music, vol };
    }
    for (const id of this.zoneAmbience) if (!amb.has(id)) this.audio.stopLoop(`zone:${id}`);
    this.zoneAmbience = amb;
    this.audio.music('zone', best ? best.music : undefined);
  }

  /** the map's music and ambience (P5.4) */
  private applyMapAudio() {
    const d = this.world.doc;
    this.audio.music('map', d.music ?? undefined);
    if (d.ambience) this.audio.loop('map:ambience', d.ambience);
    else this.audio.stopLoop('map:ambience');
  }

  /** a sound event at the hero, or at the instance an asset action belongs to */
  playSound(event: string, self: string | undefined) {
    const inst = self ? this.world.instances.find((i) => i.inst.id === self) : undefined;
    const so = inst?.sockets[0];
    const s = this.heroState;
    this.audio.play(event, { pos: so ? (so.world as Vec3) : [s.x, s.y + 1, s.z] });
  }

  stepEmitters() {
    if (this.runtime.ticks % 6) return;
    const s = this.heroState;
    this.emitterSystem.step(this.world.emitters, [s.x, s.y + 1, s.z], this.clock, this.audio);
  }

  // ---------- screens and game flow (P5.7, P5.8) ----------

  stepUi(dt: number) {
    this.uiClock += dt;
    this.uiActions.step(this.uiClock);
    const s = this.heroState;
    this.audio.listener([s.x, s.y + 1.5, s.z], this.camYaw);
  }

  /** true while a screen (title, pause, game over) holds the game */
  get screenPaused(): boolean {
    return this.screens.pausesGame;
  }

  private screensChanged() {
    const now = new Set(this.screens.ids);
    for (const id of now) {
      if (this.shownScreens.has(id)) continue;
      const sc = resolveScreen(this.snapshot, id);
      this.emit('screen', `Screen ${sc?.name ?? id}`);
      if (sc?.onShow?.length) this.uiActions.run(sc.onShow, this.uiClock);
    }
    this.shownScreens = now;
    // screen music: the topmost screen that names music
    let music: string | undefined;
    for (const sc of this.screens.screens()) if (sc.music) music = sc.music;
    this.audio.music('screen', music);
  }

  screenOp(op: 'show' | 'hide', screen: string, replace: boolean) {
    if (op === 'hide') return this.screens.hide(screen);
    const ok = replace ? this.screens.replace(screen) : this.screens.push(screen);
    if (!ok) this.emit('info', `Screen ${screen} does not exist`);
  }

  /** the HUD (the project's own HUD screen, else the built-in) */
  private hud(): Screen | undefined {
    return screenOfKind(this.snapshot, 'hud');
  }

  startGame() {
    const hud = this.hud();
    this.screens.set(hud ? [hud.id] : []);
  }

  gameOp(op: GameOp) {
    switch (op) {
      case 'start':
        // after Quit to title, Play is a new game; the first Play of a session starts the world as it is
        if (this.quitToTitle) this.newGame();
        this.startGame();
        break;
      case 'continue': {
        // P26: the newest save (autosave or a slot); none yet: a new game
        const save = newestSave(this.saves, this.project.id);
        if (save) this.loadSave(save.slot);
        else {
          if (this.quitToTitle) this.newGame();
          this.startGame();
        }
        break;
      }
      case 'saveMenu':
      case 'loadMenu':
        this.openSaves(op === 'saveMenu' ? 'save' : 'load');
        break;
      // P26 part 2
      case 'settingsMenu':
      case 'achievementsMenu': {
        const id = op === 'settingsMenu' ? SETTINGS_SCREEN : ACHIEVEMENTS_SCREEN;
        if (resolveScreen(this.snapshot, id) && !this.screens.has(id)) this.screens.push(id);
        break;
      }
      case 'finish': {
        if (this.over) break;
        this.progress.finish();
        const pct = this.progress.percent();
        this.emit(
          'screen',
          `Game finished${this.progress.doc.collections.length || this.progress.doc.achievements.length ? ` · ${pct}%` : ''}`,
        );
        if (this.saving.autosave) this.saveGame(AUTO_SLOT, true);
        const t = screenOfKind(this.snapshot, 'title');
        this.screens.set(t ? [t.id] : []);
        this.quitToTitle = true;
        this.say(
          `The end · ${this.progress.record.finished === 1 ? 'finished!' : `finished ${this.progress.record.finished} times`}`,
          4,
        );
        break;
      }
      case 'newGamePlus':
        this.newGamePlus();
        this.startGame();
        break;
      case 'pause': {
        const p = screenOfKind(this.snapshot, 'pause');
        if (p && !this.screens.has(p.id)) this.screens.push(p.id);
        break;
      }
      case 'resume':
        for (const s of this.screens.screens()) if (s.kind === 'pause') this.screens.hide(s.id);
        break;
      case 'retry': {
        this.over = false;
        this.logic.setVar('hp', this.logic.vars.get('maxHp') ?? 3);
        const cp = this.checkpoint;
        if (cp.map !== this.world.mapId && (cp.spawn || cp.pos)) {
          this.travel(cp.map, cp.spawn ?? '');
          this.checkpoint = cp;
        }
        if (cp.pos && cp.map === this.world.mapId) this.placeAt(cp.pos, cp.heading ?? this.heroState.heading);
        else if (cp.map === this.world.mapId) {
          const sp = this.world.doc.spawns.find((x) => x.id === cp.spawn);
          if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
          else this.world.controller.spawn();
        }
        this.emit('screen', 'Retry from the last checkpoint');
        this.startGame();
        break;
      }
      case 'quit': {
        const t = screenOfKind(this.snapshot, 'title');
        this.screens.set(t ? [t.id] : []);
        this.quitToTitle = true;
        break;
      }
    }
  }

  // ---------- saving (P26) ----------

  /** seconds played in this game, counting the loaded save */
  playTime(): number {
    return this.playBase + this.clock;
  }

  /** Save, Load, a Saves-screen slot button, or Set checkpoint (from actions, logic and screens). */
  savingOp(op: 'save' | 'load' | 'slot' | 'checkpoint', slot: number | undefined) {
    if (op === 'save') this.saveGame(slot ?? this.slot);
    else if (op === 'load') {
      const s = slot ?? newestSave(this.saves, this.project.id)?.slot;
      if (s === undefined) this.say('No saved game yet.', 2);
      else this.loadSave(s);
    } else if (op === 'checkpoint') this.setCheckpoint();
    else if (slot !== undefined) {
      if (this.saveMenu === 'load') this.loadSave(slot);
      else this.saveGame(slot);
      this.closeSaves();
    }
  }

  /** Writes the game to a slot (0: the autosave). */
  saveGame(slot: number, quiet = false) {
    if (this.over) return;
    const n = Math.max(0, Math.min(this.saving.slots, slot));
    this.saves.write(captureSave(this as unknown as SaveHost, n));
    if (n !== AUTO_SLOT) this.slot = n;
    if (!quiet) {
      this.emit('info', `Saved to ${slotName(n)}`);
      this.say(n === AUTO_SLOT ? 'Autosaved' : `Game saved · ${slotName(n)}`, 2);
      this.audio.play(SND.pickup);
    }
  }

  /** Loads a slot: the world, the hero and everything carried come back as they were saved. */
  loadSave(slot: number): boolean {
    const save = this.saves.read(this.project.id, slot);
    if (!save) {
      this.say(`${slotName(slot)} is empty.`, 2);
      return false;
    }
    this.putBack(save, slot);
    return true;
  }

  /** puts a save back into this play (a slot, or a test moment); returns the message it showed */
  private putBack(save: SaveGame, slot: number | null): string {
    this.cancelRebuild();
    this.pendingSmash = null;
    this.endTalk();
    this.emitterSystem.reset(this.audio);
    this.inZones.clear();
    const r = applySave(this as unknown as SaveHost, save);
    this.placeAt(save.map === r.map ? save.hero.pos : this.entryPos(), save.hero.heading);
    this.world.controller.state.heading = save.hero.heading;
    this.camYaw = this.heroState.heading + Math.PI;
    // standing on a gate when it was saved must not travel at once
    const sp = this.world.doc.spawns.find(
      (x) => Math.hypot(x.pos[0] - this.heroState.x, x.pos[2] - this.heroState.z) < 2.5,
    );
    this.travelLock = sp ? { spawn: sp.id } : null;
    this.playBase = save.playTime;
    this.clock = 0;
    this.messageUntil = 0;
    if (slot !== null && slot !== AUTO_SLOT) this.slot = slot;
    this.over = false;
    this.quitToTitle = false;
    this.startGame();
    this.zoneAudio();
    this.applyMapAudio();
    const msg =
      slot === null ? loadMessage(0, r).replace('Loaded Autosave', 'Back to the snapshot') : loadMessage(slot, r);
    this.emit('info', msg);
    this.say(msg, 2.5);
    return msg;
  }

  // ---------- test shortcuts (P28) ----------

  /** god mode: nothing hurts the hero and stamina never runs out (testing) */
  god = false;
  /** a moment kept to come back to (testing a puzzle again) */
  moment: SaveGame | null = null;

  /** keeps this moment of the play (everything a save keeps), to come back to with restoreMoment */
  snapshotMoment() {
    this.moment = captureSave(this as unknown as SaveHost, AUTO_SLOT);
    this.emit('cheat', 'Snapshot taken');
    this.say('Snapshot taken', 1.5);
  }

  /** back to the snapshot: the world, the hero and everything carried as they were */
  restoreMoment(): boolean {
    if (!this.moment) return false;
    const keepClock = this.clock + this.playBase;
    this.putBack(this.moment, null);
    this.playBase = keepClock;
    this.emit('cheat', 'Back to the snapshot');
    return true;
  }

  /** A new game from the start: every map as the maker built it, variables at their first values. */
  newGame() {
    this.quitToTitle = false;
    this.worlds.clear();
    this.world = this.loadWorld(this.project.entry.map);
    this.forgetBodies();
    const sp = this.world.doc.spawns.find((s) => s.id === this.project.entry.spawn) ?? this.world.doc.spawns[0];
    if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
    this.checkpoint = { map: this.world.mapId, spawn: sp?.id ?? null };
    this.travelLock = sp ? { spawn: sp.id } : null;
    this.inventory.clear();
    this.health.clear();
    this.cine.seen.clear();
    this.logic.vars.clear();
    const vars = this.snapshot.get(paths.variables) as Variables | undefined;
    for (const [k, v] of Object.entries(vars?.vars ?? {})) this.logic.vars.set(k, v.default);
    this.heroVars();
    this.playBase = 0;
    this.clock = 0;
    this.over = false;
    this.inZones.clear();
    this.zoneAudio();
    this.applyMapAudio();
    this.camYaw = this.heroState.heading + Math.PI;
    this.logic.fire({ type: 'event.onStart' });
  }

  /** P26: a new game that keeps what Project › Progress › New game plus says (items, chosen variables) */
  newGamePlus() {
    const ng = this.progress.doc.newGamePlus;
    const items = ng.keepItems ? new Map(this.inventory) : new Map<string, number>();
    const vars = new Map(ng.keepVars.map((k) => [k, this.logic.vars.get(k)] as const));
    this.newGame();
    for (const [k, v] of items) this.inventory.set(k, v);
    for (const [k, v] of vars) if (v !== undefined) this.logic.vars.set(k, v);
    this.logic.vars.set('newGamePlus', this.progress.record.finished);
    this.emit('info', `New game plus (${this.progress.record.finished})`);
    this.say(`New game + ${this.progress.record.finished > 1 ? this.progress.record.finished : ''}`.trim(), 2.5);
  }

  /** P26: the player's settings that the game applies itself (volumes); the play view reads the camera ones */
  applySettings() {
    const s = this.progress.settings;
    this.audio.playerVolume?.(s.music / 100, s.sounds / 100);
    this.screenFx.reduceMotion = !!s.reduceMotion;
  }

  private entryPos(): [number, number, number] {
    const sp = this.world.doc.spawns[0];
    const s = this.heroState;
    return sp ? (sp.pos as [number, number, number]) : [s.x, s.y, s.z];
  }

  /** Retry and falls come back here: where the hero stands now (a checkpoint, or Set checkpoint in logic). */
  setCheckpoint() {
    const s = this.heroState;
    this.checkpoint = { map: this.world.mapId, spawn: null, pos: [s.x, s.y, s.z], heading: s.heading };
    this.emit('info', 'Checkpoint');
  }

  /** P26: touching a checkpoint asset: it is the new checkpoint (its flag goes up) and the game autosaves */
  stepCheckpoints() {
    if (this.cine.active || this.over) return;
    const s = this.heroState;
    for (const i of this.world.instances) {
      if (!i.def.checkpoint) continue;
      const c = this.instanceCenter(i);
      if (!c || Math.hypot(c[0] - s.x, c[2] - s.z) > 2.6 || Math.abs(c[1] - s.y) > 4) continue;
      const cp = this.checkpoint;
      const here = cp.pos && cp.map === this.world.mapId && Math.hypot(cp.pos[0] - c[0], cp.pos[2] - c[2]) < 3;
      if (here) continue;
      this.checkpoint = { map: this.world.mapId, spawn: null, pos: [s.x, s.y, s.z], heading: s.heading };
      // its last state means “touched” (a flag up); every other checkpoint here goes back to its first state
      for (const o of this.world.instances)
        if (o.def.checkpoint && o !== i && o.state !== o.def.initialState)
          this.setInstanceState(o.inst.id, o.def.initialState);
      const up = i.def.states[i.def.states.length - 1]!;
      if (i.state !== up) this.setInstanceState(i.inst.id, up);
      this.emit('info', `Checkpoint: ${i.inst.name ?? i.def.name}`);
      this.logic.fire({
        type: 'event.onCustom',
        match: { event: 'checkpoint' },
      });
      if (this.saving.autosave) this.saveGame(AUTO_SLOT, true);
      this.say(this.saving.autosave ? 'Checkpoint · saved' : 'Checkpoint', 2);
      this.audio.play(SND.pickup);
      return;
    }
  }

  /** the Saves screen (P26): slot buttons that save or load */
  private openSaves(mode: 'save' | 'load') {
    if (mode === 'save' && this.saving.mode !== 'anywhere') {
      this.say(this.saving.mode === 'savePoints' ? 'Save at a save point.' : 'This game saves at checkpoints.', 2);
      return;
    }
    this.saveMenu = mode;
    const s = resolveScreen(this.snapshot, SAVES_SCREEN);
    if (s && !this.screens.has(s.id)) this.screens.push(s.id);
  }

  private closeSaves() {
    this.saveMenu = null;
    if (this.screens.has(SAVES_SCREEN)) this.screens.hide(SAVES_SCREEN);
  }

  /** {save.…} values for screens: whether a save exists, what each slot holds */
  private saveValue(name: string): unknown {
    const game = this.project.id;
    if (name === 'save.any') return !!newestSave(this.saves, game);
    if (name === 'save.canSave') return this.saving.mode === 'anywhere';
    if (name === 'save.menuTitle') return this.saveMenu === 'load' ? 'Load game' : 'Save game';
    if (name === 'save.slot') return slotName(this.slot);
    const m = /^save\.slot([1-3])(\.shown)?$/.exec(name);
    if (!m) return undefined;
    const n = Number(m[1]);
    if (m[2]) return n <= this.saving.slots;
    return slotLine(n, this.saves.read(game, n));
  }

  /** a screen button was pressed: logic's On screen button (screen + button id) */
  screenButton(screen: string, button: string) {
    this.logic.fire({ type: 'event.onScreenButton', match: { screen, button }, payload: { screen, button } });
  }

  /** Esc / Android back / gamepad B: the top screen's onBack, else pause ⇄ resume. */
  back() {
    if (this.cine.active) {
      this.cine.skip();
      return;
    }
    // P22: Esc ends a conversation
    if (this.talks.active) return this.endTalk();
    const top = this.screens.top();
    if (!top) return this.gameOp('pause');
    if (top.onBack?.length) return this.uiActions.run(top.onBack, this.uiClock);
    if (top.kind === 'pause') this.gameOp('resume');
    else if (top.kind === 'hud') this.gameOp('pause');
    else if (top.kind === 'dialogue') this.endTalk();
    else if (top.kind === 'custom') this.screens.hide(top.id);
  }

  /** values for {bindings} in screens and world UI */
  lookup = (name: string): unknown => {
    switch (name) {
      case 'hero.gear':
        return `${String(this.hero.held ?? 'hands')}${hasShield(this.hero) ? ' + Shield' : ''}`;
      case 'hero.name':
        return String(this.hero.name ?? 'Hero');
      case 'map.name':
        return this.world.doc.name;
      case 'game.name':
        return this.project.name;
      case 'prompt':
        if (this.talking || this.talks.active) return '';
        if (this.prompt) return `E · ${this.prompt.label}`;
        if (this.signPrompt) return 'E · Read';
        // P9c: standing where a smashed thing can be rebuilt
        return this.nearestBroken() ? 'Hold E · Rebuild' : '';
      case 'message':
        return this.clock < this.messageUntil ? this.message : '';
      case 'dialogue.speaker':
        return this.talks.view?.speakerName ?? this.dialogue?.speaker ?? '';
      case 'dialogue.text':
        return this.talks.view?.text ?? this.dialogue?.text ?? '';
      case 'inventory':
        return this.inventory;
      case 'time':
        return Math.floor(this.clock);
    }
    if (name.startsWith('inventory.')) return this.inventory.get(name.slice(10)) ?? 0;
    if (name.startsWith('save.')) return this.saveValue(name);
    if (/^(progress|achievements|collections|collection|bests|best|settings)\./.test(name))
      return this.progress.value(name);
    return this.logic.vars.get(name);
  };

  /** Stop: silence everything this session started. */
  dispose() {
    // the editor's own sounds go back to full volume
    this.audio.playerVolume?.(1, 1);
    this.emitterSystem.reset(this.audio);
    this.audio.stopAll();
  }

  /** An asset by id or by name (the project's own first, then the built-in library). */
  findAsset(ref: string): Asset | null {
    const r = ref.trim();
    const byId = (this.snapshot.get(paths.asset(r)) as Asset | undefined) ?? BUILTIN_ASSETS.find((a) => a.id === r);
    if (byId) return byId;
    const low = r.toLowerCase();
    for (const p of this.snapshot.keys())
      if (p.startsWith('assets/')) {
        const a = this.snapshot.get(p) as Asset | undefined;
        if (a?.name.toLowerCase() === low) return a;
      }
    return BUILTIN_ASSETS.find((a) => a.name.toLowerCase() === low) ?? null;
  }

  /**
   * P32: a placed asset by instance id, or by its asset's name or id — then the copy nearest the hero
   * (so logic can say “Treasure chest” instead of an id).
   */
  resolveEntity(ref: string | null | undefined): PlayInstance | null {
    if (!ref) return null;
    const w = this.world;
    const exact = w.instances.find((i) => i.inst.id === ref);
    if (exact) return exact;
    const low = ref.trim().toLowerCase();
    // P9c: a copy's own name (“Gate switch”)
    const named = w.instances.find((i) => i.inst.name?.toLowerCase() === low);
    if (named) return named;
    const h = this.heroState;
    let best: PlayInstance | null = null;
    let bd = Infinity;
    for (const i of w.instances) {
      if (i.def.id !== ref && i.def.name.toLowerCase() !== low) continue;
      const d = Math.hypot(i.inst.pos[0] - h.x, i.inst.pos[2] - h.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * P32 world.spawnNear: a copy of an asset (by name or id) at a placed object's item spot — its first
   * “spawn” socket, or the middle of its top — turned like it, for this play only. An item made only of
   * moving parts (a sword rising out of a chest) floats: it is drawn, and skips the brick rules.
   */
  spawnNear(item: string, near: string): string | null {
    const def = this.findAsset(item);
    const host = this.resolveEntity(near);
    if (!def || !host) {
      this.emit('info', `Spawn ${item}: ${def ? `nothing called “${near}” here` : 'no asset with that name'}.`);
      return null;
    }
    const spot =
      host.sockets.find((s) => s.kind === 'spawn')?.world ??
      (() => {
        const xs = host.bricks.map((b) => b.x);
        const zs = host.bricks.map((b) => b.z);
        const top = Math.max(...host.bricks.map((b) => b.y)) + 3;
        return [(Math.min(...xs) + Math.max(...xs) + 1) / 2, top * 0.4, (Math.min(...zs) + Math.max(...zs) + 1) / 2];
      })();
    const rot = host.inst.rot;
    const [fw, fd] = rot % 2 ? [def.footprint[1], def.footprint[0]] : [def.footprint[0], def.footprint[1]];
    return this.placeCopy(
      def,
      [Math.round(spot[0]! - fw / 2), Math.round(spot[1]! / 0.4), Math.round(spot[2]! - fd / 2)],
      rot,
    );
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
    return this.placeCopy(
      def,
      [
        Math.round(sp.pos[0] - def.footprint[0] / 2),
        Math.round(sp.pos[1] / 0.4),
        Math.round(sp.pos[2] - def.footprint[1] / 2),
      ],
      0,
    );
  }

  /** Adds a copy of an asset to this play's world (refused if its bricks would not fit). */
  placeCopy(
    def: Asset,
    pos: [number, number, number],
    rot: number,
    as?: { id: string; idBase: number },
  ): string | null {
    const w = this.world;
    const idBase =
      as?.idBase ??
      Math.max(
        maxOf(w.pieces, (p) => p.id ?? 0, 0),
        maxOf(w.broken, (b) => maxOf(b.originals, (p) => p.id ?? 0, 0), 0),
      ) + 1;
    // P26: a copy put back by a save keeps its id; new ones count on from the highest
    if (as) this.spawnSerial = Math.max(this.spawnSerial, Number(as.id.slice(8)) || 0);
    if (as && w.instances.some((i) => i.inst.id === as.id)) return null;
    const inst = {
      id: (as?.id ?? `ins_play${String(++this.spawnSerial).padStart(6, '0')}`) as AssetInstanceId,
      kind: 'asset' as const,
      asset: def.id,
      pos,
      rot,
      idBase,
    };
    const exp = expandAsset(def, inst);
    const added = exp.bricks.map((b) => brickToPiece(b, true));
    const pieces = [...w.pieces, ...added];
    // a floating item (every brick in a moving part) is drawn only: it does not have to fit
    const check = floating(def) ? { ok: true as const, reason: '' } : this.layoutCheck(w, pieces, added);
    if (!check.ok) {
      this.emit('info', `Spawn ${def.name}: ${check.reason}`);
      return null;
    }
    w.pieces = pieces;
    for (const b of exp.bricks) w.dirtyChunks.add(chunkKeyOf(brickToPiece(b)));
    w.instances.push({ inst, def, ...exp, state: def.initialState });
    w.rev++;
    this.syncPhysics(w);
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
    const check = this.layoutCheck(
      w,
      pieces,
      w.pieces.filter((p) => p.id! >= lo && p.id! < hi),
    );
    if (!check.ok) {
      this.emit('info', `Remove ${inst.def.name}: ${check.reason}`);
      return;
    }
    for (const p of w.pieces) if (p.id! >= lo && p.id! < hi) w.dirtyChunks.add(chunkKeyOf(p));
    w.pieces = pieces;
    w.instances = w.instances.filter((i) => i !== inst);
    w.rev++;
    this.syncPhysics(w);
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
      this.heroStates.stop();
      return;
    }
    const s = this.heroState;
    if (!s.grounded || s.building || this.talking) return;
    this.heroStates.play(clip);
    this.emit('info', `Emote: ${clip.name ?? clip.id}`);
  }

  /**
   * P23 part 4: the hero's animation state machine picks idle, walk, run, jump, attack or hurt from what the hero
   * does and plays the sheet's clip for it (none: v68's own motion). An emote plays while the hero stands.
   */
  stepAnim(dt: number) {
    const s = this.heroState;
    const sm = this.heroStates;
    if (s.building) {
      sm.stop();
      this.heroAnim.step(dt);
      return;
    }
    const v = this.inputVector();
    const going = !!(v.x || v.z) && !this.talks.active;
    const attacking = (s.attack as number) > 0;
    const events = sm.step(
      {
        speed: going ? Math.max(MOVING_AT + 0.01, Number(s.speed) || 0) : 0,
        grounded: s.grounded && !v.jump,
        attacking,
        hurtAgo: this.clock - this.heroHurtAt,
      },
      this.heroChr?.states,
      (st) => (this.bodyOf('hero') ? undefined : this.sheetClip(this.heroChr, st)),
      dt,
      1.5,
    );
    this.statesSeen.add(sm.state);
    for (const e of events) {
      if ('emit' in e) this.emit('event', `Event “${e.emit}” · ${this.heroAnim.clip?.name ?? 'clip'}`);
      else if ('sound' in e) this.audio.play(e.sound, { pos: [s.x, s.y + 1, s.z] });
      else this.cine.play(e.cinematic);
    }
  }

  /** the clip a character sheet sets for a state (a project clip or a built-in one) */
  private sheetClip(chr: Character | null | undefined, st: AnimState): Clip | undefined {
    const id = chr?.animations?.[st];
    if (!id) return undefined;
    return (this.snapshot.get(paths.clip(id)) as Clip | undefined) ?? BUILTIN_CLIPS.find((c) => c.id === id);
  }

  /** P23 part 4: the neighbours' state machines (a character with clips plays them; a body plan shows the state) */
  stepNpcStates(dt: number) {
    const seen = new Set<number>();
    for (const n of this.world.npcs) {
      const chr = npcCharacter(this.snapshot, this.world.mapId, n);
      if (!chr) continue;
      seen.add(n.id);
      const st = n.state;
      let rec = this.npcStates.get(n.id);
      if (!rec) {
        rec = { sm: new StateMachine(), x: st.x, z: st.z, speed: 0, hurtAt: -Infinity };
        this.npcStates.set(n.id, rec);
      }
      const d = Math.hypot(st.x - rec.x, st.z - rec.z);
      // a jump across the map (a respawn, a knock back) is not walking
      const now = dt > 0 && d < 2 ? d / dt : 0;
      rec.speed += (now - rec.speed) * Math.min(1, dt * 10);
      rec.x = st.x;
      rec.z = st.z;
      const body = !!this.bodyOf(n);
      rec.sm.step(
        {
          speed: rec.speed,
          grounded: (st as { grounded?: boolean }).grounded !== false,
          attacking: Number((st as { attack?: number }).attack ?? 0) > 0,
          hurtAgo: this.clock - rec.hurtAt,
        },
        chr.states,
        (s) => (body ? undefined : this.sheetClip(chr, s)),
        dt,
      );
    }
    for (const id of this.npcStates.keys()) if (!seen.has(id)) this.npcStates.delete(id);
  }

  /** P23 part 4: the state a character is in now (the hero, or a neighbour with a character) */
  animStateOf(who: Npc | 'hero'): AnimState | null {
    if (who === 'hero') return this.heroStates.state;
    return this.npcStates.get(who.id)?.sm.state ?? null;
  }

  /** P23 part 4: how far into its state a character is (seconds) */
  animSinceOf(who: Npc | 'hero'): number {
    if (who === 'hero') return this.heroStates.since;
    return this.npcStates.get(who.id)?.sm.since ?? 0;
  }

  /** P23 part 4: a neighbour's pose from its state's clip (null: its own motion) */
  npcPose(n: Npc): { params: ReturnType<Animator['params']>; clip: Clip | null } | null {
    const a = this.npcStates.get(n.id)?.sm.anim;
    const params = a?.params();
    return a && params ? { params, clip: a.clip } : null;
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
    // P22: a sign that tells something (a conversation) can be read with E
    let sign: UiInstance | null = null;
    let sd = 3;
    for (const it of this.world.worldUi) {
      if (!it.conversation) continue;
      const d = Math.hypot(it.pos[0] - s.x, it.pos[2] - s.z);
      if (d < sd) {
        sd = d;
        sign = it;
      }
    }
    this.signPrompt = sign;
    this.actions.step(this.clock);
  }

  /** P22: a neighbour close to the hero says one of its barks (its character's short lines) */
  stepBarks() {
    if (this.talking || this.talks.active || this.cine.active || this.over) return;
    const h = this.heroState;
    for (const n of this.world.npcs) {
      if (Math.hypot(n.state.x - h.x, n.state.z - h.z) > 4) continue;
      const chr = npcCharacter(this.snapshot, this.world.mapId, n);
      const line = chr ? this.talks.bark(chr, this.clock) : null;
      if (line) {
        this.say(line, 2.5);
        this.emit('talk', line);
        return;
      }
    }
  }

  /** E pressed: use the prompted interaction. Returns false when there is nothing to use. */
  interact(): boolean {
    if (this.cine.active) return false;
    if (this.talks.active) {
      this.dialogueNext();
      return true;
    }
    const sign = this.signPrompt;
    if (!this.prompt && sign?.conversation && !this.talking)
      return this.startConversation(sign.conversation, null, 'sign');
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
      self: p.instance.inst.id,
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
    const pieces = [
      ...w.pieces.filter((p) => p.id! < lo || p.id! >= hi),
      ...next.bricks.map((b) => brickToPiece(b, true)),
    ];
    const check = floating(inst.def)
      ? { ok: true as const, reason: '' }
      : this.layoutCheck(w, pieces, [
          ...w.pieces.filter((p) => p.id! >= lo && p.id! < hi),
          ...next.bricks.map((b) => brickToPiece(b)),
        ]);
    if (!check.ok) {
      this.say(`Something is in the way: ${check.reason}`, 2);
      return;
    }
    for (const p of w.pieces) if (p.id! >= lo && p.id! < hi) w.dirtyChunks.add(chunkKeyOf(p));
    for (const b of next.bricks) w.dirtyChunks.add(chunkKeyOf(brickToPiece(b)));
    w.pieces = pieces.sort((a, b) => a.id! - b.id!);
    inst.anim = { from: inst.state, since: this.clock };
    inst.state = state;
    inst.bricks = next.bricks;
    w.rev++;
    this.syncPhysics(w);
    this.emit('info', `${inst.def.name} is now ${state}`);
  }

  /** world time scale outside the cast (cinematic slow motion) */
  get slowmo(): number {
    return this.cine.frame?.post.slowmo ?? 1;
  }

  stepNpcs(dt: number) {
    const w = this.world;
    if (!w.npcs.length) return;
    const awake = w.big ? w.npcs.filter((n) => this.awake(w, n)) : w.npcs;
    const acting = this.cine.active ? awake.filter((n) => !this.cine.isCast(n)) : awake;
    // P9c: enemies in a fight move themselves; P9b: stunned neighbours stand still for a moment
    this.enemies.step(acting, dt * this.slowmo);
    const free = acting.filter((n) => !this.combat.isStunned(n) && !this.enemies.engaged(n) && !this.standsStill(n));
    this.L.NPCWorld.step(free, dt * this.slowmo, this.heroState, this.talking?.id ?? null);
    // a talk ends when the hero walks away (further, when they are locked on to the one they talk to)
    const reach = this.talking && this.combat.lockedNpc() === this.talking ? LOCK_RELEASE : 4.5;
    if (
      this.talking &&
      Math.hypot(this.talking.state.x - this.heroState.x, this.talking.state.z - this.heroState.z) > reach
    )
      this.endTalk();
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
    if (this.cine.active) return;
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
    if (hit) this.travel(hit.toMap, hit.toSpawn, hit.gate);
  }

  /** Switch to another map (each map keeps its own damage while playing, as in v68). */
  travel(mapId: string, spawnId: string, gateId?: string) {
    const from = this.world;
    const keep = { ...this.heroState };
    this.cancelRebuild();
    this.pendingSmash = null;
    this.endTalk();
    this.emitterSystem.reset(this.audio);
    this.inZones.clear();
    this.zoneAudio();
    this.world = this.loadWorld(mapId);
    this.forgetBodies();
    const sp = this.world.doc.spawns.find((x) => x.id === spawnId) ?? this.world.doc.spawns[0];
    Object.assign(this.world.controller.state, { ...keep, vy: 0 });
    if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
    this.travelLock = sp ? { spawn: sp.id } : null;
    this.checkpoint = { map: mapId, spawn: sp?.id ?? null };
    this.camYaw = this.heroState.heading + Math.PI;
    this.audio.play(SND.gate);
    this.applyMapAudio();
    this.emit('travel', `${from.doc.name} → ${this.world.doc.name}${sp ? ` (${sp.name})` : ''}`);
    this.say(`Welcome to ${this.world.doc.name}`, 2);
    // P6.4: a gate's on-arrive actions (e.g. play a cinematic when entering the castle)
    const gate = gateId
      ? (this.snapshot.get(paths.gates) as Gates | undefined)?.gates.find((g) => g.id === gateId)
      : undefined;
    if (gate?.onArrive?.length) this.actions.run(gate.onArrive, this.clock);
    // P26: a new map is a good place to autosave (not while a cinematic travels)
    if (this.saving.autosave && !this.cine.active) this.saveGame(AUTO_SLOT, true);
  }

  /** P26 (saves): the brick rules for a changed list of pieces */
  piecesOk(pieces: LegacyPiece[]): boolean {
    return inspectPieces(this.solid(pieces)).ok;
  }

  /**
   * The bricks the brick rules look at: all but floating items (a sword risen out of a chest is drawn
   * only). Without this, one floating item would make every later change fail the rules.
   */
  private solid(pieces: LegacyPiece[]): LegacyPiece[] {
    const ranges = this.world.instances
      .filter((i) => floating(i.def))
      .map((i) => [i.inst.idBase, i.inst.idBase + i.def.bricks.length] as const);
    if (!ranges.length) return pieces;
    return pieces.filter((p) => !ranges.some(([lo, hi]) => p.id! >= lo && p.id! < hi));
  }

  /** P26 (saves): after pieces changed, collision and neighbours see the new bricks */
  piecesChanged(w: MapWorld) {
    w.rev++;
    this.syncPhysics(w);
  }

  /**
   * After a map's pieces changed: v68's physics and the neighbours see the new bricks. P27 part 3: on a big map
   * only the window around the hero (the chunk index is rebuilt first).
   */
  syncPhysics(w: MapWorld) {
    if (!w.big) {
      w.controller.replace(w.pieces, w.meta);
      this.L.NPCWorld.sync(w.npcs, w.pieces, w.meta);
      return;
    }
    w.byChunk = indexByChunk(w.pieces);
    this.moveWindow(w, true);
  }

  private ids: { pieces: LegacyPiece[]; map: Map<number, LegacyPiece> } | null = null;
  /** a piece by its id (an index rebuilt when the map's pieces change, not a search per call) */
  pieceById(w: MapWorld, id: number): LegacyPiece | undefined {
    if (!this.ids || this.ids.pieces !== w.pieces) {
      const map = new Map<number, LegacyPiece>();
      for (const p of w.pieces) if (p.id !== undefined) map.set(p.id, p);
      this.ids = { pieces: w.pieces, map };
    }
    return this.ids.map.get(id);
  }

  /** P27 part 3: re-centres a big map's window when the hero reaches another chunk */
  moveWindow(w: MapWorld, force = false) {
    if (!w.big || !w.byChunk) return;
    const st = w.controller.state;
    const key = `${Math.floor(st.x / 32)}_${Math.floor(st.z / 32)}`;
    if (!force && key === w.windowAt) return;
    w.windowAt = key;
    const near = piecesAround(w.byChunk, key);
    w.controller.replace(near, w.meta);
    w.controller.area = w.fullArea;
    this.L.NPCWorld.sync(w.npcs, near, w.meta);
    for (const n of w.npcs) n.controller.area = w.fullArea;
  }

  /** P27 part 3: is a neighbour inside the window (outside it, it sleeps) */
  awake(w: MapWorld, n: Npc): boolean {
    if (!w.big || !w.windowAt) return true;
    const [cx, cz] = w.windowAt.split('_').map(Number) as [number, number];
    return (
      Math.abs(Math.floor(n.state.x / 32) - cx) < WINDOW_RADIUS &&
      Math.abs(Math.floor(n.state.z / 32) - cz) < WINDOW_RADIUS
    );
  }

  /**
   * The brick rules for a changed list of pieces. P27 part 3: on a big map only the chunks around `around` (the
   * pieces that came or went) are checked; pieces in the ring around them count as connected.
   */
  layoutCheck(
    w: MapWorld,
    next: LegacyPiece[],
    around: readonly LegacyPiece[],
  ): { ok: boolean; reason?: string; connected?: Set<number>; list: LegacyPiece[] } {
    if (!w.big) {
      const list = this.solid(next);
      return { ...inspectPieces(list), list };
    }
    const keys = new Set(around.map(chunkKeyOf));
    if (!keys.size) return { ok: true, list: [] };
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let z0 = Number.POSITIVE_INFINITY;
    let z1 = Number.NEGATIVE_INFINITY;
    for (const k of keys) {
      const [cx, cz] = k.split('_').map(Number) as [number, number];
      x0 = Math.min(x0, cx - 1);
      x1 = Math.max(x1, cx + 1);
      z0 = Math.min(z0, cz - 1);
      z1 = Math.max(z1, cz + 1);
    }
    const local: LegacyPiece[] = [];
    for (const p of next) {
      const cx = Math.floor(p.x / 32);
      const cz = Math.floor(p.z / 32);
      if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) local.push(p);
    }
    const list = this.solid(local);
    return { ...inspectPieces(list, (p) => !keys.has(chunkKeyOf(p))), list };
  }

  chunkOf(p: LegacyPiece): string {
    return chunkKeyOf(p);
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
      const back = w.broken.flatMap((e) => e.originals.map((p) => ({ ...p })));
      const restored = [...w.pieces, ...back];
      if (this.layoutCheck(w, restored, back).ok) {
        for (const e of w.broken) for (const p of e.originals) w.dirtyChunks.add(chunkKeyOf(p));
        w.pieces = restored;
        w.broken = [];
        w.debris = [];
        this.syncPhysics(w);
      }
    }
    if (kind === 'held' && arg)
      this.hero = { ...this.L.CharacterCatalog.validate({ ...this.hero, held: arg }), offHand: this.hero.offHand };
    this.emit('cheat', `Cheat: ${kind}${arg ? ` ${arg}` : ''}`);
  }
}

/** a filled brick cell (x, z in studs; y in plates) as one number */
function cellKey(x: number, y: number, z: number) {
  return ((x + 1024) * 2048 + (z + 1024)) * 1024 + (y + 64);
}
