import type { Asset, AssetBrick } from '../../core/schema';

/**
 * Step 11, 4a: the adventure starter pack's buildings and props — dungeon pieces first (walls, a pillar, an arch, a
 * barred gate, a locked door, a wall torch, a brazier, pots, a boss chest, a cracked wall, a block to push, a floor
 * switch, spikes, stairs, a guardian statue), then the village (a cottage, a well, a barrel, a grass tuft, a bridge).
 * Step 12a adds the puzzle pieces: weight, timer and crystal switches, a lever, the boss door, the small key, the
 * boss key, the dungeon map, the compass and a small chest with a key in it.
 * All original, built here brick by brick so each opens in the Asset studio like any other asset.
 */
type Raw = Omit<Asset, 'id'>;
const C = {
  stone: '#8a8f94',
  stoneDark: '#6c6e68',
  stoneLight: '#a0a5a9',
  moss: '#4b9f4a',
  wood: '#754429',
  woodDark: '#5c3a21',
  gold: '#f7c900',
  iron: '#3a3f45',
  fire: '#ff7a1a',
  flame: '#ffd23f',
  red: '#c91a09',
  clay: '#b5652b',
  straw: '#e4cd9e',
  water: '#3a7fc1',
  white: '#f4f4f4',
  green: '#237841',
  roof: '#9b3b2b',
};

/** a brick builder: palette entries are made as they are used; returns each brick's index */
class Build {
  types: string[] = [];
  colors: string[] = [];
  bricks: AssetBrick[] = [];
  private ix(list: string[], v: string) {
    let i = list.indexOf(v);
    if (i < 0) {
      list.push(v);
      i = list.length - 1;
    }
    return i;
  }
  /** one brick: kind and size (d rows deep × w wide), corner x, height y (plates), corner z */
  put(kind: 'brick' | 'plate' | 'tile', d: number, w: number, x: number, y: number, z: number, color: string, rot = 0) {
    this.bricks.push([this.ix(this.types, `${kind}${d}x${w}`), x, y, z, rot, this.ix(this.colors, color), 0]);
    return this.bricks.length - 1;
  }
  /** a w×d layer of bricks (or plates) at height y, in runs of up to 4 studs, staggered on odd layers */
  layer(
    kind: 'brick' | 'plate' | 'tile',
    x0: number,
    z0: number,
    w: number,
    d: number,
    y: number,
    color: string | ((i: number) => string),
  ) {
    const out: number[] = [];
    const odd = (kind === 'brick' ? y / 3 : y) % 2 === 1;
    for (let z = z0; z < z0 + d; z++) {
      let x = x0;
      let first = odd && w > 2 ? 2 : Math.min(4, w);
      while (x < x0 + w) {
        const run = Math.min(first, x0 + w - x);
        out.push(this.put(kind, 1, run, x, y, z, typeof color === 'string' ? color : color(out.length)));
        x += run;
        first = Math.min(4, x0 + w - x);
      }
    }
    return out;
  }
  /** a block of `bricks` brick layers from height y */
  stack(
    x0: number,
    z0: number,
    w: number,
    d: number,
    y: number,
    layers: number,
    color: string | ((i: number) => string),
  ) {
    const out: number[] = [];
    for (let i = 0; i < layers; i++) out.push(...this.layer('brick', x0, z0, w, d, y + i * 3, color));
    return out;
  }
}

const stones = (i: number) => (i % 5 === 2 ? C.stoneDark : i % 7 === 4 ? C.stoneLight : C.stone);
/** an old wall: a few stones grown over with moss */
const mossy = (i: number) => (i % 6 === 3 ? C.moss : stones(i));

function asset(
  name: string,
  category: Raw['category'],
  footprint: [number, number],
  b: Build,
  more: Partial<Raw> = {},
): Raw {
  return {
    name,
    category,
    bricks: b.bricks,
    palette: { types: b.types, colors: b.colors },
    pivot: [0, 0, 0],
    footprint,
    sockets: [],
    states: ['default'],
    initialState: 'default',
    interactions: [],
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
    generator: null,
    origin: 'builtin',
    ...more,
  };
}

const SND = { door: 'snd_door000000', chest: 'snd_chest00000', gate: 'snd_gate000000' };

