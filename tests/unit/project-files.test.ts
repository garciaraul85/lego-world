import { describe, expect, it } from 'vitest';
import { toLegacy } from '../../src/core/bridge/legacy-bridge';
import { serializeFile } from '../../src/core/json/stable';
import { packProject, unpackProject } from '../../src/core/project/archive';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { validateFile } from '../../src/core/schema';
import { canonical } from './helpers/legacy-app';

describe('new projects and .bwproj', () => {
  it('a new generated project is valid, and v68 can load it', () => {
    const files = newProjectFiles({ name: 'Test', generate: { environments: ['forest'], size: 16, seed: 3 } });
    for (const [p, v] of files) expect(validateFile(p, v)).toEqual([]);
    const store = new ProjectStore(files);
    const save = canonical(toLegacy(store)) as { pieces: unknown[]; world: unknown };
    expect(save.pieces.length).toBeGreaterThan(50);
    expect(save.world).not.toBeNull();
  });

  it('an empty project is valid', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Empty' }));
    expect(canonical(toLegacy(store))).toMatchObject({ pieces: [] });
  });

  it('pack -> unpack round-trips every file', () => {
    const store = new ProjectStore(
      newProjectFiles({ name: 'Zip', generate: { environments: ['city'], size: 16, seed: 1 } }),
    );
    const back = unpackProject(packProject(store));
    expect([...back.keys()].sort()).toEqual([...store.keys()].sort());
    for (const [p, v] of back) expect(serializeFile(p, v)).toBe(serializeFile(p, store.get(p)));
    expect(() => unpackProject(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
