// v68's self-contained IIFE modules, reused unchanged until their ports land.
// They are pure JavaScript (no DOM), so evaluating them in core keeps core runnable in Node and workers.
import generatorSource from '../../legacy/world-generator.js?raw';
import skySource from '../../legacy/world-sky.js?raw';

export type LegacyGeneratedPiece = {
  id: number;
  rows: number;
  cols: number;
  kind: 'brick' | 'plate' | 'tile';
  color: number;
  turn: number;
  x: number;
  y: number;
  z: number;
  group?: string;
};
export type LegacyWorldConfig = {
  biomes: string[];
  time: string;
  rain: boolean;
  snow: boolean;
  snowing: boolean;
  size: number;
  seed: number;
  mountainShape?: string;
  mountainScale?: string;
};
export interface WorldGeneratorApi {
  biomes: [string, string][];
  times: string[];
  mountainShapes: [string, string][];
  mountainScales: [string, string][];
  validate(config: LegacyWorldConfig): LegacyWorldConfig;
  generate(config: LegacyWorldConfig): {
    pieces: LegacyGeneratedPiece[];
    width: number;
    depth: number;
    config: LegacyWorldConfig;
    layoutVersion: number;
  };
  districtSize(config: LegacyWorldConfig, layoutVersion: number): number;
  isPavement(piece: LegacyGeneratedPiece, config: LegacyWorldConfig, layoutVersion: number): boolean;
  isRoadMark(piece: LegacyGeneratedPiece, config: LegacyWorldConfig, layoutVersion: number): boolean;
}
export type SkySample = {
  zenith: number[];
  horizon: number[];
  ambient: number[];
  light: number[];
  sun?: number[];
  moon?: number[];
  night: number;
  overcast: number;
};
export interface SkyCycleApi {
  sample(time: string, elapsed: number, rain: boolean, snowing: boolean): SkySample;
  duration: number;
}

let generator: WorldGeneratorApi | null = null;
let sky: SkyCycleApi | null = null;

export function worldGenerator(): WorldGeneratorApi {
  generator ??= new Function(`${generatorSource}\nreturn WorldGenerator;`)() as WorldGeneratorApi;
  return generator;
}

export function skyCycle(): SkyCycleApi {
  sky ??= new Function(`${skySource}\nreturn SkyCycle;`)() as SkyCycleApi;
  return sky;
}
