import { type Block, parseMarkdown, plain } from './markdown';

/** `rank` < 1 lowers a page in search (the long generated references). */
export type HelpPage = { id: string; title: string; md: string; rank?: number };
export type Section = { rank: number; page: string; pageTitle: string; anchor: string; title: string; text: string };
export type Hit = Section & { score: number; snippet: string };

const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'is',
  'it',
  'how',
  'do',
  'i',
  'my',
  'for',
  'with',
]);

/** Lowercase words with a light stem, so "zones" finds "zone" and "playing" finds "play". */
export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w)).map(stem);
}
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** One section per ## heading (the text before the first ## belongs to the page itself). */
export function sections(page: HelpPage, blocks: Block[] = parseMarkdown(page.md)): Section[] {
  const out: Section[] = [];
  let cur: Section = {
    rank: page.rank ?? 1,
    page: page.id,
    pageTitle: page.title,
    anchor: '',
    title: page.title,
    text: '',
  };
  for (const b of blocks) {
    if (b.t === 'h' && b.level === 1) continue;
    if (b.t === 'h' && b.level === 2) {
      out.push(cur);
      cur = { rank: page.rank ?? 1, page: page.id, pageTitle: page.title, anchor: b.id, title: b.text, text: '' };
      continue;
    }
    const text =
      b.t === 'h'
        ? b.text
        : b.t === 'p' || b.t === 'quote'
          ? plain(b.c)
          : b.t === 'pre'
            ? b.v
            : b.t === 'table'
              ? [b.head, ...b.rows].map((r) => r.map(plain).join(' ')).join(' ')
              : b.items.map(plain).join(' ');
    cur.text += `${text} `;
  }
  out.push(cur);
  return out.filter((s) => s.text.trim() || s.anchor);
}

type Posting = Map<number, number>; // section index -> weight

/** A small inverted index over every section of every page (P7.5 search). */
export class HelpIndex {
  readonly sections: Section[] = [];
  private index = new Map<string, Posting>();

  constructor(pages: HelpPage[]) {
    for (const p of pages) {
      for (const s of sections(p)) {
        const i = this.sections.push(s) - 1;
        const add = (words: string[], w: number) => {
          for (const t of words) {
            const post = this.index.get(t) ?? new Map<number, number>();
            post.set(i, (post.get(i) ?? 0) + w);
            this.index.set(t, post);
          }
        };
        add(tokens(s.title), 6);
        add(tokens(s.pageTitle), 3);
        add(tokens(s.text), 1);
      }
    }
  }

  /** Sections that match every word (the last word may be a prefix while typing), best first. */
  search(query: string, limit = 12): Hit[] {
    const q = tokens(query);
    if (!q.length) return [];
    const scores = new Map<number, number>();
    const matched = new Map<number, number>();
    q.forEach((t, k) => {
      const post = new Map<number, number>();
      const exact = this.index.get(t);
      if (exact) for (const [i, w] of exact) post.set(i, w);
      if (k === q.length - 1 && t.length >= 2)
        for (const [term, p] of this.index)
          if (term !== t && term.startsWith(t))
            for (const [i, w] of p) post.set(i, Math.max(post.get(i) ?? 0, w * 0.6));
      for (const [i, w] of post) {
        scores.set(i, (scores.get(i) ?? 0) + Math.log(1 + w) * (1 + 1 / (1 + (exact?.size ?? 10))));
        matched.set(i, (matched.get(i) ?? 0) + 1);
      }
    });
    let ids = [...scores.keys()].filter((i) => matched.get(i) === q.length);
    if (!ids.length) ids = [...scores.keys()];
    return ids
      .map((i) => ({ i, score: (scores.get(i) ?? 0) * (matched.get(i)! / q.length) * this.sections[i]!.rank }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ i, score }) => ({ ...this.sections[i]!, score, snippet: snippet(this.sections[i]!.text, q) }));
  }
}

function snippet(text: string, q: string[]): string {
  const words = text.split(/\s+/);
  let at = words.findIndex((w) => q.some((t) => stem(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).startsWith(t)));
  if (at < 0) at = 0;
  const from = Math.max(0, at - 8);
  return `${from ? '…' : ''}${words.slice(from, from + 28).join(' ')}${from + 28 < words.length ? '…' : ''}`;
}
