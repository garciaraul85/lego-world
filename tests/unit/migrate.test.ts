import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toLegacy } from '../../src/core/bridge/legacy-bridge';
import { serializeFile } from '../../src/core/json/stable';
import { migrate } from '../../src/core/migrate';
import { canonical } from './helpers/legacy-app';

const NOW = '2026-10-09T00:00:00.000Z';
const fixture = (v: number) => JSON.parse(readFileSync(`tests/fixtures/legacy/save-v${v}.json`, 'utf8'));
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

describe.each([1, 2, 3, 4])('legacy save v%i', (v) => {
  const original = fixture(v);
  const result = migrate(original, { now: NOW });

  it('migrates with no schema errors', () => {
    expect(result.from).toBe(v);
    expect(result.problems.filter((p) => p.level === 'error')).toEqual([]);
  });

  it('round-trips through v68: load(original) equals load(toLegacy(migrate(original)))', () => {
    expect(canonical(toLegacy(result.files))).toEqual(canonical(original));
  });

  it("round-trips v68's own output exactly: toLegacy(migrate(A)) equals A", () => {
    const a = canonical(original);
    expect(plain(toLegacy(migrate(a, { now: NOW }).files))).toEqual(a);
  });

  it('is deterministic', () => {
    const again = migrate(original, { now: NOW });
    const dump = (m: Map<string, unknown>) => [...m].map(([p, x]) => `${p}\n${serializeFile(p, x)}`).join('\n');
    expect(dump(again.files)).toBe(dump(result.files));
  });
});

describe('v4 layout', () => {
  const { files } = migrate(fixture(4), { now: NOW });
  const paths = [...files.keys()];

  it('splits bricks into chunk files and keeps every brick once', () => {
    const chunks = paths.filter((p) => p.includes('/chunks/'));
    expect(chunks.length).toBeGreaterThan(2);
    const save = fixture(4);
    const expected =
      save.pieces.length +
      save.maps.maps.reduce((n: number, m: { build?: { pieces: unknown[] } }) => n + (m.build?.pieces.length ?? 0), 0);
    const actual = chunks.reduce((n, p) => n + (files.get(p) as { bricks: unknown[] }).bricks.length, 0);
    expect(actual).toBe(expected);
  });

  it('writes one folder per map, gates, characters and a file index', () => {
    expect(paths.filter((p) => p.endsWith('/map.json'))).toHaveLength(2);
    expect(paths).toContain('world/gates.json');
    expect(paths.filter((p) => p.startsWith('characters/')).length).toBeGreaterThan(1);
    const project = files.get('project.json') as { files: Record<string, unknown> };
    expect(Object.keys(project.files).sort()).toEqual(paths.filter((p) => p !== 'project.json').sort());
  });

  it('rejects what v68 rejects', () => {
    expect(() => migrate({ format: 'other', version: 4, pieces: [] })).toThrow(/brick-builder/);
    expect(() => migrate({ format: 'brick-builder', version: 9, pieces: [] })).toThrow(/version/);
  });
});
