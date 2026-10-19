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
  return <>{lines.map((l, i) => [i > 0 && <br key={`br${i}`} />, render(parseInline(l), go)])}</>;
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
    .map((l) => flat(parseInline(l)))
    .join('\n');
}
