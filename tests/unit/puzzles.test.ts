import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { SCRIPT_TEMPLATES } from '../../src/builtin/templates/scripts';
import { CommandBus, registerAll } from '../../src/core/commands';
import { nameBook, withIds } from '../../src/core/logic/code/names';
import { parseCode } from '../../src/core/logic/code/parse';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { dungeonItem, lockItem, puzzleProblems, switchHitBy } from '../../src/core/puzzles/puzzle';
import { SaveGame } from '../../src/core/save/save';
import { Asset, MapDoc, paths, validateFile } from '../../src/core/schema';
import { applySave, captureSave } from '../../src/engine/runtime/saves';
import { PlaySession } from '../../src/engine/runtime/session';

/** Step 12a: push blocks, switches, locks, pickups and each dungeon's keys, map and compass. */
const piece = (name: string) => BUILTIN_ASSETS.find((a) => a.name === name)!;

function game(
  things: [string, [number, number, number], string, number?][],
  opts: { dungeon?: boolean; code?: string } = {},
) {
  const store = new ProjectStore(newProjectFiles({ name: 'Dungeon', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const run = (c: unknown) => {
    const r = bus.execute(c as Parameters<typeof bus.execute>[0], { source: 'user' });
    expect(r.ok, r.error).toBe(true);
  };
  for (const [name, pos, id, rot] of things) {
    const def = piece(name);
    if (!store.has(paths.asset(def.id))) run({ type: 'asset.create', payload: { asset: def } });
    run({ type: 'asset.place', payload: { map, asset: def.id, pos, rot: rot ?? 0, id } });
  }
  // the corners of the play area (the hero is kept inside the bricks' bounds)
  const pot = piece('Grass tuft');
  run({ type: 'asset.create', payload: { asset: pot } });
  run({ type: 'asset.place', payload: { map, asset: pot.id, pos: [-4, 0, -4], rot: 0, id: 'ins_corner0001' } });
  run({ type: 'asset.place', payload: { map, asset: pot.id, pos: [44, 0, 36], rot: 0, id: 'ins_corner0002' } });
  if (opts.dungeon) run({ type: 'map.setDungeon', payload: { map, dungeon: true } });
  if (opts.code) {
    const parsed = parseCode(opts.code);
    if ('error' in parsed) throw new Error(parsed.error.message);
    const r = withIds(parsed, nameBook(store));
    run({
      type: 'logic.create',
      payload: { graph: { id: 'lg_gatetst001', name: 'Gate', scope: 'global', nodes: r.nodes, edges: r.edges } },
    });
  }
  const p = new PlaySession(store.snapshot());
  const get = (id: string) => p.world.instances.find((i) => i.inst.id === id)!;
  return { store, bus, map, p, get };
}
const steps = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};
/** the hero walks the way the camera looks (+x with this yaw) */
const walkX = (p: PlaySession, sign: 1 | -1) => {
  p.camYaw = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
  p.input.keys.add('forward');
};

describe('puzzle parts', () => {
  it('validate, and say what is wrong', () => {
    expect(validateFile(paths.asset(piece('Push block').id), piece('Push block'))).toEqual([]);
    const bad = { ...piece('Floor switch'), switch: { by: 'kick', stays: 'on' } };
    expect(validateFile(paths.asset(bad.id), bad).length).toBeGreaterThan(0);
    expect(puzzleProblems({ name: 'Rock', states: ['a'], switch: { by: 'hit', stays: 'held' } }).join(' ')).toMatch(
      /one state.*only a floor switch \(held down\), a light sensor/,
    );
    expect(switchHitBy({ by: 'hit', stays: 'toggle', hitBy: ['pierce'] }, 'slash')).toBe(false);
    expect(switchHitBy({ by: 'hit', stays: 'toggle' }, 'explosive')).toBe(true);
    expect(dungeonItem('small KEYS')).toBe('Small key');
    expect(dungeonItem('Big key')).toBe('Boss key');
    expect(dungeonItem('Bomb')).toBeNull();
    expect(dungeonItem('Dungeon map')).toBe('Dungeon map');
    expect(dungeonItem('map')).toBeNull(); // an ordinary item: it goes into the inventory
    expect(lockItem({ key: 'item', item: 'Moon gem' })).toBe('Moon gem');
    expect(MapDoc.shape.dungeon).toBeTruthy();
    expect(Asset.shape.pickup).toBeTruthy();
  });
});

const state = (p: PlaySession) => (p as unknown as { heroStates: { state: string } }).heroStates.state;

describe('push blocks', () => {
  it('held with Grab, walking into it for a moment slides it two studs; a wall stops it', () => {
    const { p, get } = game([
      ['Push block', [10, 0, 10], 'ins_block00001'],
      ['Dungeon wall', [16, 0, 8], 'ins_wall000001', 1],
    ]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    expect(p.puzzles.canGrab()).toBe(true);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    steps(p, 1.0);
    expect(get('ins_block00001').inst.pos[0]).toBe(12);
    // the hero came along behind it
    expect(p.heroState.x).toBeGreaterThan(10);
    // the wall is at x 16: one more shove reaches 14, then it is blocked
    steps(p, 1.2);
    expect(get('ins_block00001').inst.pos[0]).toBe(14);
    steps(p, 1.2);
    expect(get('ins_block00001').inst.pos[0]).toBe(14);
    expect(p.events.some((e) => /Push block: blocked/.test(e.msg))).toBe(true);
    // leaning into it the whole time
    expect(state(p)).toBe('push');
  });

  it('slides at an even pace: drawn between whole studs, the bricks a stud ahead', () => {
    const { p, get } = game([['Push block', [10, 0, 10], 'ins_block00001']]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    const seen: number[] = [];
    for (let t = 0; t < 1.2; t += 1 / 60) {
      p.runtime.stepOnce();
      const v = p.puzzles.slideView();
      if (v) seen.push(Number(get('ins_block00001').inst.pos[0]) + v.dx);
      // the first shove only
      else if (seen.length) break;
    }
    // drawn at many places between 10 and 12, always moving forward
    expect(seen.length).toBeGreaterThan(10);
    expect(new Set(seen.map((x) => x.toFixed(2))).size).toBeGreaterThan(10);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]! - 1e-9);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...seen)).toBeLessThanOrEqual(12);
  });

  it('walking into it without Grab does not push it: the hero climbs on top', () => {
    const { p, get } = game([['Push block', [10, 0, 10], 'ins_block00001']]);
    p.placeAt([8.6, 0.4, 11], Math.PI / 2);
    walkX(p, 1);
    let climbed = false;
    for (let t = 0; t < 2 && !(climbed && !p.puzzles.climbing); t += 1 / 60) {
      p.runtime.stepOnce();
      if (p.puzzles.climbing) climbed = true;
    }
    expect(get('ins_block00001').inst.pos[0]).toBe(10);
    expect(climbed).toBe(true);
    p.input.keys.delete('forward');
    steps(p, 0.3);
    // standing on it (2 bricks and a tile up)
    expect(p.heroState.y).toBeGreaterThan(2.5);
    expect(p.heroState.x).toBeGreaterThan(9.5);
    p.input.keys.delete('forward');
  });

  it('held with Grab, stepping back pulls it after the hero', () => {
    const { p, get } = game([['Push block', [10, 0, 10], 'ins_block00001']]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    expect(p.puzzles.canGrab()).toBe(true);
    expect(
      (p as unknown as { offersNow(): { kind: string; label: string }[] })
        .offersNow()
        .some((o) => o.kind === 'grab' && o.label === 'Grab'),
    ).toBe(true);
    p.puzzles.setGrab(true);
    p.camYaw = -Math.PI / 2;
    p.input.keys.add('back');
    steps(p, 1.0);
    expect(get('ins_block00001').inst.pos[0]).toBe(8);
    expect(p.heroState.x).toBeLessThan(7.6);
    expect(state(p)).toBe('pull');
    // the HUD says which key pushes and which pulls (the camera looks along +x: W walks into it)
    expect(p.lookup('prompt')).toBe('▲ W push · ▼ S pull');
    expect(p.puzzles.grabView()).toMatchObject({ dx: 1, dz: 0, pull: true, lean: 'pull' });
    p.puzzles.setGrab(false);
    p.input.keys.delete('back');
    steps(p, 0.3);
    expect(state(p)).not.toBe('pull');
  });
});

describe('switches', () => {
  it('a floor switch goes down when stepped on and stays; logic hears it', () => {
    const { p, get } = game([['Floor switch', [20, 0, 10], 'ins_switch0001']]);
    const heard: unknown[] = [];
    const fire = p.logic.fire.bind(p.logic);
    p.logic.fire = (e: Parameters<typeof fire>[0], ...rest: unknown[]) => {
      if (e.type === 'event.onSwitch') heard.push(e.match);
      return (fire as (...a: unknown[]) => unknown)(e, ...rest) as never;
    };
    p.placeAt([21, 0.9, 11], 0);
    steps(p, 0.2);
    expect(get('ins_switch0001').state).toBe('down');
    p.placeAt([30, 0.4, 30], 0);
    steps(p, 0.2);
    expect(get('ins_switch0001').state).toBe('down');
    expect(heard).toEqual([{ asset: piece('Floor switch').id, to: 'on' }]);
  });

  it('a weight switch is down only while a block stands on it; the block stops there until let go', () => {
    const { p, get } = game([
      ['Push block', [10, 0, 10], 'ins_block00001'],
      ['Weight switch', [12, 0, 10], 'ins_weight0001'],
    ]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    steps(p, 1.0);
    // it slid up onto the pad (a plate up), and its weight pressed the pad flat: it sank with it
    expect(get('ins_block00001').inst.pos).toEqual([12, 1, 10]);
    expect(get('ins_weight0001').state).toBe('down');
    // still walking into it: it stays on the switch
    steps(p, 1.5);
    expect(get('ins_block00001').inst.pos[0]).toBe(12);
    // let go of the stick and push again: off it goes
    p.input.keys.delete('forward');
    steps(p, 0.1);
    walkX(p, 1);
    steps(p, 1.2);
    expect(get('ins_block00001').inst.pos[0]).toBe(14);
    expect(get('ins_weight0001').state).toBe('up');
  });

  it('weight: a switch that needs 3 is not pressed by the hero alone, but a push block (3) presses it', () => {
    const { p, get, bus, store } = game([
      ['Push block', [10, 0, 10], 'ins_block00001'],
      ['Weight switch', [12, 0, 10], 'ins_weight0001'],
    ]);
    void bus;
    void store;
    const sw = get('ins_weight0001');
    sw.def = { ...sw.def, switch: { ...sw.def.switch!, weight: 3 } };
    p.placeAt([13, 0.9, 11], 0);
    steps(p, 0.3);
    expect(sw.state).toBe('up');
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    steps(p, 1.0);
    expect(get('ins_weight0001').state).toBe('down');
  });

  it('a loose crate the physics engine drops onto a floor switch presses it', () => {
    const crate = { ...piece('Wooden crate'), loose: true };
    const { p, get } = game([['Floor switch', [20, 0, 10], 'ins_switch0001']]);
    void crate;
    expect(get('ins_switch0001').state).toBe('up');
    // a crate stood on it: the physics engine moves it (its weight, not its bricks' place, presses the pad)
    const store2 = new ProjectStore(newProjectFiles({ name: 'Crate', random: () => 0.3 }));
    const bus2 = registerAll(new CommandBus(store2));
    const map2 = store2.manifest.entry.map;
    const sw = piece('Floor switch');
    const r = bus2.execute(
      [
        { type: 'asset.create', payload: { asset: sw } },
        { type: 'asset.place', payload: { map: map2, asset: sw.id, pos: [20, 0, 10], id: 'ins_switch0001' } },
        { type: 'asset.create', payload: { asset: crate } },
        { type: 'asset.place', payload: { map: map2, asset: crate.id, pos: [20, 2, 10], id: 'ins_dropcrate1' } },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const q = new PlaySession(store2.snapshot());
    q.placeAt([0, 0.4, 0], 0);
    expect(q.world.looseObjects).toHaveLength(1);
    for (let i = 0; i < 60 * 3; i++) q.runtime.stepOnce();
    expect(q.world.instances.find((i) => i.inst.id === 'ins_switch0001')!.state).toBe('down');
    q.dispose();
    p.dispose();
  });

  it('a block pushed onto a switch opens the gate of “Switch opens a gate” (a block on a smooth top breaks no brick rule), and it shuts when pushed off', () => {
    const t = SCRIPT_TEMPLATES.find((x) => x.id === 'switch-gate')!;
    const code = t.code({ switch: 'Weight switch', gate: 'Barred gate', open: 'open', shut: 'closed' }, (x) => x);
    const { p, get } = game(
      [
        ['Push block', [10, 0, 10], 'ins_block00001'],
        ['Weight switch', [12, 0, 10], 'ins_weight0001'],
        ['Barred gate', [20, 0, 9], 'ins_gate000001'],
      ],
      { code },
    );
    expect(get('ins_gate000001').state).toBe('closed');
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    steps(p, 1.0);
    expect(get('ins_weight0001').state).toBe('down');
    steps(p, 0.2);
    expect(get('ins_gate000001').state).toBe('open');
    p.input.keys.delete('forward');
    steps(p, 0.1);
    walkX(p, 1);
    steps(p, 1.2);
    expect(get('ins_weight0001').state).toBe('up');
    expect(get('ins_gate000001').state).toBe('closed');
  });

  it('a timer switch ticks and goes back after its seconds; a crystal flips on each hit', () => {
    const { p, get } = game([
      ['Timer switch', [20, 0, 10], 'ins_timer00001'],
      ['Crystal switch', [30, 0, 10], 'ins_crystal001'],
    ]);
    p.placeAt([21, 0.9, 11], 0);
    steps(p, 0.2);
    expect(get('ins_timer00001').state).toBe('down');
    p.placeAt([25, 0.4, 25], 0);
    steps(p, 5);
    expect(p.puzzles.timeLeft('ins_timer00001')).toBeGreaterThan(3);
    steps(p, 6);
    expect(get('ins_timer00001').state).toBe('up');
    const c = get('ins_crystal001');
    p.puzzles.hit(c, 'slash');
    expect(c.state).toBe('on');
    p.puzzles.hit(c, 'pierce');
    expect(c.state).toBe('off');
  });

  it('a sword swing at a crystal switch flips it instead of breaking it', () => {
    const { p, get } = game([['Crystal switch', [10, 0, 10], 'ins_crystal001']]);
    p.placeAt([11, 0.4, 8.4], 0);
    p.strike('light');
    steps(p, 1);
    expect(get('ins_crystal001').state).toBe('on');
    expect(p.world.broken).toHaveLength(0);
  });

  it('a lever is pulled with Action', () => {
    const { p, get } = game([['Lever', [10, 0, 10], 'ins_lever00001']]);
    p.placeAt([11, 0.4, 12.4], Math.PI);
    p.stepInteract();
    expect(p.prompt?.label).toBe('Pull');
    expect(p.interact()).toBe(true);
    expect(get('ins_lever00001').state).toBe('on');
    p.interact();
    expect(get('ins_lever00001').state).toBe('off');
  });
});

describe('keys, locks and the dungeon items', () => {
  it('a small key picked up opens a locked door and is used up; the boss door wants the boss key', () => {
    const { p, get } = game([
      ['Locked door', [10, 0, 10], 'ins_door000001'],
      ['Small key', [20, 0, 20], 'ins_key0000001'],
      ['Boss door', [30, 0, 10], 'ins_bossdoor01'],
    ]);
    p.placeAt([12.5, 0.4, 12.2], Math.PI);
    p.stepInteract();
    expect(p.prompt?.label).toBe('Unlock');
    p.interact();
    expect(get('ins_door000001').state).toBe('locked');
    expect(p.message).toMatch(/small key/);
    // the key: touched, it is gone and counted for this map
    p.placeAt([21, 0.4, 21], 0);
    steps(p, 0.2);
    expect(p.world.instances.some((i) => i.inst.id === 'ins_key0000001')).toBe(false);
    expect(p.itemCount('Small key')).toBe(1);
    expect(p.inventory.has('Small key')).toBe(false);
    p.placeAt([12.5, 0.4, 12.2], Math.PI);
    p.stepInteract();
    p.interact();
    expect(get('ins_door000001').state).toBe('open');
    expect(p.itemCount('Small key')).toBe(0);
    // the boss door: no small key will do
    p.placeAt([33.5, 0.4, 12.2], Math.PI);
    p.stepInteract();
    p.interact();
    expect(p.message).toMatch(/boss key/);
    p.puzzles.give('Boss key', 1);
    p.interact();
    expect(get('ins_bossdoor01').state).toBe('open');
    expect(p.itemCount('Boss key')).toBe(1);
  });

  it('a small chest gives a small key of this map, and it opens the locked door', () => {
    const { p, get } = game(
      [
        ['Small chest', [10, 0, 10], 'ins_chest00001'],
        ['Locked door', [20, 0, 10], 'ins_door000001'],
      ],
      { dungeon: true },
    );
    p.placeAt([12, 0.4, 12.6], Math.PI);
    p.stepInteract();
    expect(p.prompt?.instance.inst.id).toBe('ins_chest00001');
    p.interact();
    expect(get('ins_chest00001').state).toBe('open');
    expect(p.itemCount('Small key')).toBe(1);
    expect(p.inventory.has('Small key')).toBe(false);
    expect(p.lookup('dungeon')).toBe('🗝 1');
    p.placeAt([22.5, 0.4, 12.2], Math.PI);
    p.stepInteract();
    p.interact();
    expect(get('ins_door000001').state).toBe('open');
    expect(p.itemCount('Small key')).toBe(0);
  });

  it('keys belong to the map where they were found', () => {
    const { p, map } = game([]);
    p.puzzles.give('Small key', 2);
    expect(p.puzzles.record(map).keys).toBe(2);
    expect(p.puzzles.record('map_elsewhere').keys).toBe(0);
  });

  it('a dungeon minimap shows only where the hero has been until the map is found; the compass marks chests', () => {
    const { p } = game([['Small chest', [10, 0, 10], 'ins_chest00001']], { dungeon: true });
    steps(p, 0.1);
    const v = p.minimapView();
    expect(v.seen?.size).toBeGreaterThan(0);
    expect(v.marks).toEqual([]);
    expect(p.lookup('dungeon')).toBe('🗝 0');
    p.puzzles.give('Dungeon map', 1);
    p.puzzles.give('Compass', 1);
    const w = p.minimapView();
    expect(w.seen).toBeNull();
    expect(w.marks).toEqual([{ x: 12, z: 11, kind: 'chest' }]);
    expect(p.lookup('dungeon')).toBe('🗝 0 · Map · Compass');
    // the chest opened: no mark
    p.setInstanceState('ins_chest00001', 'open');
    expect(p.minimapView().marks).toEqual([]);
  });

  it('a save keeps the moved blocks, the switches and the dungeon items', () => {
    const { p, get, store } = game([
      ['Push block', [10, 0, 10], 'ins_block00001'],
      ['Floor switch', [20, 0, 10], 'ins_switch0001'],
    ]);
    p.placeAt([9.4, 0.4, 11], Math.PI / 2);
    p.puzzles.setGrab(true);
    walkX(p, 1);
    steps(p, 1.0);
    p.input.keys.clear();
    p.puzzles.setGrab(false);
    p.placeAt([21, 0.9, 11], 0);
    steps(p, 0.2);
    p.puzzles.give('Small key', 1);
    const save = captureSave(p as never, 1);
    expect(SaveGame.safeParse(save).success).toBe(true);
    expect(save.maps[p.world.mapId]!.moved).toEqual({ ins_block00001: [12, 0, 10] });
    const q = new PlaySession(store.snapshot());
    applySave(q as never, save);
    expect(q.world.instances.find((i) => i.inst.id === 'ins_block00001')!.inst.pos).toEqual([12, 0, 10]);
    expect(q.world.instances.find((i) => i.inst.id === 'ins_switch0001')!.state).toBe('down');
    expect(q.itemCount('Small key')).toBe(1);
    expect(get('ins_block00001').inst.pos[0]).toBe(12);
  });
});

describe('step 12a: the hero leans into a push and sits back to pull', () => {
  it('picks the push and pull states, and the built-in clips play them', async () => {
    const { pickState } = await import('../../src/core/character/states');
    const { MOVE_FOR, MOVE_CLIPS } = await import('../../src/builtin/clips/moves');
    const base = { speed: 0, grounded: true, attacking: false, hurtAgo: Infinity };
    expect(pickState({ ...base, pushing: 'push' }, undefined)).toBe('push');
    expect(pickState({ ...base, speed: 3, pushing: 'pull' }, undefined)).toBe('pull');
    expect(pickState({ ...base, pushing: null }, undefined)).toBe('idle');
    // a hit still shows, and in the air it is a jump
    expect(pickState({ ...base, hurtAgo: 0.1, pushing: 'push' }, undefined)).toBe('hurt');
    expect(pickState({ ...base, grounded: false, pushing: 'pull' }, undefined)).toBe('jump');
    for (const s of ['push', 'pull'] as const) expect(MOVE_CLIPS.some((c) => c.id === MOVE_FOR[s])).toBe(true);
  });
});

describe('the starter Weight switch', () => {
  it('needs weight 3: the hero alone does not hold it down, a push block does', () => {
    expect(piece('Weight switch').switch?.weight).toBe(3);
    expect(piece('Floor switch').switch?.weight).toBeUndefined();
  });
});
