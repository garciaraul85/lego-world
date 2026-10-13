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

/** Studio brick id -> asset brick index, for the bricks the plate started with (id = index + 1). */
export const initialIndex = (def: Asset, hidden: Scratch['hidden']) => {
  const hiddenSet = new Set(hidden.map((h) => h.index));
  return new Map(def.bricks.flatMap((_, i) => (hiddenSet.has(i) ? [] : [[i + 1, i] as [number, number]])));
};

/**
 * The asset after studio edits: original bricks keep their order (so placed copies keep their brick
 * ids and state lists stay right), removed ones drop out, new ones are appended. New bricks belong to
 * every state unless `newOnlyIn` names the state they were built in. Also returns the updated
 * plate-id -> index table and hidden list, so the plate can keep editing without reloading.
 */
export function assetFromScratch(
  def: Asset,
  studio: Brick[],
  hidden: Scratch['hidden'],
  indexOf: Map<number, number>,
  newOnlyIn: string | null,
): { asset: Asset; hidden: Scratch['hidden']; indexOf: Map<number, number> } {
  const byIndex = new Map<number, Brick>();
  const added: Brick[] = [];
  for (const b of [...studio].sort((x, y) => x.id - y.id)) {
    const index = indexOf.get(b.id);
    if (index !== undefined) byIndex.set(index, b);
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
  const nextIndex = new Map<number, number>();
  const nextHidden: Scratch['hidden'] = [];
  for (let i = 0; i < def.bricks.length; i++) {
    const h = hiddenAt.get(i);
    const b = byIndex.get(i);
    if (h) {
      remap.set(i, out.length);
      nextHidden.push({ ...h, index: out.length });
      out.push([ix(types, h.type), h.brick[1], h.brick[2], h.brick[3], h.brick[4], ix(colors, h.color), h.brick[6]]);
    } else if (b) {
      remap.set(i, out.length);
      nextIndex.set(b.id, out.length);
      out.push([ix(types, b.type), b.x, b.y, b.z, b.rot, ix(colors, b.color.toLowerCase()), b.flags & 15]);
    }
  }
  const fresh: number[] = [];
  for (const b of added) {
    fresh.push(out.length);
    nextIndex.set(b.id, out.length);
    out.push([ix(types, b.type), b.x, b.y, b.z, b.rot, ix(colors, b.color.toLowerCase()), b.flags & 15]);
  }
  const onlyIn: Record<string, number[]> = {};
  for (const [state, list] of Object.entries(def.onlyIn ?? {})) {
    const next = list.flatMap((i) => (remap.has(i) ? [remap.get(i)!] : []));
    if (next.length) onlyIn[state] = next;
  }
  if (newOnlyIn && fresh.length) onlyIn[newOnlyIn] = [...(onlyIn[newOnlyIn] ?? []), ...fresh];
  // turned parts follow their bricks; a part whose bricks are all gone goes too
  const parts = (def.parts ?? []).flatMap((p) => {
    const next = p.bricks.flatMap((i) => (remap.has(i) ? [remap.get(i)!] : []));
    return next.length ? [{ ...p, bricks: next }] : [];
  });
  let fw = 1;
  let fd = 1;
  for (const t of out) {
    const [w, d] = footprint({ type: types[t[0]]!, rot: t[4] });
    fw = Math.max(fw, t[1] + w);
    fd = Math.max(fd, t[3] + d);
  }
  const { onlyIn: _old, parts: _parts, ...rest } = def;
  return {
    asset: {
      ...rest,
      bricks: out,
      palette: { types, colors },
      footprint: [fw, fd],
      ...(Object.keys(onlyIn).length ? { onlyIn } : {}),
      ...(parts.length ? { parts } : {}),
    },
    hidden: nextHidden,
    indexOf: nextIndex,
  };
}

/**
 * P32: `other` built into `def` (a copy of its bricks as it looks in its starting state, turned `rot` quarter
 * turns, its corner at `at` in `def`'s own studs and plates). Its turned parts come along; its sockets and
 * interactions stay with the original. The same result as dropping it on the build plate.
 */
export function buildInto(def: Asset, other: Asset, at: [number, number, number], rot = 0): Asset {
  const shown = expandAsset(other, { pos: at, rot, idBase: 0 }).bricks;
  const types = [...def.palette.types];
  const colors = [...def.palette.colors];
  const ix = (arr: string[], v: string) => {
    const i = arr.indexOf(v);
    return i >= 0 ? i : arr.push(v) - 1;
  };
  const indexOf = new Map<number, number>();
  const added: AssetBrick[] = shown.map((b, k) => {
    indexOf.set(b.id, def.bricks.length + k);
    return [ix(types, b.type), b.x, b.y, b.z, b.rot, ix(colors, b.color.toLowerCase()), b.flags & 15];
  });
  const bricks = [...def.bricks, ...added];
  let fw = def.footprint[0];
  let fd = def.footprint[1];
  for (const t of added) {
    const [w, d] = footprint({ type: types[t[0]]!, rot: t[4] });
    fw = Math.max(fw, t[1] + w);
    fd = Math.max(fd, t[3] + d);
  }
  const parts = (other.parts ?? []).flatMap((p) => {
    const list = p.bricks.flatMap((i) => (indexOf.has(i) ? [indexOf.get(i)!] : []));
    if (!list.length) return [];
    return [{ name: `${other.name} · ${p.name}`, bricks: list, ...turnPart(p, rot) }];
  });
  const allParts = [...(def.parts ?? []), ...parts];
  return {
    ...def,
    bricks,
    palette: { types, colors },
    footprint: [fw, fd],
    ...(allParts.length ? { parts: allParts } : {}),
  };
}

type V3 = [number, number, number];
/**
 * A part's turn and size after the asset it is in is turned `rot` quarter turns about the up axis (exact for a
 * part turned about one axis).
 */
export function turnPart(p: { tilt?: number[] | undefined; scale?: number[] | undefined }, rot: number) {
  let tilt = p.tilt ? ([...p.tilt] as V3) : undefined;
  let scale = p.scale ? ([...p.scale] as V3) : undefined;
  for (let r = 0; r < rot; r++) {
    if (tilt) tilt = [tilt[2] ? -tilt[2] : 0, tilt[1], tilt[0]];
    if (scale) scale = [scale[2], scale[1], scale[0]];
  }
  return { ...(tilt ? { tilt } : {}), ...(scale ? { scale } : {}) };
}
