import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILTIN_MODEL_FILES } from '../../src/builtin/models/data';
import { CommandBus, registerAll } from '../../src/core/commands';
import { readModel } from '../../src/core/media/gltf';
import { importMedia } from '../../src/core/media/import';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { fromBase64, modelMatrix } from '../../src/engine/model/prepare';
import { drawBox, placedTriangles } from '../../src/engine/render/model-draw';

/** Milestone 2b, 10c part 5: 3D models — the built-in ones, importing files, placing and where copies stand */
describe('3D models', () => {
  it('the eight built-in models read, each a sensible size (the hero is about 4 studs tall)', () => {
    expect(Object.keys(BUILTIN_MODEL_FILES)).toHaveLength(8);
    for (const [id, f] of Object.entries(BUILTIN_MODEL_FILES)) {
      const m = readModel(fromBase64(f.glb));
      const h = m.max[1] - m.min[1];
      expect(h, id).toBeGreaterThan(1);
      expect(h, id).toBeLessThan(10);
      // they stand on the ground: their base at 0
      expect(Math.abs(m.min[1]), id).toBeLessThan(0.05);
      expect(m.triangles, id).toBeLessThan(5000);
    }
  });

  it('a placed copy is moved, turned about its upright axis and sized', () => {
    const m = modelMatrix({ pos: [10, 2, -4], turn: 90, size: 2 });
    const p = placedTriangles({ parts: [{ positions: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) }] }, m);
    // x turns into -z (a quarter turn), everything doubled, then moved
    expect(Array.from(p).map((v) => Math.round(v * 1000) / 1000)).toEqual([10, 2, -6, 10, 4, -4, 12, 2, -4]);
    const box = drawBox(m, [-1, 0, -1], [1, 1, 1]);
    expect(box.min.map((v) => Math.round(v))).toEqual([8, 2, -6]);
    expect(box.max.map((v) => Math.round(v))).toEqual([12, 4, -2]);
  });

  it('importing: a .glb is a model with its triangle count; a broken one says why', async () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/models/lamp-post.glb'));
    const r = await importMedia('lamp-post.glb', bytes, { index: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.kind).toBe('model');
      expect(r.entry.mime).toBe('model/gltf-binary');
      expect(r.entry.triangles).toBe(readModel(bytes).triangles);
    }
    const bad = await importMedia('nope.gltf', new TextEncoder().encode('{"asset":{"version":"1.0"}}'), {
      index: undefined,
    });
    expect(bad).toMatchObject({ ok: false });
    expect(!bad.ok && bad.error).toMatch(/nope\.gltf: .*glTF 2\.0/);
  });

  it('placing: a built-in model, or an imported file the project holds; not a missing one', async () => {
    const store = new ProjectStore(newProjectFiles({ name: 'Models', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(store));
    const map = store.manifest.entry.map;
    const run = (c: Parameters<typeof bus.execute>[0]) => bus.execute(c, { source: 'user' });
    const add = (id: string, model: string) =>
      run({ type: 'item.add', payload: { map, item: { id, kind: 'model', model, pos: [0, 0, 0] } } });
    expect(add('ins_model00001', 'builtin:barrel').ok).toBe(true);
    const ref = `sha256:${'a'.repeat(64)}`;
    expect(add('ins_model00002', ref)).toMatchObject({ ok: false, error: expect.stringMatching(/import it first/) });
    run({
      type: 'media.register',
      payload: { ref, entry: { name: 'thing.glb', kind: 'model', mime: 'model/gltf-binary', bytes: 10, triangles: 1 } },
    });
    expect(add('ins_model00002', ref).ok).toBe(true);
    // the file can't be removed while a map uses it
    expect(run({ type: 'media.remove', payload: { ref } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Still used by Map/),
    });
    // sizes and turns stay in range
    expect(run({ type: 'item.update', payload: { map, id: 'ins_model00001', patch: { size: 100 } } }).ok).toBe(false);
    expect(run({ type: 'item.update', payload: { map, id: 'ins_model00001', patch: { size: 3, turn: 45 } } }).ok).toBe(
      true,
    );
  });
});
