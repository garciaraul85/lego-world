import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { PlaySession } from '../../src/engine/runtime/session';

/** P9c: where to stand to rebuild, and an open lid that never swings through the hero. */
function yard() {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const y = trainingYard();
  const r = bus.execute(y.commands, { source: 'user' });
  expect(r.ok, r.error).toBe(true);
  return new PlaySession(s.snapshot(), { mapId: y.map });
}
const step = (p: PlaySession, n = 10) => {
  for (let i = 0; i < n; i++) p.runtime.stepOnce();
};

describe('rebuilding: where to stand', () => {
  it('a smashed thing shows a stand spot just outside it; standing there says Hold E · Rebuild', () => {
    const p = yard();
    const wall = p.world.instances.find((i) => i.def.name === 'Cracked wall')!;
    p.hitInstance(wall, { power: 20, type: 'blunt' });
    step(p);
    const spots = p.rebuildSpots();
    expect(spots.length).toBe(1);
    const [x, y, z] = p.rebuildStand(spots[0]!.bounds);
    const b = spots[0]!.bounds;
    // outside the wall, close enough to rebuild from
    expect(x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1).toBe(true);
    p.placeAt([x, y, z], 0);
    step(p, 2);
    expect(p.nearestBroken()).toBe(spots[0]!.entry);
    expect(p.lookup('prompt')).toBe('Hold E · Rebuild');
  });
});

describe('moving parts take up room', () => {
  it('an open chest’s lid pushes the hero out instead of swinging through them', () => {
    const p = yard();
    const chest = p.world.instances.find((i) => i.def.name === 'Treasure chest')!;
    p.setInstanceState(chest.inst.id, 'open');
    step(p, 90); // the lid eases open
    const boxes = p.partBoxes();
    expect(boxes.length).toBe(1);
    const lid = boxes[0]!;
    // put the hero right where the open lid is
    p.placeAt([(lid.x0 + lid.x1) / 2, 0.4, (lid.z0 + lid.z1) / 2], 0);
    p.heroState.x = (lid.x0 + lid.x1) / 2;
    p.heroState.z = (lid.z0 + lid.z1) / 2;
    step(p, 2);
    const h = p.heroState;
    const cx = Math.max(lid.x0, Math.min(h.x, lid.x1));
    const cz = Math.max(lid.z0, Math.min(h.z, lid.z1));
    expect(Math.hypot(h.x - cx, h.z - cz)).toBeGreaterThanOrEqual(0.44);
    // pushed away from the chest, never into it
    const c = p.instanceCenter(chest)!;
    expect(Math.hypot(h.x - c[0], h.z - c[2])).toBeGreaterThan(
      Math.hypot((lid.x0 + lid.x1) / 2 - c[0], (lid.z0 + lid.z1) / 2 - c[2]),
    );
  });
});