// ---------- dungeon ----------
function dungeonWall(): Raw {
  const b = new Build();
  b.stack(0, 0, 6, 1, 0, 4, mossy);
  b.layer('tile', 0, 0, 6, 1, 12, C.stoneDark);
  return asset('Dungeon wall', 'structure', [6, 1], b);
}

function dungeonPillar(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.stoneDark);
  for (let i = 0; i < 5; i++) b.put('brick', 2, 2, 0, 1 + i * 3, 0, i % 2 ? C.stoneLight : C.stone);
  b.put('plate', 2, 2, 0, 16, 0, C.stoneDark);
  b.put('tile', 2, 2, 0, 17, 0, C.stone);
  return asset('Dungeon pillar', 'structure', [2, 2], b);
}

function archway(): Raw {
  const b = new Build();
  b.stack(0, 0, 2, 1, 0, 4, stones);
  b.stack(4, 0, 2, 1, 0, 4, stones);
  b.layer('brick', 0, 0, 6, 1, 12, C.stoneDark);
  b.put('tile', 1, 2, 2, 15, 0, C.gold);
  return asset('Stone archway', 'structure', [6, 1], b);
}

function barredGate(): Raw {
  const b = new Build();
  b.stack(0, 0, 1, 1, 0, 4, C.stoneDark);
  b.stack(5, 0, 1, 1, 0, 4, C.stoneDark);
  b.layer('brick', 0, 0, 6, 1, 12, C.stone);
  const bars: number[] = [];
  for (const x of [1, 2, 3, 4]) for (let i = 0; i < 4; i++) bars.push(b.put('brick', 1, 1, x, i * 3, 0, C.iron));
  return asset('Barred gate', 'structure', [6, 1], b, {
    states: ['closed', 'open'],
    initialState: 'closed',
    onlyIn: { closed: bars },
    sockets: [{ id: 'gate', kind: 'interact', pos: [3, 1.4, 1.2], prompt: 'Barred' }],
    interactions: [
      {
        socket: 'gate',
        when: { state: 'closed' },
        do: [
          { do: 'message', text: 'Barred shut. A switch somewhere must open it.' },
          { do: 'emit', event: 'gate-barred' },
        ],
      },
    ],
  });
}

function lockedDoor(): Raw {
  const b = new Build();
  b.stack(0, 0, 1, 1, 0, 4, C.stoneDark);
  b.stack(4, 0, 1, 1, 0, 4, C.stoneDark);
  b.layer('brick', 0, 0, 5, 1, 12, C.stone);
  const door = b.stack(1, 0, 3, 1, 0, 4, (i) => (i === 2 ? C.gold : C.woodDark));
  // step 12a: it opens with a small key found on this map (and uses it up)
  return asset('Locked door', 'structure', [5, 1], b, {
    states: ['locked', 'open'],
    initialState: 'locked',
    onlyIn: { locked: door },
    sockets: [{ id: 'door', kind: 'interact', pos: [2.5, 1.4, 1.2], prompt: 'Unlock' }],
    lock: { key: 'small' },
  });
}

function wallTorch(): Raw {
  const b = new Build();
  b.put('brick', 1, 1, 0, 0, 0, C.woodDark);
  b.put('brick', 1, 1, 0, 3, 0, C.woodDark);
  b.put('plate', 1, 1, 0, 6, 0, C.iron);
  const flame = [b.put('brick', 1, 1, 0, 7, 0, C.fire), b.put('plate', 1, 1, 0, 10, 0, C.flame)];
  return asset('Torch', 'decoration', [1, 1], b, {
    states: ['lit', 'out'],
    initialState: 'lit',
    onlyIn: { lit: flame },
    sockets: [{ id: 'torch', kind: 'interact', pos: [0.5, 2.8, 1.2], prompt: 'Torch' }],
    interactions: [
      {
        socket: 'torch',
        when: { state: 'lit' },
        do: [
          { do: 'setState', state: 'out' },
          { do: 'emit', event: 'torch-out' },
        ],
      },
      {
        socket: 'torch',
        when: { state: 'out' },
        do: [
          { do: 'setState', state: 'lit' },
          { do: 'emit', event: 'torch-lit' },
        ],
      },
    ],
    light: {
      color: '#ff9a3c',
      brightness: 1.6,
      range: 11,
      flicker: 0.5,
      shadow: true,
      at: [0.5, 4.4, 0.5],
      states: ['lit'],
    },
  });
}

