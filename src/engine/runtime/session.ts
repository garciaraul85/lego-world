import { BUILTIN_ASSETS } from '../../builtin/assets';
import { SND } from '../../builtin/audio';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_CLIPS } from '../../builtin/clips';
import { MOVE_FOR } from '../../builtin/clips/moves';
import { BUILTIN_EFFECTS, DEFAULT_EFFECT_EVENTS, DEFAULT_HITS } from '../../builtin/effects';
import { genreById } from '../../builtin/genres';
import { BUILTIN_SCREEN_EFFECTS, DEFAULT_SCREEN_EVENTS } from '../../builtin/screen-effects';
import { SCR } from '../../builtin/screens';
import { type Cleanup, cleanupOf, DEBRIS_FADE, MAX_BROKEN, RUBBLE_BRICKS } from '../../core/assets/cleanup';
import { expandAsset } from '../../core/assets/expand';
import { freeGroups } from '../../core/assets/free';
import { type ExpandedInstance, expandInstances, instanceBricks } from '../../core/assets/instances';
import { customIdOf } from '../../core/bricks/custom';
import { footprint } from '../../core/bricks/inspect';
import { brickHeight } from '../../core/bricks/map-bricks';
import {
  brickToPiece,
  chunkCustomShapes,
  chunkExactColors,
  chunkPieces,
  type FileSource,
  mapToLegacyBuild,
} from '../../core/bridge/legacy-bridge';
import { moodFace } from '../../core/character/faces';
import { lookForV68 } from '../../core/character/hair';
import { BODY_MOVES, type BodyMove, movesOf as bodyMovesOf, MOVE_LENGTH } from '../../core/character/moves';
import { minifigExtras, type ResolvedBody, resolveBody } from '../../core/character/resolve';
import { levelOf, xpFor } from '../../core/character/sheet';
import { type AnimState, MOVING_AT } from '../../core/character/states';
import {
  type AttackHit,
  type DamageType,
  damageOf,
  type Health,
  heldAttack,
  hitSide,
  stunsIt,
} from '../../core/combat/damage';
import type { Enemy } from '../../core/combat/enemy';
import {
  ACTION_PRIORITY,
  type ActionOffer,
  type Bindable,
  BUTTON_NAME,
  BUTTONS,
  buttonsOf,
  type Controls,
  ITEM_BUTTONS,
  keyName,
  MOVES,
} from '../../core/controls/controls';
import type { Effect, EffectEvent } from '../../core/effects/schema';
import { Mood, NO_MOOD, type ScreenEffect, type ScreenEvent } from '../../core/effects/screen';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { LegacyPiece } from '../../core/legacy/types';
import { FOG_PRESET, type Fog, type FogPreset } from '../../core/lighting/atmosphere';
import type { ExecCtx } from '../../core/logic/catalog';
import { maxOf } from '../../core/num';
import {
  AutoQuality,
  type DeviceInfo,
  lowerQuality,
  QUALITY,
  type QualityChoice,
  type QualityLevel,
  resolveQuality,
} from '../../core/render/quality';
import type { MapSave } from '../../core/save/save';
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
  type Chunk,
  type Clip,
  type EffectInstance,
  type EmitterInstance,
  type Gates,
  type Instances,
  type LightInstance,
  type LogicGraph,
  type MapDoc,
  type MapState,
  type ModelInstance,
  type Project,
  paths,
  type Screen,
  TIMES,
  type UiInstance,
  type Variables,
  type WaterInstance,
} from '../../core/schema';
import {
  type Breath,
  breathe,
  DROWN_EVERY,
  floatY,
  headUnder,
  SWIM_DEFAULTS,
  type Swimming,
  swimStep,
  type WaterBox,
  type WaterMode,
  waterAt,
  waterMode,
} from '../../core/water/swim';
import type { AudioPort, Vec3 } from '../audio/port';
import { RecordingAudio } from '../audio/port';
import { Animator } from '../character/animator';
import { bodyBounds } from '../character/body-anim';
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
  type MoveInput,
  type Npc,
} from '../legacy/runtime-modules';
import { type Atmosphere, atmosphere } from '../lighting/atmosphere';
import { findLight, gatherLights, type LightSource, pointLights } from '../lighting/lights';
import { LogicRuntime } from '../logic/interpreter';
import { type MediaSource, modelMatrix, prepareModel, readyModel } from '../model/prepare';
import { HERO_HEIGHT, HERO_RADIUS, walkHero } from '../physics/hero';
import { PhysicsWorld, physicsReady } from '../physics/physics';
import { type ModelUpload, placedTriangles } from '../render/model-draw';
import { portrait } from '../render/portraits';
import type { PointLight } from '../render/renderer';
import { CinematicSystem } from '../systems/cinematic';
import { EmitterSystem } from '../systems/emitters';
import { formatValue, interpolate } from '../ui/bindings';
import { ScreenStack } from '../ui/ScreenStack';
import { resolveScreen, screenOfKind } from '../ui/screens';
import { ActionRunner, type GameOp } from './actions';
import { type ButtonHost, GameButtons } from './buttons';
import { ATTACKS, type AttackKind, Combat, hasShield, LOCK_RELEASE, type LockTarget, MAX_STAMINA } from './combat';
import { Enemies } from './enemies';
import { asDamageType, assetHealth, HealthBook, hurtBy, npcCharacter, npcItem, spawnedNpcs } from './health';
import { ObjectIndex } from './objects';
import { chunkKeyOf, indexByChunk, inspectPieces, localArea, piecesAround, WINDOW_RADIUS } from './pieces';
import { isSettingKey, PlayerProgress, type ProgressHost } from './progress';
import { boxOf, Puzzles, SEEN_CELL } from './puzzles';
import { Runtime, type System } from './runtime';
import { applySave, captureMap, captureSave, loadMessage, restoreMap, type SaveHost, type SaveWorld } from './saves';
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

/**
 * One smash: the bricks it took, how far a rebuild has got, and (P27 part 3d) what becomes of it — rebuilt,
 * gone, back after `after` seconds (0: when the player comes back) or rubble — and when it broke (session clock).
 */
