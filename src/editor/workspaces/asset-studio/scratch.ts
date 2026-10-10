import { expandAsset, visibleBricks } from '../../../core/assets/expand';
import { type Brick, encodeChunks } from '../../../core/bricks/codec';
import { footprint } from '../../../core/bricks/inspect';
import { newProjectFiles } from '../../../core/project/new-project';
import type { Asset, AssetBrick, MapDoc } from '../../../core/schema';
import { paths } from '../../../core/schema';

export type Scratch = {
  files: Map<string, unknown>;
  mapId: string;
  /** bricks of other states (not on the studio's build plate), by asset index */
  hidden: { index: number; brick: AssetBrick; type: string; color: string }[];
};

/**
 * The Asset studio edits an asset on its own little build plate: a scratch project whose one map holds
 * the asset's bricks visible in `state`, at the origin, with brick id = asset index + 1.
 */
export function scratchFor(def: Asset, state: string): Scratch {
  let n = 0;
  const files = newProjectFiles({
    name: 'Asset studio',
    mapName: def.name,
    random: () => {
      n = (n * 9301 + 49297) % 233280;
      return n / 233280;
    },
  });
  const project = files.get(paths.project) as { entry: { map: string } };
  const mapId = project.entry.map;
  const bricks = expandAsset(def, { pos: [0, 0, 0], rot: 0, idBase: 1, state }).bricks.map((b) => {
    const { group: _g, ...rest } = b;
    return rest as Brick;
  });
  for (const [key, chunk] of encodeChunks(bricks)) {
    const [cx, cz] = key.split('_').map(Number) as [number, number];
    files.set(paths.chunk(mapId, cx, cz), chunk);
  }
  const map = files.get(paths.map(mapId)) as MapDoc;
  // the studio plate: no spawn markers to trip over (sockets are drawn instead)
  files.set(paths.map(mapId), { ...map, spawns: map.spawns.map((s) => ({ ...s, pos: [0, -50, 0] })) });
  const shown = new Set(visibleBricks(def, state));
  const hidden = def.bricks.flatMap((b, index) =>
    shown.has(index) ? [] : [{ index, brick: b, type: def.palette.types[b[0]]!, color: def.palette.colors[b[5]]! }],
  );
  return { files, mapId, hidden };
}

/**
 * The asset after studio edits: original bricks keep their order (so placed copies keep their brick
 * ids and state lists stay right), removed ones drop out, new ones are appended. New bricks belong to
 * every state unless `newOnlyIn` names the state they were built in.
 */
export function assetFromScratch(
  def: Asset,
  studio: Brick[],
  hidden: Scratch['hidden'],
  newOnlyIn: string | null,
): Asset {
  const byIndex = new Map<number, Brick>();
  const added: Brick[] = [];
  for (const b of [...studio].sort((x, y) => x.id - y.id)) {
    const index = b.id - 1;
    if (index >= 0 && index < def.bricks.length && !hidden.some((h) => h.index === index)) byIndex.set(index, b);
    else added.push(b);
  }
  const hiddenAt = new Map(hidden.map((h) => [h.index, h]));
  const types: string[] = [];
  const colors: string[] = [];
  const ix = (arr: string[], v: string) => {
    const i = arr.indexOf(v);
    return i >= 0 ? i : arr.push(v) - 1;
  };
  const out: AssetBrick[] = [];
  const remap = new Map<number, number>();
  for (let i = 0; i < def.bricks.length; i++) {
    const h = hiddenAt.get(i);
    const b = byIndex.get(i);
    if (h) {
      remap.set(i, out.length);
      out.push([ix(types, h.type), h.brick[1], h.brick[2], h.brick[3], h.brick[4], ix(colors, h.color), h.brick[6]]);
    } else if (b) {
      remap.set(i, out.length);
      out.push([ix(types, b.type), b.x, b.y, b.z, b.rot, ix(colors, b.color.toLowerCase()), b.flags & 15]);
    }
  }
  const fresh: number[] = [];
  for (const b of added) {
    fresh.push(out.length);
    out.push([ix(types, b.type), b.x, b.y, b.z, b.rot, ix(colors, b.color.toLowerCase()), b.flags & 15]);
  }
  const onlyIn: Record<string, number[]> = {};
  for (const [state, list] of Object.entries(def.onlyIn ?? {})) {
    const next = list.flatMap((i) => (remap.has(i) ? [remap.get(i)!] : []));
    if (next.length) onlyIn[state] = next;
  }
  if (newOnlyIn && fresh.length) onlyIn[newOnlyIn] = [...(onlyIn[newOnlyIn] ?? []), ...fresh];
  let fw = 1;
  let fd = 1;
  for (const t of out) {
    const [w, d] = footprint({ type: types[t[0]]!, rot: t[4] });
    fw = Math.max(fw, t[1] + w);
    fd = Math.max(fd, t[3] + d);
  }
  const { onlyIn: _old, ...rest } = def;
  return {
    ...rest,
    bricks: out,
    palette: { types, colors },
    footprint: [fw, fd],
    ...(Object.keys(onlyIn).length ? { onlyIn } : {}),
  };
}