function brazier(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.iron);
  b.put('brick', 1, 1, 0, 1, 0, C.iron);
  b.put('brick', 1, 1, 1, 1, 1, C.iron);
  b.put('plate', 2, 2, 0, 4, 0, C.iron);
  const fire = [
    b.put('plate', 2, 2, 0, 5, 0, C.fire),
    b.put('plate', 1, 1, 0, 6, 0, C.flame),
    b.put('plate', 1, 1, 1, 6, 1, C.flame),
  ];
  return asset('Brazier', 'decoration', [2, 2], b, {
    states: ['lit', 'out'],
    initialState: 'out',
    onlyIn: { lit: fire },
    sockets: [{ id: 'fire', kind: 'interact', pos: [1, 2.4, 2.2], prompt: 'Brazier' }],
    interactions: [
      {
        socket: 'fire',
        when: { state: 'out' },
        do: [
          { do: 'setState', state: 'lit' },
          { do: 'emit', event: 'brazier-lit' },
        ],
      },
    ],
    light: {
      color: '#ff9a3c',
      brightness: 1.8,
      range: 12,
      flicker: 0.5,
      shadow: true,
      at: [1, 2.8, 1],
      states: ['lit'],
    },
  });
}

function pot(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.clay);
  b.put('brick', 2, 2, 0, 1, 0, C.clay);
  b.put('plate', 1, 1, 0, 4, 0, C.woodDark);
  return asset('Clay pot', 'prop', [2, 2], b, {
    smash: { enabled: true, rebuild: false, sound: null, studs: 0, after: 'gone' },
    health: {
      hp: 1,
      atZero: {
        break: true,
        loot: [
          { item: 'heart', count: 1, chance: 0.3 },
          { item: 'rupee', count: 1, chance: 0.3 },
        ],
      },
    },
  });
}

function bossChest(): Raw {
  const b = new Build();
  b.put('brick', 2, 6, 0, 0, 0, C.woodDark);
  b.put('brick', 1, 6, 0, 0, 2, C.woodDark);
  b.put('plate', 2, 6, 0, 3, 0, C.gold);
  b.put('plate', 1, 6, 0, 3, 2, C.gold);
  const lid = [
    b.put('brick', 2, 6, 0, 4, 0, C.red),
    b.put('brick', 1, 6, 0, 4, 2, C.red),
    b.put('tile', 1, 2, 2, 7, 1, C.gold),
  ];
  return asset('Boss chest', 'prop', [6, 3], b, {
    states: ['closed', 'open'],
    initialState: 'closed',
    sockets: [
      { id: 'lid', kind: 'interact', pos: [3, 2.8, 3.4], prompt: 'Open' },
      { id: 'item', kind: 'spawn', pos: [3, 2, 1.5] },
    ],
    parts: [{ name: 'Lid', bricks: lid, hinge: [3, 1.6, 0], pose: { open: { turn: [-100, 0, 0] } }, ease: 0.8 }],
    interactions: [
      {
        socket: 'lid',
        when: { state: 'closed' },
        do: [
          { do: 'sound', event: SND.chest },
          { do: 'setState', state: 'open' },
          { do: 'emit', event: 'boss-chest-opened' },
        ],
      },
    ],
  });
}

function crackedWall(): Raw {
  const b = new Build();
  // its cracks: dark stones running up through it
  b.stack(0, 0, 4, 1, 0, 4, (i) => (i % 2 === 1 ? C.iron : C.stoneDark));
  return asset('Cracked wall', 'structure', [4, 1], b, {
    smash: { enabled: true, rebuild: false, sound: null, studs: 0, after: 'gone' },
    health: {
      hp: 3,
      resist: { slash: 0, blunt: 0, pierce: 0, fire: 0, electric: 0, light: 0, ice: 0, explosive: 1 },
      atZero: { break: true, emit: 'wall-blown' },
    },
  });
}

function pushBlock(): Raw {
  const b = new Build();
  b.stack(0, 0, 2, 2, 0, 2, (i) => (i % 2 ? C.stoneLight : C.stone));
  b.put('tile', 1, 1, 0, 6, 0, C.gold);
  // step 12a: it slides square along the floor, two studs a shove; hold Action to pull it back
  return asset('Push block', 'prop', [2, 2], b, { push: { pull: true } });
}

