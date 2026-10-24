import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ModelError, readModel } from '../../src/engine/model/gltf';

/** Milestone 2b, 10c part 5: reading glTF models (the sample lamp post, made by scripts/make-sample-model.mjs) */
const file = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/models/${name}`));

describe('reading a glTF model', () => {
  it('a .glb: three parts placed by their nodes, with colours and a picture', () => {
    const m = readModel(file('lamp-post.glb'));
    expect(m.parts).toHaveLength(3);
    // the lamp sits on top (its node moved it up 3.6), the base on the ground
    expect(m.min[1]).toBeCloseTo(0, 3);
    expect(m.max[1]).toBeCloseTo(4.2, 3);
    const [lamp, post, base] = m.parts;
    expect(lamp!.color.slice(0, 3)).toEqual([1, 0.85, 0.4].map((v) => expect.closeTo(v, 5)));
    expect(post!.texture).toBeNull();
    expect(base!.texture?.mime).toBe('image/png');
    expect(base!.uvs).not.toBeNull();
    expect(m.triangles).toBe(m.parts.reduce((s, p) => s + p.positions.length / 9, 0));
  });

  it('normals point outwards and stay unit length after the nodes turn the parts', () => {
    const m = readModel(file('lamp-post.glb'));
    const lamp = m.parts[0]!;
    for (let i = 0; i < lamp.positions.length; i += 27) {
      const p = [lamp.positions[i]!, lamp.positions[i + 1]! - 3.6, lamp.positions[i + 2]!];
      const n = [lamp.normals[i]!, lamp.normals[i + 1]!, lamp.normals[i + 2]!];
      expect(Math.hypot(...n)).toBeCloseTo(1, 4);
      expect(p[0]! * n[0]! + p[1]! * n[1]! + p[2]! * n[2]!).toBeGreaterThan(0);
    }
    // the base is turned an eighth of a turn: its side normals are diagonal
    const base = m.parts[2]!;
    const side = [base.normals[0]!, base.normals[1]!, base.normals[2]!];
    expect(Math.abs(side[0]!)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('a .gltf with its data inside it reads the same', () => {
    const a = readModel(file('lamp-post.glb'));
    const b = readModel(file('lamp-post.gltf'));
    expect(b.triangles).toBe(a.triangles);
    expect(Array.from(b.parts[2]!.positions.slice(0, 9))).toEqual(Array.from(a.parts[2]!.positions.slice(0, 9)));
  });

  it('says in plain words why a file cannot be used', () => {
    const bad = (s: string) => () => readModel(new TextEncoder().encode(s));
    expect(bad('hello')).toThrow(ModelError);
    expect(bad('hello')).toThrow(/not a glTF model/);
    expect(bad('{"asset":{"version":"1.0"}}')).toThrow(/glTF 2.0/);
    expect(bad('{"asset":{"version":"2.0"},"extensionsRequired":["KHR_draco_mesh_compression"]}')).toThrow(
      /compressed/,
    );
    expect(bad('{"asset":{"version":"2.0"},"buffers":[{"byteLength":4,"uri":"model.bin"}]}')).toThrow(
      /another file \(model.bin\)/,
    );
    expect(bad('{"asset":{"version":"2.0"}}')).toThrow(/nothing to draw/);
  });
});
