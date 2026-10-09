import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILE_KINDS, fileKindOf, paths, validateFile } from '../../src/core/schema';

const DIR = 'tests/fixtures/schema/';
const load = (f: string) => JSON.parse(readFileSync(DIR + f, 'utf8')) as { path: string; value: unknown };
const files = readdirSync(DIR);

describe('schemas', () => {
  it('has a valid and an invalid fixture for every file kind', () => {
    for (const kind of FILE_KINDS.filter((k) => k !== 'editor')) {
      expect(files).toContain(`${kind}.valid.json`);
      expect(files).toContain(`${kind}.invalid.json`);
    }
  });

  for (const f of files.filter((f) => f.endsWith('.valid.json'))) {
    it(`accepts ${f}`, () => {
      const { path, value } = load(f);
      expect(validateFile(path, value)).toEqual([]);
    });
  }

  for (const f of files.filter((f) => f.endsWith('.invalid.json'))) {
    it(`rejects ${f} with a located error`, () => {
      const { path, value } = load(f);
      const issues = validateFile(path, value);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.message).toBeTruthy();
    });
  }
});

describe('fileKindOf', () => {
  const m = 'map_0000000001';
  it.each([
    ['project.json', 'project'],
    ['settings.json', 'settings'],
    [paths.map(m), 'map'],
    [paths.chunk(m, -1, 0), 'chunk'],
    [paths.instances(m), 'instances'],
    [paths.state(m), 'state'],
    ['world/gates.json', 'gates'],
    ['assets/ast_0000000001.json', 'asset'],
    ['characters/chr_0000000001.json', 'character'],
    ['clips/clp_0000000001.json', 'clip'],
    ['logic/lg_0000000001.json', 'logic'],
    ['logic/variables.json', 'variables'],
    ['screens/scr_0000000001.json', 'screen'],
    ['cinematics/cin_0000000001.json', 'cinematic'],
    ['audio/events.json', 'soundEvents'],
    ['audio/music.json', 'music'],
    ['audio/mixer.json', 'mixer'],
    ['.editor/layout.json', 'editor'],
    ['maps/map_0000000001/other.json', null],
    ['../etc/passwd', null],
  ])('%s -> %s', (path, kind) => {
    expect(fileKindOf(path)).toBe(kind);
  });
});
