import type { Brick } from '../bricks/codec';
import { type Asset, type AssetInstance, BRICK_STRIDE, type Chunk, chunkRows, type Instances, paths } from '../schema';
import { expandAsset, type WorldSocket } from './expand';

/** Read access to project files (a ProjectStore, a snapshot or a migrate() file map). */
export type FileSource = { get(path: string): unknown; keys(): Iterable<string> };
type Source = Pick<FileSource, 'get'> & { list?(prefix: string): string[]; keys?(): Iterable<string> };

export const assetInstances = (files: Pick<FileSource, 'get'>, mapId: string): AssetInstance[] =>
  ((files.get(paths.instances(mapId)) as Instances | undefined)?.items ?? []).filter(
    (i): i is AssetInstance => i.kind === 'asset',
  );

export type ExpandedInstance = { inst: AssetInstance; def: Asset; bricks: Brick[]; sockets: WorldSocket[] };

/**
 * P27 part 3b: expansions kept per placed copy. Project files never change in place (a change is a new
 * object), so a copy whose instance and asset objects are the same as last time expands to the same bricks.
 */
const expanded = new WeakMap<AssetInstance, { def: Asset; bricks: Brick[]; sockets: WorldSocket[] }>();

function expandCached(def: Asset, inst: AssetInstance): { bricks: Brick[]; sockets: WorldSocket[] } {
  const hit = expanded.get(inst);
  if (hit && hit.def === def) return hit;
  const e = expandAsset(def, inst);
  // shared between callers: nothing may change them
  for (const b of e.bricks) Object.freeze(b);
  Object.freeze(e.bricks);
  const entry = { def, ...e };
  if (Object.isFrozen(inst)) expanded.set(inst, entry);
  return entry;
}

/** Every asset instance of a map expanded into world bricks (instances whose asset is missing are skipped). */
export function expandInstances(files: Pick<FileSource, 'get'>, mapId: string): ExpandedInstance[] {
  const out: ExpandedInstance[] = [];
  for (const inst of assetInstances(files, mapId)) {
    const def = files.get(paths.asset(inst.asset)) as Asset | undefined;
    if (!def) continue;
    const e = expandCached(def, inst);
    out.push({ inst, def, bricks: e.bricks, sockets: e.sockets });
  }
  return out;
}

export const instanceBricks = (files: Pick<FileSource, 'get'>, mapId: string): Brick[] =>
  expandInstances(files, mapId).flatMap((e) => e.bricks);

/** Highest brick id the map uses (chunk bricks and every id range an instance reserves). */
export function maxBrickId(files: Source, mapId: string): number {
  let max = 0;
  const prefix = paths.chunkDir(mapId);
  const chunkPaths = files.list ? files.list(prefix) : [...(files.keys?.() ?? [])].filter((p) => p.startsWith(prefix));
  for (const p of chunkPaths) {
    const rows = chunkRows(files.get(p) as Chunk);
    for (let o = 7; o < rows.length; o += BRICK_STRIDE) if (rows[o]! > max) max = rows[o]!;
  }
  for (const inst of assetInstances(files, mapId)) {
    const def = files.get(paths.asset(inst.asset)) as Asset | undefined;
    max = Math.max(max, inst.idBase + (def?.bricks.length ?? 1) - 1);
  }
  return max;
}

/** Brick id -> the instance that owns it. */
export function instanceOwners(files: Pick<FileSource, 'get'>, mapId: string): Map<number, AssetInstance> {
  const out = new Map<number, AssetInstance>();
  for (const e of expandInstances(files, mapId)) for (const b of e.bricks) out.set(b.id, e.inst);
  return out;
}
