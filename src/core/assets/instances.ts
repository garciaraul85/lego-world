import type { Brick } from '../bricks/codec';
import type { FileSource } from '../bridge/legacy-bridge';
import { type Asset, type AssetInstance, type Chunk, type Instances, paths } from '../schema';
import { expandAsset, type WorldSocket } from './expand';

type Source = Pick<FileSource, 'get'> & { list?(prefix: string): string[]; keys?(): Iterable<string> };

export const assetInstances = (files: Pick<FileSource, 'get'>, mapId: string): AssetInstance[] =>
  ((files.get(paths.instances(mapId)) as Instances | undefined)?.items ?? []).filter(
    (i): i is AssetInstance => i.kind === 'asset',
  );

export type ExpandedInstance = { inst: AssetInstance; def: Asset; bricks: Brick[]; sockets: WorldSocket[] };

/** Every asset instance of a map expanded into world bricks (instances whose asset is missing are skipped). */
export function expandInstances(files: Pick<FileSource, 'get'>, mapId: string): ExpandedInstance[] {
  const out: ExpandedInstance[] = [];
  for (const inst of assetInstances(files, mapId)) {
    const def = files.get(paths.asset(inst.asset)) as Asset | undefined;
    if (!def) continue;
    out.push({ inst, def, ...expandAsset(def, inst) });
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
  for (const p of chunkPaths) for (const b of (files.get(p) as Chunk).bricks) if (b[7] > max) max = b[7];
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
