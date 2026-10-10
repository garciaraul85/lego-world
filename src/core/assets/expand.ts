import type { Brick } from '../bricks/codec';
import { footprint } from '../bricks/inspect';
import type { Asset, AssetBrick, AssetInstance, Socket } from '../schema';

export type InstanceLike = Pick<AssetInstance, 'pos' | 'rot' | 'idBase'> & {
  id?: string;
  state?: string | undefined;
  group?: string | undefined;
};
export type WorldSocket = Socket & { instance?: string | undefined; world: [number, number, number] };

/** "Autumn maple tree" -> "autumn-maple-tree" (group names follow v68's "house-3" style). */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'asset';

/** Default smash-group name of an instance's bricks. */
export const instanceGroup = (def: Pick<Asset, 'name'>, inst: InstanceLike) =>
  inst.group ?? `${slugify(def.name).slice(0, 80)}-${inst.idBase}`;

/** Footprint of the asset after `rot` quarter turns. */
export function rotatedFootprint(def: Pick<Asset, 'footprint'>, rot: number): [number, number] {
  const [w, d] = def.footprint;
  return rot % 2 ? [d, w] : [w, d];
}

/** Indexes of the asset's bricks visible in `state` (bricks listed under another state in onlyIn are hidden). */
export function visibleBricks(def: Pick<Asset, 'bricks' | 'onlyIn' | 'initialState'>, state?: string): number[] {
  const s = state ?? def.initialState;
  const only = def.onlyIn ?? {};
  const owner = new Map<number, string[]>();
  for (const [st, list] of Object.entries(only)) for (const i of list) owner.set(i, [...(owner.get(i) ?? []), st]);
  const out: number[] = [];
  for (let i = 0; i < def.bricks.length; i++) {
    const states = owner.get(i);
    if (!states || states.includes(s)) out.push(i);
  }
  return out;
}

/** One quarter turn of a footprint cell frame of size fd (depth before the turn). */
function turnBrick(x: number, z: number, w: number, d: number, fd: number) {
  return { x: fd - z - d, z: x, w: d, d: w };
}

/**
 * P3.1 expandAsset: an asset placed at `inst.pos` (studs, plates) turned `inst.rot` quarter turns
 * becomes world bricks (ids idBase + brick index) and world sockets.
 */
export function expandAsset(def: Asset, inst: InstanceLike): { bricks: Brick[]; sockets: WorldSocket[] } {
  const group = instanceGroup(def, inst);
  const rot = ((inst.rot % 4) + 4) % 4;
  const bricks: Brick[] = [];
  for (const i of visibleBricks(def, inst.state)) {
    const t = def.bricks[i]!;
    const type = def.palette.types[t[0]]!;
    let [w, d] = footprint({ type, rot: t[4] });
    let x = t[1];
    let z = t[3];
    let fw = def.footprint[0];
    let fd = def.footprint[1];
    for (let r = 0; r < rot; r++) {
      const n = turnBrick(x, z, w, d, fd);
      x = n.x;
      z = n.z;
      w = n.w;
      d = n.d;
      [fw, fd] = [fd, fw];
    }
    bricks.push({
      id: inst.idBase + i,
      type,
      x: inst.pos[0] + x,
      y: inst.pos[1] + t[2],
      z: inst.pos[2] + z,
      rot: (t[4] + rot) % 4,
      color: def.palette.colors[t[5]]!.toLowerCase(),
      flags: t[6],
      group,
    });
  }
  const sockets = def.sockets.map((s): WorldSocket => {
    let [x, y, z] = s.pos;
    let fd = def.footprint[1];
    let fw = def.footprint[0];
    for (let r = 0; r < rot; r++) {
      [x, z] = [fd - z, x];
      [fw, fd] = [fd, fw];
    }
    return { ...s, instance: inst.id, world: [inst.pos[0] + x, inst.pos[1] * 0.4 + y, inst.pos[2] + z] };
  });
  return { bricks, sockets };
}

/**
 * World bricks -> local asset bricks with their own palette, origin at the bricks' lowest corner.
 * The inverse of expandAsset for rot 0 (bricks keep their order, so idBase + i maps back).
 */
export function bricksToAsset(bricks: readonly Brick[]): {
  bricks: AssetBrick[];
  palette: Asset['palette'];
  footprint: [number, number];
  origin: [number, number, number];
} {
  if (!bricks.length) throw new Error('An asset needs at least one brick.');
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const b of bricks) {
    const [w, d] = footprint(b);
    x0 = Math.min(x0, b.x);
    z0 = Math.min(z0, b.z);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + w);
    z1 = Math.max(z1, b.z + d);
  }
  const types: string[] = [];
  const colors: string[] = [];
  const idx = (arr: string[], v: string) => {
    const i = arr.indexOf(v);
    return i >= 0 ? i : arr.push(v) - 1;
  };
  const out = bricks.map(
    (b): AssetBrick => [
      idx(types, b.type),
      b.x - x0,
      b.y - y0,
      b.z - z0,
      b.rot,
      idx(colors, b.color.toLowerCase()),
      b.flags & 15,
    ],
  );
  return { bricks: out, palette: { types, colors }, footprint: [x1 - x0, z1 - z0], origin: [x0, y0, z0] };
}

/** Canonical text of an asset's shape (bricks + palette), used to reuse identical assets. */
export function shapeKey(a: Pick<Asset, 'bricks' | 'palette'>): string {
  return JSON.stringify(a.bricks.map((b) => [a.palette.types[b[0]], b[1], b[2], b[3], b[4], a.palette.colors[b[5]]]));
}
