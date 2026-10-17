import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOERS } from '../../src/editor/tutorial/doers';
import { CHAPTERS, CODING_STEPS, COMBAT_STEPS, STEPS } from '../../src/editor/tutorial/index';
import { type Do, howLines } from '../../src/editor/tutorial/schema';

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
  pick: /`pick-\$\{tour\}/,
  tab: /data-tour=\{`tab-\$\{/,
  menu: /data-tour=\{`menu-\$\{/,
  enemy: /tour=\{`enemy-\$\{/,
};

/** attributes built from template literals (aria-label={`Add to ${row.label}`}) as patterns */
const TEMPLATE_ATTRS = (attr: string) =>
  [...SRC.matchAll(new RegExp(`${attr}=\\{\`([^\`]*)\`\\}`, 'g'))].map(
    (m) =>
      new RegExp(
        `^${m[1]!
          .split(/\$\{[^}]*\}/)
          .map((x) => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
          .join('.+')}$`,
      ),
  );

function present(attr: string, value: string): boolean {
  if (TEMPLATE_ATTRS(attr).some((r) => r.test(value))) return true;
  if (SRC.includes(`${attr}="${value}"`) || SRC.includes(`${attr}={'${value}'}`)) return true;
  if (attr === 'data-tour') {
    // a component that renders the hook from its `tour` prop (DraftText, PreviewPicker)
    if (SRC.includes(`tour="${value}"`)) return true;
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
    for (const s of [...STEPS, ...CODING_STEPS, ...COMBAT_STEPS]) {
      for (const m of s.target.matchAll(/\[(data-tour|aria-label|title)="([^"]+)"\]/g)) {
        if (!present(m[1]!, m[2]!)) missing.push(`${s.id}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  /** every action a step can perform: its Do it for me list and the actions of its click-by-click lines */
  const actionsOf = (s: (typeof STEPS)[number]): Do[] => [...s.doItForMe, ...howLines(s).flatMap((l) => l.do ?? [])];

  it('every Do it for me uses a known doer', () => {
    const bad: string[] = [];
    for (const s of [...STEPS, ...COMBAT_STEPS])
      for (const d of actionsOf(s)) if ('fn' in d && !(d.fn in DOERS)) bad.push(`${s.id}: ${d.fn}`);
    expect(bad).toEqual([]);
    // everything except reading steps can be done automatically
    const manual = [...STEPS, ...CODING_STEPS, ...COMBAT_STEPS]
      .filter((s) => !actionsOf(s).length && s.check.kind !== 'manual')
      .map((s) => s.id);
    expect(manual).toEqual([]);
  });

  it('scripted lines (P32) are runnable by a person or an AI: named controls, one verification each', () => {
    const bad: string[] = [];
    for (const s of [...STEPS, ...COMBAT_STEPS]) {
      const lines = howLines(s);
      if (!lines.some((l) => l.do?.length)) continue;
      lines.forEach((l, i) => {
        const at = `${s.id} line ${i + 1}`;
        // every line that acts is verified before the next line starts (pointing with `show` changes nothing)
        if (l.do?.some((d) => !('show' in d)) && !l.check) bad.push(`${at}: acts without a check`);
        for (const d of l.do ?? []) {
          const sel =
            'click' in d ? d.click : 'choose' in d ? d.choose : 'fill' in d ? d.fill : 'show' in d ? d.show : null;
          if (sel === null) continue;
          for (const m of sel.matchAll(/\[(data-tour|aria-label|title)="([^"]+)"\]/g))
            if (!present(m[1]!, m[2]!)) bad.push(`${at}: ${m[0]}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
