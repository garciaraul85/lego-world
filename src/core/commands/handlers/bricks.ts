import { type Brick, chunkKey } from '../../bricks/codec';
import { inspectBricks } from '../../bricks/inspect';
import { brickError, MAX_BRICKS_PER_MAP, MapBricks } from '../../bricks/map-bricks';
import type { ProjectStore } from '../../project/store';
import { paths } from '../../schema';
import type { CommandHandler } from '../types';

export type NewBrick = Omit<Brick, 'id' | 'flags'> & { flags?: number; id?: number };
export type PlaceBricks = { map: string; bricks: NewBrick[] };
export type BrickIds = { map: string; ids: number[] };
export type MoveBricks = BrickIds & { dx: number; dy: number; dz: number; drot?: number };
export type PaintBricks = BrickIds & { color: string };

/** Throws (rolling the transaction back) if the map's bricks no longer form a valid v68 build. */
function assertLayout(store: ProjectStore, map: string) {
  const check = inspectBricks(new MapBricks(store, map).all());
  if (!check.ok) throw new Error(check.reason);
}

const mapMissing = (store: ProjectStore, map: string) =>
  store.has(paths.map(map)) ? null : `Map ${map} does not exist.`;

function missingIds(mb: MapBricks, ids: number[]): string | null {
  if (!ids.length) return 'No bricks given.';
  if (new Set(ids).size !== ids.length) return 'A brick id is listed twice.';
  const found = mb.locate(ids);
  const missing = ids.filter((id) => !found.has(id));
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
    if (mb.count() + p.bricks.length > MAX_BRICKS_PER_MAP)
      return `A map can hold ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')} bricks.`;
    const given = p.bricks.flatMap((b) => (b.id === undefined ? [] : [b.id]));
    if (new Set(given).size !== given.length) return 'A brick id is listed twice.';
    if (given.length && mb.locate(given).size) return 'A brick with that id already exists.';
    return null;
  },
  apply(store, p) {
    const mb = new MapBricks(store, p.map);
    let next = Math.max(mb.maxId(), ...p.bricks.map((b) => b.id ?? 0)) + 1;
    const added: Brick[] = p.bricks.map((b) => ({ ...b, flags: b.flags ?? 0, id: b.id ?? next++ }));
    const keys = new Set(added.map((b) => chunkKey(b.x, b.z)));
    const existing = [...keys].flatMap((k) => mb.inChunk(k));
    mb.write(keys, [...existing, ...added]);
    assertLayout(store, p.map);
  },
};

export const removeBricks: CommandHandler<BrickIds> = {
  label: (p) => (p.ids.length === 1 ? 'Remove brick' : `Remove ${p.ids.length} bricks`),
  validate: (store, p) => mapMissing(store, p.map) ?? missingIds(new MapBricks(store, p.map), p.ids),
  apply: (store, p) => {
    editBricks(store, p.map, p.ids, () => null);
    assertLayout(store, p.map);
  },
};

export const moveBricks: CommandHandler<MoveBricks> = {
  label: (p) => (p.ids.length === 1 ? 'Move brick' : `Move ${p.ids.length} bricks`),
  validate(store, p) {
    const e = mapMissing(store, p.map) ?? missingIds(new MapBricks(store, p.map), p.ids);
    if (e) return e;
    if (![p.dx, p.dy, p.dz, p.drot ?? 0].every(Number.isInteger)) return 'Moves are whole studs and plates.';
    const want = new Set(p.ids);
    for (const b of new MapBricks(store, p.map).all()) {
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
    editBricks(store, p.map, p.ids, (b) => ({
      ...b,
      x: b.x + p.dx,
      y: b.y + p.dy,
      z: b.z + p.dz,
      rot: (((b.rot + (p.drot ?? 0)) % 4) + 4) % 4,
    }));
    assertLayout(store, p.map);
  },
};

export const paintBricks: CommandHandler<PaintBricks> = {
  label: (p) => (p.ids.length === 1 ? 'Paint brick' : `Paint ${p.ids.length} bricks`),
  validate: (store, p) =>
    mapMissing(store, p.map) ??
    (/^#[0-9a-f]{6}$/i.test(p.color) ? null : 'Color must be #rrggbb.') ??
    missingIds(new MapBricks(store, p.map), p.ids),
  apply: (store, p) => editBricks(store, p.map, p.ids, (b) => ({ ...b, color: p.color.toLowerCase() })),
};

export type UpdateBricks = { map: string; bricks: Array<Partial<Omit<Brick, 'id'>> & { id: number }> };

/** Sets fields of existing bricks (position, rotation, type, color, group). Used for group rotate and drag-move. */
export const updateBricks: CommandHandler<UpdateBricks> = {
  label: (p) => (p.bricks.length === 1 ? 'Edit brick' : `Edit ${p.bricks.length} bricks`),
  validate(store, p) {
    const e =
      mapMissing(store, p.map) ??
      missingIds(
        new MapBricks(store, p.map),
        p.bricks.map((b) => b.id),
      );
    if (e) return e;
    const byId = new Map(new MapBricks(store, p.map).all().map((b) => [b.id, b]));
    for (const u of p.bricks) {
      const err = brickError({ ...byId.get(u.id)!, ...u });
      if (err) return err;
    }
    return null;
  },
  apply(store, p) {
    const patch = new Map(p.bricks.map((b) => [b.id, b]));
    editBricks(store, p.map, [...patch.keys()], (b) => {
      const u = patch.get(b.id)!;
      const next = { ...b, ...u, id: b.id };
      if (u.color) next.color = u.color.toLowerCase();
      return next;
    });
    assertLayout(store, p.map);
  },
};
