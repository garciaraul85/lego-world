import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { foundationsPark } from '../../src/core/gamegen/foundations-park';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { PlaySession } from '../../src/engine/runtime/session';

/** the Milestone 2b gate's sample map: made from engine commands, with everything Milestone 2b built */
describe('the Foundations park', () => {
  it('is made in one step and plays with water, loose crates, 3D models and shadowed lights', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Park', random: () => 0.4 }));
    const bus = registerAll(new CommandBus(store));
    const park = foundationsPark();
    const r = bus.execute(park.commands, { source: 'user', label: 'Add the Foundations park' });
    expect(r.ok, r.error).toBe(true);
    const s = new PlaySession(store.snapshot(), { mapId: park.map });
    const w = s.world;
    expect(w.doc.name).toBe('Foundations park');
    expect(w.water).toHaveLength(3);
    expect(w.models).toHaveLength(13);
    expect(w.looseObjects).toHaveLength(2);
    expect(w.lights.filter((l) => l.light.shadow)).toHaveLength(2);
    expect(w.instances.some((i) => i.def.name === 'Old brick wall')).toBe(true);
  });
});
