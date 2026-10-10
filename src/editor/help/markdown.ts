/**
 * A tiny Markdown parser for the Help guide (P7.5): headings, paragraphs, lists, code, tables and
 * inline code / bold / italic / links. Produces plain data; Markdown.tsx renders it without innerHTML.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] };

export type Block =
  | { t: 'h'; level: 1 | 2 | 3; text: string; id: string }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'pre'; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'quote'; c: Inline[] };

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if (ch === '*' && s[i + 1] === '*') {
      const j = s.indexOf('**', i + 2);
      if (j > i) {
        flush();
        out.push({ t: 'b', c: parseInline(s.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    }
    if (ch === '*' && s[i + 1] !== ' ') {
      const j = s.indexOf('*', i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: 'i', c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(s.slice(i));
      if (m) {
        flush();
        out.push({ t: 'a', href: m[2]!, c: parseInline(m[1]!) });
        i += m[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  const used = new Map<string, number>();
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^<!--.*-->\s*$/.test(line.trim())) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const text = h[2]!.trim();
      const base = slugify(text) || 'section';
      const n = used.get(base) ?? 0;
      used.set(base, n + 1);
      out.push({ t: 'h', level: h[1]!.length as 1 | 2 | 3, text, id: n ? `${base}-${n}` : base });
      continue;
    }
    if (line.startsWith('```')) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !lines[i]!.startsWith('```')) body.push(lines[i]!);
      out.push({ t: 'pre', v: body.join('\n') });
      continue;
    }
    const li = /^\s*(-|\*|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const kind = /\d/.test(li[1]!) ? 'ol' : 'ul';
      const items: Inline[][] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const m = /^\s*(-|\*|\d+\.)\s+(.*)$/.exec(lines[j]!);
        if (!m) break;
        items.push(parseInline(m[2]!));
      }
      out.push({ t: kind, items });
      i = j - 1;
      continue;
    }
    if (line.trim().startsWith('|')) {
      flush();
      const rows: string[] = [];
      let j = i;
      for (; j < lines.length && lines[j]!.trim().startsWith('|'); j++) rows.push(lines[j]!);
      const [head, sep, ...rest] = rows;
      const body = sep && /^[\s|:-]+$/.test(sep) ? rest : [sep!, ...rest].filter(Boolean);
      out.push({ t: 'table', head: cells(head!), rows: body.map(cells) });
      i = j - 1;
      continue;
    }
    if (line.startsWith('> ')) {
      flush();
      out.push({ t: 'quote', c: parseInline(line.slice(2)) });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** Plain text of inline content (for search and snippets). */
export const plain = (c: Inline[]): string =>
  c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : plain(x.c))).join('');
