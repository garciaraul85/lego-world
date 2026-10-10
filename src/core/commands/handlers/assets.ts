import { bricksToAsset, expandAsset, type InstanceLike } from '../../assets/expand';
import { assetInstances, expandInstances, instanceBricks, maxBrickId } from '../../assets/instances';
import { type Brick, chunkKey } from '../../bricks/codec';
import { inspectBricks } from '../../bricks/inspect';
import { brickError, MAX_BRICKS_PER_MAP, MapBricks } from '../../bricks/map-bricks';
import { type Id, newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { Asset, type AssetInstance, type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';

const getInstances = (store: ProjectStore, map: string): Instances =>
  store.get<Instances>(paths.instances(map)) ?? { npcsSaved: false, items: [] };

/** Every brick of a map: chunk bricks plus expanded asset instances. */
export const allBricks = (store: ProjectStore, map: string): Brick[] => [
  ...new MapBricks(store, map).all(),
  ...instanceBricks(store, map),
];

/** Throws (rolling back) unless the whole map, instances included, is a valid v68 build. */
export function assertMapLayout(store: ProjectStore, map: string) {
  const check = inspectBricks(allBricks(store, map));
  if (!check.ok) throw new Error(check.reason);
}

function instanceError(store: ProjectStore, def: Asset, inst: InstanceLike): string | null {
  for (const b of expandAsset(def, inst).bricks) {
    const e = brickError(b);
    if (e) return e;
  }
  return null;
}

function putInstances(store: ProjectStore, map: string, fn: (items: Instances['items']) => Instances['items']) {
  const cur = getInstances(store, map);
  store.put(paths.instances(map), { ...cur, items: fn(cur.items) });
}

const findInstance = (store: ProjectStore, map: string, id: string) =>
  assetInstances(store, map).find((i) => i.id === id) ?? null;

const mapMissing = (store: ProjectStore, map: string) =>
  store.has(paths.map(map)) ? null : `Map ${map} does not exist.`;

// ---------- placing and editing instances ----------

export type PlaceAsset = {
  map: string;
  asset: string;
  pos: [number, number, number];
  rot?: number;
  state?: string;
  id?: string;
};

export const placeAsset: CommandHandler<PlaceAsset> = {
  label: (p) => `Place asset`,
  validate(store, p) {
    const e = mapMissing(store, p.map);
    if (e) return e;
    const def = store.get<Asset>(paths.asset(p.asset));
    if (!def) return 'That asset does not exist in this project.';
    if (allBricks(store, p.map).length + def.bricks.length > MAX_BRICKS_PER_MAP)
      return `A map can hold ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')} bricks.`;
    if (p.state && !def.states.includes(p.state)) return `${def.name} has no state "${p.state}".`;
    return instanceError(store, def, { pos: p.pos, rot: p.rot ?? 0, idBase: 1 });
  },
  apply(store, p) {
    const idBase = maxBrickId(store, p.map) + 1;
    const inst: AssetInstance = {
      id: (p.id ?? newId('instance')) as Id<'instance'>,
      kind: 'asset',
      asset: p.asset as Id<'asset'>,
      pos: p.pos,
      rot: ((p.rot ?? 0) + 4) % 4,
      idBase,
      ...(p.state ? { state: p.state } : {}),
    };
    putInstances(store, p.map, (items) => [...items, inst]);
    assertMapLayout(store, p.map);
  },
};

export type MoveInstance = { map: string; instance: string; dx?: number; dy?: number; dz?: number; rot?: number };

/** Moves an instance and/or sets its rotation (turning keeps the footprint's centre where it was). */
export const moveInstance: CommandHandler<MoveInstance> = {
  label: (p) => (p.rot !== undefined ? 'Turn asset' : 'Move asset'),
  validate(store, p) {
    const inst = findInstance(store, p.map, p.instance);
    if (!inst) return 'Asset instance not found.';
    if (![p.dx ?? 0, p.dy ?? 0, p.dz ?? 0, p.rot ?? 0].every(Number.isInteger)) return 'Moves are whole studs.';
    const def = store.get<Asset>(paths.asset(inst.asset));
    if (!def) return 'The asset of this instance is missing.';
    return instanceError(store, def, moved(def, inst, p));
  },
  apply(store, p) {
    const inst = findInstance(store, p.map, p.instance)!;
    const def = store.get<Asset>(paths.asset(inst.asset))!;
    const next = moved(def, inst, p);
    putInstances(store, p.map, (items) =>
      items.map((i) => (i.id === inst.id && i.kind === 'asset' ? { ...i, pos: next.pos, rot: next.rot } : i)),
    );
    assertMapLayout(store, p.map);
  },
};

function moved(def: Asset, inst: AssetInstance, p: MoveInstance): AssetInstance {
  const rot = p.rot === undefined ? inst.rot : ((p.rot % 4) + 4) % 4;
  let [x, y, z] = inst.pos;
  if (rot !== inst.rot) {
    // keep the centre of the footprint in place
    const [w0, d0] = inst.rot % 2 ? [def.footprint[1], def.footprint[0]] : def.footprint;
    const [w1, d1] = rot % 2 ? [def.footprint[1], def.footprint[0]] : def.footprint;
    x += Math.round((w0 - w1) / 2);
    z += Math.round((d0 - d1) / 2);
  }
  return { ...inst, rot, pos: [x + (p.dx ?? 0), y + (p.dy ?? 0), z + (p.dz ?? 0)] };
}

export const removeInstance: CommandHandler<{ map: string; instances: string[] }> = {
  label: (p) => (p.instances.length === 1 ? 'Remove asset' : `Remove ${p.instances.length} assets`),
  validate: (store, p) =>
    p.instances.every((id) => findInstance(store, p.map, id)) ? null : 'Asset instance not found.',
  apply(store, p) {
    const gone = new Set(p.instances);
    putInstances(store, p.map, (items) => items.filter((i) => !gone.has(i.id)));
    assertMapLayout(store, p.map);
  },
};

export const setInstanceState: CommandHandler<{ map: string; instance: string; state: string }> = {
  label: (p) => `Set state ${p.state}`,
  validate(store, p) {
    const inst = findInstance(store, p.map, p.instance);
    if (!inst) return 'Asset instance not found.';
    const def = store.get<Asset>(paths.asset(inst.asset));
    return def?.states.includes(p.state) ? null : `That asset has no state "${p.state}".`;
  },
  apply(store, p) {
    putInstances(store, p.map, (items) =>
      items.map((i) => (i.id === p.instance && i.kind === 'asset' ? { ...i, state: p.state } : i)),
    );
    assertMapLayout(store, p.map);
  },
};

/** Turns instances back into plain chunk bricks (same ids and group), so single bricks can be edited. */
export const unpackInstance: CommandHandler<{ map: string; instances: string[] }> = {
  label: () => 'Unpack asset into bricks',
  validate: (store, p) =>
    p.instances.every((id) => findInstance(store, p.map, id)) ? null : 'Asset instance not found.',
  apply(store, p) {
    const want = new Set(p.instances);
    const bricks = expandInstances(store, p.map)
      .filter((e) => want.has(e.inst.id))
      .flatMap((e) => e.bricks);
    putInstances(store, p.map, (items) => items.filter((i) => !want.has(i.id)));
    const mb = new MapBricks(store, p.map);
    const keys = new Set(bricks.map((b) => chunkKey(b.x, b.z)));
    mb.write(keys, [...[...keys].flatMap((k) => mb.inChunk(k)), ...bricks]);
    assertMapLayout(store, p.map);
  },
};

/** Makes chunk bricks into a new user asset and replaces them with an instance of it (Make asset). */
export const makeAsset: CommandHandler<{
  map: string;
  ids: number[];
  name: string;
  id?: string;
  category?: Asset['category'];
}> = {
  label: (p) => `Make asset ${p.name}`,
  validate(store, p) {
    if (!p.name.trim()) return 'Give the asset a name.';
    const mb = new MapBricks(store, p.map);
    const found = mb.locate(p.ids);
    if (!p.ids.length || found.size !== new Set(p.ids).size)
      return 'Only loose bricks (not other assets) can become an asset.';
    return null;
  },
  apply(store, p) {
    const mb = new MapBricks(store, p.map);
    const want = new Set(p.ids);
    const picked = mb.all().filter((b) => want.has(b.id));
    const shape = bricksToAssetSorted(picked);
    const id = (p.id ?? newId('asset')) as Id<'asset'>;
    const def: Asset = {
      id,
      name: p.name.trim().slice(0, 60),
      category: p.category ?? 'prop',
      bricks: shape.bricks,
      palette: shape.palette,
      pivot: [0, 0, 0],
      footprint: shape.footprint,
      sockets: [],
      states: ['default'],
      initialState: 'default',
      interactions: [],
      smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
      generator: null,
      origin: 'user',
    };
    store.put(paths.asset(id), Asset.parse(def));
    const keys = new Set(mb.locate(p.ids).values());
    mb.write(
      keys,
      [...keys].flatMap((k) => mb.inChunk(k)).filter((b) => !want.has(b.id)),
    );
    const idBase = maxBrickId(store, p.map) + 1;
    putInstances(store, p.map, (items) => [
      ...items,
      { id: newId('instance'), kind: 'asset', asset: id, pos: shape.origin, rot: 0, idBase },
    ]);
    assertMapLayout(store, p.map);
  },
};

function bricksToAssetSorted(bricks: Brick[]) {
  return bricksToAsset([...bricks].sort((a, b) => a.id - b.id));
}

// ---------- asset definitions ----------

export const createAsset: CommandHandler<{ asset: Asset }> = {
  label: (p) => `New asset ${p.asset.name}`,
  validate(store, p) {
    const r = Asset.safeParse(p.asset);
    if (!r.success) return `That asset is not valid: ${r.error.issues[0]?.message}`;
    return store.has(paths.asset(p.asset.id)) ? 'An asset with that id already exists.' : null;
  },
  apply: (store, p) => store.put(paths.asset(p.asset.id), p.asset),
};

/**
 * Replaces an asset definition. Instances on every map follow it; an instance whose id range would
 * now overlap other bricks gets a fresh range, and every map must stay a valid build.
 */
export const updateAsset: CommandHandler<{ asset: Asset }> = {
  label: (p) => `Edit asset ${p.asset.name}`,
  validate(store, p) {
    if (!store.has(paths.asset(p.asset.id))) return 'That asset does not exist.';
    const r = Asset.safeParse(p.asset);
    if (!r.success) return `That asset is not valid: ${r.error.issues[0]?.message}`;
    if (!p.asset.states.includes(p.asset.initialState)) return 'The starting state must be one of the states.';
    return null;
  },
  apply(store, p) {
    const before = store.get<Asset>(paths.asset(p.asset.id))!;
    store.put(paths.asset(p.asset.id), p.asset);
    if (p.asset.bricks.length <= before.bricks.length) {
      for (const map of mapsUsing(store, p.asset.id)) assertMapLayout(store, map);
      return;
    }
    for (const map of mapsUsing(store, p.asset.id)) {
      // grown asset: move its instances to fresh id ranges above everything else on the map
      const cur = getInstances(store, map);
      const users = cur.items.filter((i) => i.kind === 'asset' && i.asset === p.asset.id).map((i) => i.id);
      let next = maxBrickId(store, map) + 1;
      putInstances(store, map, (items) =>
        items.map((i) => {
          if (!users.includes(i.id) || i.kind !== 'asset') return i;
          const r = { ...i, idBase: next };
          next += p.asset.bricks.length;
          return r;
        }),
      );
      assertMapLayout(store, map);
    }
  },
};

export const deleteAsset: CommandHandler<{ asset: string }> = {
  label: () => 'Delete asset',
  validate(store, p) {
    if (!store.has(paths.asset(p.asset))) return 'That asset does not exist.';
    const n = mapsUsing(store, p.asset).length;
    return n ? `This asset is placed on ${n} map${n === 1 ? '' : 's'}. Remove or unpack those first.` : null;
  },
  apply: (store, p) => store.remove(paths.asset(p.asset)),
};

export function mapsUsing(store: ProjectStore, asset: string): string[] {
  const out: string[] = [];
  for (const p of store.list('maps/'))
    if (
      p.endsWith('/instances.json') &&
      store.get<Instances>(p)!.items.some((i) => i.kind === 'asset' && i.asset === asset)
    )
      out.push(p.split('/')[1]!);
  return out;
}
