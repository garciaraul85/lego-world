import { expandAsset } from '../../assets/expand';
import { expandInstances, maxBrickId } from '../../assets/instances';
import { type Brick, chunkKey } from '../../bricks/codec';
import { footprint } from '../../bricks/inspect';
import { brickHeight, MAX_BRICKS_PER_MAP, MapBricks } from '../../bricks/map-bricks';
import { type Id, newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { type Asset, type AssetInstance, BUILD_HALF, type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';
import { brickCount } from './assets';
import { MAX_ITEMS_PER_MAP } from './items';

/** P27 part 3b: most copies one scatter places */
export const MAX_SCATTER = 5000;

export type Scatter = {
  map: string;
  asset: string;
  /** studs: [x0, z0, x1, z1] */
  area: [number, number, number, number];
  count: number;
  seed?: number;
  /** turn each copy a random quarter turn (default true) */
  turn?: boolean;
};

/**
 * Where copies would go: on flat studded ground, clear of other copies, inside the area; as many as fit, up to
 * count. A column's ground is its highest brick, so a copy standing on it (all of its bricks are inside its
 * footprint, above the ground) cannot overlap a brick, and stands on studs: the brick rules hold by construction.
 */
export function scatterPlan(store: ProjectStore, p: Scatter, def: Asset): AssetInstance[] {
  const x0 = Math.floor(Math.min(p.area[0], p.area[2]));
  const z0 = Math.floor(Math.min(p.area[1], p.area[3]));
  const x1 = Math.ceil(Math.max(p.area[0], p.area[2]));
  const z1 = Math.ceil(Math.max(p.area[1], p.area[3]));
  const W = x1 - x0 + 1;
  const D = z1 - z0 + 1;
  // the ground: each column's top (plates; negative: a tile, nothing stands on it), or none, or a copy is there
  const NONE = -32768;
  const BLOCKED = -32767;
  const top = new Int16Array(W * D).fill(NONE);
  const at = (x: number, z: number) => (x < x0 || x > x1 || z < z0 || z > z1 ? -1 : (x - x0) * D + (z - z0));
  const mark = (b: Brick, ground: boolean) => {
    const [w, d] = footprint(b);
    const h = b.y + brickHeight(b.type);
    const studs = ground && !b.type.startsWith('tile');
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const k = at(b.x + i, b.z + j);
        if (k < 0) continue;
        const cur = top[k]!;
        if (!ground) top[k] = BLOCKED;
        else if (cur !== BLOCKED && (cur === NONE || h >= Math.abs(cur))) top[k] = studs ? h : -h;
      }
  };
  const keys = new Set<string>();
  // and the chunks around (a brick can reach 8 studs into the next chunk)
  for (let x = Math.floor(x0 / 32) - 1; x <= Math.floor(x1 / 32) + 1; x++)
    for (let z = Math.floor(z0 / 32) - 1; z <= Math.floor(z1 / 32) + 1; z++) keys.add(`${x}_${z}`);
  const mb = new MapBricks(store, p.map);
  for (const k of keys) for (const b of mb.inChunk(k)) mark(b, true);
  for (const e of expandInstances(store, p.map))
    if (e.bricks.some((b) => keys.has(chunkKey(b.x, b.z)))) for (const b of e.bricks) mark(b, false);
  let seed = (p.seed ?? 1) >>> 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let next = maxBrickId(store, p.map) + 1;
  // no more copies than the map has room for (a map holds MAX_BRICKS_PER_MAP bricks, placed assets included)
  const count = Math.min(p.count, scatterRoom(store, p.map, def));
  const out: AssetInstance[] = [];
  for (let tries = 0; tries < count * 20 && out.length < count; tries++) {
    const rot = p.turn === false ? 0 : Math.floor(random() * 4);
    const [w, d] = rot % 2 ? [def.footprint[1], def.footprint[0]] : def.footprint;
    const x = Math.floor(x0 + random() * Math.max(1, x1 - x0 + 1 - w));
    const z = Math.floor(z0 + random() * Math.max(1, z1 - z0 + 1 - d));
    const k0 = at(x, z);
    const h = k0 < 0 ? -1 : top[k0]!;
    if (h < 1) continue;
    let flat = true;
    for (let i = 0; i < w && flat; i++)
      for (let j = 0; j < d && flat; j++) if (at(x + i, z + j) < 0 || top[at(x + i, z + j)] !== h) flat = false;
    if (!flat) continue;
    const inst: AssetInstance = {
      id: newId('instance') as Id<'instance'>,
      kind: 'asset',
      asset: def.id,
      pos: [x, h, z],
      rot,
      idBase: next,
    };
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) top[at(x + i, z + j)] = BLOCKED;
    out.push(inst);
    next += def.bricks.length;
  }
  return out;
}

/** how many more copies of an asset fit on a map's brick budget */
export const scatterRoom = (store: ProjectStore, map: string, def: Asset): number =>
  Math.max(0, Math.floor((MAX_BRICKS_PER_MAP - brickCount(store, map)) / Math.max(1, def.bricks.length)));

/** an asset stands on the ground: some of its bricks are at its bottom, inside its footprint */
function stands(def: Asset): boolean {
  const e = expandAsset(def, { pos: [0, 0, 0], rot: 0, idBase: 1 });
  return (
    e.bricks.some((b) => b.y === 0) &&
    e.bricks.every((b) => {
      const [w, d] = footprint(b);
      return b.x >= 0 && b.z >= 0 && b.x + w <= def.footprint[0] && b.z + d <= def.footprint[1];
    })
  );
}

/** P27 part 3b: many copies of an asset at once across an area (a forest, a field of flowers), one undo step */
export const scatterAsset: CommandHandler<Scatter> = {
  label: (p) => `Scatter ${p.count} copies`,
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    const def = store.get<Asset>(paths.asset(p.asset));
    if (!def) return 'That asset does not exist in this project.';
    if (def.parts?.some((x) => x.pose) || !stands(def))
      return `${def.name} can’t be scattered: place it one at a time.`;
    if (!Number.isInteger(p.count) || p.count < 1 || p.count > MAX_SCATTER)
      return `Scatter 1 to ${MAX_SCATTER.toLocaleString('en-US')} copies at a time.`;
    if (p.area.length !== 4 || p.area.some((v) => !Number.isFinite(v) || Math.abs(v) > BUILD_HALF))
      return 'The area is outside the build area.';
    const items = store.get<Instances>(paths.instances(p.map))?.items ?? [];
    if (items.filter((i) => i.kind === 'asset').length + p.count > MAX_ITEMS_PER_MAP)
      return `A map holds at most ${MAX_ITEMS_PER_MAP.toLocaleString('en-US')} placed assets.`;
    if (scatterRoom(store, p.map, def) < 1)
      return `The map is full: it holds ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')} bricks, and ${def.name} would go over.`;
    return null;
  },
  apply(store, p) {
    const def = store.get<Asset>(paths.asset(p.asset))!;
    const add = scatterPlan(store, p, def);
    if (!add.length) throw new Error('There is no flat, free ground in that area for this asset.');
    const cur = store.get<Instances>(paths.instances(p.map)) ?? { npcsSaved: false, items: [] };
    // standing on the ground's top, inside their footprints: the brick rules hold without a check of the area
    store.put(paths.instances(p.map), { ...cur, items: [...cur.items, ...add] });
  },
};
