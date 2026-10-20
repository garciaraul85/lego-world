import { describe, expect, it } from 'vitest';
import { plainText } from '../../src/editor/components/Rich';
import { GUIDES, helpEntries } from '../../src/editor/help/entries';
import { type Inline, parseMarkdown } from '../../src/editor/help/markdown';
import { helpPages } from '../../src/editor/help/pages';
import {
  BRIX_CHAPTERS,
  CHAPTERS,
  CODING_CHAPTERS,
  COMBAT_CHAPTERS,
  COURSES,
  DIALOGUE_CHAPTERS,
  SAVING_CHAPTERS,
  SCREENFX_CHAPTERS,
} from '../../src/editor/tutorial';

/**
 * Text people read in Brix, the tutorials and Help is written with a little Markdown (**bold**, *italic*,
 * `code`, [links](…)). Every piece of it must be well formed, so it shows as formatting and never as raw
 * asterisks.
 */
const strings = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) for (const v of o) strings(v, out);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out);
  return out;
};
const raw = (s: string) => /\*\*/.test(plainText(s));

describe('formatted text', () => {
  it('Rich shows bold, headings and bullets without their marks', () => {
    expect(plainText('Click **Save** and *then* `Play`')).toBe('Click Save and then Play');
    expect(plainText('### Steps\n- **One**\n* two\n---')).toBe('Steps\n• One\n• two\n');
  });
  it('Help entries and screen guides', () => {
    const bad = [...strings(helpEntries()), ...strings(GUIDES)].filter(raw);
    expect(bad).toEqual([]);
  });
  it('every tutorial and course', () => {
    const all = [
      CHAPTERS,
      CODING_CHAPTERS,
      COMBAT_CHAPTERS,
      SAVING_CHAPTERS,
      SCREENFX_CHAPTERS,
      BRIX_CHAPTERS,
      DIALOGUE_CHAPTERS,
      COURSES,
    ];
    const bad = strings(all).filter(raw);
    expect(bad).toEqual([]);
  });
  it('every Help page', () => {
    const flat = (c: Inline[]): string =>
      c.map((x) => (x.t === 'text' ? x.v : x.t === 'code' ? '' : flat(x.c))).join('');
    const bad: string[] = [];
    for (const p of helpPages())
      for (const b of parseMarkdown(p.md)) {
        const texts =
          b.t === 'p' || b.t === 'quote'
            ? [flat(b.c)]
            : b.t === 'ul' || b.t === 'ol'
              ? b.items.map(flat)
              : b.t === 'table'
                ? [...b.head, ...b.rows.flat()].map(flat)
                : b.t === 'h'
                  ? [b.text]
                  : [];
        for (const t of texts) if (/\*\*/.test(t)) bad.push(`${p.id}: ${t.slice(0, 80)}`);
      }
    expect(bad).toEqual([]);
  });
});