export type BrokenEntry = {
  id: number;
  originals: LegacyPiece[];
  progress: number;
  mode?: Cleanup;
  at?: number;
  after?: number;
};

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
  /** P27 part 3d: the neighbours have not seen the latest small changes yet (synced twice a second) */
  npcsStale?: boolean;
  /** big maps: the chunk the window is centred on */
  windowAt: string | null;
  /** big maps: the whole map's walkable area (the window's own would fence the hero in) */
  fullArea: unknown;
  /** P27 part 3d: bricks of broken things gone for good that are no longer remembered as breaks (ids) */
  goneIds: number[];
  /** Milestone 2b: the placed objects' indexes (by id, name, brick and place) */
  objects: ObjectIndex<PlayInstance>;
  /** Milestone 2b: the physics core for this map (null until the engine has loaded: v68's debris then) */
  physics: PhysicsWorld | null;
  /** Milestone 2b: bodies of water */
  water: WaterInstance[];
  /** Milestone 2b, 10c part 5: the 3D models placed on the map */
  models: ModelInstance[];
  /** Milestone 2b: loose objects (assets marked loose): their copy, and the middle of their bricks as placed */
  looseObjects: { inst: PlayInstance; origin: [number, number, number]; pieces: LegacyPiece[] }[];
  /** Milestone 2b: the bricks of loose objects, by id (not among the map's solid pieces) */
  loosePieces: Map<number, LegacyPiece>;
  /** P27 part 3d: neighbours beaten that come back (after seconds; 0: when the player comes back) */
  defeated: { npc: Npc; at: number; after: number }[];
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
const LEGACY_HEX = new Set(LEGACY_COLORS.map(([, hex]) => hex.toLowerCase()));
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
  /** Milestone 2b, 10c part 5: where imported model files come from (the editor's media) */
  mediaSource: MediaSource | null = null;
  /** P27 part 3c: maps left in this play that are no longer loaded: what changed on them (as a save keeps it) */
  readonly parked = new Map<string, MapSave>();
  /** loaded maps, least recently used first */
  private readonly lru = new Set<string>();
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
  /** step 11, 4a: the size of each body (see figureOf) */
  private figures = new WeakMap<ResolvedBody, { bottom: number; top: number; radius: number }>();
  /** step 11, 4a: minifigs' extra parts, by NPC id */
  private extraParts = new Map<number | 'hero', ReturnType<typeof minifigExtras>>();
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
  /**
   * step 11b part 1: the game's buttons — what the Action button does here and now, and the item in each item
   * button (Play turns keys, gamepad buttons and touches into presses through the game's bindings)
   */
  readonly buttons: GameButtons;
  /** step 11b: more things the Action button can offer (swimming, puzzles and items add theirs) */
  readonly actionOffers: (() => ActionOffer[])[] = [];
  /** step 11b part 2: swimming now (in deep water), diving or rising (the Action button held), and breath */
  swim = { on: false, down: false, up: false, under: false };
  breath: Breath = { air: 20, drownIn: DROWN_EVERY };
  private waterCache: { map: string; list: WaterBox[]; of: unknown } | null = null;
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
  private smashedCache: { world: MapWorld; rev: number; key: string; ids: Set<string> } | null = null;
  /** P9c: neighbours that fight the hero */
  readonly enemies: Enemies = new Enemies(this);
  /** P9b: attacks, guarding, moves and lock-on */
  readonly combat: Combat = new Combat(this);
  /** step 12a: push blocks, switches, locks, pickups and each dungeon's keys, map and compass */
  readonly puzzles: Puzzles<PlayInstance> = this.makePuzzles();
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
      /** P27 part 4: play at this quality whatever the settings say (the editor's preview) */
      quality?: QualityLevel;
      /** P27 part 4: the device, for Auto quality (none: a mid-range one) */
      device?: DeviceInfo;
      /** Milestone 2b, 10c part 5: where imported model files come from */
      media?: MediaSource;
    } = {},
  ) {
    this.L = legacyRuntime();
    this.mediaSource = opts.media ?? null;
    this.saves = opts.saves ?? new MemorySaveStore();
    this.audio = opts.audio ?? new RecordingAudio();
    this.buttons = new GameButtons(
      (snapshot.get(paths.settings) as { controls?: Controls } | undefined)?.controls,
      this.buttonHost(),
    );
    const self = this;
    const host = {
      setState: (state: string, target: string | undefined, me: string | undefined) =>
        this.setInstanceState(target ? (this.resolveEntity(target)?.inst.id ?? target) : me, state),
      teleport: (spawn: string) => {
        const sp = this.world.doc.spawns.find((x) => x.id === spawn);
        if (sp) this.placeAt(sp.pos as [number, number, number], sp.yaw);
      },
      travel: (map: string, spawn: string) => this.goTo(map, spawn),
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
    // step 11, 4c: characters spawned in an earlier play are gone
    spawnedNpcs.clear();
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
      travel: (map) => this.goTo(map, ''),
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
    this.qualityPreview = opts.quality ?? null;
    this.device = opts.device ?? {};
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

  /** a map, loaded now (all at once) if it is not loaded yet */
  loadWorld(mapId: string): MapWorld {
    const steps = this.loadSteps(mapId);
    let r = steps.next();
    while (!r.done) r = steps.next();
    return r.value;
  }

  /**
   * P27 part 3c: loads a map in small steps (yielding how far along it is, 0–1), so the game can draw a
   * loading screen instead of freezing: the chunks a few at a time, then the copies, the physics and the
   * neighbours. A map left earlier in this play comes back as the player left it (see park).
   */
  *loadSteps(mapId: string): Generator<number, MapWorld> {
    const cached = this.worlds.get(mapId);
    if (cached) {
      this.lru.delete(mapId);
      this.lru.add(mapId);
      return cached;
    }
    const doc = this.snapshot.get(paths.map(mapId)) as MapDoc;
    const prefix = paths.chunkDir(mapId);
    const chunkPaths = [...this.snapshot.keys()].filter((p) => p.startsWith(prefix));
    const decoded: LegacyPiece[] = [];
    // any-colour bricks keep their exact colour in Play (v68 saves keep the nearest v68 colour)
    const exact = new Map<number, string>();
    // step 11: custom bricks keep their shape in Play
    const shapes = new Map<number, string>();
    for (let i = 0; i < chunkPaths.length; i++) {
      const c = this.snapshot.get(chunkPaths[i]!) as Chunk;
      chunkPieces(c, decoded);
      chunkExactColors(c, exact);
      chunkCustomShapes(c, shapes);
      if (i % 8 === 7) yield (0.7 * (i + 1)) / chunkPaths.length;
    }
    for (const b of instanceBricks(this.snapshot, mapId)) {
      decoded.push(brickToPiece(b));
      if (!LEGACY_HEX.has(b.color.toLowerCase())) exact.set(b.id, b.color.toLowerCase());
      const shape = customIdOf(b.type);
      if (shape) shapes.set(b.id, shape);
    }
    yield 0.75;
    decoded.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    yield 0.8;
    const build = mapToLegacyBuild(this.snapshot, mapId, { pieces: decoded });
    const meta = (build.world ?? null) as LegacyWorldMeta;
    const pieces = build.pieces.map((p) => {
      const q: LegacyPiece = p.id !== undefined && exact.has(p.id) ? { ...p, hex: exact.get(p.id)! } : { ...p };
      if (p.id !== undefined && shapes.has(p.id)) q.shape = shapes.get(p.id)!;
      return q;
    });
    yield 0.85;
    // Milestone 2b: loose objects are bodies in the physics core, not solid bricks of the map
    const expanded = expandInstances(this.snapshot, mapId);
    const looseIds = new Set<number>();
    if (physicsReady()) for (const e of expanded) if (e.def.loose) for (const b of e.bricks) looseIds.add(b.id);
    const loosePieces = new Map<number, LegacyPiece>();
    if (looseIds.size) {
      for (const p of pieces) if (p.id !== undefined && looseIds.has(p.id)) loosePieces.set(p.id, p);
      const kept = pieces.filter((p) => p.id === undefined || !looseIds.has(p.id));
      pieces.length = 0;
      pieces.push(...kept);
    }
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
      instances: expanded.map((e) => ({
        ...e,
        state: e.inst.state ?? e.def.initialState,
      })),
      rev: 0,
      emitters: (inst?.items ?? []).filter((i): i is EmitterInstance => i.kind === 'emitter'),
      effects: (inst?.items ?? []).filter((i): i is EffectInstance => i.kind === 'effect'),
      lights: (inst?.items ?? []).filter((i): i is LightInstance => i.kind === 'light'),
      water: (inst?.items ?? []).filter((i): i is WaterInstance => i.kind === 'water'),
      models: (inst?.items ?? []).filter((i): i is ModelInstance => i.kind === 'model'),
      looseObjects: [],
      loosePieces,
      worldUi: (inst?.items ?? []).filter((i): i is UiInstance => i.kind === 'ui'),
      big,
      byChunk,
      windowAt: startKey,
      fullArea,
      goneIds: [],
      objects: new ObjectIndex<PlayInstance>(),
      physics: physicsReady() ? new PhysicsWorld() : null,
      defeated: [],
      start: { instances: new Map(), npcs: npcs.map((n) => n.id) },
    };
    for (const i of w.instances) w.start.instances.set(i.inst.id, i.state);
    this.physicsBricks(w, null);
    this.physicsLoose(w);
    this.worlds.set(mapId, w);
    this.lru.add(mapId);
    // a map left earlier in this play: back as the player left it
    const parked = this.parked.get(mapId);
    if (parked) {
      this.parked.delete(mapId);
      yield 0.95;
      restoreMap(this as unknown as SaveHost, w, parked);
    }
    this.evict();
    return w;
  }

  /**
   * P27 part 3c: at most MAX_LOADED maps stay loaded (the one played and the latest ones, with the maps its
   * gates lead to loaded ahead). A map that goes is parked: what changed on it is kept small (as a save keeps
   * it) and put back when the player comes back.
   */
  private evict() {
    for (const id of this.lru) {
      if (this.worlds.size <= MAX_LOADED) break;
      if (id === this.world?.mapId) continue;
      const w = this.worlds.get(id);
      if (!w) {
        this.lru.delete(id);
        continue;
      }
      this.parked.set(id, captureMap(w as unknown as SaveWorld));
      w.physics?.free();
      w.physics = null;
      this.worlds.delete(id);
      this.lru.delete(id);
    }
  }

  /** the map being loaded for a trip (the game holds and shows a loading screen meanwhile) */
  loading: {
    mapId: string;
    name: string;
    spawnId: string;
    gateId?: string | undefined;
    progress: number;
    steps: Generator<number, MapWorld>;
  } | null = null;
  /** P27 part 3c: Play loads maps in steps with a loading screen (the editor's Play sets it; tests load at once) */
  asyncLoads = false;
  private prefetch: { mapId: string; steps: Generator<number, MapWorld> } | null = null;

  /** go to another map: at once when it is loaded (or loading is not stepped), else through a loading screen */
  goTo(mapId: string, spawnId: string, gateId?: string) {
    if (!this.asyncLoads || this.worlds.has(mapId)) return this.travel(mapId, spawnId, gateId);
    if (this.prefetch?.mapId === mapId) {
      this.loading = {
        mapId,
        name: (this.snapshot.get(paths.map(mapId)) as MapDoc).name,
        spawnId,
        gateId,
        progress: 0,
        steps: this.prefetch.steps,
      };
      this.prefetch = null;
    } else
      this.loading = {
        mapId,
        name: (this.snapshot.get(paths.map(mapId)) as MapDoc).name,
        spawnId,
        gateId,
        progress: 0,
        steps: this.loadSteps(mapId),
      };
    this.input.keys.clear();
  }

  /**
   * P27 part 3c, once a frame: works on the map being loaded for `budgetMs` (then arrives when it is done);
   * otherwise loads the maps the current one's gates lead to, a little at a time, so going there is instant.
   */
  stepLoading(budgetMs = 10) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const l = this.loading;
    if (l) {
      let r = l.steps.next();
      while (!r.done && now() - t0 < budgetMs) {
        l.progress = r.value;
        r = l.steps.next();
      }
      if (r.done) {
        this.loading = null;
        this.travel(l.mapId, l.spawnId, l.gateId);
      } else l.progress = r.value;
      return;
    }
    if (!this.asyncLoads) return;
    if (!this.prefetch) {
      const next = this.outbound()
        .map((o) => o.toMap)
        .find((m) => !this.worlds.has(m) && this.snapshot.get(paths.map(m)));
      if (!next) return;
      this.prefetch = { mapId: next, steps: this.loadSteps(next) };
    }
    const pf = this.prefetch;
    let r = pf.steps.next();
    while (!r.done && now() - t0 < Math.min(2, budgetMs)) r = pf.steps.next();
    if (r.done) this.prefetch = null;
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

  // ---------- step 11, 4c: items, followers and characters put on the map by logic ----------

  /** the inventory's key for an item name, whatever its capitals */
  private itemKey(item: string): string {
    const t = item.trim();
    if (this.inventory.has(t)) return t;
    for (const k of this.inventory.keys()) if (k.toLowerCase() === t.toLowerCase()) return k;
    return t;
  }

  itemCount(item: string): number {
    return this.puzzles.count(item) ?? this.inventory.get(this.itemKey(item)) ?? 0;
  }

  takeItem(item: string, count: number) {
    if (this.puzzles.take(item, count)) {
      this.emit('info', `Took ${count} × ${item} (this map)`);
      return;
    }
    const k = this.itemKey(item);
    const n = Math.max(0, (this.inventory.get(k) ?? 0) - count);
    if (n) this.inventory.set(k, n);
    else this.inventory.delete(k);
    this.emit('info', `Took ${count} × ${k} (${n} left)`);
  }

  /** neighbours (by play id) following the hero */
  readonly followers = new Set<number>();

  /** the nearest character of this name on the open map */
  npcNamed(who: string): Npc | null {
    const w = who.trim().toLowerCase();
    if (!w) return null;
    return (
      this.world.npcs
        .filter((n) => String(n.profile.name ?? '').toLowerCase() === w)
        .sort(
          (a, b) =>
            Math.hypot(a.state.x - this.heroState.x, a.state.z - this.heroState.z) -
            Math.hypot(b.state.x - this.heroState.x, b.state.z - this.heroState.z),
        )[0] ?? null
    );
  }

  setFollow(who: string, on: boolean) {
    const n = this.npcNamed(who);
    if (!n) {
      this.emit('info', `Follow: nobody called “${who}” here`);
      return;
    }
    if (on) this.followers.add(n.id);
    else {
      this.followers.delete(n.id);
      // it settles where it stands
      (n as Npc & { home?: { x: number; y: number; z: number } }).home = { x: n.state.x, y: n.state.y, z: n.state.z };
    }
  }

  /** followers walk after the hero, keep about 2.5 studs away, run to catch up and jump to it when far behind */
  private stepFollowers(npcs: readonly Npc[], dt: number) {
    const h = this.heroState;
    for (const n of npcs) {
      if (!this.followers.has(n.id)) continue;
      const s = n.state;
      const dx = h.x - s.x;
      const dz = h.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > 30 || Math.abs(h.y - s.y) > 8) {
        Object.assign(s, { x: h.x - Math.sin(h.heading) * 2, y: h.y, z: h.z - Math.cos(h.heading) * 2, vy: 0 });
        continue;
      }
      if (d < 2.5) {
        n.controller.step({ x: 0, z: 0, run: false, jump: false, vertical: 0 }, dt, 0);
        continue;
      }
      const k = d > 7 ? 0.62 : 0.42;
      n.controller.step({ x: (dx / d) * k, z: -(dz / d) * k, run: d > 7, jump: false, vertical: 0 }, dt, 0);
      s.heading = Math.atan2(dx, dz);
    }
  }

  private charSerial = 0;

  /** a character (by name or id; the game's, else the starter pack's) put on the open map at a spawn point */
  spawnCharacter(character: string, at: string): string | null {
    const want = character.trim().toLowerCase();
    const own = [...this.snapshot.keys()]
      .filter((p) => p.startsWith('characters/'))
      .map((p) => this.snapshot.get(p) as Character | undefined)
      .filter((c): c is Character => !!c?.name);
    const chr =
      [...own, ...BUILTIN_CHARACTERS].find((c) => c.id === character.trim()) ??
      [...own, ...BUILTIN_CHARACTERS].find((c) => c.name.toLowerCase() === want);
    const w = this.world;
    const sp = w.doc.spawns.find((x) => x.id === at || x.name.toLowerCase() === at.trim().toLowerCase());
    if (!chr || !sp) {
      this.emit('info', `Spawn character: ${!chr ? `no character “${character}”` : `no spawn point “${at}” here`}`);
      return null;
    }
    const id = 900_000 + ++this.charSerial;
    const entry = {
      id,
      biome: 'city',
      role: 'Explorer',
      profile: lookForV68(chr.profile as Record<string, unknown>),
      state: { x: sp.pos[0], y: sp.pos[1], z: sp.pos[2], heading: sp.yaw },
    };
    let made: Npc[] = [];
    try {
      made = this.L.NPCWorld.restore([entry], w.pieces, w.meta);
    } catch (e) {
      this.emit('info', `Spawn character: ${(e as Error).message}`);
      return null;
    }
    const n = made[0];
    if (!n) return null;
    spawnedNpcs.set(id, { id: `ins_spawn${String(id).slice(-5)}`, character: chr.id });
    w.npcs.push(n);
    this.L.NPCWorld.connect(w.npcs, w.controller);
    this.eventEffect('defeat', [sp.pos[0], sp.pos[1] + 1, sp.pos[2]]);
    this.emit('info', `${chr.name} came in at ${sp.name}`);
    return chr.name;
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
    this.extraParts.delete('hero');
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
      { id: 'cleanup', fixed: (g, dt) => g.stepCleanup(dt) },
      { id: 'npc', fixed: (g, dt) => g.stepNpcs(dt) },
      { id: 'gates', fixed: (g) => g.stepGates() },
      { id: 'interact', fixed: (g) => g.stepInteract() },
      { id: 'puzzles', fixed: (g, dt) => g.puzzles.step(dt) },
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
      // step 11b: Play's keys arrive as the buttons they are bound to (forward, back, left, right); pad- is the
      // stick; the plain key names still move the hero when something sets them directly (tests, courses)
      x: (has('right', 'pad-right', 'd', 'arrowright') ? 1 : 0) - (has('left', 'pad-left', 'a', 'arrowleft') ? 1 : 0),
      z: (has('forward', 'pad-forward', 'w', 'arrowup') ? 1 : 0) - (has('back', 'pad-back', 's', 'arrowdown') ? 1 : 0),
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
    // step 12a: holding a block to pull it: the hero stays put (stepping back drags it)
    if (this.puzzles.grab) input = { ...input, x: 0, z: 0, jump: false };
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
    const move = {
      ...input,
      // P22 part 2: the sheet's speed and jump
      speedScale: (input.speedScale ?? 1) * this.heroStats.speed,
      jumpSpeed: (input.jumpSpeed ?? (this.hero.power === 'Super jumping' ? 19 : 9.5)) * Math.sqrt(this.heroStats.jump),
    };
    // step 11b part 2: deep water: the hero swims (shallow water only slows walking)
    const water = this.waterHere();
    if (water.mode === 'swim') this.swimStep(water.box!, move, dt);
    else {
      if (this.swim.on) this.leaveWater();
      if (water.mode === 'wade') move.speedScale *= 0.6;
      if (this.physicsMovement) this.walkWithPhysics(move, dt);
      // v68 heroMovement without powers: the controller does walking, running, jumping and collision.
      else this.world.controller.step(move, dt, this.camYaw);
    }
    this.stepBreath(water.box, dt);
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

  /** Milestone 2b, 10b part 3: the project's movement (Project › Movement), when the physics engine is loaded */
  get movementChoice(): 'classic' | 'physics' {
    return (
      (this.snapshot.get(paths.settings) as { movement?: 'classic' | 'physics' } | undefined)?.movement ?? 'classic'
    );
  }

  /** the hero is walked by the physics engine now (else by v68's controller) */
  get physicsMovement(): boolean {
    return this.movementChoice === 'physics' && !!this.world.physics;
  }

  /** Milestone 2b, 10b part 3: the hero walked by the physics engine, the other characters solid to it */
  private walkWithPhysics(move: MoveInput & { speedScale?: number; jumpSpeed?: number }, dt: number) {
    const w = this.world;
    this.physicsFlush(w);
    const ph = w.physics!;
    const c = w.controller;
    const s = c.state;
    const G = this.L.GamePhysics;
    const k = G.scaleOf(s);
    ph.setActors(
      w.npcs.map((n) => {
        const ks = G.scaleOf(n.state);
        return { key: n, x: n.state.x, y: n.state.y, z: n.state.z, radius: 0.8 * ks, height: 4.4 * ks };
      }),
    );
    const weapon = s.attack > 0 ? (this.L.GameWeapons.get(String(s.attackWeapon ?? '')) as never) : null;
    walkHero(ph, s, move, dt, this.camYaw, { scale: k, weapon });
    // kept inside the map, as v68 keeps it
    const p = G.containPoint(c.area, s.x, s.z, G.characterMargin * k);
    s.x = p.x;
    s.z = p.z;
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
      this.logic.fire({
        type: 'event.onDamaged',
        match: { asset: '', who: 'hero' },
        payload: { target: 'hero', amount: n, hp },
      });
    else {
      this.logic.fire({ type: 'event.onDefeated', match: { asset: '', who: 'hero' }, payload: { target: 'hero' } });
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
    // step 11, 4b: a blade swings with a swish
    if (attack.type === 'slash') this.audio.play(SND.swish, { pos: [h.x, h.y, h.z] });
    if (how.around) {
      const r = reach + 1.2;
      let any = false;
      for (const n of [...this.world.npcs])
        if (Math.hypot(n.state.x - h.x, n.state.z - h.z) <= r + 0.6 && this.canHarm(n)) {
          this.hitNpc(n, attack, push);
          any = true;
        }
      // Milestone 2b: the objects within reach of the swing (the widest objects are 48 studs), not every object
      for (const i of this.objs().near(h.x, h.z, r + 26)) {
        const sw = i.def.switch?.by === 'hit';
        if (!i.def.health && !sw) continue;
        const c = this.instanceCenter(i);
        if (c && Math.hypot(c[0] - h.x, c[2] - h.z) <= r + Math.max(i.def.footprint[0], i.def.footprint[1]) / 2) {
          if (sw) this.puzzles.hit(i, attack.type);
          else this.hitInstance(i, attack);
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
    // step 12a: a switch that is hit (a crystal) is used, not broken
    if (owner?.def.switch?.by === 'hit') {
      this.puzzles.hit(owner, attack.type);
      return;
    }
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
      // step 11, 4a: a big body is hit from further away, a tall or hovering one at any height along it
      const f = this.figureOf(n);
      if (d > bd + Math.max(0, f.radius - 0.6) || h.y < n.state.y + f.bottom - 2 || h.y > n.state.y + f.top) continue;
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
        match: { asset: owner.def.id, who: owner.def.name },
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
    this.logic.fire({
      type: 'event.onDefeated',
      match: { asset: owner.def.id, who: owner.def.name },
      payload: { target: at },
      self: at,
    });
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
    // step 11, 4a: where the hit comes from (a shield in front, a soft back), and whether it stuns
    const side = hitSide(npc.state, this.heroState, this.figureOf(npc).top);
    const { dealt, wound } = this.health.hit(key, def, attack, side);
    const pos: Vec3 = [npc.state.x, npc.state.y, npc.state.z];
    const stun = stunsIt(attack, def);
    if (stun) {
      this.combat.stunNpc(npc, def.stunFor ?? 2);
      this.hitEffect('stun', [pos[0], pos[1] + this.figureOf(npc).top * 0.6, pos[2]]);
    }
    if (dealt <= 0) {
      if (stun) this.say(`${name} is stunned!`, 1.2);
      else if (this.health.invulnerable.has(key)) this.say(`${name} can’t be hurt right now.`, 1.5);
      else if (def.sides?.[side] === 0) {
        // blocked: a clang, and a word on where to hit instead
        this.audio.play(SND.land, { pos });
        this.hitEffect('slash', [pos[0], pos[1] + 2, pos[2]]);
        const weak = (['back', 'side', 'above'] as const).find((x) => (def.sides?.[x] ?? 1) > 1);
        this.say(weak ? `Blocked! Try its ${weak === 'above' ? 'head, from above' : weak}.` : 'Blocked!', 1.5);
      } else this.say(`${name} shrugs it off.`, 1.5);
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
        match: { asset: '', who: name },
        payload: { target: name, amount: dealt, hp: wound.hp },
        ...this.npcSelf(npc),
      });
      return;
    }
    // at zero the neighbour leaves this play (puff of bricks where it stood); P27 part 3d: some come back
    this.world.npcs = this.world.npcs.filter((n) => n !== npc);
    if (def.atZero.respawn !== undefined) this.world.defeated.push({ npc, at: this.clock, after: def.atZero.respawn });
    if (this.talking === npc) this.talking = null;
    if (def.atZero.drop) this.drop(def.atZero.drop, { at: pos });
    // step 11, 4a: its loot, each by its chance
    for (const l of def.atZero.loot ?? []) if (Math.random() < l.chance) this.drop(l, { at: pos });
    if (def.atZero.emit) this.logic.fire({ type: 'event.onCustom', match: { event: def.atZero.emit } });
    this.say(`${name} is defeated.`, 2);
    this.eventEffect('defeat', [pos[0], pos[1] + 1.5, pos[2]]);
    this.screenEvent('defeat');
    this.emit('smash', `${name} defeated`);
    this.logic.fire({
      type: 'event.onDefeated',
      match: { asset: '', who: name },
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
    // step 12a: a small key, the boss key, the map and the compass belong to this map (the dungeon)
    if (this.puzzles.give(item, count)) return;
    // step 11, 4a: a heart heals at once, like Zelda's
    if (/^hearts?$/i.test(item.trim())) {
      this.heal('hero', count);
      this.eventEffect('heal', [this.heroState.x, this.heroState.y + 3, this.heroState.z]);
      this.say(`+${count} ♥`, 1.2);
      this.audio.play(SND.pickup);
      return;
    }
    const n = (this.inventory.get(item) ?? 0) + count;
    this.inventory.set(item, n);
    this.emit('info', `Got ${count} × ${item} (${n} in total)`);
    if (count > 0) this.eventEffect('coin', [this.heroState.x, this.heroState.y + 3, this.heroState.z]);
    this.say(`+${count} ${item}`, 1.5);
    // step 11, 4b: a key jingles
    this.audio.play(/\bkeys?\b/i.test(item) ? SND.keyget : SND.pickup);
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
    // Milestone 2b: the objects near the hero only
    for (const i of this.objs().near(h.x, h.z, 26)) {
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
      out.push({ pos: [n.state.x, n.state.y + this.figureOf(n).top + 1.4, n.state.z], k: (w?.hp ?? max) / max });
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
    // a break or a rebuild changes the list of breaks, not always the map's revision
    const key = `${w.brokenSerial}:${w.broken.length}`;
    const c = this.smashedCache;
    if (c?.world === w && c.rev === w.rev && c.key === key) return c.ids;
    const ids = new Set<string>();
    for (const b of w.broken)
      for (const p of b.originals) {
        const i = this.instanceOfPiece(p.id);
        if (i) ids.add(i.inst.id);
      }
    this.smashedCache = { world: w, rev: w.rev, key, ids };
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
    this.extraParts?.clear();
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

  /**
   * Step 11, 4a: how big a character stands, from where it stands (its feet): the bottom and top of its body, and how
   * far it reaches out sideways. A minifig is about 4.4 tall; a creature is measured from its bricks (a hovering bat's
   * bottom is above the ground, a spider boss is wide). Markers, health bars, lock-on and hits use it.
   */
  figureOf(who: Npc | 'hero'): { bottom: number; top: number; radius: number } {
    const st = who === 'hero' ? this.heroState : who.state;
    const body = this.bodyOf(who);
    if (!body) {
      const k = this.L.GamePhysics.scaleOf(st);
      return { bottom: 0, top: 4.4 * k, radius: 0.6 * k };
    }
    let f = this.figures.get(body);
    if (!f) {
      const { min, max } = bodyBounds(body);
      f = {
        bottom: Math.max(0, min[1]),
        top: Math.max(1, max[1]),
        radius: Math.max(
          0.5,
          ...min.filter((_, i) => i !== 1).map(Math.abs),
          ...max.filter((_, i) => i !== 1).map(Math.abs),
        ),
      };
      this.figures.set(body, f);
    }
    return f;
  }

  /** step 11, 4a: a minifig's extra parts (a tail, a snout…), coloured */
  extrasOf(who: Npc | 'hero') {
    const key = who === 'hero' ? 'hero' : who.id;
    let e = this.extraParts.get(key);
    if (!e) {
      const chr = who === 'hero' ? this.heroChr : npcCharacter(this.snapshot, this.world.mapId, who);
      e = minifigExtras(chr?.body);
      this.extraParts.set(key, e);
    }
    return e;
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
  /** step 11, 4a (enemies): how far a neighbour's body reaches out sideways */
  radiusOf(n: Npc): number {
    return this.figureOf(n).radius;
  }

  /** step 11, 4a (enemies): the hero is running or fighting, so enemies with hearing notice */
  heroLoud(): boolean {
    const h = this.heroState as typeof this.heroState & { attack?: number };
    return !!h.attack || this.input.keys.has('shift') || !!this.combat.pose();
  }

  enemyOf(n: Npc): Enemy | null {
    if (!this.enemyCache.has(n.id)) {
      const chr = npcCharacter(this.snapshot, this.world.mapId, n);
      this.enemyCache.set(n.id, chr?.enemy ?? null);
    }
    return this.enemyCache.get(n.id) ?? null;
  }

  /** P9c: the instance id of a neighbour (what a script on it is owned by) */
  npcSelf(n: Npc): { self?: string } {
    const item = npcItem(this.snapshot, this.world.mapId, n.id);
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
    const i = this.objs().byId(t.id);
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
    const ids = new Set<number>();
    for (const p of w.pieces) if (p.y > 0 && (p.id === hit.id || (hit.group && p.group === hit.group))) ids.add(p.id!);
    let remaining = w.pieces.filter((p) => !ids.has(p.id!));
    let gone = w.pieces.filter((p) => ids.has(p.id!));
    let check = this.layoutCheck(w, remaining, gone);
    if (!check.ok && check.connected) {
      const connected = check.connected;
      check.list.forEach((p, i) => {
        if (!connected.has(i)) ids.add(p.id!);
      });
      remaining = w.pieces.filter((p) => !ids.has(p.id!));
      gone = w.pieces.filter((p) => ids.has(p.id!));
      check = this.layoutCheck(w, remaining, gone);
    }
    if (!check.ok) {
      this.say(check.reason ?? 'That can’t break.', 2);
      return 0;
    }
    const originals = gone.map((p) => ({ ...p }));
    if (!originals.length) return 0;
    // P27 part 3d: what becomes of it (loose map bricks: rebuildable, as in v68)
    const mode = cleanupOf(owner?.def);
    const entry: BrokenEntry = {
      id: w.brokenSerial++,
      originals,
      progress: 0,
      mode,
      at: this.clock,
      after: owner?.def.smash.respawnAfter ?? 0,
    };
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
    this.capBroken(w);
    this.syncPhysics(w, { gone });
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
    // P27 part 3d: rubble keeps a few of its bricks on the ground for good
    if (entry.mode === 'rubble') {
      let n = 0;
      for (const d of w.debris) if (d.entryId === entry.id && n++ < RUBBLE_BRICKS) d.keep = true;
    }
    for (const d of w.debris) this.L.GamePhysics.confineDebris(d, w.controller);
    // at most 220 loose bricks fly about (the oldest go), and at most 2,000 lie as rubble
    const loose = w.debris.filter((d) => !d.keep);
    const kept = w.debris.length - loose.length;
    if (loose.length > 220 || kept > 2000) {
      const drop = new Set(loose.slice(0, Math.max(0, loose.length - 220)));
      if (kept > 2000) for (const d of w.debris.filter((x) => x.keep).slice(0, kept - 2000)) drop.add(d);
      w.debris = w.debris.filter((d) => !drop.has(d));
    }
  }

  stepDebris(dt0: number) {
    const dt = dt0 * this.slowmo;
    const w = this.world;
    // P27 part 3d: the loose bricks of things gone (or coming back) fade a moment after they break
    if (w.debris.length) {
      const fade = new Set<number>();
      for (const e of w.broken)
        if (e.mode && e.mode !== 'rebuild' && this.clock - (e.at ?? 0) > DEBRIS_FADE) fade.add(e.id);
      if (fade.size) w.debris = w.debris.filter((d) => d.keep || !fade.has(d.entryId));
    }
    // Milestone 2b: loose bricks are rigid bodies in the physics core: they tumble, stack and come to rest on the
    // bricks, and the hero pushes them (a brick being rebuilt flies back to its place by hand, as before)
    const ph = w.physics;
    if (ph) {
      this.physicsFlush(w);
      const rebuilding = this.rebuildEntry?.id;
      ph.syncLoose(w.debris, (d) => (d as Debris).entryId === rebuilding);
      // loose objects keep the simulation going even with no loose bricks about
      // (and the hero walked by it: what it pushes and stands on moves every step)
      if (w.debris.length || ph.objectCount || ph.walking) {
        const s = this.heroState;
        const k = this.L.GamePhysics.scaleOf(s);
        ph.moveHero(s.x, s.y, s.z, 0.8 * k, 4.4 * k);
        ph.step(dt);
        ph.readLoose();
        for (const d of w.debris) {
          if (d.entryId === rebuilding) continue;
          d.age += dt;
          // kept inside the map, as v68 keeps them
          const x = d.x;
          const z = d.z;
          this.L.GamePhysics.confineDebris(d, w.controller);
          if (d.x !== x || d.z !== z) ph.place(d, d.x, d.y, d.z, d.vx, d.vz);
          // fell through the world's floor: it is gone
          if (d.y < -20) d.keep = false;
        }
        w.debris = w.debris.filter((d) => d.y >= -20);
      }
    }
    for (const d of w.debris) {
      if (ph && this.rebuildEntry?.id !== d.entryId) continue;
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

  private cleanupClock = 0;

  /** P27 part 3d, twice a second: broken things and beaten neighbours whose time has come come back */
  stepCleanup(dt: number) {
    this.cleanupClock += dt;
    if (this.cleanupClock < 0.5) return;
    this.cleanupClock = 0;
    const w = this.world;
    if (w.npcsStale && w.byChunk && w.windowAt) {
      w.npcsStale = false;
      const near = piecesAround(w.byChunk, w.windowAt);
      this.syncNpcs(w, near);
      for (const n of w.npcs) n.controller.area = w.fullArea;
    }
    for (const e of [...w.broken])
      if (e.mode === 'respawn' && (e.after ?? 0) > 0 && this.clock - (e.at ?? 0) >= e.after!) this.respawnEntry(w, e);
    for (const d of [...w.defeated]) if (d.after > 0 && this.clock - d.at >= d.after) this.respawnNpc(w, d);
  }

  /** P27 part 3d: on arriving at a map, what comes back when the player comes back does */
  private comeBack(w: MapWorld) {
    for (const e of [...w.broken]) if (e.mode === 'respawn' && !(e.after ?? 0)) this.respawnEntry(w, e, true);
    for (const d of [...w.defeated]) if (!d.after) this.respawnNpc(w, d, true);
  }

  /** a broken thing comes back whole (not while the hero stands where it goes) */
  respawnEntry(w: MapWorld, entry: BrokenEntry, anyway = false): boolean {
    const b = this.damagedBounds(entry);
    const s = w === this.world ? this.heroState : null;
    if (!anyway && s && s.x > b.x0 - 1.5 && s.x < b.x1 + 1.5 && s.z > b.z0 - 1.5 && s.z < b.z1 + 1.5) return false;
    const back = entry.originals.map((p) => ({ ...p }));
    const restored = [...w.pieces, ...back];
    if (!this.layoutCheck(w, restored, back).ok) return false;
    w.pieces = restored;
    for (const p of entry.originals) w.dirtyChunks.add(chunkKeyOf(p));
    w.broken = w.broken.filter((x) => x !== entry);
    w.debris = w.debris.filter((d) => d.entryId !== entry.id);
    w.rev++;
    this.syncPhysics(w, { added: back });
    const owner = this.instanceOfPiece(entry.originals[0]?.id);
    if (owner) this.health.forget(`i:${owner.inst.id}`);
    this.emit('info', `${owner?.def.name ?? `${entry.originals.length} bricks`} came back`);
    return true;
  }

  /** a beaten neighbour comes back at home, healed (out of the hero's sight unless arriving) */
  respawnNpc(w: MapWorld, d: MapWorld['defeated'][number], anyway = false) {
    const n = d.npc as Npc & { home?: { x: number; y: number; z: number } };
    const home = n.home ?? { x: n.state.x, y: n.state.y, z: n.state.z };
    if (!anyway && w === this.world && Math.hypot(home.x - this.heroState.x, home.z - this.heroState.z) < 12) return;
    Object.assign(n.state, { x: home.x, y: home.y, z: home.z, vy: 0 });
    this.health.forget(`n:${n.id}`);
    w.defeated = w.defeated.filter((x) => x !== d);
    w.npcs.push(n);
    this.L.NPCWorld.connect(w.npcs, w.controller);
    this.emit('info', `${String(n.profile.name ?? 'A neighbour')} is back`);
  }

  /**
   * P27 part 3d: a map remembers at most MAX_BROKEN breaks. Past that the oldest that need not be rebuilt go:
   * things gone for good (or rubble) are kept only as brick ids; things that come back come back now.
   */
  private capBroken(w: MapWorld) {
    while (w.broken.length > MAX_BROKEN) {
      const i = w.broken.findIndex((e) => e.mode && e.mode !== 'rebuild' && e !== this.rebuildEntry);
      if (i < 0) return;
      const e = w.broken[i]!;
      if (e.mode === 'respawn') {
        if (!this.respawnEntry(w, e, true)) w.broken.splice(w.broken.indexOf(e), 1);
        continue;
      }
      for (const p of e.originals) if (p.id !== undefined) w.goneIds.push(p.id);
      w.debris = w.debris.filter((d) => d.keep || d.entryId !== e.id);
      w.broken.splice(i, 1);
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
      if ((e.mode && e.mode !== 'rebuild') || (owner && !owner.def.smash.rebuild)) continue;
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
      if ((e.mode && e.mode !== 'rebuild') || (owner && !owner.def.smash.rebuild)) continue;
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
        if (this.snapshot.get(paths.map(map))) this.goTo(map, spawn);
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
      move: (who, kind) => void this.doMove(who, kind),
      effect: (op, a, at) => this.effectOp(op, a, at),
      screen: (op, a) => this.screenFxOp(op, a),
      light: (op, name, value) => this.lightOp(op, name, undefined, value),
      sky: (op, value) => this.skyOp(op, value),
      buttons: (op, value, slot) => {
        if (op === 'label') this.buttons.custom = value.trim() || null;
        else this.equip(Math.max(1, Math.min(4, Math.round(slot ?? 1))), value || null);
      },
      sheet: (op, value) =>
        op === 'outfit'
          ? this.setOutfit(String(value))
          : op === 'xp'
            ? this.giveXp(Number(value) || 0)
            : this.switchHero(),
      spawn: (asset, at) => this.spawnAsset(asset, at),
      spawnNear: (item, near) => this.spawnNear(item, near),
      // step 11, 4c: what the script templates need
      say: (text, seconds) => this.say(text, seconds),
      count: (item) => this.itemCount(item),
      take: (item, count) => this.takeItem(item, count),
      follow: (who, on) => this.setFollow(who, on),
      spawnCharacter: (character, at) => this.spawnCharacter(character, at),
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
        // Milestone 2b: objects whose centre is in or near the zone's ground plan, then the exact test
        for (const i of this.objs().inBox(z.min[0] - 8, z.min[2] - 8, z.max[0] + 8, z.max[2] + 8)) {
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
    const inst = self ? this.objs().byId(self) : undefined;
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
    // P27 part 3c: the game holds while a map loads
    return this.screens.pausesGame || !!this.loading;
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
    this.puzzles.restore(undefined);
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
    this.applyQuality();
  }

  // ---------- P27 part 4: quality levels ----------

  /** the quality the game plays at now (the renderer reads it every frame) */
  quality: QualityLevel = 'medium';
  /** the editor's preview level (null: the game's settings decide) */
  private qualityPreview: QualityLevel | null = null;
  private device: DeviceInfo = {};
  private autoQ = new AutoQuality();

  /** the player's choice, else the maker's default */
  get qualityChoice(): QualityChoice {
    const player = this.progress.settings.quality;
    if (player && player !== 'auto') return player;
    return (this.snapshot.get(paths.settings) as { quality?: QualityChoice } | undefined)?.quality ?? 'auto';
  }

  /** Auto is on: the level steps down while frames are slow */
  get qualityAuto(): boolean {
    return !this.qualityPreview && this.qualityChoice === 'auto';
  }

  private applyQuality() {
    this.quality =
      this.qualityPreview ?? resolveQuality(this.progress.settings.quality, this.qualityChoice, this.device);
    this.autoQ = new AutoQuality();
    this.effects.cap = QUALITY[this.quality].particles;
  }

  /** the editor's preview: play at this level (null: the game's settings), now */
  setQualityPreview(level: QualityLevel | null) {
    this.qualityPreview = level;
    this.applyQuality();
  }

  /** a frame took `ms` (drawing included); Auto steps down a level when frames stay slow */
  frameTime(ms: number) {
    if (!this.qualityAuto || this.quality === 'low' || !this.autoQ.frame(ms)) return;
    this.quality = lowerQuality(this.quality);
    this.effects.cap = QUALITY[this.quality].particles;
    this.emit('info', `Graphics lowered to ${QUALITY[this.quality].label} to keep the game smooth`);
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
    // Milestone 2b: the map's checkpoints only (a short list), not every object
    for (const i of this.objs().checkpoints) {
      const c = this.instanceCenter(i);
      if (!c || Math.hypot(c[0] - s.x, c[2] - s.z) > 2.6 || Math.abs(c[1] - s.y) > 4) continue;
      const cp = this.checkpoint;
      const here = cp.pos && cp.map === this.world.mapId && Math.hypot(cp.pos[0] - c[0], cp.pos[2] - c[2]) < 3;
      if (here) continue;
      this.checkpoint = { map: this.world.mapId, spawn: null, pos: [s.x, s.y, s.z], heading: s.heading };
      // its last state means “touched” (a flag up); every other checkpoint here goes back to its first state
      for (const o of this.objs().checkpoints)
        if (o !== i && o.state !== o.def.initialState) this.setInstanceState(o.inst.id, o.def.initialState);
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
    // step 11b part 1: {action}, {action.key}, {slot1}, {slot1.count}, {button.attack}…
    const fromButtons = this.buttons.lookup(name);
    if (fromButtons !== undefined) return fromButtons;
    switch (name) {
      case 'hero.gear':
        return `${String(this.hero.held ?? 'hands')}${hasShield(this.hero) ? ' + Shield' : ''}`;
      case 'hero.name':
        return String(this.hero.name ?? 'Hero');
      case 'map.name':
        return this.world.doc.name;
      case 'game.name':
        return this.project.name;
      case 'prompt': {
        if (this.talking || this.talks.active) return '';
        // step 11b: the Action button's key and what it does here (not a plain jump: the HUD shows that anyway)
        const now = this.buttons.now;
        return now && now.kind !== 'jump' ? this.buttons.prompt() : '';
      }
      case 'message':
        return this.clock < this.messageUntil ? this.message : '';
      case 'dialogue.speaker':
        return this.talks.view?.speakerName ?? this.dialogue?.speaker ?? '';
      case 'dialogue.text':
        return this.talks.view?.text ?? this.dialogue?.text ?? '';
      case 'inventory':
        return this.inventory;
      // step 12a: this dungeon's small keys, and a line with its keys, boss key, map and compass
      case 'keys':
        return this.puzzles.count('Small key') ?? 0;
      case 'dungeon':
        return this.puzzles.hudLine();
      case 'time':
        return Math.floor(this.clock);
    }
    if (name.startsWith('inventory.')) return this.itemCount(name.slice(10));
    if (name.startsWith('save.')) return this.saveValue(name);
    if (/^(progress|achievements|collections|collection|bests|best|settings)\./.test(name))
      return this.progress.value(name);
    return this.logic.vars.get(name);
  };

  /** Stop: silence everything this session started. */
  dispose() {
    // Milestone 2b: the physics worlds' memory goes back
    for (const w of this.worlds.values()) {
      w.physics?.free();
      w.physics = null;
    }
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
    const exact = this.objs(w).byId(ref);
    if (exact) return exact;
    const low = ref.trim().toLowerCase();
    // P9c: a copy's own name (“Gate switch”)
    const named = this.objs(w).byName(low);
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
  /** step 12a: the puzzle parts' view of the game */
  private makePuzzles(): Puzzles<PlayInstance> {
    // the host's getters read the session's state (a getter has its own this)
    const self = this;
    const p = new Puzzles<PlayInstance>({
      get heroState() {
        return self.heroState;
      },
      get clock() {
        return self.clock;
      },
      mapId: () => this.world.mapId,
      dungeon: () => !!this.world.doc.dungeon,
      near: (x, z, r) => this.objs().near(x, z, r),
      pieces: () => this.world.pieces,
      moveWish: () => {
        const v = this.inputVector();
        if (!v.x && !v.z) return { x: 0, z: 0 };
        const l = Math.min(1, Math.hypot(v.x, v.z)) / (Math.hypot(v.x, v.z) || 1);
        const yaw = this.camYaw;
        return {
          x: (Math.cos(yaw) * v.x - Math.sin(yaw) * v.z) * l,
          z: (-Math.sin(yaw) * v.x - Math.cos(yaw) * v.z) * l,
        };
      },
      free: () => !this.talking && !this.talks.active && !this.over && !this.cine.active && !this.heroState.building,
      someoneAt: (x0, z0, x1, z1, y0, y1) =>
        this.world.npcs.some(
          (n) =>
            n.state.x > x0 - 0.4 &&
            n.state.x < x1 + 0.4 &&
            n.state.z > z0 - 0.4 &&
            n.state.z < z1 + 0.4 &&
            n.state.y < y1 &&
            n.state.y + 3 > y0,
        ),
      setState: (o, state) => this.setInstanceState(o.inst.id, state, true),
      moveTo: (o, pos) => this.moveInstance(o, pos),
      placeHero: (x, z) => {
        const s = this.heroState;
        s.x = x;
        s.z = z;
      },
      heroFits: (x, z) => {
        const s = this.heroState;
        return this.world.controller.clear(x, s.y, z);
      },
      remove: (o) => this.despawn(o.inst.id),
      give: (item, n) => this.give(item, n),
      say: (t, sec) => this.say(t, sec),
      sound: (id, at) => this.audio.play(SND[id], at ? { pos: at } : {}),
      fire: (event, o, extra) => {
        const asset = o.def.id;
        if (event === 'switch')
          this.logic.fire({
            type: 'event.onSwitch',
            match: { asset, to: extra.on ? 'on' : 'off' },
            payload: { target: o.inst.id, on: extra.on },
            self: o.inst.id,
          });
        else if (event === 'pushed')
          this.logic.fire({
            type: 'event.onPushed',
            match: { asset },
            payload: { target: o.inst.id },
            self: o.inst.id,
          });
        else if (event === 'unlocked')
          this.logic.fire({
            type: 'event.onUnlocked',
            match: { asset },
            payload: { target: o.inst.id, key: extra.key },
            self: o.inst.id,
          });
        else
          this.logic.fire({
            type: 'event.onPickedUp',
            match: { item: String(extra.item) },
            payload: { item: extra.item, count: extra.count },
          });
      },
      log: (t) => this.emit('info', t),
    });
    p.itemCount = (item) => this.inventory.get(this.itemKey(item)) ?? 0;
    p.takeItem = (item, n) => this.takeItem(item, n);
    return p;
  }

  /**
   * Step 12a, for the minimap: in a dungeon without its map, the cells the hero has seen (null: show it all);
   * with its compass, the chests not yet opened and the boss.
   */
  minimapView(): { seen: Set<string> | null; cell: number; marks: { x: number; z: number; kind: 'chest' | 'boss' }[] } {
    const w = this.world;
    const r = this.puzzles.dungeons.get(w.mapId);
    const dungeon = !!w.doc.dungeon;
    const seen = dungeon && !r?.map ? (r?.seen ?? new Set<string>()) : null;
    const marks: { x: number; z: number; kind: 'chest' | 'boss' }[] = [];
    if (dungeon && r?.compass) {
      for (const i of w.instances) {
        if (!/chest/i.test(i.def.name) || i.def.states.length < 2 || i.state !== i.def.states[0]) continue;
        const b = boxOf(i.bricks);
        if (b) marks.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, kind: 'chest' });
      }
      for (const n of w.npcs)
        if (this.enemyOf(n)?.style === 'boss') marks.push({ x: n.state.x, z: n.state.z, kind: 'boss' });
    }
    return { seen, cell: SEEN_CELL, marks };
  }

  /**
   * Step 12a: moves a placed object to pos (a push block sliding): its bricks, prompts and solidity follow. It
   * is not checked against the brick rules here: the puzzle checked the way was clear.
   */
  moveInstance(o: PlayInstance, pos: [number, number, number]) {
    const w = this.world;
    const lo = o.inst.idBase;
    const hi = lo + o.def.bricks.length;
    const gone = w.pieces.filter((q) => q.id! >= lo && q.id! < hi);
    const inst = { ...o.inst, pos };
    const next = expandAsset(o.def, { ...inst, state: o.state });
    const added = next.bricks.map((b) => brickToPiece(b, true));
    for (const q of gone) w.dirtyChunks.add(chunkKeyOf(q));
    for (const q of added) w.dirtyChunks.add(chunkKeyOf(q));
    w.pieces = [...w.pieces.filter((q) => q.id! < lo || q.id! >= hi), ...added].sort((a, b) => a.id! - b.id!);
    o.inst = inst;
    o.bricks = next.bricks;
    o.sockets = next.sockets;
    delete o.box;
    // the object index keeps centres: a new list builds it again
    w.instances = [...w.instances];
    w.rev++;
    this.syncPhysics(w, { gone, added });
  }

  despawn(target: string) {
    const w = this.world;
    const inst = this.objs(w).byId(target);
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
        swimming: this.swim.on,
      },
      this.heroChr?.states,
      (st) =>
        this.bodyOf('hero')
          ? undefined
          : (this.sheetClip(this.heroChr, st) ??
            // step 11b: v68's own motion is a walk, so swimming always has a clip (the built-in crawl and tread)
            (st === 'swim' || st === 'tread' ? BUILTIN_CLIPS.find((c) => c.id === MOVE_FOR[st]) : undefined)),
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

  /** Milestone 3, 10d part 2: a move a character is doing (a roar, a spin, a dance…) and when it began (game clock) */
  private moves = new Map<number | 'hero', { kind: BodyMove; at: number }>();

  /**
   * Milestone 3, 10d part 2: a character does one of its body's moves — `who` is “hero” or a character's name
   * (the nearest neighbour with that name). Moves its body can't do are left out; minifigs have none yet.
   */
  doMove(who: string, kind: string): boolean {
    if (!BODY_MOVES.includes(kind as BodyMove)) return false;
    const npc =
      who === 'hero' || !who
        ? null
        : this.world.npcs
            .filter((n) => n.profile.name?.toLowerCase() === who.toLowerCase())
            .sort(
              (a, b) =>
                Math.hypot(a.state.x - this.heroState.x, a.state.z - this.heroState.z) -
                Math.hypot(b.state.x - this.heroState.x, b.state.z - this.heroState.z),
            )[0];
    const target: Npc | 'hero' = npc ?? 'hero';
    if (who && who !== 'hero' && !npc) return false;
    const body = this.bodyOf(target);
    if (!body || !bodyMovesOf(body.bones).some((m) => m.move === kind)) return false;
    this.moves.set(target === 'hero' ? 'hero' : target.id, { kind: kind as BodyMove, at: this.clock });
    return true;
  }

  /** the move a character is doing now and how far through it (0…1), if any */
  moveOf(who: Npc | 'hero'): { kind: BodyMove; u: number } | null {
    const key = who === 'hero' ? 'hero' : who.id;
    const m = this.moves.get(key);
    if (!m) return null;
    const u = (this.clock - m.at) / MOVE_LENGTH[m.kind];
    if (u >= 1 || u < 0) {
      this.moves.delete(key);
      return null;
    }
    return { kind: m.kind, u };
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

  /** Milestone 2b: a map's placed objects, indexed (kept in step with its list) */
  objs(w: MapWorld = this.world): ObjectIndex<PlayInstance> {
    return w.objects.sync(w.instances);
  }

  instanceOfPiece(id: number | undefined): PlayInstance | null {
    if (id === undefined) return null;
    return this.objs().byPiece(id);
  }

  /** Nearest interact/sign socket within 2 studs of the hero (plus a little for big heroes). */
  stepInteract() {
    const s = this.heroState;
    let best: Prompt | null = null;
    let bestD = 2 + 0.4 * this.L.GamePhysics.scaleOf(s);
    // Milestone 2b: only the objects with interactions near the hero, not every object on the map
    const objs = this.objs();
    const smashed = this.smashedIds();
    for (const inst of objs.near(s.x, s.z, bestD + objs.interactiveReach + 1)) {
      const usable = inst.def.switch?.by === 'press' || (!!inst.def.lock && inst.state === inst.def.states[0]);
      if (!inst.def.interactions.length && !usable) continue;
      if (smashed.has(inst.inst.id)) continue;
      for (const so of inst.sockets) {
        if (so.kind !== 'interact' && so.kind !== 'sign') continue;
        if (
          !usable &&
          !inst.def.interactions.some((i) => i.socket === so.id && (!i.when || i.when.state === inst.state))
        )
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
    this.buttons.update();
  }

  /** step 11b part 2: the game's swimming (Project › Movement) */
  get swimming(): Swimming {
    const v = (this.snapshot.get(paths.settings) as { swimming?: Swimming } | undefined)?.swimming;
    return { ...SWIM_DEFAULTS, ...(v ?? {}) };
  }

  /** the map's water as boxes (its water items) */
  waterBoxes(): WaterBox[] {
    const w = this.world;
    if (this.waterCache?.map === w.mapId && this.waterCache.of === w.water) return this.waterCache.list;
    const list = w.water.map((it) => ({
      x0: it.pos[0],
      y0: it.pos[1],
      z0: it.pos[2],
      x1: it.pos[0] + it.size[0],
      y1: it.pos[1] + it.size[1],
      z1: it.pos[2] + it.size[2],
      current: (it.current ?? [0, 0]) as [number, number],
    }));
    this.waterCache = { map: w.mapId, list, of: w.water };
    return list;
  }

  /** the water the hero is in, and what it means: none, wading, or swimming */
  waterHere(): { box: WaterBox | null; mode: WaterMode } {
    const s = this.heroState;
    const list = this.waterBoxes();
    if (!list.length) return { box: null, mode: 'none' };
    const box = waterAt(list, s.x, s.y + 0.05, s.z);
    const h = HERO_HEIGHT * this.L.GamePhysics.scaleOf(s);
    return { box, mode: waterMode(box, s.y, h, this.swimming.can) };
  }

  /** step 11b part 2: one step of swimming: across, up and down (the Action button), the current, the shore */
  private swimStep(w: WaterBox, move: { x: number; z: number; speedScale?: number; jump?: boolean }, dt: number) {
    const s = this.heroState;
    const st = s as typeof s & Record<string, unknown>;
    const k = this.L.GamePhysics.scaleOf(s);
    const h = HERO_HEIGHT * k;
    if (!this.swim.on) {
      this.swim.on = true;
      // falling in: the splash, then afloat
      if (s.vy < -3) this.playSound(SND.splash, undefined);
      s.vy = 0;
    }
    // a jump at the surface leaps out (onto a low shore)
    if (move.jump && s.y >= floatY(w, h) - 0.2) {
      this.leaveWater();
      s.vy = 7.5;
      s.y += 0.3;
      return;
    }
    const step = swimStep(
      s,
      { x: move.x, z: move.z, up: this.swim.up, down: this.swim.down, speed: move.speedScale },
      w,
      h,
      this.camYaw,
      dt,
    );
    const c = this.world.controller;
    const ph = this.physicsMovement ? this.world.physics : null;
    let nx = s.x + step.dx;
    let ny = s.y + step.dy;
    let nz = s.z + step.dz;
    if (ph) {
      const r = ph.walk({ x: s.x, y: s.y, z: s.z }, { x: step.dx, y: step.dy, z: step.dz }, HERO_RADIUS * k, h, {
        noSnap: true,
      });
      nx = r.x;
      ny = r.y;
      nz = r.z;
    } else if (c.clear(s.x, s.y, s.z) && !c.clear(nx, ny, nz)) {
      // (stuck in something already, e.g. dropped into the water at the bottom: it may move out of it)
      // blocked: slide along one axis, else stay
      if (c.clear(nx, s.y, s.z)) [ny, nz] = [s.y, s.z];
      else if (c.clear(s.x, s.y, nz)) [nx, ny] = [s.x, s.y];
      else [nx, ny, nz] = [s.x, s.y, s.z];
    }
    // pushing into a low shore at the surface climbs out onto it
    const pushed =
      Math.hypot(step.dx, step.dz) > 0.001 && Math.hypot(nx - s.x, nz - s.z) < 0.3 * Math.hypot(step.dx, step.dz);
    if (pushed && s.y >= floatY(w, h) - 0.3) {
      const fx = s.x + Math.sin(s.heading) * 0.9;
      const fz = s.z + Math.cos(s.heading) * 0.9;
      for (let up = w.y1 - s.y; up < w.y1 - s.y + 1.4; up += 0.2) {
        if (c.clear(fx, s.y + up, fz)) {
          s.x = fx;
          s.z = fz;
          s.y += up + 0.05;
          this.leaveWater();
          return;
        }
      }
    }
    s.x = nx;
    s.y = ny;
    s.z = nz;
    if (step.heading !== null) s.heading = step.heading;
    s.speed = step.speed;
    s.vy = 0;
    s.grounded = true;
    st.swimming = true;
    st.diving = step.diving;
  }

  /** out of the water: walking again */
  private leaveWater() {
    const st = this.heroState as typeof this.heroState & Record<string, unknown>;
    this.swim = { on: false, down: false, up: false, under: false };
    st.swimming = false;
    st.diving = false;
  }

  /** step 11b part 2: holding breath under water (the HUD shows {air} of {maxAir} while {underwater}) */
  private stepBreath(w: WaterBox | null, dt: number) {
    const s = this.heroState;
    const max = this.swimming.breath;
    const under = headUnder(w, s.y, HERO_HEIGHT * this.L.GamePhysics.scaleOf(s));
    const r = breathe(this.breath, under && !this.god, max, dt);
    this.breath = r.breath;
    if (r.hearts) {
      this.say('Out of air! Swim up.', 1.5);
      this.hurt(r.hearts);
    }
    if (under !== this.swim.under) {
      this.swim.under = under;
      this.logic.setVar('underwater', under);
      if (!under && this.breath.air < max) this.playSound(SND.splash, undefined);
    }
    const air = Math.ceil(this.breath.air);
    if (this.logic.vars.get('air') !== air) this.logic.vars.set('air', air);
    if (this.logic.vars.get('maxAir') !== max) this.logic.vars.set('maxAir', max);
    this.logic.vars.set('swimming', this.swim.on);
  }

  /** step 11b part 1: what the Action button can do here (the first that fits wins, see ACTION_PRIORITY) */
  private offersNow(): ActionOffer[] {
    if (this.over || this.cine.active || this.talks.active || this.talking) return [];
    const out: ActionOffer[] = [];
    const s = this.heroState;
    // a neighbour close by and in front (or locked on to), like Zelda: not one across the square
    const locked = this.combat.lockedNpc();
    const npc = locked ?? this.L.NPCWorld.nearest(this.world.npcs, s);
    if (npc) {
      const dx = npc.state.x - s.x;
      const dz = npc.state.z - s.z;
      const d = Math.hypot(dx, dz);
      const facing = d < 0.5 || (dx * Math.sin(s.heading) + dz * Math.cos(s.heading)) / d > 0.2;
      if (locked || (d < 3.5 && facing)) out.push({ kind: 'talk', label: 'Talk', priority: ACTION_PRIORITY.talk });
    }
    if (this.prompt) out.push({ kind: 'use', label: this.prompt.label, priority: ACTION_PRIORITY.use });
    else if (this.signPrompt) out.push({ kind: 'read', label: 'Read', priority: ACTION_PRIORITY.read });
    if (this.nearestBroken()) out.push({ kind: 'rebuild', label: 'Rebuild', priority: ACTION_PRIORITY.rebuild });
    // step 11b part 2: in deep water the Action button dives, and under it swims up (held)
    if (this.swim.on) {
      const s2 = this.heroState;
      const w = waterAt(this.waterBoxes(), s2.x, s2.y + 0.05, s2.z);
      const atTop = w && s2.y >= floatY(w, HERO_HEIGHT * this.L.GamePhysics.scaleOf(s2)) - 0.2;
      out.push(
        atTop
          ? { kind: 'dive', label: 'Dive', priority: ACTION_PRIORITY.dive }
          : { kind: 'swimUp', label: 'Swim up', priority: ACTION_PRIORITY.swimUp },
      );
    }
    // step 12a: a block that can be pulled, right in front
    if (this.puzzles.canGrab() || this.puzzles.grab)
      out.push({ kind: 'grab', label: 'Grab', priority: ACTION_PRIORITY.grab });
    for (const f of this.actionOffers) out.push(...f());
    return out;
  }

  /** step 11b part 1: what each button does in this game */
  private buttonHost(): ButtonHost {
    return {
      offers: () => this.offersNow(),
      act: (o, down) => {
        if (o.kind === 'rebuild') {
          this.rebuildHeld = down;
          return;
        }
        // step 11b part 2: held to dive or to swim up; let go and the swimmer drifts back up
        if (o.kind === 'dive') {
          this.swim.down = down;
          this.swim.up = false;
          return;
        }
        if (o.kind === 'swimUp') {
          this.swim.up = down;
          this.swim.down = false;
          return;
        }
        // step 12a: held to hold on to a block; step back to pull it
        if (o.kind === 'grab') {
          this.puzzles.setGrab(down);
          return;
        }
        if (!down) return;
        if (o.kind === 'talk') this.talk();
        else if (o.kind === 'use' || o.kind === 'read') this.interact();
        else if (o.kind === 'jump') this.input.jump = true;
        this.logic.fire({ type: 'event.onActionPressed', match: { action: o.label }, payload: { action: o.label } });
      },
      attack: (down) => (down ? this.combat.press() : this.combat.release()),
      jump: () => {
        this.input.jump = true;
      },
      guard: (down) => (down ? this.input.keys.add('q') : this.input.keys.delete('q')),
      roll: () => this.combat.roll(),
      lock: () => this.combat.toggleLock(),
      move: (dir, down) => (down ? this.input.keys.add(dir) : this.input.keys.delete(dir)),
      useItem: (item, slot) => this.useItem(item, slot),
      itemMenu: () => this.openItemMenu(),
      count: (item) => this.inventory.get(item) ?? 0,
    };
  }

  /** step 11b part 1: an item button pressed: its item is used (logic: On item used) */
  useItem(item: string | null, slot: number) {
    if (!item) {
      this.say(`Nothing in item button ${slot} yet: put an item in it from the item menu.`, 2.5);
      return;
    }
    if ((this.inventory.get(item) ?? 0) <= 0) {
      this.say(`No ${item} left.`, 1.5);
      return;
    }
    this.emit('info', `Item ${slot}: ${item}`);
    this.logic.fire({ type: 'event.onItemUsed', match: { item }, payload: { item, slot } });
  }

  /** step 11b part 1: the buttons as the HUD shows them (key, and what each does now) */
  buttonViews(): { id: string; name: string; key: string; label: string; count?: number }[] {
    const b = this.buttons;
    const out: { id: string; name: string; key: string; label: string; count?: number }[] = [
      { id: 'attack', name: 'Attack', key: b.keyOf('attack'), label: 'Attack' },
      { id: 'action', name: 'Action', key: b.keyOf('action'), label: b.now?.label ?? '' },
    ];
    if (b.c.jump === 'button') out.push({ id: 'jump', name: 'Jump', key: b.keyOf('jump'), label: 'Jump' });
    for (let i = 0; i < b.c.items; i++) {
      const item = b.slots[i] ?? null;
      out.push({
        id: `item${i + 1}`,
        name: `Item ${i + 1}`,
        key: b.keyOf(ITEM_BUTTONS[i]!),
        label: item ?? '',
        ...(item ? { count: this.inventory.get(item) ?? 0 } : {}),
      });
    }
    return out;
  }
  itemViews(): { name: string; count: number }[] {
    return [...this.inventory].filter(([, n]) => n > 0).map(([name, count]) => ({ name, count }));
  }
  slotViews(): { slot: number; key: string; item: string | null }[] {
    const b = this.buttons;
    return Array.from({ length: b.c.items }, (_, i) => ({
      slot: i + 1,
      key: b.keyOf(ITEM_BUTTONS[i]!),
      item: b.slots[i] ?? null,
    }));
  }
  /** step 11b part 1: an item put in an item button (logic: Put item in slot does the same) */
  equip(slot: number, item: string | null) {
    this.buttons.equip(slot, item);
    this.emit('info', `Item button ${slot}: ${item ?? 'empty'}`);
  }
  /** step 11b part 1: the player's own keys changed (Play keeps them on the device) */
  onBindings: ((keys: Partial<Record<Bindable, string[]>>) => void) | null = null;
  bindingViews(): { id: string; name: string; keys: string; pad: string }[] {
    const b = this.buttons;
    return [...buttonsOf({ layout: b.c.layout, items: b.c.items, jump: b.c.jump }), ...MOVES].map((id) => ({
      id,
      name: BUTTON_NAME[id],
      keys: (b.playerKeys[id] ?? b.c.keys[id]).map(keyName).join(', '),
      pad: b.keyOf(id, true),
    }));
  }
  rebind(id: string, key: string) {
    const b = this.buttons;
    const k = key.toLowerCase();
    const next: Partial<Record<Bindable, string[]>> = {};
    // the key leaves any other button that had it
    for (const x of [...BUTTONS, ...MOVES]) {
      const cur = b.playerKeys[x] ?? b.c.keys[x];
      if (x !== id && cur.includes(k)) next[x] = cur.filter((y) => y !== k);
      else if (b.playerKeys[x]) next[x] = b.playerKeys[x];
    }
    next[id as Bindable] = [k];
    b.playerKeys = next;
    this.onBindings?.(next);
  }
  resetBindings() {
    this.buttons.playerKeys = {};
    this.onBindings?.({});
  }

  /** step 11b part 1: the item menu (the Items screen: pick what goes in each item button) */
  openItemMenu() {
    if (this.screens.top()?.id === SCR.items) this.screenOp('hide', SCR.items, false);
    else this.screenOp('show', SCR.items, false);
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
    // step 12a: a lock tries the hero's key; a press switch (a lever) is used
    if (this.puzzles.press(p.instance)) {
      this.logic.fire({
        type: 'event.onInteract',
        match: { asset: p.instance.def.id },
        payload: { target: p.instance.inst.id, socket: p.socket },
        self: p.instance.inst.id,
      });
      this.stepInteract();
      return true;
    }
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
  setInstanceState(instanceId: string | undefined, state: string, anyway = false) {
    const w = this.world;
    const inst = instanceId ? this.objs(w).byId(instanceId) : undefined;
    if (!inst || !inst.def.states.includes(state) || inst.state === state) return;
    const lo = inst.inst.idBase;
    const hi = lo + inst.def.bricks.length;
    const next = expandAsset(inst.def, { ...inst.inst, state });
    const pieces = [
      ...w.pieces.filter((p) => p.id! < lo || p.id! >= hi),
      ...next.bricks.map((b) => brickToPiece(b, true)),
    ];
    // step 12a: a switch or a lock changes state whatever rests on it (a block on a switch, a door opening)
    const check =
      floating(inst.def) || anyway
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
    // step 11, 4c: followers walk after the hero
    if (this.followers.size) this.stepFollowers(acting, dt * this.slowmo);
    const free = acting.filter(
      (n) => !this.combat.isStunned(n) && !this.enemies.engaged(n) && !this.standsStill(n) && !this.followers.has(n.id),
    );
    this.L.NPCWorld.step(free, dt * this.slowmo, this.heroState, this.talking?.id ?? null);
    // a talk ends when the hero walks away (further, when they are locked on to the one they talk to)
    const reach = this.talking && this.combat.lockedNpc() === this.talking ? LOCK_RELEASE : 4.5;
    if (
      this.talking &&
      Math.hypot(this.talking.state.x - this.heroState.x, this.talking.state.z - this.heroState.z) > reach
    )
      this.endTalk();
  }

  /**
   * Step 11, 4c: the characters follow a change of bricks. v68's sync sent one whose spot was not clear to the
   * map's first open corner, and "not clear" counted the hero standing against it, so an enemy in a fight
   * vanished when a swing broke a brick. Now other characters do not count, and one caught in bricks steps to the
   * nearest open spot instead.
   */
  syncNpcs(w: MapWorld, pieces: LegacyPiece[]) {
    if (!w.npcs.length) return;
    const was = w.npcs.map((n) => ({ x: n.state.x, y: n.state.y, z: n.state.z }));
    for (const n of w.npcs) n.controller.setActors([]);
    this.L.NPCWorld.sync(w.npcs, pieces, w.meta);
    w.npcs.forEach((n, i) => {
      const k = was[i]!;
      if (Math.hypot(n.state.x - k.x, n.state.z - k.z) < 1.5) return;
      const c = n.controller;
      for (let r = 0.5; r <= 8; r += 0.5)
        for (let a = 0; a < 16; a++) {
          const x = k.x + Math.sin((a / 16) * Math.PI * 2) * r;
          const z = k.z + Math.cos((a / 16) * Math.PI * 2) * r;
          const y = c.floor(x, z, k.y + 1.3);
          if (y === null || Math.abs(y - k.y) > 2.5 || !c.clear(x, y, z)) continue;
          Object.assign(n.state, { x, y, z, vy: 0, grounded: true });
          (n as Npc & { home?: unknown }).home = { x, y, z };
          return;
        }
    });
    this.L.NPCWorld.connect(w.npcs, w.controller);
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
    if (hit) this.goTo(hit.toMap, hit.toSpawn, hit.gate);
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
    // P27 part 3d: what comes back when the player comes back
    this.comeBack(this.world);
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

  /** P27 part 3d (saves): what becomes of a broken thing, by one of its bricks */
  breakMode(p: LegacyPiece | undefined): { mode: Cleanup; after: number } {
    const owner = this.instanceOfPiece(p?.id);
    return { mode: cleanupOf(owner?.def), after: owner?.def.smash.respawnAfter ?? 0 };
  }

  /** P26 (saves): the brick rules for a changed list of pieces */
  piecesOk(pieces: LegacyPiece[]): boolean {
    const w = this.world;
    if (!w.big) return inspectPieces(this.solid(pieces)).ok;
    // P27 part 3d: a big map checks only around what came or went
    const now = new Set(pieces);
    const was = new Set(w.pieces);
    const around = [...w.pieces.filter((p) => !now.has(p)), ...pieces.filter((p) => !was.has(p))];
    return this.layoutCheck(w, pieces, around).ok;
  }

  /**
   * The bricks the brick rules look at: all but floating items (a sword risen out of a chest is drawn
   * only). Without this, one floating item would make every later change fail the rules.
   */
  private floatRanges: { of: unknown; ranges: (readonly [number, number])[] } | null = null;
  private solid(pieces: LegacyPiece[]): LegacyPiece[] {
    // the id ranges of floating assets, worked out once per list of instances (thousands on a big map)
    const inst = this.world.instances;
    if (this.floatRanges?.of !== inst)
      this.floatRanges = {
        of: inst,
        ranges: inst
          .filter((i) => floating(i.def))
          .map((i) => [i.inst.idBase, i.inst.idBase + i.def.bricks.length] as const),
      };
    const ranges = this.floatRanges.ranges;
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
  syncPhysics(w: MapWorld, change?: { gone?: readonly LegacyPiece[]; added?: readonly LegacyPiece[] }) {
    // Milestone 2b: the chunks the change touched become solid again in the physics core (all of them without one)
    const touched = change ? new Set([...(change.gone ?? []), ...(change.added ?? [])].map(chunkKeyOf)) : null;
    if (!w.big) {
      w.controller.replace(w.pieces, w.meta);
      this.syncNpcs(w, w.pieces);
      if (touched) this.physicsLater(w, touched);
      else this.physicsBricks(w, null);
      return;
    }
    // P27 part 3d: a small change updates only its chunks of the index, and the neighbours catch up twice a second
    if (change && w.byChunk) {
      if (change.gone?.length) {
        const ids = new Set(change.gone.map((p) => p.id));
        for (const k of new Set(change.gone.map(chunkKeyOf))) {
          const list = w.byChunk.get(k);
          if (list)
            w.byChunk.set(
              k,
              list.filter((p) => !ids.has(p.id)),
            );
        }
      }
      for (const p of change.added ?? []) {
        const k = chunkKeyOf(p);
        const list = w.byChunk.get(k);
        if (list) list.push(p);
        else w.byChunk.set(k, [p]);
      }
      w.npcsStale = true;
      this.moveWindow(w, true, true);
      this.physicsLater(w, touched!);
      return;
    }
    w.byChunk = indexByChunk(w.pieces);
    this.moveWindow(w, true);
    this.physicsBricks(w, null);
  }

  /** Milestone 2b: the map's water and its loose objects go into the physics core */
  private physicsLoose(w: MapWorld) {
    const ph = w.physics;
    if (!ph) return;
    // 10c part 5: solid placed models (each as soon as its file has been read)
    for (const it of w.models) {
      if (it.solid === false) continue;
      const solid = (up: ModelUpload) => {
        if (w.physics === ph) ph.setSolidMesh(`model:${it.id}`, placedTriangles(up.data, modelMatrix(it)));
      };
      const up = readyModel(it.model);
      if (up) solid(up);
      else void prepareModel(it.model, this.mediaSource).then(solid, () => {});
    }
    ph.setWater(
      w.water.map((it) => ({
        x0: it.pos[0],
        y0: it.pos[1],
        z0: it.pos[2],
        x1: it.pos[0] + it.size[0],
        y1: it.pos[1] + it.size[1],
        z1: it.pos[2] + it.size[2],
        current: it.current ?? [0, 0],
      })),
    );
    for (const i of w.instances) {
      if (!i.def.loose || !i.bricks.length) continue;
      const boxes = i.bricks.map((b) => {
        const [bw, bd] = footprint(b);
        return { x0: b.x, x1: b.x + bw, y0: b.y * 0.4, y1: (b.y + brickHeight(b.type)) * 0.4, z0: b.z, z1: b.z + bd };
      });
      const { origin } = ph.addObject(i.inst.id, boxes);
      const pieces = i.bricks.flatMap((b) => {
        const p = w.loosePieces.get(b.id);
        return p ? [p] : [];
      });
      w.looseObjects.push({ inst: i, origin, pieces });
    }
  }

  private smallChunks: { pieces: unknown; index: Map<string, LegacyPiece[]> } | null = null;
  /**
   * Milestone 2b: the bricks the physics core treats as solid: a big map's window around the hero, a small map
   * whole. `changed` names chunks to build again (null: every chunk in the window).
   */
  /** chunks whose solid bricks must be built again, at the next physics step (many breaks in a row: once) */
  private physicsDirty = new WeakMap<MapWorld, Set<string>>();

  private physicsLater(w: MapWorld, touched: Set<string>) {
    if (!w.physics) return;
    const set = this.physicsDirty.get(w) ?? new Set<string>();
    for (const k of touched) set.add(k);
    this.physicsDirty.set(w, set);
  }

  /** builds again the chunks changed since the last physics step */
  private physicsFlush(w: MapWorld) {
    const set = this.physicsDirty.get(w);
    if (!set?.size) return;
    this.physicsDirty.delete(w);
    this.physicsBricks(w, set);
  }

  physicsBricks(w: MapWorld, changed: Set<string> | null) {
    const ph = w.physics;
    if (!ph) return;
    let index: Map<string, LegacyPiece[]>;
    const want = new Set<string>();
    if (w.big && w.byChunk) {
      index = w.byChunk;
      const at = w.windowAt;
      if (at) {
        const [cx, cz] = at.split('_').map(Number) as [number, number];
        for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++)
          for (let dz = -WINDOW_RADIUS; dz <= WINDOW_RADIUS; dz++) {
            const k = `${cx + dx}_${cz + dz}`;
            if (index.has(k)) want.add(k);
          }
      }
    } else {
      if (this.smallChunks?.pieces !== w.pieces) this.smallChunks = { pieces: w.pieces, index: indexByChunk(w.pieces) };
      index = this.smallChunks.index;
      for (const k of index.keys()) want.add(k);
    }
    const have = ph.chunkKeys();
    const bounds = (p: LegacyPiece) => this.L.GamePhysics.bounds(p);
    for (const k of have) if (!want.has(k) || (changed?.has(k) && !index.has(k))) ph.dropChunk(k);
    for (const k of want)
      if (!have.has(k) || changed === null || changed.has(k)) ph.setChunk(k, index.get(k) ?? [], bounds);
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
  moveWindow(w: MapWorld, force = false, heroOnly = false) {
    if (!w.big || !w.byChunk) return;
    const st = w.controller.state;
    const key = `${Math.floor(st.x / 32)}_${Math.floor(st.z / 32)}`;
    if (!force && key === w.windowAt) return;
    w.windowAt = key;
    const near = piecesAround(w.byChunk, key);
    w.controller.replace(near, w.meta);
    w.controller.area = w.fullArea;
    this.physicsBricks(w, new Set());
    if (heroOnly) return;
    w.npcsStale = false;
    this.syncNpcs(w, near);
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
    if (!around.length) return { ok: true, list: [] };
    // P27 part 3d: only the pieces near the change (a crate's break checks a few hundred pieces, not 3 × 3 chunks)
    const area = localArea(next, around);
    const list = this.solid(area.list);
    return { ...inspectPieces(list, area.anchored), list };
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

/** P27 part 3c: maps kept loaded at once while playing (the one played, the latest ones and the ones ahead) */
export const MAX_LOADED = 4;
