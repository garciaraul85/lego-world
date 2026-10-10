// Generated list of the built-in asset library (P3.2). Structures come from scripts/extract-assets.mjs;
// interactive props (chest, door, lamp post, stall, bench, fence, signpost) are hand-made.
import { shapeId } from '../../core/assets/instancify';
import { Asset } from '../../core/schema';
import autumnMapleTree from './autumn-maple-tree.json';
import bench from './bench.json';
import birchTree from './birch-tree.json';
import cactus from './cactus.json';
import car from './car.json';
import castleWall from './castle-wall.json';
import chest from './chest.json';
import door from './door.json';
import fence from './fence.json';
import fern from './fern.json';
import flowerBush from './flower-bush.json';
import house from './house.json';
import lampPost from './lamp-post.json';
import marketStall from './market-stall.json';
import mushroom from './mushroom.json';
import oakTree from './oak-tree.json';
import palm from './palm.json';
import pineTree from './pine-tree.json';
import rainforestTree from './rainforest-tree.json';
import shrub from './shrub.json';
import signpost from './signpost.json';
import skyscraper from './skyscraper.json';
import tower from './tower.json';
import willowTree from './willow-tree.json';

const RAW: Record<string, unknown> = {
  'autumn-maple-tree': autumnMapleTree,
  bench: bench,
  'birch-tree': birchTree,
  cactus: cactus,
  car: car,
  'castle-wall': castleWall,
  chest: chest,
  door: door,
  fence: fence,
  fern: fern,
  'flower-bush': flowerBush,
  house: house,
  'lamp-post': lampPost,
  'market-stall': marketStall,
  mushroom: mushroom,
  'oak-tree': oakTree,
  palm: palm,
  'pine-tree': pineTree,
  'rainforest-tree': rainforestTree,
  shrub: shrub,
  signpost: signpost,
  skyscraper: skyscraper,
  tower: tower,
  'willow-tree': willowTree,
};

/** Built-in assets with their fixed ids (same id in every project, so placing one twice reuses the file). */
export const BUILTIN_ASSETS: readonly Asset[] = Object.entries(RAW).map(([slug, raw]) =>
  Asset.parse({ ...(raw as object), id: shapeId(`builtin:${slug}`), origin: 'builtin' }),
);

export const builtinAsset = (id: string) => BUILTIN_ASSETS.find((a) => a.id === id) ?? null;
