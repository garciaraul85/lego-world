import { bricksToAsset, expandAsset, type InstanceLike } from '../../assets/expand';
import { hasFree } from '../../assets/free';
import { assetInstances, expandInstances, instanceBricks, maxBrickId } from '../../assets/instances';
import { bricksBox, hasScale, hasTilt, isFree, normalizeScale, normalizeTilt } from '../../assets/tilt';
import { type Brick, chunkKey } from '../../bricks/codec';
import { inspectBricks } from '../../bricks/inspect';
import { brickError, MAX_BRICKS_PER_MAP, MapBricks } from '../../bricks/map-bricks';
import { type Id, newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { Asset, type AssetInstance, type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';

const getInstances = (store: ProjectStore, map: string): Instances =>
  store.get<Instances>(paths.instances(map)) ?? { npcsSaved: false, items: [] };

/** how many bricks a map holds, loose and in asset copies (without decoding the loose ones) */
export const brickCount = (store: ProjectStore, map: string): number =>
  new MapBricks(store, map).count() + expandInstances(store, map).reduce((n, e) => n + e.bricks.length, 0);

/** Every brick of a map: chunk bricks plus expanded asset instances. */
export const allBricks = (store: ProjectStore, map: string): Brick[] => [
  ...new MapBricks(store, map).all(),
  ...instanceBricks(store, map),
];

/** P27 part 3: maps with more bricks than this check only the area an edit touched (and a ring around it). */
export const LOCAL_CHECK_FROM = 50_000;

/**
 * Throws (rolling back) unless the whole map, instances included, is a valid v68 build. Turned or resized
 * assets are free objects and are left out of the grid rules (P31). On big maps only the chunks this
 * transaction touched are checked, with the chunks around them; bricks in that ring count as connected.
 */
export function assertMapLayout(store: ProjectStore, map: string) {
  const exp = expandInstances(store, map);
  // a whole turned or sized asset is a free object; turned parts inside an asset keep their straight
  // cells for the rules, so nothing that was built on them is left floating
  const free = new Set(exp.filter((e) => isFree(e.inst)).flatMap((e) => e.bricks.map((b) => b.id)));
  const mb = new MapBricks(store, map);
  const total = mb.count() + exp.reduce((n, e) => n + e.bricks.length, 0);
  const region = total > LOCAL_CHECK_FROM ? touchedChunks(store, map, exp) : null;
  if (region && !region.size) return;
  let bricks: Brick[];
  let anchored: ((b: Brick) => boolean) | undefined;
  if (!region) bricks = [...mb.all(), ...exp.flatMap((e) => e.bricks)];
  else {
    // the touched chunks and every chunk next to them (bricks reach up to 8 studs into the next chunk)
    const area = new Set<string>();
    for (const k of region) {
      const [cx, cz] = k.split('_').map(Number) as [number, number];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) area.add(`${cx + dx}_${cz + dz}`);
    }
    bricks = [...area].flatMap((k) => mb.inChunk(k));
    for (const e of exp) if (e.bricks.some((b) => area.has(chunkKey(b.x, b.z)))) bricks.push(...e.bricks);
    anchored = (b) => !region.has(chunkKey(b.x, b.z));
  }
  const check = inspectBricks(free.size ? bricks.filter((b) => !free.has(b.id)) : bricks, MAX_BRICKS_PER_MAP, anchored);
  if (!check.ok) throw new Error(check.reason);
}

/** chunk keys this transaction changed on a map: its chunk files, and the chunks of asset copies added, moved, removed or redefined */
function touchedChunks(store: ProjectStore, map: string, exp: ReturnType<typeof expandInstances>): Set<string> {
  const out = new Set<string>();
  const tx = store.txChanges();
  if (!tx) return new Set(exp.flatMap((e) => e.bricks.map((b) => chunkKey(b.x, b.z))));
  const dir = paths.chunkDir(map);
  const changedAssets = new Set<string>();
  for (const p of tx.keys()) {
    if (p.startsWith(dir)) out.add(p.slice(dir.length, -'.json'.length));
    const m = /^assets\/(ast_[0-9a-z]+)\.json$/.exec(p);
    if (m) changedAssets.add(m[1]!);
  }
  const instPath = paths.instances(map);
  const now = new Map(exp.map((e) => [e.inst.id, e]));
  for (const e of exp) if (changedAssets.has(e.inst.asset)) for (const b of e.bricks) out.add(chunkKey(b.x, b.z));
  if (tx.has(instPath)) {
    const before = ((tx.get(instPath) as Instances | undefined)?.items ?? []).filter(
      (i): i is AssetInstance => i.kind === 'asset',
    );
    const beforeIds = new Set(before.map((i) => i.id));
    for (const i of before) {
      const cur = now.get(i.id);
      if (cur && JSON.stringify(cur.inst) === JSON.stringify(i)) continue;
      // where it was
      const def = store.get<Asset>(paths.asset(i.asset));
      if (def) for (const b of expandAsset(def, i).bricks) out.add(chunkKey(b.x, b.z));
      if (cur) for (const b of cur.bricks) out.add(chunkKey(b.x, b.z));
    }
    for (const e of exp) if (!beforeIds.has(e.inst.id)) for (const b of e.bricks) out.add(chunkKey(b.x, b.z));
  }
  return out;
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
    if (brickCount(store, p.map) + def.bricks.length > MAX_BRICKS_PER_MAP)
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

/** P9c: names one placed copy (null: no name), so logic and wiring can refer to it. Names are unique on a map. */
export const renameInstance: CommandHandler<{ map: string; instance: string; name: string | null }> = {
  label: (p) => (p.name ? `Name it ${p.name}` : 'Remove name'),
  validate(store, p) {
    const inst = findInstance(store, p.map, p.instance);
    if (!inst) return 'Asset instance not found.';
    if (p.name === null) return null;
    const name = p.name.trim();
    if (!name || name.length > 40) return 'A name is 1 to 40 characters.';
    if (name.toLowerCase() === 'this' || name.toLowerCase() === 'hero')
      return `“${name}” is a word logic uses; pick another name.`;
    const taken = assetInstances(store, p.map).find(
      (i) => i.id !== p.instance && i.name?.toLowerCase() === name.toLowerCase(),
    );
    return taken ? `Another object on this map is already called “${name}”.` : null;
  },
  apply(store, p) {
    putInstances(store, p.map, (items) =>
      items.map((i) => {
        if (i.id !== p.instance || i.kind !== 'asset') return i;
        const { name: _n, ...rest } = i;
        return p.name ? { ...rest, name: p.name.trim() } : rest;
      }),
    );
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

/**
 * Turns and sizes a placed asset freely (P31): `tilt` is degrees about X, Y, Z on top of its quarter turn,
 * around its middle; `scale` is its size per axis (1 = normal), growing from the middle of its base. `rot`
 * may change too (the Y ring snaps whole quarter turns into it) and the asset stays centered. No turn and
 * normal size put it back on the brick grid, where the usual rules apply again. Omitted fields stay as they are.
 */
export const transformInstance: CommandHandler<{
  map: string;
  instance: string;
  tilt?: [number, number, number];
  scale?: [number, number, number];
  rot?: number;
}> = {
  label: (p) =>
    p.scale && !p.tilt
      ? hasScale(p.scale)
        ? 'Resize asset'
        : 'Reset asset size'
      : p.tilt && !hasTilt(p.tilt) && !p.scale
        ? 'Straighten asset'
        : 'Turn asset freely',
  validate(store, p) {
    const inst = findInstance(store, p.map, p.instance);
    if (!inst) return 'Asset instance not found.';
    if (!store.get<Asset>(paths.asset(inst.asset))) return 'Asset not found.';
    if (p.tilt && !p.tilt.every(Number.isFinite)) return 'Angles must be numbers.';
    if (p.scale && !p.scale.every((v) => Number.isFinite(v) && v > 0)) return 'Sizes must be above zero.';
    if (p.rot !== undefined && !(Number.isInteger(p.rot) && p.rot >= 0 && p.rot <= 3)) return 'rot is 0 to 3.';
    return null;
  },
  apply(store, p) {
    putInstances(store, p.map, (items) =>
      items.map((i) => {
        if (i.id !== p.instance || i.kind !== 'asset') return i;
        const def = store.get<Asset>(paths.asset(i.asset))!;
        const rot = p.rot ?? i.rot;
        const tilt = normalizeTilt(p.tilt ?? i.tilt ?? [0, 0, 0]);
        const scale = normalizeScale(p.scale ?? i.scale ?? [1, 1, 1]);
        let pos = i.pos;
        if (rot !== i.rot) {
          // keep the middle where it was
          const [a0, b0] = bricksBox(expandAsset(def, i).bricks);
          const [a1, b1] = bricksBox(expandAsset(def, { ...i, rot, pos: [0, 0, 0] }).bricks);
          pos = [
            Math.round((a0[0] + b0[0]) / 2 - (a1[0] + b1[0]) / 2),
            i.pos[1],
            Math.round((a0[2] + b0[2]) / 2 - (a1[2] + b1[2]) / 2),
          ];
        }
        const { tilt: _t, scale: _s, ...rest } = i;
        return {
          ...rest,
          rot,
          pos,
          ...(hasTilt(tilt) ? { tilt } : {}),
          ...(hasScale(scale) ? { scale } : {}),
        };
      }),
    );
    assertMapLayout(store, p.map);
  },
};

/** Turns instances back into plain chunk bricks (same ids and group), so single bricks can be edited. */
export const unpackInstance: CommandHandler<{ map: string; instances: string[] }> = {
  label: () => 'Unpack asset into bricks',
  validate: (store, p) =>
    !p.instances.every((id) => findInstance(store, p.map, id))
      ? 'Asset instance not found.'
      : p.instances.some((id) => {
            const i = findInstance(store, p.map, id);
            const def = i && store.get<Asset>(paths.asset(i.asset));
            return !!i && !!def && hasFree(i, def);
          })
        ? 'Loose bricks stand studs-up at their real size. Straighten it, reset its size, and straighten its turned parts first.'
        : null,
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
    // turned parts name real bricks, each brick in at most one part
    const seen = new Set<number>();
    for (const part of p.asset.parts ?? [])
      for (const i of part.bricks) {
        if (i >= p.asset.bricks.length) return `Part ${part.name} names a brick the asset does not have.`;
        if (seen.has(i)) return 'A brick can be in only one part.';
        seen.add(i);
      }
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
