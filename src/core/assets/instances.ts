import type { Brick } from '../bricks/codec';
import { footprint } from '../bricks/inspect';
import { type Asset, type AssetInstance, BRICK_STRIDE, type Chunk, chunkRows, type Instances, paths } from '../schema';
import { expandAsset, type WorldSocket } from './expand';

/** Read access to project files (a ProjectStore, a snapshot or a migrate() file map). */
export type FileSource = { get(path: string): unknown; keys(): Iterable<string> };
type Source = Pick<FileSource, 'get'> & { list?(prefix: string): string[]; keys?(): Iterable<string> };

/** Milestone 2b: a map's asset copies, worked out once per instances file (files never change in place) */
const assetLists = new WeakMap<Instances, AssetInstance[]>();
export const assetInstances = (files: Pick<FileSource, 'get'>, mapId: string): AssetInstance[] =>
  assetItems(files.get(paths.instances(mapId)) as Instances | undefined);

/** the asset copies of an instances file */
export function assetItems(file: Instances | undefined): AssetInstance[] {
  if (!file) return [];
  let list = assetLists.get(file);
  if (!list) {
    list = file.items.filter((i): i is AssetInstance => i.kind === 'asset');
    if (Object.isFrozen(file)) assetLists.set(file, list);
  }
  return list;
}

export type ExpandedInstance = {
  inst: AssetInstance;
  def: Asset;
  bricks: Brick[];
  sockets: WorldSocket[];
  /** Milestone 2b: the studs its bricks cover on the ground plan, [x0, z0, x1, z1] (x1, z1 exclusive) */
  box?: readonly [number, number, number, number];
};

/**
 * P27 part 3b: expansions kept per placed copy. Project files never change in place (a change is a new
 * object), so a copy whose instance and asset objects are the same as last time expands to the same bricks.
 */
type Expansion = { def: Asset; bricks: Brick[]; sockets: WorldSocket[]; box: NonNullable<ExpandedInstance['box']> };
const expanded = new WeakMap<AssetInstance, Expansion>();

/** one copy's world bricks (kept per copy: the same copy and asset give the same bricks) */
export function expandCached(def: Asset, inst: AssetInstance): Expansion {
  const hit = expanded.get(inst);
  if (hit && hit.def === def) return hit;
  const e = expandAsset(def, inst);
  // shared between callers: nothing may change them
  let x0 = Number.POSITIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const b of e.bricks) {
    Object.freeze(b);
    const [w, d] = footprint(b);
    if (b.x < x0) x0 = b.x;
    if (b.z < z0) z0 = b.z;
    if (b.x + w > x1) x1 = b.x + w;
    if (b.z + d > z1) z1 = b.z + d;
  }
  Object.freeze(e.bricks);
  const box = (
    e.bricks.length ? [x0, z0, x1, z1] : [inst.pos[0], inst.pos[2], inst.pos[0], inst.pos[2]]
  ) as Expansion['box'];
  const entry = { def, ...e, box };
  if (Object.isFrozen(inst)) expanded.set(inst, entry);
  return entry;
}

/**
 * Milestone 2b: a whole map's expansion, kept per instances file while the assets it uses are the same objects.
 * A command asks several times (check, apply, the layout check); with 100,000 copies each walk costs.
 */
const mapExpansions = new WeakMap<Instances, { defs: Map<string, Asset | undefined>; out: ExpandedInstance[] }>();

/** Every asset instance of a map expanded into world bricks (instances whose asset is missing are skipped). */
export function expandInstances(files: Pick<FileSource, 'get'>, mapId: string): ExpandedInstance[] {
  const file = files.get(paths.instances(mapId)) as Instances | undefined;
  const hit = file && mapExpansions.get(file);
  if (hit) {
    let same = true;
    for (const [id, def] of hit.defs)
      if (files.get(paths.asset(id)) !== def) {
        same = false;
        break;
      }
    if (same) return hit.out;
  }
  const out: ExpandedInstance[] = [];
  const defs = new Map<string, Asset | undefined>();
  for (const inst of assetInstances(files, mapId)) {
    let def: Asset | undefined;
    if (defs.has(inst.asset)) def = defs.get(inst.asset);
    else {
      def = files.get(paths.asset(inst.asset)) as Asset | undefined;
      defs.set(inst.asset, def);
    }
    if (!def) continue;
    const e = expandCached(def, inst);
    out.push({ inst, def, bricks: e.bricks, sockets: e.sockets, box: e.box });
  }
  if (file && Object.isFrozen(file)) mapExpansions.set(file, { defs, out });
  return out;
}

export const instanceBricks = (files: Pick<FileSource, 'get'>, mapId: string): Brick[] =>
  expandInstances(files, mapId).flatMap((e) => e.bricks);

/** Milestone 2b: a chunk's highest brick id, worked out once per chunk file */
const chunkMax = new WeakMap<Chunk, number>();

/** Highest brick id the map uses (chunk bricks and every id range an instance reserves). */
export function maxBrickId(files: Source, mapId: string): number {
  let max = 0;
  const prefix = paths.chunkDir(mapId);
  const chunkPaths = files.list ? files.list(prefix) : [...(files.keys?.() ?? [])].filter((p) => p.startsWith(prefix));
  for (const p of chunkPaths) {
    const c = files.get(p) as Chunk;
    let m = chunkMax.get(c);
    if (m === undefined) {
      m = 0;
      const rows = chunkRows(c);
      for (let o = 7; o < rows.length; o += BRICK_STRIDE) if (rows[o]! > m) m = rows[o]!;
      if (Object.isFrozen(c)) chunkMax.set(c, m);
    }
    if (m > max) max = m;
  }
  const defs = new Map<string, number>();
  for (const inst of assetInstances(files, mapId)) {
    let n = defs.get(inst.asset);
    if (n === undefined) {
      n = (files.get(paths.asset(inst.asset)) as Asset | undefined)?.bricks.length ?? 1;
      defs.set(inst.asset, n);
    }
    const top = inst.idBase + n - 1;
    if (top > max) max = top;
  }
  return max;
}

/** Brick id -> the instance that owns it. */
export function instanceOwners(files: Pick<FileSource, 'get'>, mapId: string): Map<number, AssetInstance> {
  const out = new Map<number, AssetInstance>();
  for (const e of expandInstances(files, mapId)) for (const b of e.bricks) out.set(b.id, e.inst);
  return out;
}
