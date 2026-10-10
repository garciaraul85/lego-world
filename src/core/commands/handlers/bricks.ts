import { expandAsset } from '../../assets/expand';
import { type ExpandedInstance, expandInstances, maxBrickId } from '../../assets/instances';
import { type Brick, chunkKey } from '../../bricks/codec';
import { brickError, MAX_BRICKS_PER_MAP, MapBricks } from '../../bricks/map-bricks';
import type { ProjectStore } from '../../project/store';
import { type AssetInstance, type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';
import { allBricks, assertMapLayout } from './assets';

export type NewBrick = Omit<Brick, 'id' | 'flags'> & { flags?: number; id?: number };
export type PlaceBricks = { map: string; bricks: NewBrick[] };
export type BrickIds = { map: string; ids: number[] };
export type MoveBricks = BrickIds & { dx: number; dy: number; dz: number; drot?: number };
export type PaintBricks = BrickIds & { color: string };

/** Throws (rolling the transaction back) if the map's bricks no longer form a valid v68 build. */
const assertLayout = assertMapLayout;

/**
 * Splits brick ids into loose (chunk) bricks and whole asset instances. A command may act on an asset
 * instance only as a whole: listing part of one is an error that says how to edit single bricks.
 */
function classify(store: ProjectStore, map: string, ids: number[]) {
  const exp = expandInstances(store, map);
  const owner = new Map<number, ExpandedInstance>();
  for (const e of exp) for (const b of e.bricks) owner.set(b.id, e);
  const loose: number[] = [];
  const touched = new Map<ExpandedInstance, number>();
  for (const id of ids) {
    const e = owner.get(id);
    if (!e) loose.push(id);
    else touched.set(e, (touched.get(e) ?? 0) + 1);
  }
  const whole: ExpandedInstance[] = [];
  for (const [e, n] of touched) {
    if (n !== e.bricks.length)
      return {
        error: `Those bricks are part of the asset “${e.def.name}”. Select the whole asset, or Unpack it to edit single bricks.`,
        loose,
        whole,
      };
    whole.push(e);
  }
  return { error: null, loose, whole };
}

function setInstances(store: ProjectStore, map: string, fn: (i: AssetInstance) => AssetInstance | null) {
  const cur = store.get<Instances>(paths.instances(map)) ?? { npcsSaved: false, items: [] };
  store.put(paths.instances(map), {
    ...cur,
    items: cur.items.flatMap((i): Instances['items'] => {
      if (i.kind !== 'asset') return [i];
      const n = fn(i);
      return n ? [n] : [];
    }),
  });
}

const mapMissing = (store: ProjectStore, map: string) =>
  store.has(paths.map(map)) ? null : `Map ${map} does not exist.`;

function missingIds(store: ProjectStore, map: string, ids: number[]): string | null {
  if (!ids.length) return 'No bricks given.';
  if (new Set(ids).size !== ids.length) return 'A brick id is listed twice.';
  const all = new Set(allBricks(store, map).map((b) => b.id));
  const missing = ids.filter((id) => !all.has(id));
  return missing.length ? `Brick ${missing.slice(0, 5).join(', ')} not found.` : null;
}

/** Applies fn to the listed bricks, rewriting only the chunks they leave or enter. */
function editBricks(store: ProjectStore, map: string, ids: number[], fn: (b: Brick) => Brick | null) {
  const mb = new MapBricks(store, map);
  const where = mb.locate(ids);
  const keys = new Set(where.values());
  const want = new Set(ids);
  const changed: Brick[] = [];
  const kept: Brick[] = [];
  for (const key of keys) {
    for (const b of mb.inChunk(key)) {
      if (!want.has(b.id)) kept.push(b);
      else {
        const nb = fn(b);
        if (nb) changed.push(nb);
      }
    }
  }
  for (const b of changed) {
    const k = chunkKey(b.x, b.z);
    if (!keys.has(k)) {
      keys.add(k);
      kept.push(...mb.inChunk(k));
    }
  }
  mb.write(keys, [...kept, ...changed]);
}

export const placeBricks: CommandHandler<PlaceBricks> = {
  label: (p) => (p.bricks.length === 1 ? `Place ${p.bricks[0]!.type}` : `Place ${p.bricks.length} bricks`),
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    if (!p.bricks.length) return 'No bricks given.';
    for (const b of p.bricks) {
      const err = brickError({ ...b, flags: b.flags ?? 0 });
      if (err) return err;
    }
    const mb = new MapBricks(store, p.map);
    if (allBricks(store, p.map).length + p.bricks.length > MAX_BRICKS_PER_MAP)
      return `A map can hold ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')} bricks.`;
    const given = p.bricks.flatMap((b) => (b.id === undefined ? [] : [b.id]));
    if (new Set(given).size !== given.length) return 'A brick id is listed twice.';
    if (given.length && allBricks(store, p.map).some((b) => given.includes(b.id)))
      return 'A brick with that id already exists.';
    return null;
  },
  apply(store, p) {
    const mb = new MapBricks(store, p.map);
    let next = Math.max(maxBrickId(store, p.map), ...p.bricks.map((b) => b.id ?? 0)) + 1;
    const added: Brick[] = p.bricks.map((b) => ({ ...b, flags: b.flags ?? 0, id: b.id ?? next++ }));
    const keys = new Set(added.map((b) => chunkKey(b.x, b.z)));
    const existing = [...keys].flatMap((k) => mb.inChunk(k));
    mb.write(keys, [...existing, ...added]);
    assertLayout(store, p.map);
  },
};