function floorSwitch(): Raw {
  const b = new Build();
  // up: a pad on a dark rim, a plate above the ground; down: pressed flat into the ground, a plate lower (what
  // stands on it sinks with it)
  const up = [b.put('plate', 2, 2, 0, 0, 0, C.stoneDark), b.put('plate', 2, 2, 0, 1, 0, C.gold)];
  const down = [b.put('tile', 2, 2, 0, 0, 0, C.gold)];
  // step 12a: stepped on (by the hero or a block) it goes down and stays down
  return asset('Floor switch', 'prop', [2, 2], b, {
    states: ['up', 'down'],
    initialState: 'up',
    onlyIn: { up, down },
    switch: { by: 'step', stays: 'on' },
  });
}

// ---------- step 12a: puzzle pieces ----------
/** a floor switch in its own colours: blue held down (by a block), white on a timer */
function stepSwitch(name: string, color: string, sw: Raw['switch']): Raw {
  const b = new Build();
  // up: a pad on a dark rim, a plate above the ground; down: pressed flat into the ground, a plate lower (what
  // stands on it sinks with it)
  const up = [b.put('plate', 2, 2, 0, 0, 0, C.stoneDark), b.put('plate', 2, 2, 0, 1, 0, color)];
  const down = [b.put('tile', 2, 2, 0, 0, 0, color)];
  return asset(name, 'prop', [2, 2], b, {
    states: ['up', 'down'],
    initialState: 'up',
    onlyIn: { up, down },
    switch: sw,
  });
}

function crystalSwitch(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.stoneDark);
  b.put('brick', 1, 1, 0, 1, 0, C.stone);
  b.put('brick', 1, 1, 1, 1, 1, C.stone);
  const off = [b.put('brick', 2, 2, 0, 4, 0, C.water), b.put('plate', 1, 1, 0, 7, 0, C.white)];
  const on = [b.put('brick', 2, 2, 0, 4, 0, C.red), b.put('plate', 1, 1, 1, 7, 1, C.flame)];
  return asset('Crystal switch', 'prop', [2, 2], b, {
    states: ['off', 'on'],
    initialState: 'off',
    onlyIn: { off, on },
    switch: { by: 'hit', stays: 'toggle' },
    lockOn: true,
    light: { color: '#7fc8ff', brightness: 1, range: 6, flicker: 0, shadow: false, at: [1, 2.4, 1] },
  });
}

function lever(): Raw {
  const b = new Build();
  b.put('plate', 1, 2, 0, 0, 0, C.stoneDark);
  b.put('brick', 1, 2, 0, 1, 0, C.stone);
  const off = [b.put('plate', 1, 1, 0, 4, 0, C.wood), b.put('brick', 1, 1, 0, 5, 0, C.red)];
  const on = [b.put('plate', 1, 1, 1, 4, 0, C.wood), b.put('brick', 1, 1, 1, 5, 0, C.gold)];
  return asset('Lever', 'prop', [2, 1], b, {
    states: ['off', 'on'],
    initialState: 'off',
    onlyIn: { off, on },
    sockets: [{ id: 'lever', kind: 'interact', pos: [1, 1.6, 1.3], prompt: 'Pull' }],
    switch: { by: 'press', stays: 'toggle' },
  });
}

function bossDoor(): Raw {
  const b = new Build();
  b.stack(0, 0, 1, 1, 0, 5, C.stoneDark);
  b.stack(6, 0, 1, 1, 0, 5, C.stoneDark);
  // the lintel in two runs, each held by a pillar (the door is gone when open)
  b.put('brick', 1, 4, 0, 15, 0, C.stone);
  b.put('brick', 1, 3, 4, 15, 0, C.stone);
  b.put('tile', 1, 3, 2, 18, 0, C.red);
  const door = b.stack(1, 0, 5, 1, 0, 5, (i) => (i % 4 === 1 ? C.gold : C.red));
  return asset('Boss door', 'structure', [7, 1], b, {
    states: ['locked', 'open'],
    initialState: 'locked',
    onlyIn: { locked: door },
    sockets: [{ id: 'door', kind: 'interact', pos: [3.5, 1.4, 1.2], prompt: 'Unlock' }],
    lock: { key: 'boss' },
  });
}

/** a key lying on the floor: a ring, a shaft and teeth */
function key(name: string, color: string, item: string): Raw {
  const b = new Build();
  b.put('plate', 1, 1, 0, 0, 0, color);
  b.put('plate', 1, 1, 0, 0, 1, color);
  b.put('plate', 1, 1, 0, 0, 2, color);
  b.put('plate', 1, 1, 1, 0, 2, color);
  b.put('tile', 1, 1, 1, 0, 0, color);
  b.put('plate', 1, 1, 0, 1, 0, C.white);
  return asset(name, 'prop', [2, 3], b, { pickup: { item } });
}

