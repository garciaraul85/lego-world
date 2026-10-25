import { expandInstances } from '../assets/instances';
import type { Brick } from '../bricks/codec';
import { footprint } from '../bricks/inspect';
import { brickHeight } from '../bricks/map-bricks';
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
  opts: { minSteps?: number; maxSteps?: number; id?: string; before?: Command[]; rough?: number } = {},
): Command | null {
  // Milestone 3, 10d: commands that come first (the new asset's asset.create), tried together
  const pre = opts.before ?? [];
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
    if (bus.dryRun([...pre, cmd]).ok) return cmd;
  }
  // Milestone 3, 10d part 5: hilly or snowy land has no flat spot as big: then ground that rises at most `rough`
  // plates under it (the asset stands on the highest point, a little above the low side)
  if (opts.rough)
    for (const c of pool.slice(0, 400)) {
      const r = s.roughRect(c[0], c[2], def.footprint[0], def.footprint[1]);
      if (!r || r.top - r.lo > opts.rough) continue;
      const cmd: Command = {
        type: 'asset.place',
        payload: { map, asset: def.id, pos: [c[0], r.top, c[2]], rot: 0, ...(opts.id ? { id: opts.id } : {}) },
      };
      if (bus.dryRun([...pre, cmd]).ok) return cmd;
    }
  if (cells.length) return null;
  // a map with no bricks yet (a new map, the tutorial's practice map): the bare ground near the spawn, west
  // and south first (the tutorial puts its villager north-east of the arrival)
  const a = spawns[0] ?? [0, 0, 0];
  const [cx, cz] = [Math.floor(a[0]), Math.floor(a[2])];
  const lo = Math.max(opts.minSteps ?? 3, 3);
  for (let d = lo; d <= (opts.maxSteps ?? 40); d++)
    for (const [dx, dz] of [
      [-d - def.footprint[0], 0],
      [0, -d - def.footprint[1]],
      [d, 0],
      [0, d],
      [d, d],
      [-d - def.footprint[0], -d - def.footprint[1]],
    ] as const) {
      const cmd: Command = {
        type: 'asset.place',
        payload: { map, asset: def.id, pos: [cx + dx, 0, cz + dz], rot: 0, ...(opts.id ? { id: opts.id } : {}) },
      };
      if (bus.dryRun([...pre, cmd]).ok) return cmd;
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

/**
 * Milestone 3, 10d part 5: a spot for a building made for a map. Snowy or paved land is mostly smooth tiles, which
 * nothing can be built on (no studs): a spot is still good when the ground is near enough level and at least one
 * cell at its highest point is a studded brick (the building stands there, held by those studs, over the tiles
 * around). Plants in the way (the generator's trees, bushes and flowers) are cleared for it, in the same step, as
 * a builder clears a plot; other things are never moved. The ground's height is read once per column, so trying
 * hundreds of spots stays quick.
 */
export function clearedSpot(
  store: ProjectStore,
  bus: CommandBus,
  map: string,
  def: Pick<Asset, 'id' | 'footprint'>,
  minSteps: number,
  skip: ReadonlySet<string> = new Set(),
): Command[] {
  const { cells } = reachable(store, map);
  const spawns = store.get<MapDoc>(paths.map(map))?.spawns.map((x) => x.pos) ?? [];
  const insts = expandInstances(store, map);
  const plant = new Set(insts.filter((e) => e.def.category === 'nature').map((e) => e.inst.id));
  const owner = new Map<Brick, string>();
  for (const e of insts) for (const b of e.bricks) owner.set(b, e.inst.id);
  // each column: its top and whether that top has studs, without plants; and which plants stand on it
  const col = new Map<string, [number, boolean]>();
  const plants = new Map<string, Set<string>>();
  for (const b of allBricks(store, map)) {
    const [bw, bd] = footprint(b);
    const who = owner.get(b);
    for (let i = 0; i < bw; i++)
      for (let j = 0; j < bd; j++) {
        const k = `${b.x + i},${b.z + j}`;
        if (who && plant.has(who)) {
          (plants.get(k) ?? plants.set(k, new Set()).get(k)!).add(who);
          continue;
        }
        const t = b.y + brickHeight(b.type);
        const studs = !b.type.startsWith('tile');
        const now = col.get(k);
        if (!now || t > now[0] || (t === now[0] && !now[1])) col.set(k, [t, studs]);
      }
  }
  const pool = cells.filter(([, , , st]) => st >= minSteps && st <= 80).sort((a, b) => a[3] - b[3]);
  for (const [x, , z] of pool.slice(0, 900))
    for (const rot of [0, 1]) {
      const [w, d] = rot ? [def.footprint[1], def.footprint[0]] : def.footprint;
      if (skip.has(`${x},${z},${rot}`)) continue;
      // never on (or right beside) where the hero arrives
      if (spawns.some((p) => p[0] > x - 3 && p[0] < x + w + 3 && p[2] > z - 3 && p[2] < z + d + 3)) continue;
      let top = 0;
      let lo = Number.POSITIVE_INFINITY;
      const clear = new Set<string>();
      for (let i = 0; i < w; i++)
        for (let j = 0; j < d; j++) {
          const k = `${x + i},${z + j}`;
          const t = col.get(k)?.[0] ?? 0;
          top = Math.max(top, t);
          lo = Math.min(lo, t);
          for (const id of plants.get(k) ?? []) clear.add(id);
        }
      if (top - lo > 6) continue;
      let held = false;
      for (let i = 0; i < w && !held; i++)
        for (let j = 0; j < d && !held; j++) {
          const c = col.get(`${x + i},${z + j}`) ?? [0, true];
          if (c[0] === top && c[1]) held = true;
        }
      if (!held) continue;
      const cmds: Command[] = [
        ...(clear.size ? [{ type: 'instance.remove', payload: { map, instances: [...clear] } }] : []),
        { type: 'asset.place', payload: { map, asset: def.id, pos: [x, top, z], rot } },
      ];
      if (bus.dryRun(cmds).ok) return cmds;
    }
  return [];
}

/**
 * Places an asset made for a map where it leaves the hero room to walk: each try that walls off much of the land
 * the hero could reach (more than 40%) is taken back and the next spot is tried. Returns the commands that stayed.
 */
export function placeKeepingReach(
  store: ProjectStore,
  bus: CommandBus,
  map: string,
  def: Pick<Asset, 'id' | 'footprint'>,
  minSteps: number,
  tries = 12,
): Command[] {
  const before = reachable(store, map).cells.length;
  const skip = new Set<string>();
  for (let t = 0; t < tries; t++) {
    const cmds = clearedSpot(store, bus, map, def, minSteps, skip);
    if (!cmds.length) return [];
    const place = cmds.at(-1)!.payload as { pos: number[]; rot: number };
    if (!bus.execute(cmds, { source: 'user' }).ok) return [];
    if (reachable(store, map).cells.length >= before * 0.6) return cmds;
    bus.undo();
    skip.add(`${place.pos[0]},${place.pos[2]},${place.rot}`);
  }
  return [];
}