export const removeBricks: CommandHandler<BrickIds> = {
  label: (p) => (p.ids.length === 1 ? 'Remove brick' : `Remove ${p.ids.length} bricks`),
  validate: (store, p) =>
    mapMissing(store, p.map) ?? missingIds(store, p.map, p.ids) ?? classify(store, p.map, p.ids).error,
  apply: (store, p) => {
    const c = classify(store, p.map, p.ids);
    editBricks(store, p.map, c.loose, () => null);
    const gone = new Set(c.whole.map((e) => e.inst.id));
    if (gone.size) setInstances(store, p.map, (i) => (gone.has(i.id) ? null : i));
    assertLayout(store, p.map);
  },
};

export const moveBricks: CommandHandler<MoveBricks> = {
  label: (p) => (p.ids.length === 1 ? 'Move brick' : `Move ${p.ids.length} bricks`),
  validate(store, p) {
    const e = mapMissing(store, p.map) ?? missingIds(store, p.map, p.ids) ?? classify(store, p.map, p.ids).error;
    if (e) return e;
    if (![p.dx, p.dy, p.dz, p.drot ?? 0].every(Number.isInteger)) return 'Moves are whole studs and plates.';
    const want = new Set(p.ids);
    for (const b of allBricks(store, p.map)) {
      if (!want.has(b.id)) continue;
      const err = brickError({
        ...b,
        x: b.x + p.dx,
        y: b.y + p.dy,
        z: b.z + p.dz,
        rot: (((b.rot + (p.drot ?? 0)) % 4) + 4) % 4,
      });
      if (err) return err;
    }
    return null;
  },
  apply: (store, p) => {
    const c = classify(store, p.map, p.ids);
    editBricks(store, p.map, c.loose, (b) => ({
      ...b,
      x: b.x + p.dx,
      y: b.y + p.dy,
      z: b.z + p.dz,
      rot: (((b.rot + (p.drot ?? 0)) % 4) + 4) % 4,
    }));
    const moved = new Set(c.whole.map((e) => e.inst.id));
    if (moved.size)
      setInstances(store, p.map, (i) =>
        moved.has(i.id)
          ? {
              ...i,
              pos: [i.pos[0] + p.dx, i.pos[1] + p.dy, i.pos[2] + p.dz],
              rot: (((i.rot + (p.drot ?? 0)) % 4) + 4) % 4,
            }
          : i,
      );
    assertLayout(store, p.map);
  },
};

