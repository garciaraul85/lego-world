import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { expandAsset } from '../../src/core/assets/expand';
import { freeGroupsOf, partPose, partsMoving } from '../../src/core/assets/free';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { Asset } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';
import { graph } from './logic-helpers';

/** P32: parts that move between states (a lid swings open, a sword rises), and items put at an object. */
const named = (n: string) => BUILTIN_ASSETS.find((a) => a.name === n)!;
const chest = named('Treasure chest');
const sword = named('Sword');

describe('moving parts', () => {
  it('the built-in chest and sword are valid assets with moving parts', () => {
    expect(Asset.safeParse(chest).success).toBe(true);
    expect(Asset.safeParse(sword).success).toBe(true);
    expect(chest.parts?.[0]?.pose?.open?.turn?.[0]).toBeLessThan(-90);
    expect(chest.sockets.some((s) => s.kind === 'spawn')).toBe(true);
  });

  it('eases from the old pose to the new one over the part’s ease time', () => {
    const lid = chest.parts![0]!;
    expect(partPose(lid, 'open').turn[0]).toBe(-105);
    expect(partPose(lid, 'closed').turn[0]).toBe(0);
    const at = (now: number) => partPose(lid, 'open', { from: 'closed', since: 10, now }).turn[0];
    expect(at(10)).toBe(0);
    expect(at(10 + 0.35)).toBeCloseTo(-52.5, 5); // halfway in time is halfway (smoothstep)
    expect(at(10 + 0.7)).toBe(-105);
    expect(partsMoving(chest, 'open', { from: 'closed', since: 10, now: 10.3 })).toBe(true);
    expect(partsMoving(chest, 'open', { from: 'closed', since: 10, now: 11 })).toBe(false);
  });

  it('the open lid swings up around its back edge, also when the chest is turned', () => {
    for (const rot of [0, 1, 2, 3]) {
      const inst = { id: 'ins_aaaaaaaaaa', pos: [10, 0, 10] as [number, number, number], rot, idBase: 1 };
      const e = { inst, def: chest, ...expandAsset(chest, inst) };
      const closed = freeGroupsOf({ ...e, state: 'closed' })[0]!;
      const open = freeGroupsOf({ ...e, state: 'open' })[0]!;
      // the lid's top stays at its height when closed, and rises when open
      expect(closed.t.box[1][1]).toBeCloseTo(3.2, 3);
      expect(open.t.box[1][1]).toBeGreaterThan(3.4);
      // the hinge (back edge) does not move
      const hinge = closed.t.point([0, 0, 0]);
      expect(hinge).toBeTruthy();
    }
  });
});

describe('items at an object, in play', () => {
  function game() {
    const s = new ProjectStore(newProjectFiles({ name: 'Chest', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const g = graph(
      [
        ['event.onCustom', { event: 'scene-opens-chest' }],
        ['world.setState', { target: 'Treasure chest', state: 'open' }],
        ['world.spawnNear', { item: 'Sword', near: 'Treasure chest' }],
        ['world.setState', { state: 'out' }],
      ],
      [
        [1, 'then', 2, 'in'],
        [2, 'then', 3, 'in'],
        [3, 'then', 4, 'in'],
        [3, 'entity', 4, 'target'],
      ],
    );
    const r = bus.execute(
      [
        { type: 'asset.create', payload: { asset: chest } },
        { type: 'asset.place', payload: { map, asset: chest.id, pos: [-2, 0, 3] } },
        { type: 'logic.create', payload: { graph: g } },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const play = new PlaySession(s.snapshot());
    play.placeAt([0, 0.4, 7], Math.PI);
    return play;
  }

  it('logic opens the chest by name and puts the sword at its item spot; the sword rises', () => {
    const play = game();
    const n0 = play.world.instances.length;
    play.logic.fire({ type: 'event.onCustom', match: { event: 'scene-opens-chest' } });
    play.runtime.stepOnce();
    const c = play.world.instances.find((i) => i.def.name === 'Treasure chest')!;
    expect(c.state).toBe('open');
    expect(play.world.instances.length).toBe(n0 + 1);
    const s = play.world.instances.at(-1)!;
    expect(s.def.name).toBe('Sword');
    // the spawned copy took its output into Set state: it is rising
    expect(s.state).toBe('out');
    expect(s.anim).toMatchObject({ from: 'in' });
    // at the chest's item spot, turned like the chest
    const spot = c.sockets.find((x) => x.kind === 'spawn')!.world;
    const xs = s.bricks.map((b) => b.x);
    // (an odd width sits half a stud off: copies stand on whole studs)
    expect(Math.abs((Math.min(...xs) + Math.max(...xs) + 1) / 2 - spot[0])).toBeLessThanOrEqual(0.5);
    expect(s.inst.rot).toBe(c.inst.rot);
  });

  it('an unknown item or object is reported, not thrown', () => {
    const play = game();
    expect(play.spawnNear('Unicorn', 'Treasure chest')).toBeNull();
    expect(play.spawnNear('Sword', 'Nowhere')).toBeNull();
    expect(play.events.some((e) => /no asset with that name/.test(e.msg))).toBe(true);
  });
});
