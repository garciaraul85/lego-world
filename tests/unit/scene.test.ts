import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allBricks } from '../../src/core/commands/handlers/assets';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { SceneModel } from '../../src/editor/scene';

describe('SceneModel follows the store', () => {
  it('stays equal to the chunk files and asset instances through moves across chunks, regenerate, undo and redo', () => {
    const store = new ProjectStore(
      newProjectFiles({ name: 'S', generate: { environments: ['city'], size: 16, seed: 2 } }),
    );
    const bus = registerAll(new CommandBus(store));
    const map = store.manifest.entry.map;
    const scene = new SceneModel(store, map);
    const check = () => {
      // chunk bricks plus expanded asset instances (houses, trees... since P3.2)
      const truth = allBricks(store, map);
      expect(scene.count).toBe(truth.length);
      expect(scene.all().length).toBe(truth.length);
      for (const b of truth) expect(scene.get(b.id)).toEqual(b);
    };
    bus.execute(
      {
        type: 'bricks.place',
        payload: { map, bricks: [{ id: 90_000, type: 'brick2x2', x: 30, y: 0, z: 30, rot: 0, color: '#d20c20' }] },
      },
      { source: 'user' },
    );
    check();
    bus.execute({ type: 'bricks.move', payload: { map, ids: [90_000], dx: 4, dy: 0, dz: 0 } }, { source: 'user' }); // 30 -> 34 crosses x = 32
    check();
    bus.execute(
      { type: 'map.generate', payload: { map, config: { environments: ['desert'], size: 16, seed: 5 } } },
      { source: 'user' },
    );
    check();
    for (let i = 0; i < 3; i++) bus.undo();
    check();
    for (let i = 0; i < 3; i++) bus.redo();
    check();
  });
});
