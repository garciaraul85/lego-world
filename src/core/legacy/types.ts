/** Shapes of the LEGO World v68 `brick-builder` save (versions 1-4). Read-only views; validation lives in migrate. */
export type LegacyPiece = {
  id?: number;
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
export type LegacyWorld = {
  config: Record<string, unknown> & { biomes?: string[]; size?: number; seed?: number };
  layoutVersion?: number;
  width?: number;
  depth?: number;
};
export type LegacyEnvironment = { time: string; rain: boolean; snow: boolean; snowing: boolean };
export type LegacyNpc = {
  id: number;
  biome: string;
  role: string;
  profile: Record<string, unknown>;
  state: Record<string, unknown>;
};
export type LegacyBuild = {
  pieces: LegacyPiece[];
  world?: LegacyWorld | null;
  environment?: LegacyEnvironment;
  broken?: Array<{ id: number; originals: LegacyPiece[]; progress?: number }>;
  player?: Record<string, unknown> | null;
  npcs?: LegacyNpc[];
  [extra: string]: unknown;
};
export type LegacySpawn = { id: number; name: string; x: number; y: number; z: number; heading: number };
export type LegacyMapEntry = { id: number; name: string; spawns: LegacySpawn[]; build?: LegacyBuild | null };
export type LegacyLink = {
  id: number;
  from: { mapId: number; spawnId: number };
  to: { mapId: number; spawnId: number };
  twoWay: boolean;
};
export type LegacySave = LegacyBuild & {
  format: 'brick-builder';
  version: 1 | 2 | 3 | 4;
  characters?: { items: Array<{ id: number; profile: Record<string, unknown> }>; activeId?: number };
  maps?: { activeId: number; nextId: number; maps: LegacyMapEntry[]; links: LegacyLink[] };
};
