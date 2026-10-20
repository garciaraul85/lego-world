// v68 gameplay modules (self-contained IIFEs), evaluated together in one scope so they see each other
// exactly as in the assembled page. Their ports replace them one system at a time.

import type { LegacyPiece } from '../../core/legacy/types';
import characterArt from '../../legacy/character-art.js?raw';
import characterCatalog from '../../legacy/character-catalog.js?raw';
import characterModel from '../../legacy/character-model.js?raw';
import gameMagic from '../../legacy/game-magic.js?raw';
import gamePhysics from '../../legacy/game-physics.js?raw';
import gameWeapons from '../../legacy/game-weapons.js?raw';
import npcWorld from '../../legacy/npc-world.js?raw';
import rigCollision from '../../legacy/rig-collision.js?raw';
import studioAnimations from '../../legacy/studio-animations.js?raw';
import studioMotion from '../../legacy/studio-motion.js?raw';
import superPowers from '../../legacy/super-powers.js?raw';
import volcanoSimulation from '../../legacy/volcano-simulation.js?raw';
import worldGenerator from '../../legacy/world-generator.js?raw';
import worldSky from '../../legacy/world-sky.js?raw';

export type Bounds = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
export type HeroState = Record<string, unknown> & {
  x: number;
  y: number;
  z: number;
  vy: number;
  heading: number;
  grounded: boolean;
  speed: number;
  running: boolean;
  attack: number;
  attackDuration?: number;
  attackWeapon?: string;
  building: boolean;
};
export type MoveInput = {
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
  vertical: number;
  speedScale?: number;
  jumpSpeed?: number;
  flight?: boolean;
  climbing?: boolean;
};
export type LegacyWorldMeta = {
  config: Record<string, unknown>;
  layoutVersion?: number;
  width?: number;
  depth?: number;
} | null;

export interface Controller {
  state: HeroState;
  pieces: LegacyPiece[];
  spawnPoint?: { x: number; y: number; z: number };
  replace(pieces: LegacyPiece[], world?: LegacyWorldMeta): void;
  repairPosition(): void;
  setActors(states: HeroState[]): void;
  clear(x: number, y: number, z: number): boolean;
  contains?(x: number, z: number): boolean;
  floor(x: number, z: number, ceiling?: number): number | null;
  spawn(): HeroState;
  step(input: MoveInput, dt: number, yaw: number): void;
  target(reach?: number): (LegacyPiece & { id: number }) | null;
  sceneryContacts(x: number, y: number, z: number): unknown[];
}

export type Npc = {
  id: number;
  biome: string;
  role: string;
  profile: Record<string, unknown> & { name: string };
  controller: Controller;
  state: HeroState;
};
export type Debris = {
  entryId: number;
  x: number;
  y: number;
  z: number;
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  color: number[];
  scale: number;
  age: number;
  sleeping?: boolean;
};