function dungeonMap(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.straw);
  b.put('tile', 1, 1, 0, 1, 0, C.wood);
  b.put('tile', 1, 1, 1, 1, 1, C.red);
  return asset('Dungeon map', 'prop', [2, 2], b, { pickup: { item: 'Dungeon map' } });
}

function compass(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.gold);
  b.put('tile', 1, 1, 0, 1, 0, C.red);
  b.put('tile', 1, 1, 1, 1, 1, C.white);
  return asset('Compass', 'prop', [2, 2], b, { pickup: { item: 'Compass' } });
}

function smallChest(): Raw {
  const b = new Build();
  b.put('brick', 2, 4, 0, 0, 0, C.wood);
  b.put('plate', 2, 4, 0, 3, 0, C.gold);
  const lid = [b.put('brick', 2, 4, 0, 4, 0, C.woodDark), b.put('tile', 1, 1, 1, 7, 1, C.gold)];
  return asset('Small chest', 'prop', [4, 2], b, {
    states: ['closed', 'open'],
    initialState: 'closed',
    sockets: [{ id: 'lid', kind: 'interact', pos: [2, 2.4, 2.4], prompt: 'Open' }],
    parts: [{ name: 'Lid', bricks: lid, hinge: [2, 1.6, 0], pose: { open: { turn: [-100, 0, 0] } }, ease: 0.6 }],
    interactions: [
      {
        socket: 'lid',
        when: { state: 'closed' },
        do: [
          { do: 'sound', event: SND.chest },
          { do: 'setState', state: 'open' },
          { do: 'give', item: 'Small key' },
        ],
      },
    ],
  });
}

function spikes(): Raw {
  const b = new Build();
  b.layer('plate', 0, 0, 2, 2, 0, C.stoneDark);
  for (const [x, z] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const)
    b.put('plate', 1, 1, x, 1, z, C.stoneLight);
  return asset('Spike trap', 'prop', [2, 2], b, {
    sockets: [{ id: 'spikes', kind: 'sound', pos: [1, 0.6, 1] }],
  });
}

function stairs(): Raw {
  const b = new Build();
  for (let i = 0; i < 4; i++) b.stack(0, i, 4, 1, 0, i + 1, stones);
  return asset('Stone stairs', 'structure', [4, 4], b);
}

function guardianStatue(): Raw {
  const b = new Build();
  b.put('brick', 2, 2, 0, 0, 0, C.stoneDark);
  b.put('brick', 2, 2, 0, 3, 0, C.stone);
  b.put('brick', 2, 2, 0, 6, 0, C.stone);
  b.put('plate', 2, 2, 0, 9, 0, C.stoneLight);
  b.put('brick', 2, 2, 0, 10, 0, C.stone);
  // its watching eyes, on top at the front, and a crest behind
  b.put('tile', 1, 1, 0, 13, 1, C.red);
  b.put('tile', 1, 1, 1, 13, 1, C.red);
  b.put('plate', 1, 2, 0, 13, 0, C.stoneDark);
  return asset('Guardian statue', 'decoration', [2, 2], b, { lockOn: true });
}

// ---------- village ----------
function cottage(): Raw {
  const b = new Build();
  // walls: the back, the sides, and the front with a door in the middle (a lintel over it)
  b.stack(0, 0, 6, 1, 0, 3, C.white);
  b.stack(0, 1, 1, 3, 0, 3, C.white);
  b.stack(5, 1, 1, 3, 0, 3, C.white);
  b.stack(0, 4, 2, 1, 0, 3, C.white);
  b.stack(4, 4, 2, 1, 0, 3, C.white);
  b.put('brick', 1, 2, 2, 6, 4, C.woodDark);
  // the roof steps in, and a chimney at the back
  for (let z = 0; z < 5; z++) b.put('plate', 1, 6, 0, 9, z, C.roof);
  for (let z = 1; z < 4; z++) b.put('plate', 1, 4, 1, 10, z, C.roof);
  b.put('plate', 1, 2, 2, 11, 2, C.roof);
  b.put('brick', 1, 1, 4, 10, 0, C.stoneDark);
  b.put('brick', 1, 1, 4, 13, 0, C.stoneDark);
  return asset('Cottage', 'building', [6, 5], b);
}

