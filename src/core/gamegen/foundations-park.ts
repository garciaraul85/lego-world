import { BUILTIN_ASSETS } from '../../builtin/assets';
import type { Command } from '../commands';
import { newId } from '../ids';
import type { Asset } from '../schema';

/**
 * Milestone 2b gate: the Foundations park — a sample map that uses everything Milestone 2b built, made only from
 * engine commands (it undoes in one step, and the AI builder could make the same): a river that carries a loose
 * crate along and a still pond with another floating in it, a brick wall to smash (its bricks tumble and come to
 * rest), the built-in 3D models lit beside the bricks (a stone ring, lantern posts, round trees, a boulder to
 * climb, crystals, toadstools, barrels and a vase) with the lanterns' lights casting shadows in the evening, and
 * the water mirroring it all. Tips show in the HUD as you walk up to each spot.
 */
export type FoundationsPark = { map: string; spawn: string; commands: Command[] };

type Bricks = Asset['bricks'];
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const asset = (name: string, over: Partial<Asset>): Asset => ({
  ...crate,
  id: newId('asset') as Asset['id'],
  name,
  category: 'prop',
  health: undefined,
  sockets: [],
  states: ['default'],
  initialState: 'default',
  interactions: [],
  generator: null,
  origin: 'user',
  loose: undefined,
  ...over,
});

/** 48 × 48 studs of ground in 8 × 8 plates, leaving the river's bed (z 0 to 8) open but for the bridge */
const SIDE = [0, 1, 2, 3, 4, 5];
const floorBricks: Bricks = SIDE.flatMap((i) =>
  SIDE.flatMap((j) =>
    j === 3 && i !== 2 && i !== 3 ? [] : [[0, i * 8, 0, j * 8, 0, (i + j) % 2, 0] as Bricks[number]],
  ),
);

