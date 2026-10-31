/**
 * Step 11, 4c: the ten script templates of the adventure starter pack. Each is a short form (which door, which
 * boss, how many) and the logic code it writes from the answers. The code goes through the same parser as the
 * Logic workspace's Code view, so a template makes an ordinary logic file that can be read and changed like any
 * other. Names in the code (assets, zones, spawn points, sounds, music) are turned into ids by the name book.
 */

export type FieldKind = 'asset' | 'zone' | 'spawn' | 'character' | 'item' | 'number' | 'text' | 'state';

export type TemplateField = {
  key: string;
  label: string;
  kind: FieldKind;
  default: string | number;
  help: string;
  /** a number field's range */
  min?: number;
  max?: number;
  /** it may be left empty */
  optional?: boolean;
};

export type TemplateVar = { name: string; type: 'number' | 'bool'; default: number | boolean };

export type ScriptTemplate = {
  id: string;
  name: string;
  /** one line: what it does in the game */
  about: string;
  /** what to put on the map first, if anything */
  needs?: string;
  fields: TemplateField[];
  /** variables it keeps (their names get a number added when a game already has one) */
  vars: TemplateVar[];
  /** the logic code, from the answers; `v(name)` is a variable's final name */
  code(a: Record<string, string | number>, v: (name: string) => string): string;
};

