import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { paths } from '../../src/core/schema';
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
    // the sparring knight fights; the Yard master talks
    expect(p.world.npcs.length).toBe(2);
    expect(p.world.npcs.filter((n) => p.enemyOf(n))).toHaveLength(1);
    // locking on to the target opens the gate
    const target = p.world.instances.find((i) => i.inst.name === 'Practice target')!;
    p.lockedOn({ kind: 'inst', id: target.inst.id });
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(p.world.instances.find((i) => i.inst.name === 'Yard gate')?.state).toBe('open');
    // the whole yard undoes at once
    bus.undo();
    expect(s.has(`maps/${y.map}/map.json`)).toBe(false);
  });

  it('Milestone 2 gate: the cast talks, hits spark, a dark room is lit', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const y = trainingYard();
    expect(bus.execute(y.commands, { source: 'user', label: 'Add the Training yard' }).ok).toBe(true);
    const p = new PlaySession(s.snapshot(), { mapId: y.map });
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    // the cast talks: the Yard master's conversation, with its three answers
    const master = p.world.npcs.find((n) => n.profile.name === 'Yard master')!;
    expect(master).toBeTruthy();
    p.placeAt([master.state.x, master.state.y, master.state.z - 2], 0);
    p.talk();
    expect(p.talks.view?.speakerName).toBe('Yard master');
    expect(p.talks.view?.text).toBe('Welcome to the Training yard!');
    // each press first shows the whole line, then the next one
    for (let i = 0; i < 10 && !p.talks.view?.choices; i++) p.dialogueNext();
    expect(p.talks.view?.choices?.map((c) => c.text)).toEqual([
      'How do I beat the knight?',
      'What is down the cellar stairs?',
      'Thanks!',
    ]);
    p.dialogueChoose(1);
    for (let i = 0; i < 6 && p.talks.view && !/dark down there/.test(p.talks.view.text); i++) p.dialogueNext();
    expect(p.talks.view?.text).toMatch(/It is dark down there/);
    // hits spark: a hit on a dummy plays the hit effect (tiny bricks fly)
    const dummy = p.world.instances.find((i) => i.def.name === 'Training dummy')!;
    expect(p.effects.count).toBe(0);
    p.hitEffect('slash', [dummy.inst.pos[0], 1.5, dummy.inst.pos[2]]);
    p.runtime.stepOnce();
    expect(p.effects.count).toBeGreaterThan(5);
    // a dark room is lit: down the cellar stairs it is dark, and three torches light it
    const gates = s.get<{ gates: { from: { map: string; spawn: string }; to: { map: string } }[] }>(paths.gates)!;
    const down = gates.gates.find((g) => g.from.map === y.map)!;
    expect(down).toBeTruthy();
    p.travel(down.to.map, '');
    expect(p.world.doc.name).toBe('Yard cellar');
    expect(p.darkness).toBeGreaterThan(0.8);
    expect(p.pointLightsNow().length).toBe(3);
  });
});
