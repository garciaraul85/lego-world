import type { ComponentChildren } from 'preact';
import { type Inline, parseInline } from '../help/markdown';

/**
 * Text that may carry inline Markdown (**bold**, *italic*, `code`, [links](…)) shown as formatted text, never
 * as raw asterisks: Brix's answers, tutorial steps, field help, Help entries, the AI builder's replies.
 * Built from plain data (no innerHTML). A link is clickable when `go` is given, otherwise just its words.
 * Line breaks in the text stay line breaks.
 */
export function Rich({ text, go }: { text: string | null | undefined; go?: (href: string) => unknown }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <>
      {lines.map((raw, i) => {
        const { kind, rest } = lineKind(raw);
        const body = render(parseInline(rest), go);
        return [
          i > 0 && <br key={`br${i}`} />,
          kind === 'head' ? (
            <strong key={`l${i}`} class="rich-head">
              {body}
            </strong>
          ) : kind === 'bullet' ? (
            <span key={`l${i}`} class="rich-li">
              <span aria-hidden="true">• </span>
              {body}
            </span>
          ) : kind === 'rule' ? null : (
            body
          ),
        ];
      })}
    </>
  );
}

/**
 * The kind of one line of Markdown that answers (Brix's, the AI builder's) often use: a heading (# …), a
 * bullet (- …, * …, • …), a numbered step (1. … stays as it is), a rule (---). Kept inline-safe (no blocks),
 * since the text often sits inside a paragraph.
 */
function lineKind(l: string): { kind: 'head' | 'bullet' | 'rule' | 'text'; rest: string } {
  const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
  if (h) return { kind: 'head', rest: h[1]! };
  const b = /^\s*[-*•+]\s+(.*)$/.exec(l);
  if (b) return { kind: 'bullet', rest: b[1]! };
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) return { kind: 'rule', rest: '' };
  return { kind: 'text', rest: l };
}

function render(c: Inline[], go?: (href: string) => unknown): ComponentChildren {
  return c.map((x, i) => {
    switch (x.t) {
      case 'text':
        return x.v;
      case 'code':
        return <code key={i}>{x.v}</code>;
      case 'b':
        return <strong key={i}>{render(x.c, go)}</strong>;
      case 'i':
        return <em key={i}>{render(x.c, go)}</em>;
      case 'a':
        return go ? (
          <a
            key={i}
            href={`#${x.href}`}
            onClick={(e) => {
              e.preventDefault();
              go(x.href);
            }}
          >
            {render(x.c, go)}
          </a>
        ) : (
          <span key={i}>{render(x.c, go)}</span>
        );
    }
    return null;
  });
}

/** The same text without its Markdown marks, for places that can only hold plain text (tooltips, titles). */
export function plainText(text: string): string {
  const flat = (c: Inline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : flat(x.c))).join('');
  return text
    .split('\n')
    .map((l) => {
      const { kind, rest } = lineKind(l);
      return kind === 'bullet' ? `• ${flat(parseInline(rest))}` : flat(parseInline(rest));
    })
    .join('\n');
}
