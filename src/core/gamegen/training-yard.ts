import { BUILTIN_ASSETS } from '../../builtin/assets';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { ENEMY_PRESETS } from '../combat/enemy';
import type { Command } from '../commands';
import { newId } from '../ids';
import { addWire } from '../logic/wiring';
import type { Asset, Character } from '../schema';

/**
 * P9c: the Training yard — a sample map to practise everything P9 adds, made only from engine commands (so it
 * undoes in one step and the AI builder could make the same): a floor, training dummies (lock on with Z, hit
 * with F), a cracked wall that blunt hits break faster, a target that opens a gate when you lock on to it
 * (wired, no code), a chest behind the gate, a sparring knight who fights back, and tips that show in the HUD as you walk up to each spot.
 */
export type TrainingYard = { map: string; spawn: string; commands: Command[] };

type Bricks = Asset['bricks'];
const base = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const asset = (name: string, over: Partial<Asset>): Asset => ({
  ...base,
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
  ...over,
});

/** 48 × 48 studs of ground: thirty-six 8 × 8 plates, a darker one every other */
const SIDE = [0, 1, 2, 3, 4, 5];
const floorBricks: Bricks = SIDE.flatMap((i) =>
  SIDE.map((j) => [0, i * 8, 0, j * 8, 0, (i + j) % 2, 0] as Bricks[number]),
);