function well(): Raw {
  const b = new Build();
  b.layer('brick', 0, 0, 3, 1, 0, C.stone);
  b.layer('brick', 0, 2, 3, 1, 0, C.stone);
  b.put('brick', 1, 1, 0, 0, 1, C.stone);
  b.put('brick', 1, 1, 2, 0, 1, C.stone);
  b.put('plate', 1, 1, 1, 0, 1, C.water);
  b.put('brick', 1, 1, 0, 3, 1, C.wood);
  b.put('brick', 1, 1, 2, 3, 1, C.wood);
  b.put('brick', 1, 1, 0, 6, 1, C.wood);
  b.put('brick', 1, 1, 2, 6, 1, C.wood);
  b.put('plate', 2, 3, 0, 9, 1, C.roof);
  b.put('plate', 2, 3, 0, 10, 0, C.roof);
  return asset('Well', 'structure', [3, 3], b);
}

function barrel(): Raw {
  const b = new Build();
  b.put('brick', 2, 2, 0, 0, 0, C.wood);
  b.put('plate', 2, 2, 0, 3, 0, C.iron);
  b.put('brick', 2, 2, 0, 4, 0, C.wood);
  b.put('tile', 2, 2, 0, 7, 0, C.woodDark);
  return asset('Barrel', 'prop', [2, 2], b, {
    smash: { enabled: true, rebuild: false, sound: null, studs: 0, after: 'gone' },
    health: { hp: 2, atZero: { break: true, loot: [{ item: 'rupee', count: 1, chance: 0.5 }] } },
  });
}

function grassTuft(): Raw {
  const b = new Build();
  b.put('plate', 2, 2, 0, 0, 0, C.green);
  b.put('plate', 1, 1, 0, 1, 0, C.moss);
  b.put('plate', 1, 1, 1, 1, 1, C.moss);
  b.put('plate', 1, 1, 0, 2, 0, C.green);
  return asset('Grass tuft', 'nature', [2, 2], b, {
    smash: { enabled: true, rebuild: false, sound: null, studs: 0, after: 'respawn', respawnAfter: 0 },
    health: {
      hp: 1,
      resist: { blunt: 0.5 },
      atZero: {
        break: true,
        loot: [
          { item: 'heart', count: 1, chance: 0.15 },
          { item: 'rupee', count: 1, chance: 0.15 },
        ],
      },
    },
  });
}

function bridge(): Raw {
  const b = new Build();
  for (let z = 0; z < 8; z++) b.put('plate', 1, 3, 0, 0, z, z % 2 ? C.wood : C.woodDark);
  for (const z of [0, 7]) {
    b.put('brick', 1, 1, 0, 1, z, C.woodDark);
    b.put('brick', 1, 1, 2, 1, z, C.woodDark);
  }
  return asset('Plank bridge', 'structure', [3, 8], b);
}

export const STARTER_ASSETS: Record<string, Raw> = {
  'dungeon-wall': dungeonWall(),
  'dungeon-pillar': dungeonPillar(),
  'stone-archway': archway(),
  'barred-gate': barredGate(),
  'locked-door': lockedDoor(),
  'wall-torch': wallTorch(),
  brazier: brazier(),
  'clay-pot': pot(),
  'boss-chest': bossChest(),
  'cracked-wall': crackedWall(),
  'push-block': pushBlock(),
  'floor-switch': floorSwitch(),
  'spike-trap': spikes(),
  'stone-stairs': stairs(),
  'guardian-statue': guardianStatue(),
  cottage: cottage(),
  well: well(),
  barrel: barrel(),
  'grass-tuft': grassTuft(),
  'plank-bridge': bridge(),
  // step 12a: puzzle pieces
  'weight-switch': stepSwitch('Weight switch', C.water, { by: 'step', stays: 'held' }),
  'timer-switch': stepSwitch('Timer switch', C.white, { by: 'step', stays: 'timed', seconds: 10 }),
  'crystal-switch': crystalSwitch(),
  lever: lever(),
  'boss-door': bossDoor(),
  'small-key': key('Small key', C.gold, 'Small key'),
  'boss-key': key('Boss key', C.red, 'Boss key'),
  'dungeon-map': dungeonMap(),
  compass: compass(),
  'small-chest': smallChest(),
};
