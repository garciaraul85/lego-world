import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ACTIONS, type ActionCtx, runAction } from '../actions/registry';
import { type Block, type Inline, parseMarkdown } from './markdown';
import { helpGroups, helpPages } from './pages';
import { HelpIndex } from './search';

let index: HelpIndex | null = null;
const getIndex = () => {
  index ??= new HelpIndex(helpPages());
  return index;
};

/**
 * The Help guide (P7.5, F1): a page per workspace, a "build a game from scratch" recipe, the generated
 * logic / keyboard / limits references and a search box. Links can open workspaces (open:Logic), run
 * editor actions (action:help.build) or go to another page (help:keys#playing).
 */
export function HelpView({ c, page: page0, onClose }: { c: ActionCtx; page: string; onClose: () => void }) {
  const [[page, anchor], setLoc] = useState<[string, string]>(() => split(page0));
  const [query, setQuery] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const pages = helpPages();
  const current = pages.find((p) => p.id === page) ?? pages[0]!;
  const blocks = useMemo(() => parseMarkdown(current.md), [current.id]);
  const hits = useMemo(() => (query.trim() ? getIndex().search(query) : []), [query]);

  useEffect(() => search.current?.focus(), []);
  useEffect(() => {
    const el = anchor ? body.current?.querySelector(`#help-${CSS.escape(anchor)}`) : null;
    if (el) el.scrollIntoView({ block: 'start' });
    else body.current?.scrollTo(0, 0);
  }, [page, anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (query) setQuery('');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [query]);

  const go = (href: string) => {
    const [kind, rest] = [href.slice(0, href.indexOf(':')), href.slice(href.indexOf(':') + 1)];
    if (kind === 'help') {
      setQuery('');
      setLoc(split(rest));
    } else if (kind === 'open') {
      onClose();
      c.ui.workspace(rest);
    } else if (kind === 'action') {
      const a = ACTIONS.find((x) => x.id === rest);
      onClose();
      if (a) runAction(a, c);
    } else window.open(href, '_blank', 'noopener');
  };

  return (
    <div class="help-back" role="dialog" aria-modal="true" aria-label="Help">
      <div class="help">
        <header class="help-head">
          <strong>📖 Help</strong>
          <input
            ref={search}
            type="search"
            class="help-search"
            placeholder="Search help (e.g. music zone)"
            aria-label="Search help"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn" onClick={() => go('action:help.tutorial')}>
            🎓 Tutorial
          </button>
          <button type="button" class="btn icon" aria-label="Close help" onClick={onClose}>
            ✕
          </button>
        </header>
        <div class="help-body">
          <nav class="help-nav" aria-label="Help pages">
            {helpGroups().map((g) => (
              <div key={g.name}>
                <div class="help-group">{g.name}</div>
                {g.pages.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    class={`help-link ${p.id === current.id && !query ? 'on' : ''}`}
                    aria-current={p.id === current.id && !query ? 'page' : undefined}
                    onClick={() => go(`help:${p.id}`)}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div class="help-main" ref={body}>
            {query.trim() ? (
              <section aria-label="Search results">
                <h2 class="help-h2">
                  {hits.length ? `${hits.length} result${hits.length > 1 ? 's' : ''}` : 'Nothing found'} for “
                  {query.trim()}”
                </h2>
                {!hits.length && <p class="muted">Try fewer or other words, or browse the pages on the left.</p>}
                <ol class="help-hits">
                  {hits.map((h) => (
                    <li key={`${h.page}#${h.anchor}`}>
                      <button type="button" class="help-hit" onClick={() => go(`help:${h.page}#${h.anchor}`)}>
                        <span class="help-hit-title">
                          {h.title}
                          {h.title !== h.pageTitle && <span class="muted"> · {h.pageTitle}</span>}
                        </span>
                        <span class="help-hit-snip">{h.snippet}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ) : (
              <article class="help-article" aria-label={current.title}>
                <Markdown blocks={blocks} go={go} />
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function split(loc: string): [string, string] {
  const i = loc.indexOf('#');
  return i < 0 ? [loc, ''] : [loc.slice(0, i), loc.slice(i + 1)];
}

function Markdown({ blocks, go }: { blocks: Block[]; go: (href: string) => void }) {
  const inl = (c: Inline[]): ComponentChildren =>
    c.map((x, i) => {
      switch (x.t) {
        case 'text':
          return x.v;
        case 'code':
          return <code key={i}>{x.v}</code>;
        case 'b':
          return <strong key={i}>{inl(x.c)}</strong>;
        case 'i':
          return <em key={i}>{inl(x.c)}</em>;
        case 'a': {
          const inside = /^(open|action|help):/.test(x.href);
          return (
            <a
              key={i}
              href={inside ? `#${x.href}` : x.href}
              class={x.href.startsWith('help:') ? '' : 'help-go'}
              onClick={(e) => {
                e.preventDefault();
                go(x.href);
              }}
            >
              {inl(x.c)}
              {x.href.startsWith('open:') || x.href.startsWith('action:') ? ' ↗' : ''}
            </a>
          );
        }
        default:
          return null;
      }
    });
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const H = `h${b.level}` as 'h1' | 'h2' | 'h3';
            return (
              <H key={i} id={`help-${b.id}`}>
                {b.text}
              </H>
            );
          }
          case 'p':
            return <p key={i}>{inl(b.c)}</p>;
          case 'quote':
            return (
              <p key={i} class="help-tip">
                {inl(b.c)}
              </p>
            );
          case 'pre':
            return <pre key={i}>{b.v}</pre>;
          case 'ul':
          case 'ol': {
            const L = b.t;
            return (
              <L key={i}>
                {b.items.map((it, k) => (
                  <li key={k}>{inl(it)}</li>
                ))}
              </L>
            );
          }
          case 'table':
            return (
              <table key={i} class="help-table">
                <thead>
                  <tr>
                    {b.head.map((h, k) => (
                      <th key={k}>{inl(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, k) => (
                    <tr key={k}>
                      {r.map((cell, j) => (
                        <td key={j}>{inl(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
