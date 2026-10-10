import type { Brick } from '../bricks/codec';
import { inspectBricks } from '../bricks/inspect';
import { LEGACY_COLORS } from '../legacy/constants';
import { type LegacyWorldConfig, worldGenerator } from '../legacy/modules';
import type { MapDoc } from '../schema';

/** Inputs of the v68 world generator, in v5 names. */
export type GenerateConfig = {
  environments: string[];
  size: 16 | 24 | 32;
  seed: number;
  mountainShape?: string;
  mountainScale?: string;
  time?: MapDoc['sky']['time'];
  rain?: boolean;
  snow?: boolean;
  snowing?: boolean;
};

export type GeneratedMap = {
  bricks: Brick[];
  generator: NonNullable<MapDoc['generator']>;
  size: { w: number; d: number };
  sky: MapDoc['sky'];
  weather: MapDoc['weather'];
};

export function toLegacyConfig(c: GenerateConfig): LegacyWorldConfig {
  return {
    biomes: c.environments,
    size: c.size,
    seed: c.seed,
    time: c.time ?? 'day',
    rain: c.rain ?? false,
    snow: c.snow ?? false,
    snowing: c.snowing ?? false,
    mountainShape: c.mountainShape ?? 'mixed',
    mountainScale: c.mountainScale ?? 'mixed',
  };
}

/** Plain-sentence error for a config v68's generator would reject, or null. */
export function generateConfigError(c: GenerateConfig): string | null {
  try {
    worldGenerator().validate(toLegacyConfig(c));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Runs the v68 generator (deterministic for a config) and converts its pieces to bricks. */
export function generateMap(c: GenerateConfig): GeneratedMap {
  const g = worldGenerator().generate(toLegacyConfig(c));
  const bricks = g.pieces.map((p): Brick => {
    const b: Brick = {
      id: p.id,
      type: `${p.kind}${p.rows}x${p.cols}`,
      x: p.x,
      y: p.y,
      z: p.z,
      rot: p.turn,
      color: LEGACY_COLORS[p.color]![1],
      flags: 0,
    };
    if (p.group !== undefined) b.group = p.group;
    return b;
  });
  const check = inspectBricks(bricks);
  if (!check.ok) throw new Error(`Could not connect the generated world: ${check.reason}`);
  const cfg = g.config;
  return {
    bricks,
    generator: {
      environments: cfg.biomes as never,
      seed: cfg.seed,
      size: cfg.size as 16 | 24 | 32,
      ...(cfg.mountainShape ? { mountainShape: cfg.mountainShape } : {}),
      ...(cfg.mountainScale ? { mountainScale: cfg.mountainScale } : {}),
      version: g.layoutVersion,
      locked: false,
    },
    size: { w: g.width, d: g.depth },
    sky: { time: cfg.time as MapDoc['sky']['time'] },
    weather: { rain: cfg.rain, snow: cfg.snow, snowing: cfg.snowing },
  };
}
