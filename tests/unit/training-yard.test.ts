import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { PlaySession } from '../../src/engine/runtime/session';

/** P9c: the Training yard sample map is made from commands only, plays, and its parts work. */
describe('Training yard', () => {
  it('builds in one undo step and plays: dummies, wall, wired target and gate, sparring knight', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const y = trainingYard();
    const r = bus.execute(y.commands, { source: 'user', label: 'Add the Training yard' });
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(s.snapshot(), { mapId: y.map });
    expect(p.world.mapId).toBe(y.map);
    const names = p.world.instances.map((i) => i.inst.name ?? i.def.name);
    expect(names).toEqual(
      expect.arrayContaining(['Training dummy', 'Cracked wall', 'Practice target', 'Yard gate', 'Treasure chest']),
    );
    expect(p.world.npcs.length).toBe(1);
    expect(p.enemyOf(p.world.npcs[0]!)).not.toBeNull();
    // locking on to the target opens the gate
    const target = p.world.instances.find((i) => i.inst.name === 'Practice target')!;
    p.lockedOn({ kind: 'inst', id: target.inst.id });
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(p.world.instances.find((i) => i.inst.name === 'Yard gate')?.state).toBe('open');
    // the whole yard undoes at once
    bus.undo();
    expect(s.has(`maps/${y.map}/map.json`)).toBe(false);
  });
});
