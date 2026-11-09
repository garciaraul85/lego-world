import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import {
  ACTION_PRIORITY,
  buttonForKey,
  buttonForPad,
  buttonsOf,
  clashOf,
  controlsOf,
  keyName,
  pickAction,
} from '../../src/core/controls/controls';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { paths, type Settings } from '../../src/core/schema';
import {
  breathe,
  DROWN_EVERY,
  floatY,
  headUnder,
  swimStep,
  type WaterBox,
  waterAt,
  waterMode,
} from '../../src/core/water/swim';

describe('controls: layouts and bindings', () => {
  it('a game that has not picked keeps today’s buttons', () => {
    const c = controlsOf(undefined);
    expect(c.layout).toBe('modern');
    expect(buttonForKey(c, 'e')).toBe('action');
    expect(buttonForKey(c, ' ')).toBe('jump');
    expect(buttonForKey(c, 'f')).toBe('attack');
    expect(buttonForKey(c, 'W')).toBe('up');
    expect(buttonForKey(c, 'x')).toBeNull();
  });
  it('each layout has its own buttons', () => {
    expect(buttonsOf({ layout: 'ocarina' })).toEqual([
      'attack',
      'action',
      'guard',
      'roll',
      'lock',
      'item1',
      'item2',
      'item3',
      'menu',
    ]);
    expect(buttonsOf({ layout: 'classic' })).not.toContain('jump');
    expect(buttonsOf({ layout: 'modern' })).toEqual(expect.arrayContaining(['jump', 'wheel', 'item2']));
    expect(buttonsOf({ layout: 'custom', items: 4, jump: 'button' })).toEqual(
      expect.arrayContaining(['item4', 'jump']),
    );
    expect(buttonsOf({ layout: 'custom', items: 0 })).not.toContain('item1');
    // with no Jump button, Space does nothing of its own (the Action button may jump)
    expect(buttonForKey(controlsOf({ layout: 'ocarina' }), ' ')).toBeNull();
  });
  it('a game’s own keys, then a player’s, win; clashes are found', () => {
    const c = controlsOf({ layout: 'ocarina', keys: { action: [' '] } });
    expect(buttonForKey(c, ' ')).toBe('action');
    expect(buttonForKey(c, 'e')).toBeNull();
    expect(buttonForKey(c, 'g', { item1: ['g'] })).toBe('item1');
    expect(clashOf(c, 'item1', 'f')).toBe('attack');
    expect(buttonForPad(c, 0)).toBe('action');
    expect(keyName(' ')).toBe('Space');
    expect(keyName('arrowup')).toBe('Up arrow');
  });
  it('the Action button does the most important thing that fits', () => {
    expect(pickAction([])).toBeNull();
    expect(
      pickAction([
        { kind: 'jump', label: 'Jump', priority: ACTION_PRIORITY.jump },
        { kind: 'talk', label: 'Talk', priority: ACTION_PRIORITY.talk },
        { kind: 'use', label: 'Open', priority: ACTION_PRIORITY.use },
      ])?.label,
    ).toBe('Talk');
  });
  it('project.update saves a game’s controls (null: back to the defaults)', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'T' }));
    const bus = registerAll(new CommandBus(store));
    const run = (payload: unknown) => bus.execute([{ type: 'project.update', payload }], { source: 'user' });
    expect(run({ controls: { layout: 'ocarina' } }).ok).toBe(true);
    expect(store.get<Settings>(paths.settings)?.controls).toEqual({ layout: 'ocarina' });
    expect(run({ controls: { layout: 'nope' } }).ok).toBe(false);
    expect(run({ controls: null }).ok).toBe(true);
    expect(store.get<Settings>(paths.settings)?.controls).toBeUndefined();
  });
});

describe('swimming rules', () => {
  const pool: WaterBox = { x0: 0, y0: 0, z0: 0, x1: 10, y1: 4, z1: 10, current: [0, 0] };
  const H = 4;
  it('finds the water and what the depth means', () => {
    expect(waterAt([pool], 5, 1, 5)).toBe(pool);
    expect(waterAt([pool], 15, 1, 5)).toBeNull();
    expect(waterMode(pool, 0, H, true)).toBe('swim');
    expect(waterMode(pool, 0, H, false)).toBe('wade');
    expect(waterMode(pool, 3, H, true)).toBe('wade');
    expect(waterMode(pool, 3.5, H, true)).toBe('none');
    expect(headUnder(pool, floatY(pool, H), H)).toBe(false);
    expect(headUnder(pool, 0, H)).toBe(true);
  });
  it('floats at the surface, dives and comes back up, carried by the current', () => {
    const top = floatY(pool, H);
    const still = swimStep({ x: 5, y: top, z: 5 }, { x: 0, z: 0, up: false, down: false }, pool, H, 0, 0.1);
    expect(still.dy).toBeCloseTo(0);
    expect(still.diving).toBe(false);
    const dive = swimStep({ x: 5, y: top, z: 5 }, { x: 0, z: 0, up: false, down: true }, pool, H, 0, 0.1);
    expect(dive.dy).toBeLessThan(0);
    const up = swimStep({ x: 5, y: 0.5, z: 5 }, { x: 0, z: 0, up: true, down: false }, pool, H, 0, 0.1);
    expect(up.dy).toBeGreaterThan(0);
    const river = { ...pool, current: [2, 0] as [number, number] };
    expect(swimStep({ x: 5, y: top, z: 5 }, { x: 0, z: 0, up: false, down: false }, river, H, 0, 0.5).dx).toBeCloseTo(
      1,
    );
    // never deeper than the water
    expect(0.05 + swimStep({ x: 5, y: 0.05, z: 5 }, { x: 0, z: 0, up: false, down: true }, pool, H, 0, 1).dy).toBe(0);
  });
  it('holds breath under water, loses a heart every 2 s with no air, and breathes again above', () => {
    let b = { air: 1, drownIn: DROWN_EVERY };
    let hearts = 0;
    for (let i = 0; i < 50; i++) {
      const r = breathe(b, true, 10, 0.1);
      b = r.breath;
      hearts += r.hearts;
    }
    expect(b.air).toBe(0);
    expect(hearts).toBe(2);
    b = breathe(b, false, 10, 1).breath;
    expect(b.air).toBe(4);
  });
});
