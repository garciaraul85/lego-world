import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { WaterInstance } from '../../src/core/schema';
import { floatY } from '../../src/core/water/swim';
import { RecordingAudio } from '../../src/engine/audio/port';
import { HERO_HEIGHT } from '../../src/engine/physics/hero';
import { PlaySession } from '../../src/engine/runtime/session';

/** step 11b part 2: a pool beside the start, deep enough to swim in */
function pool(extra: Record<string, unknown> = {}) {
  const store = new ProjectStore(newProjectFiles({ name: 'Swim', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(store));
  const map = store.manifest.entry.map;
  const water: WaterInstance = {
    id: 'ins_pool000001',
    kind: 'water',
    name: 'Pool 1',
    pos: [12, -1, 12],
    size: [16, 6, 16],
    body: 'pool',
  };
  const r = bus.execute(
    [
      { type: 'item.add', payload: { map, item: water } },
      ...(Object.keys(extra).length ? [{ type: 'project.update', payload: extra }] : []),
    ],
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  const p = new PlaySession(store.snapshot(), { audio: new RecordingAudio() });
  return p;
}
const steps = (g: PlaySession, n: number) => {
  for (let i = 0; i < n; i++) g.runtime.stepOnce();
};

describe('swimming in Play (step 11b part 2)', () => {
  it('in deep water the hero floats, the Action button dives, under water air runs out, and it rises again', () => {
    const p = pool();
    steps(p, 2);
    p.placeAt([20, 2, 20], 0);
    // dropped in at the bottom: it floats up to the surface
    steps(p, 150);
    expect(p.swim.on).toBe(true);
    const box = p.waterBoxes()[0]!;
    const top = floatY(box, HERO_HEIGHT);
    expect(p.heroState.y).toBeCloseTo(top, 0);
    expect(p.buttons.now?.label).toBe('Dive');
    expect(p.lookup('prompt')).toBe('E · Dive');
    // hold the Action button: down it goes, head under water
    p.buttons.press('action');
    steps(p, 40);
    expect(p.heroState.y).toBeLessThan(top - 0.8);
    expect(p.swim.under).toBe(true);
    expect(p.logic.vars.get('underwater')).toBe(true);
    expect(p.breath.air).toBeLessThan(20);
    expect(p.logic.vars.get('maxAir')).toBe(20);
    expect(p.buttons.now?.label).toBe('Swim up');
    p.buttons.release('action');
    // let go: it drifts back up and breathes again
    steps(p, 400);
    expect(p.heroState.y).toBeCloseTo(top, 0);
    expect(p.swim.under).toBe(false);
    expect(p.heroStates.state === 'tread' || p.heroStates.state === 'swim').toBe(true);
  });
  it('with no air a heart is lost every 2 seconds', () => {
    const p = pool({ swimming: { can: true, breath: 3 } });
    steps(p, 2);
    p.placeAt([20, 2, 20], 0);
    steps(p, 150);
    const hp = Number(p.logic.vars.get('hp'));
    expect(p.buttons.now?.kind).toBe('dive');
    p.buttons.press('action');
    // down, 3 s of air, then 2 s more: one heart
    steps(p, 60 * 7);
    expect(Number(p.logic.vars.get('hp'))).toBeLessThan(hp);
  });
  it('a game where the hero cannot swim walks along the bottom', () => {
    const p = pool({ swimming: { can: false, breath: 20 } });
    steps(p, 2);
    p.placeAt([20, 2, 20], 0);
    steps(p, 60);
    expect(p.swim.on).toBe(false);
    expect(p.heroState.y).toBeLessThan(1);
  });
});