export function foundationsPark(opts: { name?: string } = {}): FoundationsPark {
  const map = newId('map');
  const spawn = newId('spawn');
  const floor = asset('Park floor', {
    category: 'nature',
    palette: { types: ['plate8x8'], colors: ['#6aa84f', '#5a9443'] },
    footprint: [48, 48],
    bricks: floorBricks,
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  });
  // the crates the water carries: loose copies of the Wooden crate
  const floater = {
    ...crate,
    id: newId('asset') as Asset['id'],
    name: 'Floating crate',
    origin: 'user' as const,
    loose: true,
  };
  const wall = asset('Old brick wall', {
    category: 'structure',
    palette: { types: ['brick1x4', 'brick1x2'], colors: ['#a0522d', '#b5653c', '#8a4526'] },
    footprint: [8, 1],
    bricks: [0, 1, 2, 3, 4].flatMap((row) =>
      row % 2
        ? ([
            [1, 0, row * 3, 0, 0, 1, 0],
            [0, 2, row * 3, 0, 0, row % 3, 0],
            [1, 6, row * 3, 0, 0, 2, 0],
          ] as Bricks)
        : ([
            [0, 0, row * 3, 0, 0, 0, 0],
            [0, 4, row * 3, 0, 0, 1, 0],
          ] as Bricks),
    ),
    smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
  });
  const ins = { wall: newId('instance'), crateRiver: newId('instance'), cratePond: newId('instance') };
  const item = (it: Record<string, unknown>) => ({
    type: 'item.add',
    payload: { map, item: { id: newId('instance'), ...it } },
  });
  const model = (model: string, name: string, pos: [number, number, number], over: Record<string, unknown> = {}) =>
    item({ kind: 'model', model: `builtin:${model}`, name, pos, ...over });
  const tip = (min: [number, number], max: [number, number], name: string, text: string) => ({
    type: 'map.addZone',
    payload: {
      map,
      zone: {
        id: newId('zone'),
        min: [min[0], 0, min[1]],
        max: [max[0], 5, max[1]],
        tags: [name],
        onEnter: [{ do: 'message', text, seconds: 6 }],
      },
    },
  });
  const commands: Command[] = [
    { type: 'map.create', payload: { id: map, name: opts.name ?? 'Foundations park', spawnId: spawn } },
    { type: 'map.updateSpawn', payload: { map, spawn, pos: [0, 0.4, -16], yaw: Math.PI, name: 'Park gate' } },
    // an evening: dark enough for the lanterns' light and shadows to show
    { type: 'map.setEnvironment', payload: { map, darkness: 0.45 } },
    ...[floor, floater, wall].map((a) => ({ type: 'asset.create', payload: { asset: a } })),
    { type: 'asset.place', payload: { map, asset: floor.id, pos: [-24, 0, -24] } },
    // the river across the middle (it flows west, under the bridge), and a still pond by the gate
    item({
      kind: 'water',
      name: 'River west',
      pos: [-24, -0.4, 0],
      size: [16, 2.4, 8],
      body: 'river',
      current: [-2.5, 0],
    }),
    item({
      kind: 'water',
      name: 'River east',
      pos: [8, -0.4, 0],
      size: [16, 2.4, 8],
      body: 'river',
      current: [-2.5, 0],
    }),
    item({ kind: 'water', name: 'Pond', pos: [10, 0.4, -18], size: [10, 2, 8], body: 'pool' }),
    { type: 'asset.place', payload: { map, asset: floater.id, pos: [14, 0, 3], id: ins.crateRiver } },
    { type: 'asset.place', payload: { map, asset: floater.id, pos: [14, 1, -15], id: ins.cratePond } },
    // the wall to smash, west of the gate
    { type: 'asset.place', payload: { map, asset: wall.id, pos: [-14, 1, -10], id: ins.wall } },
    { type: 'instance.rename', payload: { map, instance: ins.wall, name: 'Old brick wall' } },
    // 3D models: lantern posts at the gate (their lights cast shadows), a stone ring beyond the river, trees,
    // a boulder to climb, crystals, toadstools, barrels on the bank and a vase
    model('lantern-post', 'Gate lantern west', [-4, 0.4, -12]),
    model('lantern-post', 'Gate lantern east', [4, 0.4, -12]),
    item({
      kind: 'light',
      name: 'West lantern light',
      pos: [-4, 4.1, -12],
      on: true,
      light: { color: '#ffd38a', brightness: 1.8, range: 16, flicker: 0.05, shadow: true },
    }),
    item({
      kind: 'light',
      name: 'East lantern light',
      pos: [4, 4.1, -12],
      on: true,
      light: { color: '#ffd38a', brightness: 1.8, range: 16, flicker: 0.05, shadow: true },
    }),
    model('stone-ring', 'Stone ring', [0, 0.4, 16], { size: 1.4 }),
    model('round-tree', 'Round tree west', [-16, 0.4, 14], { turn: 40 }),
    model('round-tree', 'Round tree east', [17, 0.4, 15], { turn: -60, size: 1.2 }),
    model('round-tree', 'Round tree south', [-18, 0.4, -18], { size: 0.9 }),
    model('boulder', 'Climbing boulder', [16, 0.4, -6], { size: 1.8, turn: 25 }),
    model('crystal', 'Crystals', [-8, 0.4, 18], { size: 1.3 }),
    model('toadstool', 'Toadstool', [9, 0.4, 12]),
    model('toadstool', 'Little toadstool', [11, 0.4, 13.5], { size: 0.6, turn: 70 }),
    model('barrel', 'Barrel', [-8, 0.4, -2.2]),
    model('barrel', 'Barrel 2', [-5.6, 0.4, -2.8], { turn: 30 }),
    model('vase', 'Vase', [6, 0.4, -10]),
    tip(
      [-5, -20],
      [5, -13],
      'Gate tip',
      'Foundations park: the river carries a crate, the pond holds one still, the brick wall smashes, and the boulder and the stone ring are 3D models — walk up to each.',
    ),
    tip(
      [-24, -2],
      [24, 0],
      'River tip',
      'The river flows west: the crate floats and drifts with it. Jump on and ride it.',
    ),
    tip(
      [6, -24],
      [22, -13],
      'Pond tip',
      'Still water: the crate floats and bobs. Its surface mirrors the lanterns and the sky.',
    ),
    tip([-18, -13], [-8, -7], 'Wall tip', 'Hit the old wall (F): its bricks tumble, bounce and come to rest.'),
    tip([12, -10], [21, -2], 'Boulder tip', 'The boulder is a 3D model, and solid: jump up onto it (Space).'),
  ];
  return { map, spawn, commands };
}