const q = (s: unknown) => JSON.stringify(String(s));
const n = (s: unknown, d: number) => (Number.isFinite(Number(s)) ? Math.round(Number(s)) : d);

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: 'locked-door',
    name: 'Locked door and key',
    about: 'A door that opens with an item you choose (the pack’s Locked door needs no script: a small key opens it)',
    needs: 'a door with an open state',
    fields: [
      {
        key: 'door',
        label: 'Door',
        kind: 'asset',
        default: 'Locked door',
        help: 'The door asset (its copy nearest the hero opens). The pack’s Locked door and Boss door open with their keys by themselves.',
      },
      {
        key: 'key',
        label: 'Key item',
        kind: 'item',
        default: 'Key',
        help: 'The item the hero carries (given by a chest, an enemy’s loot or Give item).',
      },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'The door’s state when open.' },
    ],
    vars: [{ name: 'doorOpen', type: 'bool', default: false }],
    code: (a, v) => `// ${a.door} opens with a ${a.key}: the key is used up
on("interact", { asset: ${q(a.door)} }, (e) => {
  if (!vars.${v('doorOpen')}) {
    if ((items.count(${q(a.key)}) >= 1)) {
      vars.${v('doorOpen')} = true;
      items.take(${q(a.key)}, 1);
      world.setState(${q(a.door)}, ${q(a.open)});
      audio.playSound("secret");
      say("The door unlocks.", 2);
    } else {
      say("It’s locked. You need a ${String(a.key).replace(/"/g, '')}.", 2);
    }
  }
});
`,
  },
  {
    id: 'switch-gate',
    name: 'Switch opens a gate',
    about: 'A switch turning on opens a barred gate, with a secret-found sound',
    needs: 'a switch (Floor, Weight, Timer, Crystal or Lever) and a Barred gate (Starter pack)',
    fields: [
      {
        key: 'switch',
        label: 'Switch',
        kind: 'asset',
        default: 'Floor switch',
        help: 'The switch: stepped on, hit or pressed, as it is made. A held or timed switch shuts the gate again when it goes off.',
      },
      { key: 'gate', label: 'Gate', kind: 'asset', default: 'Barred gate', help: 'What opens.' },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'The gate’s state when open.' },
      { key: 'shut', label: 'Shut state', kind: 'state', default: 'closed', help: 'The gate’s state when shut.' },
    ],
    vars: [],
    code: (a) => `// the ${a.switch} on: the ${a.gate} opens; off again (held or timed): it shuts
on("switch", { asset: ${q(a.switch)}, to: "on" }, (e) => {
  world.setState(${q(a.gate)}, ${q(a.open)});
  audio.playSound("secret");
  say("Something opened nearby…", 2);
});

on("switch", { asset: ${q(a.switch)}, to: "off" }, (e) => {
  world.setState(${q(a.gate)}, ${q(a.shut)});
});
`,
  },
  {
    id: 'light-torches',
    name: 'Light all the torches',
    about: 'When every torch stand is lit, a gate opens; one going out (a timed torch) shuts it again',
    needs: 'torch stands (Torch stand or Timed torch, Starter pack › Fire and light) and a Barred gate',
    fields: [
      {
        key: 'torch',
        label: 'Torches',
        kind: 'asset',
        default: 'Torch stand',
        help: 'The torch stands to light (with a torch’s flame).',
      },
      {
        key: 'count',
        label: 'How many',
        kind: 'number',
        default: 2,
        min: 1,
        max: 20,
        help: 'How many must burn at once.',
      },
      { key: 'gate', label: 'Gate', kind: 'asset', default: 'Barred gate', help: 'What opens.' },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'Its state when open.' },
      { key: 'shut', label: 'Shut state', kind: 'state', default: 'closed', help: 'Its state when shut.' },
    ],
    vars: [{ name: 'torchesLit', type: 'number', default: 0 }],
    code: (a, v) => `// all ${n(a.count, 2)} ${a.torch} lit: the ${a.gate} opens; one going out shuts it
on("switch", { asset: ${q(a.torch)}, to: "on" }, (e) => {
  vars.${v('torchesLit')} += 1;
  if ((vars.${v('torchesLit')} === ${n(a.count, 2)})) {
    world.setState(${q(a.gate)}, ${q(a.open)});
    audio.playSound("secret");
    say("All the torches burn. Something opened…", 2);
  }
});

on("switch", { asset: ${q(a.torch)}, to: "off" }, (e) => {
  vars.${v('torchesLit')} -= 1;
  world.setState(${q(a.gate)}, ${q(a.shut)});
});
`,
  },
  {
    id: 'collect-open',
    name: 'Collect them all, then it opens',
    about: 'When the hero carries enough of an item (gems, keys, flowers), a door or gate opens once',
    fields: [
      {
        key: 'item',
        label: 'Item',
        kind: 'item',
        default: 'Gem',
        help: 'What the hero collects (from chests, pots, loot or Give item).',
      },
      { key: 'count', label: 'How many', kind: 'number', default: 5, min: 1, max: 99, help: 'How many open it.' },
      { key: 'door', label: 'Opens', kind: 'asset', default: 'Barred gate', help: 'What opens.' },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'Its state when open.' },
    ],
    vars: [],
    code: (a) => `// with ${n(a.count, 5)} × ${a.item} the ${a.door} opens (checked twice a second, once)
on("timer", { seconds: 0.5, repeat: true }, (e) => {
  if ((items.count(${q(a.item)}) >= ${n(a.count, 5)})) {
    once(() => {
      world.setState(${q(a.door)}, ${q(a.open)});
      audio.playSound("secret");
      say("All ${n(a.count, 5)} found! Something opened.", 3);
    });
  }
});
`,
  },
  {
    id: 'shop',
    name: 'Shop counter',
    about: 'The hero buys an item with coins at a counter; too few coins says what it costs',
    needs: 'something to buy at (a Barrel, a table, any asset the hero can use with E)',
    fields: [
      {
        key: 'counter',
        label: 'Counter',
        kind: 'asset',
        default: 'Barrel',
        help: 'The asset the hero uses (E) to buy.',
      },
      { key: 'item', label: 'Sells', kind: 'item', default: 'Bomb', help: 'What the hero gets.' },
      { key: 'amount', label: 'How many', kind: 'number', default: 5, min: 1, max: 99, help: 'How many per sale.' },
      { key: 'price', label: 'Price', kind: 'number', default: 10, min: 0, max: 9999, help: 'What it costs.' },
      { key: 'money', label: 'Paid in', kind: 'item', default: 'coin', help: 'The money item.' },
    ],
    vars: [],
    code: (a) => `// a shop: ${n(a.amount, 1)} × ${a.item} for ${n(a.price, 10)} ${a.money}
on("interact", { asset: ${q(a.counter)} }, (e) => {
  if ((items.count(${q(a.money)}) >= ${n(a.price, 10)})) {
    items.take(${q(a.money)}, ${n(a.price, 10)});
    world.give(${q(a.item)}, ${n(a.amount, 1)});
    audio.playSound("itemget");
    say("Thank you! ${n(a.amount, 1)} × ${String(a.item).replace(/"/g, '')} for you.", 2);
  } else {
    say("${n(a.amount, 1)} × ${String(a.item).replace(/"/g, '')} costs ${n(a.price, 10)} ${String(a.money).replace(/"/g, '')}.", 2);
  }
});
`,
  },
  {
    id: 'boss',
    name: 'Boss fight',
    about:
      'Entering the arena wakes the boss (roar, boss music); halfway it calls helpers; beaten, it vanishes and the way out opens',
    needs: 'the boss on the map, a zone for the arena, a spawn point for its helpers and a gate to open',
    fields: [
      { key: 'boss', label: 'Boss', kind: 'character', default: 'Gloomweaver', help: 'The boss’s name.' },
      { key: 'arena', label: 'Arena zone', kind: 'zone', default: '', help: 'Walking in wakes the boss.' },
      {
        key: 'hits',
        label: 'Angry after',
        kind: 'number',
        default: 6,
        min: 1,
        max: 99,
        help: 'Hits before it calls its helpers.',
      },
      { key: 'helper', label: 'Helpers', kind: 'character', default: 'Flitterwing', help: 'Who it calls (two).' },
      { key: 'at', label: 'Helpers come in at', kind: 'spawn', default: '', help: 'A spawn point in the arena.' },
      { key: 'gate', label: 'Opens when beaten', kind: 'asset', default: 'Barred gate', help: 'The way out.' },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'Its state when open.' },
    ],
    vars: [{ name: 'bossHits', type: 'number', default: 0 }],
    code: (a, v) => `// ${a.boss}: wakes in the arena, calls helpers when angry, opens the way out when beaten
on("enterZone", { zone: ${q(a.arena)} }, (e) => {
  once(() => {
    audio.playSound("bossroar");
    audio.setMusic("boss");
    say("${String(a.boss).replace(/"/g, '')} awakens!", 3);
  });
});

on("damaged", { who: ${q(a.boss)} }, (e) => {
  vars.${v('bossHits')} += 1;
  if ((vars.${v('bossHits')} === ${n(a.hits, 6)})) {
    say("${String(a.boss).replace(/"/g, '')} calls for help!", 2);
    character.spawn(${q(a.helper)}, ${q(a.at)});
    character.spawn(${q(a.helper)}, ${q(a.at)});
  }
});

on("defeated", { who: ${q(a.boss)} }, (e) => {
  effects.play("Boss vanish", "hero");
  audio.setMusic("village");
  audio.playSound("secret");
  world.setState(${q(a.gate)}, ${q(a.open)});
  say("Victory! The way out is open.", 3);
});
`,
  },
  {
    id: 'checkpoint',
    name: 'Checkpoint',
    about: 'Walking into a zone sets where the hero comes back after losing all hearts',
    needs: 'a zone where the checkpoint is',
    fields: [{ key: 'zone', label: 'Zone', kind: 'zone', default: '', help: 'Where the checkpoint is.' }],
    vars: [],
    code: (a) => `// a checkpoint: the hero comes back here
on("enterZone", { zone: ${q(a.zone)} }, (e) => {
  once(() => {
    game.setCheckpoint();
    effects.play("Item get", "hero");
    say("Checkpoint!", 2);
  });
});
`,
  },
  {
    id: 'timer',
    name: 'Race against the clock',
    about: 'A switch starts a countdown; reach the goal zone in time for a reward, or the gate shuts again',
    needs: 'a switch, a gate, a goal zone',
    fields: [
      {
        key: 'start',
        label: 'Start switch',
        kind: 'asset',
        default: 'Lever',
        help: 'What starts the race (a switch: a Lever, a Crystal switch…).',
      },
      { key: 'seconds', label: 'Seconds', kind: 'number', default: 15, min: 3, max: 300, help: 'Time allowed.' },
      { key: 'gate', label: 'Gate', kind: 'asset', default: 'Barred gate', help: 'Opens for the race only.' },
      { key: 'goal', label: 'Goal zone', kind: 'zone', default: '', help: 'Where the hero must get to.' },
      { key: 'reward', label: 'Reward', kind: 'item', default: 'Key', help: 'What the hero gets in time.' },
    ],
    vars: [
      { name: 'raceLeft', type: 'number', default: 0 },
      { name: 'racing', type: 'bool', default: false },
    ],
    code: (a, v) => `// a timed run: ${n(a.seconds, 15)} seconds from the ${a.start} to the goal
on("switch", { asset: ${q(a.start)} }, (e) => {
  vars.${v('raceLeft')} = ${n(a.seconds, 15)};
  vars.${v('racing')} = true;
  world.setState(${q(a.gate)}, "open");
  say("Go! ${n(a.seconds, 15)} seconds!", 1);
});

on("timer", { seconds: 1, repeat: true }, (e) => {
  if (vars.${v('racing')}) {
    vars.${v('raceLeft')} -= 1;
    say(vars.${v('raceLeft')}, 0.9);
    if ((vars.${v('raceLeft')} <= 0)) {
      vars.${v('racing')} = false;
      world.setState(${q(a.gate)}, "closed");
      say("Too slow! Use the switch to try again.", 3);
    }
  }
});

on("enterZone", { zone: ${q(a.goal)} }, (e) => {
  if (vars.${v('racing')}) {
    vars.${v('racing')} = false;
    world.give(${q(a.reward)}, 1);
    audio.playSound("secret");
    say("Made it!", 2);
  }
});
`,
  },
  {
    id: 'escort',
    name: 'Follow me home',
    about: 'A character follows the hero from one zone to another, then says thanks with a reward',
    needs: 'the character on the map, a zone where it waits and a zone that is its home',
    fields: [
      { key: 'who', label: 'Who', kind: 'character', default: 'Nim', help: 'The character to bring home.' },
      { key: 'from', label: 'Waits in zone', kind: 'zone', default: '', help: 'Where the hero finds it.' },
      { key: 'home', label: 'Home zone', kind: 'zone', default: '', help: 'Where to bring it.' },
      { key: 'reward', label: 'Reward', kind: 'item', default: 'coin', help: 'The thank-you.' },
      { key: 'amount', label: 'How many', kind: 'number', default: 20, min: 1, max: 999, help: 'How many.' },
    ],
    vars: [{ name: 'escorting', type: 'bool', default: false }],
    code: (a, v) => `// bring ${a.who} home
on("enterZone", { zone: ${q(a.from)} }, (e) => {
  once(() => {
    vars.${v('escorting')} = true;
    character.follow(${q(a.who)}, true);
    say("${String(a.who).replace(/"/g, '')}: Will you take me home? I’ll follow you!", 3);
  });
});

on("enterZone", { zone: ${q(a.home)} }, (e) => {
  if (vars.${v('escorting')}) {
    vars.${v('escorting')} = false;
    character.follow(${q(a.who)}, false);
    world.give(${q(a.reward)}, ${n(a.amount, 20)});
    audio.playSound("itemget");
    say("${String(a.who).replace(/"/g, '')}: Home! Thank you!", 3);
  }
});
`,
  },
  {
    id: 'waves',
    name: 'Waves of enemies',
    about: 'The arena shuts and enemies come in waves; beat them all and it opens',
    needs: 'a zone for the arena, a spawn point where they come in, a gate',
    fields: [
      { key: 'arena', label: 'Arena zone', kind: 'zone', default: '', help: 'Walking in starts the fight.' },
      { key: 'enemy', label: 'Enemy', kind: 'character', default: 'Rattlebones', help: 'Who comes in.' },
      { key: 'at', label: 'They come in at', kind: 'spawn', default: '', help: 'A spawn point in the arena.' },
      { key: 'waves', label: 'Waves', kind: 'number', default: 3, min: 1, max: 9, help: 'How many waves.' },
      {
        key: 'per',
        label: 'Enemies per wave',
        kind: 'number',
        default: 2,
        min: 1,
        max: 6,
        help: 'How many each time.',
      },
      { key: 'gate', label: 'Gate', kind: 'asset', default: 'Barred gate', help: 'Shut during the fight.' },
    ],
    vars: [
      { name: 'wave', type: 'number', default: 0 },
      { name: 'waveLeft', type: 'number', default: 0 },
    ],
    code: (a, v) => {
      const per = n(a.per, 2);
      const spawn = Array.from({ length: per }, () => `    character.spawn(${q(a.enemy)}, ${q(a.at)});`).join('\n');
      return `// ${n(a.waves, 3)} waves of ${per} × ${a.enemy}
on("enterZone", { zone: ${q(a.arena)} }, (e) => {
  if ((vars.${v('wave')} === 0)) {
    vars.${v('wave')} = 1;
    vars.${v('waveLeft')} = ${per};
    world.setState(${q(a.gate)}, "closed");
    say("Wave 1!", 2);
${spawn}
  }
});

on("defeated", { who: ${q(a.enemy)} }, (e) => {
  if ((vars.${v('wave')} >= 1)) {
    vars.${v('waveLeft')} -= 1;
    if ((vars.${v('waveLeft')} <= 0)) {
      if ((vars.${v('wave')} >= ${n(a.waves, 3)})) {
        vars.${v('wave')} = -1;
        world.setState(${q(a.gate)}, "open");
        audio.playSound("secret");
        say("The arena is clear!", 3);
      } else {
        vars.${v('wave')} += 1;
        vars.${v('waveLeft')} = ${per};
        say("Next wave!", 2);
${spawn.replace(/^ {4}/gm, '        ')}
      }
    }
  }
});
`;
    },
  },
  {
    id: 'room-clear',
    name: 'Clear the room, find the treasure',
    about: 'Beating enough enemies makes a chest appear',
    needs: 'the enemies on the map and a spawn point where the chest appears',
    fields: [
      { key: 'enemy', label: 'Enemy', kind: 'character', default: 'Pebblespout', help: 'Who must be beaten.' },
      { key: 'count', label: 'How many', kind: 'number', default: 3, min: 1, max: 50, help: 'How many to beat.' },
      { key: 'chest', label: 'Appears', kind: 'asset', default: 'Boss chest', help: 'What appears.' },
      { key: 'at', label: 'At', kind: 'spawn', default: '', help: 'The spawn point where it appears.' },
    ],
    vars: [{ name: 'beaten', type: 'number', default: 0 }],
    code: (a, v) => `// beat ${n(a.count, 3)} × ${a.enemy} and a ${a.chest} appears
on("defeated", { who: ${q(a.enemy)} }, (e) => {
  vars.${v('beaten')} += 1;
  if ((vars.${v('beaten')} === ${n(a.count, 3)})) {
    world.spawn(${q(a.chest)}, ${q(a.at)});
    audio.playSound("secret");
    say("A treasure chest appeared!", 3);
  }
});
`,
  },
];

export const scriptTemplate = (id: string) => SCRIPT_TEMPLATES.find((t) => t.id === id) ?? null;