export interface LegacyRuntime {
  GamePhysics: {
    Controller: new (pieces: LegacyPiece[], world?: LegacyWorldMeta) => Controller;
    bounds(p: LegacyPiece): Bounds;
    scaleOf(s: HeroState): number;
    overlapsPlayer(p: LegacyPiece, s: HeroState): boolean;
    rebuildTraps(c: Controller, originals: LegacyPiece[], x: number, z: number, y: number): boolean;
    cameraDistance(target: number[], eye: number[], pieces: LegacyPiece[]): number;
    confineDebris(d: Debris, c: Controller): void;
    stepDebrisPiece(d: Debris, dt: number, c: Controller): void;
  };
  CharacterCatalog: {
    defaults: Record<string, unknown>;
    choices: Record<string, string[]>;
    colorFields: string[];
    rangeFields: Record<string, { max: number }>;
    presets: Record<string, Record<string, unknown>>;
    preset(name: string): Record<string, unknown>;
    validate(p: Record<string, unknown>): Record<string, unknown>;
    heightScale(p: Record<string, unknown>): number;
  };
  CharacterModel: {
    create(gl: WebGLRenderingContext, fragment: string, onDirty?: () => void): CharacterRenderer;
    /** v68 rig: each joint's world matrix for a pose state (16 numbers, column-major) */
    jointPose(
      state: Record<string, unknown>,
      neutral: boolean,
      profile: Record<string, unknown>,
    ): Record<string, Float32Array>;
    /** v68 column-major 4×4: translate to (x, y, z), then turn by yaw (heading), pitch, roll */
    matrix(x: number, y: number, z: number, yaw?: number, pitch?: number, roll?: number): Float32Array;
    mul(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array;
    /** a joint matrix scaled to the character's size */
    scaledMatrix(m: Float32Array, state: Record<string, unknown>, profile: Record<string, unknown>): Float32Array;
    transform(m: ArrayLike<number>, p: number[]): number[];
    /** each joint's rest position */
    pivots: Record<string, number[]>;
    /** the hand's grip point from the elbow, for a side (-1 left, 1 right) */
    handGrip(side: number): number[];
  };
  GameWeapons: {
    get(name: unknown): {
      style?: string;
      action: string;
      duration: number;
      contact: number;
      reach: number;
      impulse?: number;
      mass?: number;
      frames?: unknown;
    };
    catalog: Record<string, unknown>;
  };
  NPCWorld: {
    populate(pieces: LegacyPiece[], world: LegacyWorldMeta, hero: HeroState): Npc[];
    restore(saved: unknown, pieces: LegacyPiece[], world: LegacyWorldMeta): Npc[];
    sync(npcs: Npc[], pieces: LegacyPiece[], world: LegacyWorldMeta): void;
    connect(npcs: Npc[], c: Controller): void;
    step(npcs: Npc[], dt: number, hero: HeroState, talkingId: number | null): void;
    nearest(npcs: Npc[], hero: HeroState, range?: number): Npc | null;
    serialize(npcs: Npc[]): unknown;
    reply(npc: Npc, text: string, world: LegacyWorldMeta, env: unknown, broken: number): { text?: string } | string;
  };
  WorldGenerator: { isRoadMark(p: LegacyPiece, config: unknown, layout?: number): boolean };
  StudioAnimations: {
    sample(
      id: string,
      time: number,
      base: Record<string, unknown>,
    ): { state: HeroState; profile: Record<string, unknown> };
  };
  SkyCycle: {
    sample(
      time: string,
      elapsed: number,
      rain: boolean,
      snowing: boolean,
    ): import('../../core/legacy/modules').SkySample;
    duration: number;
  };
}

export interface CharacterRenderer {
  begin(mvp: Float32Array, eye: number[], light: unknown): void;
  draw(profile: Record<string, unknown>, state: HeroState, preview?: boolean, animated?: boolean): void;
  debris(mesh: { p: WebGLBuffer; n: WebGLBuffer; count: number }, d: Debris): void;
  bindCollision(profile: Record<string, unknown>, c: Controller): void;
}

const ORDER = [
  worldGenerator,
  volcanoSimulation,
  worldSky,
  gameMagic,
  superPowers,
  gameWeapons,
  studioMotion,
  studioAnimations,
  characterCatalog,
  rigCollision,
  withRoomToWalk(gamePhysics),
  withTalkingMouth(withOffHand(characterModel)),
  characterArt,
  npcWorld,
];

/**
 * P9b: an item in the off hand (a shield), strapped to the outside of the left forearm. v68's model only has a
 * right-hand item; the new engine adds this to its own copy at load time, so v68's files (and Play in v68)
 * stay exactly as they were.
 */
function withOffHand(src: string): string {
  const at = "paintSlot='held';if(p.held!=='None'){";
  if (!src.includes(at)) throw new Error('character model: the held-item block moved; update withOffHand');
  const shield =
    "if(p.offHand==='Shield'){paintSlot='offhand';part('leftForearm',access);const sx=-1.27,sy=1.98,sz=.34;" +
    "box(sx,sy,sz,.14,1.05,.80);part('leftForearm',accent);box(sx-.075,sy,sz,.01,.66,.09);" +
    'box(sx-.075,sy+.08,sz,.01,.09,.50);}';
  return src.replace(at, shield + at);
}

/**
 * P23: on a map with no terrain yet, v68 lets characters walk only within the bricks standing on the ground,
 * so one chest on a bare map shrinks the walkable room to that chest (the hero and every neighbour land on
 * top of it). The new engine's copy keeps the bare ground's ±16 studs while the ground is that small.
 */
function withRoomToWalk(src: string): string {
  const at = "for(const k of ['x1','z1'])area[k]=Math.max(area[k],b[k]);}return area;";
  if (!src.includes(at)) throw new Error('game physics: worldBounds moved; update withRoomToWalk');
  return src.replace(
    at,
    "for(const k of ['x1','z1'])area[k]=Math.max(area[k],b[k]);}" +
      'if(area.x1-area.x0<32&&area.z1-area.z0<32){area.x0=Math.min(area.x0,-16);area.x1=Math.max(area.x1,16);' +
      'area.z0=Math.min(area.z0,-16);area.z1=Math.max(area.z1,16);}return area;',
  );
}

/**
 * P23 part 3: a talking mouth. While a character speaks, its profile carries `mouthOpen` (0.5 half, 1 wide)
 * and the face prints an open mouth (with a tongue) instead of the expression's mouth; the brows and eyes
 * keep the mood. Each shape is a different profile, so the model caches each one once.
 */
function withTalkingMouth(src: string): string {
  const at = "part('root',ink);const mouth=[];if(['Smile',";
  if (!src.includes(at)) throw new Error('character model: the mouth block moved; update withTalkingMouth');
  const open =
    "part('root',ink);const mouth=[];if(p.mouthOpen>0){const o=p.mouthOpen;disc(0,3.47,.10+.05*o,.035+.085*o);" +
    "part('root','#b94352');disc(0,3.43,.05+.03*o,.015+.035*o,.031);part('root',ink);}else if(['Smile',";
  return src.replace(at, open);
}

let runtime: LegacyRuntime | null = null;
export function legacyRuntime(): LegacyRuntime {
  runtime ??= new Function(
    `${ORDER.join('\n')}\nreturn {WorldGenerator,VolcanoSimulation,SkyCycle,GameMagic,SuperPowers,GameWeapons,StudioMotion,StudioAnimations,CharacterCatalog,RigCollision,GamePhysics,CharacterModel,CharacterArt,NPCWorld};`,
  )() as LegacyRuntime;
  return runtime;
}
