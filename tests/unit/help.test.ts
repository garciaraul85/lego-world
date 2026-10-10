import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/core/logic/catalog';
import { logicReferenceMarkdown } from '../../src/core/logic/reference';
import { ACTIONS } from '../../src/editor/actions/registry';
import { parseInline, parseMarkdown } from '../../src/editor/help/markdown';
import { helpPages } from '../../src/editor/help/pages';
import { HelpIndex, tokens } from '../../src/editor/help/search';

const WORKSPACES = ['Scene', 'World graph', 'Logic', 'Characters', 'Assets', 'Screens', 'Cinematics', 'Audio'];

describe('help markdown (P7.5)', () => {
  it('parses headings, lists, tables and inline marks', () => {
    const b = parseMarkdown(
      '# T\n\nHello **big** `x` [go](help:keys)\n\n- a\n- b\n\n1. one\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n## Two words\n',
    );
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'ol', 'table', 'h']);
    expect(b[5]).toMatchObject({ level: 2, id: 'two-words' });
    expect(parseInline('a **b** *c* `d` [e](f)').map((x) => x.t)).toEqual([
      'text',
      'b',
      'text',
      'i',
      'text',
      'code',
      'text',
      'a',
    ]);
  });
});

describe('help guide content', () => {
  const pages = helpPages();
  const ids = new Set(pages.map((p) => p.id));

  it('has a page for every workspace, the recipe and the references', () => {
    for (const id of [
      'start',
      'build-a-game',
      'scene',
      'world',
      'assets',
      'characters',
      'logic',
      'screens',
      'cinematics',
      'audio',
      'play',
      'projects',
      'logic-reference',
      'keys',
      'limits',
      'troubleshooting',
      'coding',
      'ai-builder',
    ])
      expect(ids, id).toContain(id);
    const recipe = parseMarkdown(pages.find((p) => p.id === 'build-a-game')!.md).filter(
      (b) => b.t === 'h' && b.level === 2,
    );
    expect(recipe).toHaveLength(12);
  });

  it('every link goes somewhere real', () => {
    const bad: string[] = [];
    for (const p of pages)
      for (const m of p.md.matchAll(/\]\(([a-z]+):([^)#]+)(?:#([^)]+))?\)/g)) {
        const [, kind, target, anchor] = m;
        if (kind === 'open' && !WORKSPACES.includes(target!)) bad.push(`${p.id}: ${m[0]}`);
        if (kind === 'action' && !ACTIONS.some((a) => a.id === target)) bad.push(`${p.id}: ${m[0]}`);
        if (kind === 'help') {
          const page = pages.find((x) => x.id === target);
          if (!page) bad.push(`${p.id}: ${m[0]}`);
          else if (anchor && !parseMarkdown(page.md).some((b) => b.t === 'h' && b.id === anchor))
            bad.push(`${p.id}: ${m[0]}`);
        }
      }
    expect(bad).toEqual([]);
  });

  it('the keyboard page lists every shortcut in the registry', () => {
    const keys = pages.find((p) => p.id === 'keys')!.md;
    for (const a of ACTIONS.filter((x) => x.key)) expect(keys, a.id).toContain(`\`${a.key}\``);
  });

  it('the logic reference covers every node and is up to date in docs/', () => {
    const md = logicReferenceMarkdown();
    for (const d of CATALOG) expect(md).toContain(`\`${d.type}\``);
    execFileSync('node', ['scripts/gen-logic-reference.mjs', '--check']);
  });
});

describe('help search', () => {
  const idx = new HelpIndex(helpPages());
  it('stems words', () => expect(tokens('Zones playing the gates')).toEqual(['zone', 'play', 'gate']));
  it('“music zone” finds the music zones section', () => {
    const hits = idx.search('music zone');
    expect(hits[0]).toMatchObject({ page: 'audio', title: 'Music zones' });
  });
  it('finds pages by what you want to do', () => {
    expect(idx.search('breakpoint')[0]?.page).toBe('logic');
    expect(idx.search('one-way gate')[0]?.page).toBe('world');
    expect(idx.search('import sounds')[0]?.page).toBe('audio');
    expect(idx.search('undo').length).toBeGreaterThan(0);
    expect(idx.search('cinem')[0]?.page).toBe('cinematics'); // prefix while typing
    expect(idx.search('await wait')[0]?.page).toBe('coding');
    expect(idx.search('api key')[0]?.page).toBe('ai-builder');
    expect(idx.search('zzzqqq')).toEqual([]);
  });
});
