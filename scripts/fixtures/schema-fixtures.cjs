// Writes tests/fixtures/schema/<kind>.{valid,invalid}.json from the Project files tab examples.
// Run: node scripts/fixtures/schema-fixtures.cjs
const fs = require('node:fs');
const D = 'tests/fixtures/schema/';
const M = 'map_town01aaaa',
  SP = 'sp_plaza00001';
const H = '0123456789abcdef'.repeat(4);
const valid = {
  project: [
    'project.json',
    {
      format: 'brickworlds-project',
      schema: 5,
      id: 'prj_8f2kq0x1ab',
      name: 'Volcano Rescue',
      created: '2026-10-09T19:00:00Z',
      modified: '2026-10-09T19:42:10Z',
      entry: { map: M, spawn: SP, screen: 'scr_splash0001' },
      hero: 'chr_hero000001',
      files: { [`maps/${M}/map.json`]: { hash: 'b3a1b3a1b3a1b3a1', bytes: 2114 } },
    },
  ],
  settings: ['settings.json', { quality: 'auto' }],
  map: [
    `maps/${M}/map.json`,
    {
      id: M,
      name: 'Harbor Town',
      size: { w: 256, d: 256 },
      sky: { time: 'day' },
      weather: { rain: false, snow: false, snowing: false },
      generator: {
        environments: ['city', 'forest'],
        seed: 418811,
        size: 32,
        mountainShape: 'mixed',
        mountainScale: 'mixed',
        version: 2,
        locked: false,
      },
      music: 'mus_town000001',
      ambience: 'snd_harbor0amb',
      spawns: [{ id: SP, name: 'Plaza', pos: [128, 3, 120], yaw: 3.14 }],
      zones: [
        {
          id: 'zn_shop000001',
          shape: 'box',
          min: [100, 0, 90],
          max: [130, 30, 110],
          tags: ['music'],
          music: 'mus_market0001',
          onEnter: [{ do: 'emit', event: 'zone.shop.enter' }],
        },
      ],
    },
  ],
  chunk: [
    `maps/${M}/chunks/4_3.json`,
    {
      cx: 4,
      cz: 3,
      palette: {
        types: ['brick2x4', 'plate2x2', 'slope2x2'.replace('slope', 'tile')],
        colors: ['#c91a09', '#f2cd37', '#a0a5a9'],
        groups: ['house-1'],
      },
      bricks: [
        [0, 130, 3, 98, 1, 0, 3, 1, 0],
        [1, 132, 6, 98, 0, 1, 3, 2, -1],
        [2, 130, 9, 100, 2, 2, 11, 3, -1],
      ],
    },
  ],
  instances: [
    `maps/${M}/instances.json`,
    {
      npcsSaved: true,
      items: [
        {
          id: 'ins_0000000001',
          kind: 'npc',
          character: 'chr_0000000001',
          legacyId: 1,
          biome: 'prairie',
          role: 'Runner',
          state: { x: -4.2, y: 1.2, z: 0.3, heading: 1 },
        },
        { id: 'ins_chest00001', kind: 'asset', asset: 'ast_chest00001', pos: [10, 3, 4], rot: 1 },
      ],
    },
  ],
  state: [
    `maps/${M}/state.json`,
    {
      broken: [
        {
          id: 1,
          originals: [
            {
              id: 181,
              rows: 2,
              cols: 2,
              turn: 0,
              x: -45,
              y: 1,
              z: -21,
              kind: 'brick',
              color: 8,
              group: 'tree-willow-1',
            },
          ],
        },
      ],
      player: null,
    },
  ],
  gates: [
    'world/gates.json',
    {
      gates: [
        {
          id: 'gt_0000000001',
          from: { map: M, spawn: SP },
          to: { map: 'map_0000000002', spawn: 'sp_0000000001' },
          twoWay: true,
        },
      ],
      mapOrder: [M, 'map_0000000002'],
    },
  ],
  asset: [
    'assets/ast_chest00001.json',
    {
      id: 'ast_chest00001',
      name: 'Treasure chest',
      category: 'prop',
      bricks: [
        [0, 0, 0, 0, 0, 3, 3],
        [1, 0, 3, 0, 0, 1, 3],
      ],
      palette: { types: ['brick2x4', 'plate2x4'], colors: ['#6b3f1f', '#f2cd37', '#000', '#8a5a2b'] },
      pivot: [1, 0, 2],
      footprint: [4, 2],
      sockets: [{ id: 'use', kind: 'interact', pos: [1, 4, -1], prompt: 'Open' }],
      states: ['closed', 'open'],
      initialState: 'closed',
      interactions: [
        {
          socket: 'use',
          when: { state: 'closed' },
          do: [
            { do: 'setState', state: 'open' },
            { do: 'sound', event: 'snd_chestopen1' },
            { do: 'showScreen', screen: 'scr_reward0001' },
          ],
        },
      ],
      smash: { enabled: true, rebuild: true, sound: 'snd_woodcrash1', studs: 20 },
      generator: { environments: ['city'], weight: 0.2, placeOn: 'street' },
    },
  ],
  character: [
    'characters/chr_hero000001.json',
    {
      id: 'chr_hero000001',
      name: 'Ava',
      role: 'hero',
      profile: { name: 'Ava', hair: 'Ponytail', height: 'Tall' },
      legacyId: 1,
    },
  ],
  clip: [
    'clips/clp_clubstrike.json',
    {
      id: 'clp_clubstrike',
      length: 0.6,
      loop: false,
      tracks: [
        {
          bone: 'armR',
          prop: 'rot.x',
          keys: [
            [0, 0, 'easeOut'],
            [0.25, -110, 'easeIn'],
            [0.6, 0, 'linear'],
          ],
        },
      ],
      events: [
        { t: 0.25, emit: 'hit' },
        { t: 0.25, sound: 'snd_swing00001' },
      ],
    },
  ],
  logic: [
    'logic/lg_repairq001.json',
    {
      id: 'lg_repairq001',
      name: 'Repair 3 buildings',
      scope: 'global',
      nodes: [
        { id: 'n1', type: 'event.onRebuildFinished', pos: [40, 80] },
        { id: 'n2', type: 'var.add', pos: [300, 80], args: { var: 'repaired', value: 1 } },
        { id: 'n3', type: 'flow.branch', pos: [540, 80] },
        { id: 'n4', type: 'cmp.gte', pos: [540, 200], args: { b: 3 } },
        { id: 'n5', type: 'var.get', pos: [300, 200], args: { var: 'repaired' } },
        { id: 'n6', type: 'cinematic.play', pos: [780, 60], args: { cinematic: 'cin_reward0001', once: true } },
      ],
      edges: [
        ['n1', 'then', 'n2', 'exec'],
        ['n2', 'then', 'n3', 'exec'],
        ['n5', 'value', 'n4', 'a'],
        ['n4', 'result', 'n3', 'cond'],
        ['n3', 'then', 'n6', 'exec'],
      ],
    },
  ],
  variables: ['logic/variables.json', { vars: { repaired: { type: 'number', default: 0, scope: 'global' } } }],
  screen: [
    'screens/scr_hud0000001.json',
    {
      id: 'scr_hud0000001',
      kind: 'hud',
      name: 'Main HUD',
      root: {
        type: 'panel',
        children: [
          {
            type: 'text',
            id: 'quest',
            anchor: [0, 0],
            offset: [24, 24],
            text: 'Repaired {repaired}/3',
            bind: ['repaired'],
            style: { size: 22, color: '#ffffff' },
          },
          { type: 'hearts', anchor: [1, 0], offset: [-24, 24], bind: ['hero.hp'] },
          {
            type: 'button',
            anchor: [1, 1],
            offset: [-24, -24],
            label: 'Pause',
            touchOnly: true,
            sound: 'snd_uiclick001',
            onPress: [{ do: 'showScreen', screen: 'scr_pause00001' }],
          },
        ],
      },
      music: null,
      pausesGame: false,
    },
  ],
  cinematic: [
    'cinematics/cin_reward0001.json',
    {
      id: 'cin_reward0001',
      name: 'Mayor thanks you',
      map: M,
      length: 10,
      skippable: true,
      letterbox: true,
      hideHud: true,
      cast: [
        { role: 'hero', actor: '$hero' },
        { role: 'mayor', actor: 'chr_mayor00001' },
      ],
      marks: [{ id: 'm1', pos: [128, 3, 112], yaw: 0 }],
      tracks: [
        {
          kind: 'actor',
          role: 'mayor',
          items: [
            { t: 0, do: 'moveTo', mark: 'm1', speed: 'walk' },
            { t: 3, do: 'say', text: 'You fixed the town!', dur: 2.5 },
            { t: 3, do: 'play', clip: 'clp_wave000001' },
          ],
        },
        {
          kind: 'camera',
          items: [
            { t: 0, shot: 'wide', pos: [140, 20, 140], look: 'mayor', fov: 50 },
            { t: 3, shot: 'close', follow: 'mayor', offset: [0, 4, 8], blend: 0.8 },
          ],
        },
        { kind: 'music', items: [{ t: 0, music: 'mus_triumph001', fade: 1 }] },
        { kind: 'sfx', items: [{ t: 8.5, event: 'snd_fireworks1' }] },
        { kind: 'event', items: [{ t: 10, emit: 'cine.reward.done' }] },
      ],
    },
  ],
  soundEvents: [
    'audio/events.json',
    {
      events: {
        snd_woodcrash1: {
          clips: [`sha256:${H}`],
          pick: 'random',
          volume: -6,
          pitch: [0.9, 1.1],
          bus: 'sfx',
          spatial: true,
          maxVoices: 4,
          cooldown: 0.05,
        },
      },
    },
  ],
  music: [
    'audio/music.json',
    {
      states: { mus_town000001: { layers: [{ media: `sha256:${H}`, volume: -8 }], loop: true, bpm: 100 } },
      crossfade: 1.5,
      stingers: { 'quest.done': `sha256:${H}` },
    },
  ],
  mixer: [
    'audio/mixer.json',
    {
      buses: { master: 0, music: -4, sfx: 0, voice: 0, ui: -3, ambience: -8 },
      duck: [{ when: 'voice', target: 'music', amount: -10, attack: 0.1, release: 0.6 }],
    },
  ],
};
const invalid = {
  project: (o) => {
    o.schema = 4;
  },
  settings: (o) => {
    o.quality = 'ultra';
  },
  map: (o) => {
    o.spawns[0].id = 'sp_short';
  },
  chunk: (o) => {
    o.bricks[0][1] = 10;
  },
  instances: (o) => {
    o.items[0].kind = 'robot';
  },
  state: (o) => {
    o.broken[0].originals = [];
  },
  gates: (o) => {
    o.gates[0].twoWay = 'yes';
  },
  asset: (o) => {
    o.interactions[0].do[0] = { do: 'explode' };
  },
  character: (o) => {
    o.role = 'villain';
  },
  clip: (o) => {
    o.tracks[0].keys[0][2] = 'bouncy';
  },
  logic: (o) => {
    o.edges.push(['n1', 'then', 'n99', 'exec']);
  },
  variables: (o) => {
    o.vars['1bad'] = { type: 'number', default: 0, scope: 'global' };
  },
  screen: (o) => {
    o.root.children[0].type = 'marquee';
  },
  cinematic: (o) => {
    o.tracks[0].items[0].speed = 'fly';
  },
  soundEvents: (o) => {
    o.events.snd_woodcrash1.clips = ['crash.ogg'];
  },
  music: (o) => {
    o.crossfade = -1;
  },
  mixer: (o) => {
    delete o.buses.ui;
  },
};
for (const [k, [path, value]] of Object.entries(valid)) {
  fs.writeFileSync(`${D + k}.valid.json`, `${JSON.stringify({ path, value }, null, 1)}\n`);
  const v = JSON.parse(JSON.stringify(value));
  invalid[k](v);
  fs.writeFileSync(`${D + k}.invalid.json`, `${JSON.stringify({ path, value: v }, null, 1)}\n`);
}
console.log(Object.keys(valid).length);