export const paintBricks: CommandHandler<PaintBricks> = {
  label: (p) => (p.ids.length === 1 ? 'Paint brick' : `Paint ${p.ids.length} bricks`),
  validate: (store, p) =>
    mapMissing(store, p.map) ??
    (/^#[0-9a-f]{6}$/i.test(p.color) ? null : 'Color must be #rrggbb.') ??
    missingIds(store, p.map, p.ids) ??
    (classify(store, p.map, p.ids).whole.length || classify(store, p.map, p.ids).error
      ? 'Assets are recolored in the Asset studio. Unpack the asset to paint single bricks.'
      : null),
  apply: (store, p) => editBricks(store, p.map, p.ids, (b) => ({ ...b, color: p.color.toLowerCase() })),
};

export type UpdateBricks = { map: string; bricks: Array<Partial<Omit<Brick, 'id'>> & { id: number }> };

/** Sets fields of existing bricks (position, rotation, type, color, group). Used for group rotate and drag-move. */
export const updateBricks: CommandHandler<UpdateBricks> = {
  label: (p) => (p.bricks.length === 1 ? 'Edit brick' : `Edit ${p.bricks.length} bricks`),
  validate(store, p) {
    const ids = p.bricks.map((b) => b.id);
    const e = mapMissing(store, p.map) ?? missingIds(store, p.map, ids) ?? classify(store, p.map, ids).error;
    if (e) return e;
    const byId = new Map(allBricks(store, p.map).map((b) => [b.id, b]));
    for (const u of p.bricks) {
      const err = brickError({ ...byId.get(u.id)!, ...u });
      if (err) return err;
    }
    const patch = new Map(p.bricks.map((b) => [b.id, b]));
    for (const w of classify(store, p.map, ids).whole)
      if (!instanceFromBricks(w, patch))
        return `The asset “${w.def.name}” can only be moved or turned as a whole. Unpack it to reshape it.`;
    return null;
  },
  apply(store, p) {
    const patch = new Map(p.bricks.map((b) => [b.id, b]));
    const c = classify(store, p.map, [...patch.keys()]);
    const next = new Map(c.whole.map((w) => [w.inst.id, instanceFromBricks(w, patch)!]));
    if (next.size) setInstances(store, p.map, (i) => next.get(i.id) ?? i);
    editBricks(store, p.map, c.loose, (b) => {
      const u = patch.get(b.id)!;
      const next = { ...b, ...u, id: b.id };
      if (u.color) next.color = u.color.toLowerCase();
      return next;
    });
    assertLayout(store, p.map);
  },
};

/** The instance placement that produces exactly the patched bricks, or null if the patch reshapes the asset. */
function instanceFromBricks(
  w: ExpandedInstance,
  patch: Map<number, Partial<Omit<Brick, 'id'>> & { id: number }>,
): AssetInstance | null {
  const target = w.bricks.map((b) => ({ ...b, ...patch.get(b.id), id: b.id }));
  const first = target[0]!;
  const k = (((first.rot - w.bricks[0]!.rot) % 4) + 4) % 4;
  const rot = (w.inst.rot + k) % 4;
  const at0 = expandAsset(w.def, { ...w.inst, rot, pos: [0, 0, 0] }).bricks;
  const pos: [number, number, number] = [first.x - at0[0]!.x, first.y - at0[0]!.y, first.z - at0[0]!.z];
  const got = expandAsset(w.def, { ...w.inst, rot, pos }).bricks;
  const same = got.every((b, i) => {
    const t = target[i]!;
    return (
      b.x === t.x &&
      b.y === t.y &&
      b.z === t.z &&
      b.rot === t.rot &&
      b.type === t.type &&
      b.color === t.color.toLowerCase()
    );
  });
  return same ? { ...w.inst, rot, pos } : null;
}
