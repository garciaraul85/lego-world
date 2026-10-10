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
    validate(p: Record<string, unknown>): Record<string, unknown>;
    heightScale(p: Record<string, unknown>): number;
  };
  CharacterModel: { create(gl: WebGLRenderingContext, fragment: string, onDirty?: () => void): CharacterRenderer };
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
  gamePhysics,
  characterModel,
  characterArt,
  npcWorld,
];

let runtime: LegacyRuntime | null = null;
export function legacyRuntime(): LegacyRuntime {
  runtime ??= new Function(
    `${ORDER.join('\n')}\nreturn {WorldGenerator,VolcanoSimulation,SkyCycle,GameMagic,SuperPowers,GameWeapons,StudioMotion,StudioAnimations,CharacterCatalog,RigCollision,GamePhysics,CharacterModel,CharacterArt,NPCWorld};`,
  )() as LegacyRuntime;
  return runtime;
}
