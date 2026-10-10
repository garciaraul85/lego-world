import type { Command, CommandBus } from '../commands';
import { allBricks } from '../commands/handlers/assets';
import type { ProjectStore } from '../project/store';
import { type Asset, type MapDoc, paths } from '../schema';
import { Surface } from './surface';

/**
 * Finding good spots on a map (shared by the game generator and the tutorial's “Do it for me”):
 * open ground the hero can walk to, and places where an asset or a brick fits by v68's rules.
 */
export type Cell = [x: number, top: number, z: number, steps: number];

export function surfaceOf(store: ProjectStore, map: string) {
  return new Surface(allBricks(store, map));
}

/** open ground near the middle of the biggest walkable region, as a spawn position */
export function arrivalSpot(store: ProjectStore, map: string): [number, number, number] | null {
  const s = surfaceOf(store, map);
  const region = s.largestRegion();
  if (!region) return null;
  const spot = s.nearestOpen(0, 0, (x, z) => region.has(`${x},${z}`));
  return spot ? [spot[0] + 0.5, spot[1] * 0.4, spot[2] + 0.5] : null;
}

/** cells the hero can walk to from the map's first spawn */
export function reachable(store: ProjectStore, map: string): { s: Surface; cells: Cell[] } {
  const s = surfaceOf(store, map);
  const a = store.get<MapDoc>(paths.map(map))?.spawns[0]?.pos ?? [0, 0, 0];
  const reach = s.reach(Math.floor(a[0]), Math.floor(a[2]));
  return {
    s,
    cells: [...reach].map(([k, d]) => {
      const [x, z] = k.split(',').map(Number) as [number, number];
      return [x, s.topAt(x, z)!, z, d];
    }),
  };
}

/** an asset.place command that will succeed, near the spawn (closest first), or null */
export function assetSpot(
  store: ProjectStore,
  bus: CommandBus,
  map: string,
  def: Pick<Asset, 'id' | 'footprint'>,
  opts: { minSteps?: number; maxSteps?: number; id?: string } = {},
): Command | null {
  const { s, cells } = reachable(store, map);
  const spawns = store.get<MapDoc>(paths.map(map))?.spawns.map((x) => x.pos) ?? [];
  const pool = cells
    .filter(([, , , d]) => d >= (opts.minSteps ?? 3) && d <= (opts.maxSteps ?? 40))
    .filter(([x, , z]) => spawns.every((p) => Math.hypot(p[0] - (x + 1), p[2] - (z + 1)) > 3))
    .sort((a, b) => a[3] - b[3]);
  for (const c of pool.slice(0, 120)) {
    const rect = s.rect(c[0], c[2], def.footprint[0], def.footprint[1]);
    if (!rect?.flat) continue;
    const cmd: Command = {
      type: 'asset.place',
      payload: { map, asset: def.id, pos: [c[0], rect.top, c[2]], rot: 0, ...(opts.id ? { id: opts.id } : {}) },
    };
    if (bus.dryRun([cmd]).ok) return cmd;
  }
  return null;
}

/** a bricks.place command for one brick on open studded ground near the spawn, or null */
export function brickSpot(
  store: ProjectStore,
  bus: CommandBus,
  map: string,
  type = 'brick2x2',
  color = '#d20c20',
): Command | null {
  const { s, cells } = reachable(store, map);
  for (const c of cells.filter(([, , , d]) => d >= 2).slice(0, 200)) {
    const rect = s.rect(c[0], c[2], 2, 2);
    if (!rect?.flat) continue;
    const cmd: Command = {
      type: 'bricks.place',
      payload: { map, bricks: [{ type, x: c[0], y: rect.top, z: c[2], rot: 0, color }] },
    };
    if (bus.dryRun([cmd]).ok) return cmd;
  }
  return null;
}
