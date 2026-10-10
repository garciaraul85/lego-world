import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOERS } from '../../src/editor/tutorial/doers';
import { CHAPTERS, CODING_STEPS, STEPS } from '../../src/editor/tutorial/index';

/** All editor and engine UI sources, concatenated (targets are checked statically). */
function sources(dir: string): string {
  let out = '';
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out += sources(p);
    else if (/\.tsx?$/.test(f) && !p.includes('tutorial')) out += readFileSync(p, 'utf8');
  }
  return out;
}
const SRC = sources('src/editor') + sources('src/engine') + sources('src/apps');

/** data-tour values built from templates in the shell. */
const TEMPLATED: Record<string, RegExp> = {
  ws: /data-tour=\{`ws-\$\{/,
  tab: /data-tour=\{`tab-\$\{/,
  menu: /data-tour=\{`menu-\$\{/,
};

function present(attr: string, value: string): boolean {
  if (SRC.includes(`${attr}="${value}"`) || SRC.includes(`${attr}={'${value}'}`)) return true;
  if (attr === 'data-tour') {
    const prefix = value.split('-')[0]!;
    return !!TEMPLATED[prefix]?.test(SRC);
  }
  // toolbar tools: aria-label={`${t.label} (${t.key})`}
  const tool = /^(.+) \((\w)\)$/.exec(value);
  if (tool && new RegExp(`label: '${tool[1]}',\\s*key: '${tool[2]}'`).test(SRC)) return true;
  // labels computed in code: the literal must at least appear as a string
  return SRC.includes(`'${value}'`) || SRC.includes(`"${value}"`) || SRC.includes(`\`${value}\``);
}

describe('tutorial content (P7.4)', () => {
  it('validates and covers every workspace', () => {
    expect(CHAPTERS.length).toBe(10);
    expect(STEPS.length).toBeGreaterThanOrEqual(45);
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ws = new Set(STEPS.map((s) => s.workspace).filter(Boolean));
    for (const w of ['Scene', 'World graph', 'Assets', 'Characters', 'Logic', 'Screens', 'Cinematics', 'Audio'])
      expect(ws, w).toContain(w);
  });

  it('every target selector names something the editor renders', () => {
    const missing: string[] = [];
    for (const s of [...STEPS, ...CODING_STEPS]) {
      for (const m of s.target.matchAll(/\[(data-tour|aria-label|title)="([^"]+)"\]/g)) {
        if (!present(m[1]!, m[2]!)) missing.push(`${s.id}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every Do it for me uses a known doer', () => {
    const bad: string[] = [];
    for (const s of STEPS) for (const d of s.doItForMe) if ('fn' in d && !(d.fn in DOERS)) bad.push(`${s.id}: ${d.fn}`);
    expect(bad).toEqual([]);
    // everything except reading steps can be done automatically
    const manual = [...STEPS, ...CODING_STEPS]
      .filter((s) => !s.doItForMe.length && s.check.kind !== 'manual')
      .map((s) => s.id);
    expect(manual).toEqual([]);
  });
});
