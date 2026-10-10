import type { Brick } from '../bricks/codec';
import { hash64 } from '../hash';
import type { Id } from '../ids';
import type { Asset, AssetInstance } from '../schema';
import { bricksToAsset, shapeKey } from './expand';

const BUILDINGS = /^(skyscraper|house|tower|castle|shop|stall|gate)/;
const NATURE = /^(tree|palm|flower|shrub|mushroom|fern|cactus|bush|rock)/;
const VEHICLES = /^(car|truck|bus|boat)/;

/** Asset category from a v68 group name ("house-3", "tree-oak-12"). */
export function categoryOfGroup(group: string): Asset['category'] {
  if (BUILDINGS.test(group)) return 'building';
  if (NATURE.test(group)) return 'nature';
  if (VEHICLES.test(group)) return 'vehicle';
  return 'structure';
}

/** "tree-autumn-maple-12" -> "Autumn maple tree"; "flower-bush-4" -> "Flower bush". */
export function nameOfGroup(group: string): string {
  const base = group.replace(/-\d+$/, '').split('-');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (base[0] === 'tree' && base.length > 1) return `${cap(base.slice(1).join(' '))} tree`;
  return cap(base.join(' '));
}

/** Content-derived asset id: the same shape always gets the same id, so regenerating reuses files. */
export function shapeId(key: string): Id<'asset'> {
  const n = BigInt(`0x${hash64(key)}`) % 36n ** 10n;
  return `ast_${n.toString(36).padStart(10, '0')}` as Id<'asset'>;
}

export type Instancified = {
  /** bricks that stay in chunk files (terrain, roads, ungrouped bricks) */
  plain: Brick[];
  instances: Omit<AssetInstance, 'id'>[];
  /** assets the instances use that are not in `existing` */
  assets: Asset[];
};

/**
 * Turns every grouped structure (houses, trees, cars...) of a generated map into an asset + instance,
 * reusing identical shapes. A group becomes an instance only if its brick ids are contiguous, so
 * expandAsset (ids idBase + i) gives back exactly the same bricks.
 */
export function instancify(
  bricks: readonly Brick[],
  opts: { existing?: Iterable<Asset>; environments?: string[] } = {},
): Instancified {
  const byShape = new Map<string, Asset>();
  const taken = new Set<string>();
  for (const a of opts.existing ?? []) {
    byShape.set(shapeKey(a), a);
    taken.add(a.id);
  }
  const groups = new Map<string, Brick[]>();
  const plain: Brick[] = [];
  for (const b of bricks) {
    if (!b.group) {
      plain.push(b);
      continue;
    }
    const list = groups.get(b.group) ?? [];
    if (!groups.has(b.group)) groups.set(b.group, list);
    list.push(b);
  }
  const instances: Omit<AssetInstance, 'id'>[] = [];
  const created: Asset[] = [];
  for (const [group, list] of groups) {
    list.sort((a, b) => a.id - b.id);
    const contiguous = list.every((b, i) => b.id === list[0]!.id + i);
    if (!contiguous) {
      plain.push(...list);
      continue;
    }
    const shape = bricksToAsset(list);
    const key = shapeKey(shape);
    let def = byShape.get(key);
    if (!def) {
      let id = shapeId(key);
      for (let salt = 1; taken.has(id); salt++) id = shapeId(`${key}#${salt}`);
      taken.add(id);
      def = {
        id,
        name: nameOfGroup(group),
        category: categoryOfGroup(group),
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
        origin: 'generated',
      };
      byShape.set(key, def);
      created.push(def);
    }
    instances.push({ kind: 'asset', asset: def.id, pos: shape.origin, rot: 0, idBase: list[0]!.id, group });
  }
  plain.sort((a, b) => a.id - b.id);
  instances.sort((a, b) => a.idBase - b.idBase);
  return { plain, instances, assets: created };
}

/** Stable id of a generated instance (same map and brick range -> same id, so regenerating is repeatable). */
export const generatedInstanceId = (mapId: string, idBase: number) =>
  `ins_${(BigInt(`0x${hash64(`${mapId}:${idBase}`)}`) % 36n ** 10n).toString(36).padStart(10, '0')}` as Id<'instance'>;