export function trainingYard(opts: { name?: string } = {}): TrainingYard {
  const map = newId('map');
  const spawn = newId('spawn');
  const floor = asset('Yard floor', {
    palette: { types: ['plate8x8'], colors: ['#6aa84f', '#5a9443'] },
    footprint: [48, 48],
    bricks: floorBricks,
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  });
  const dummy = asset('Training dummy', {
    palette: { types: ['plate2x2', 'brick2x2'], colors: ['#6e4626', '#c8a165', '#e8d1a0'] },
    footprint: [2, 2],
    bricks: [
      [0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0, 1, 0],
      [1, 0, 4, 0, 0, 1, 0],
      [1, 0, 7, 0, 0, 2, 0],
    ],
    smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
    health: { hp: 4, atZero: { break: true } },
    lockOn: true,
  });
  const wall = asset('Cracked wall', {
    palette: { types: ['brick1x8'], colors: ['#8d8d8d', '#a5a5a5'] },
    footprint: [8, 1],
    bricks: [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 3, 0, 0, 1, 0],
      [0, 0, 6, 0, 0, 0, 0],
    ],
    smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
    // blunt hits (a hammer) do double, blades only half
    health: { hp: 6, resist: { blunt: 2, slash: 0.5 }, atZero: { break: true } },
  });
  const target = asset('Practice target', {
    palette: { types: ['brick2x2'], colors: ['#d93a3a', '#f4f4f4'] },
    footprint: [2, 2],
    bricks: [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 3, 0, 0, 1, 0],
      [0, 0, 6, 0, 0, 0, 0],
    ],
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
    lockOn: true,
  });
  // mock terrain to test on: a terraced hill (jump up, plunge down), boulders to fight around
  const hill = asset('Grassy hill', {
    category: 'nature',
    palette: { types: ['brick8x8', 'brick4x4'], colors: ['#5c8a3a', '#4f7a31', '#7a5b3a'] },
    footprint: [16, 16],
    bricks: [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 8, 0, 0, 0, 0, 0],
      [0, 0, 0, 8, 0, 0, 0],
      [0, 8, 0, 8, 0, 0, 0],
      [0, 4, 3, 4, 0, 1, 0],
      [1, 6, 6, 6, 0, 2, 0],
    ],
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  });
  const boulder = asset('Boulder', {
    category: 'nature',
    palette: { types: ['brick2x4', 'brick2x2', 'brick1x2'], colors: ['#8a8f96', '#6f747b'] },
    footprint: [4, 2],
    bricks: [
      [0, 0, 0, 0, 0, 0, 0],
      [1, 1, 3, 0, 0, 1, 0],
      [2, 1, 6, 0, 0, 0, 0],
    ],
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  });
  const nature = (n: string) => BUILTIN_ASSETS.find((a) => a.name === n)!;
  const [pine, oak, shrub, fern, bush] = ['Pine tree', 'Oak tree', 'Shrub', 'Fern', 'Flower bush'].map(nature) as [
    Asset,
    Asset,
    Asset,
    Asset,
    Asset,
  ];
  const door = BUILTIN_ASSETS.find((a) => a.name === 'Door')!;
  const fence = BUILTIN_ASSETS.find((a) => a.name === 'Fence')!;
  const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
  // P26: a checkpoint flag and a save point by the entrance
  const flag = BUILTIN_ASSETS.find((a) => a.name === 'Checkpoint flag')!;
  const savePoint = BUILTIN_ASSETS.find((a) => a.name === 'Save point')!;
  const knightLook = BUILTIN_CHARACTERS.find((c) => c.name === 'Knight') ?? BUILTIN_CHARACTERS[0]!;
  const grunt = ENEMY_PRESETS.grunt!;
  const knight: Character = {
    id: newId('character') as Character['id'],
    name: 'Sparring knight',
    role: 'npc',
    profile: { ...knightLook.profile, name: 'Sparring knight', held: 'Sword' },
    harm: {
      canBeHarmed: true,
      health: { ...grunt.health, atZero: { break: false, drop: { item: 'medal', count: 1 }, emit: 'knight-beaten' } },
    },
    enemy: { ...grunt.enemy, sight: 8 },
  };
  const ins = {
    dummyA: newId('instance'),
    dummyB: newId('instance'),
    wall: newId('instance'),
    target: newId('instance'),
    gate: newId('instance'),
    chest: newId('instance'),
  };
  // tips show in the HUD's message line when the hero walks into each spot (screen UI, not signs in the world)
  const tip = (min: [number, number], max: [number, number], name: string, text: string) => ({
    type: 'map.addZone',
    payload: {
      map,
      zone: {
        id: newId('zone'),
        min: [min[0], 0, min[1]],
        max: [max[0], 4, max[1]],
        tags: [name],
        onEnter: [{ do: 'message', text, seconds: 5 }],
      },
    },
  });
  // locking on to the target opens the gate: a wire (two cards in the target's own script)
  const targetScript = addWire(
    null,
    { id: ins.target, name: 'Practice target', newId: () => newId('logic') },
    'lockedOn',
    {
      kind: 'state',
      target: 'Yard gate',
      state: 'open',
    },
  );
  const commands: Command[] = [
    {
      type: 'map.create',
      payload: { id: map, name: opts.name ?? 'Training yard', spawnId: spawn },
    },
    { type: 'map.updateSpawn', payload: { map, spawn, pos: [0, 0.4, -12], yaw: Math.PI, name: 'Yard entrance' } },
    ...[floor, dummy, wall, target].map((a) => ({ type: 'asset.create', payload: { asset: a } })),
    ...[door, fence, chest, hill, boulder, pine, oak, shrub, fern, bush, flag, savePoint].map((a) => ({
      type: 'asset.create',
      payload: { asset: a },
    })),
    { type: 'asset.place', payload: { map, asset: floor.id, pos: [-24, 0, -24] } },
    // the mock terrain: a fence all round, a hill in the north-west, boulders, trees and bushes
    ...[-24, -20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20].flatMap((x) => [
      { type: 'asset.place', payload: { map, asset: fence.id, pos: [x, 1, -24] } },
      { type: 'asset.place', payload: { map, asset: fence.id, pos: [x, 1, 23] } },
    ]),
    ...[-23, -19, -15, -11, -7, -3, 1, 5, 9, 13, 17].flatMap((z) => [
      { type: 'asset.place', payload: { map, asset: fence.id, pos: [-24, 1, z], rot: 1 } },
      { type: 'asset.place', payload: { map, asset: fence.id, pos: [23, 1, z], rot: 1 } },
    ]),
    { type: 'asset.place', payload: { map, asset: hill.id, pos: [-23, 1, 7] } },
    { type: 'asset.place', payload: { map, asset: boulder.id, pos: [18, 1, -14] } },
    { type: 'asset.place', payload: { map, asset: boulder.id, pos: [-19, 1, 0] } },
    { type: 'asset.place', payload: { map, asset: boulder.id, pos: [3, 1, 15] } },
    { type: 'asset.place', payload: { map, asset: pine.id, pos: [-22, 1, -22] } },
    { type: 'asset.place', payload: { map, asset: pine.id, pos: [14, 1, -22] } },
    { type: 'asset.place', payload: { map, asset: oak.id, pos: [15, 1, 14] } },
    { type: 'asset.place', payload: { map, asset: shrub.id, pos: [-14, 1, -20] } },
    { type: 'asset.place', payload: { map, asset: shrub.id, pos: [19, 1, -6] } },
    { type: 'asset.place', payload: { map, asset: fern.id, pos: [-18, 1, -8] } },
    { type: 'asset.place', payload: { map, asset: bush.id, pos: [2, 1, -20] } },
    // left: two dummies to lock on to and hit
    { type: 'asset.place', payload: { map, asset: dummy.id, pos: [-9, 1, -4], id: ins.dummyA } },
    { type: 'asset.place', payload: { map, asset: dummy.id, pos: [-5, 1, -2], id: ins.dummyB } },
    // middle: the cracked wall
    { type: 'asset.place', payload: { map, asset: wall.id, pos: [-4, 1, 6], id: ins.wall } },
    // right: the target, and the gated pen with the chest
    { type: 'asset.place', payload: { map, asset: target.id, pos: [7, 1, -4], id: ins.target } },
    { type: 'asset.place', payload: { map, asset: fence.id, pos: [5, 1, 6] } },
    { type: 'asset.place', payload: { map, asset: door.id, pos: [9, 1, 6], id: ins.gate } },
    { type: 'asset.place', payload: { map, asset: fence.id, pos: [13, 1, 6] } },
    { type: 'asset.place', payload: { map, asset: chest.id, pos: [10, 1, 10], id: ins.chest } },
    { type: 'instance.rename', payload: { map, instance: ins.gate, name: 'Yard gate' } },
    { type: 'instance.rename', payload: { map, instance: ins.target, name: 'Practice target' } },
    { type: 'logic.create', payload: { graph: { ...targetScript, name: 'Practice target script' } } },
    // the sparring knight: an enemy that walks over when you come close
    { type: 'character.create', payload: { character: knight } },
    { type: 'npc.place', payload: { map, character: knight.id, pos: [0, 0.4, 11], heading: Math.PI } },
    tip(
      [-4, -16],
      [4, -9],
      'Entrance tip',
      'Training yard: walk up to the dummies, the wall, the target, the knight or the hill for a tip.',
    ),
    tip(
      [-12, -8],
      [-2, 2],
      'Dummies tip',
      'Dummies: Z locks on (Z again for the next one), F attacks — hold to charge, Shift+F heavy.',
    ),
    tip([-6, 3], [6, 8], 'Wall tip', 'Cracked wall: blunt hits (a hammer) break it faster than a sword.'),
    tip([4, -9], [13, -1], 'Target tip', 'Lock on to the red-and-white target (Z) to open the gate.'),
    tip(
      [-5, 9],
      [5, 16],
      'Knight tip',
      'Sparring knight: hold Q to guard; raise it just as the red ! strikes to parry; C rolls.',
    ),
    // P26: saving — touch the flag (checkpoint and autosave), press E at the save point
    { type: 'asset.place', payload: { map, asset: flag.id, pos: [12, 1, -14] } },
    { type: 'asset.place', payload: { map, asset: savePoint.id, pos: [-12, 1, -14] } },
    tip(
      [9, -17],
      [16, -10],
      'Checkpoint tip',
      'Checkpoint flag: touch it and the flag goes up. A fall or Retry brings you back here, and the game autosaves.',
    ),
    tip(
      [-15, -17],
      [-8, -10],
      'Save point tip',
      'Save point: press E to save. Pause (Esc) › Load game brings it back; the title’s Continue loads the newest save.',
    ),
    // P26 part 2: goals — three achievements and the knight's medal to collect
    {
      type: 'progress.put',
      payload: {
        progress: {
          achievements: [
            { id: 'first-smash', name: 'Smasher', description: 'Smash a training dummy.' },
            { id: 'sharp-eye', name: 'Sharp eye', description: 'Lock on to the practice target.' },
            { id: 'knight-beaten', name: 'Sparring champion', description: 'Beat the sparring knight.' },
          ],
          collections: [{ item: 'medal', label: 'Medals', total: 1 }],
          bests: [],
          newGamePlus: { enabled: true, keepItems: true, keepVars: [] },
        },
      },
    },
    {
      type: 'logic.create',
      payload: {
        graph: {
          id: newId('logic'),
          name: 'Yard goals',
          scope: 'global',
          nodes: [
            { id: 'n1', type: 'event.onSmash', pos: [40, 40], args: { asset: dummy.id } },
            { id: 'n2', type: 'game.unlockAchievement', pos: [320, 40], args: { achievement: 'first-smash' } },
            { id: 'n3', type: 'event.onLockedOn', pos: [40, 180], args: { asset: target.id } },
            { id: 'n4', type: 'game.unlockAchievement', pos: [320, 180], args: { achievement: 'sharp-eye' } },
            { id: 'n5', type: 'event.onCustom', pos: [40, 320], args: { event: 'knight-beaten' } },
            { id: 'n6', type: 'game.unlockAchievement', pos: [320, 320], args: { achievement: 'knight-beaten' } },
          ],
          edges: [
            ['n1', 'then', 'n2', 'in'],
            ['n3', 'then', 'n4', 'in'],
            ['n5', 'then', 'n6', 'in'],
          ],
        },
      },
    },
    // a third dummy at the foot of the hill: jump down from the top and press F while falling (plunge)
    { type: 'asset.place', payload: { map, asset: dummy.id, pos: [-5, 1, 18] } },
    tip(
      [-23, 4],
      [-7, 7],
      'Hill tip',
      'Hill: jump up (Space), then from the top press F while falling to plunge on the dummy.',
    ),
  ];
  return { map, spawn, commands };
}
