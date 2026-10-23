import { GENRES } from '../../builtin/genres';
import type { AiProvider, AiTool, AiTurn, AiUsage } from '../../core/ai/provider';
import { helpEntry } from '../help/entries';
import { helpPages } from '../help/pages';
import { TRACKS } from '../tutorial/index';
import { type BrixAnswer, type BrixLink, helpIndex, showable } from './answer';
import type { BrixContext } from './context';
import { showSteps } from './views';

/**
 * P19 Brix with an AI: Claude answers from Help using read-only tools. It can search Help, read a page,
 * list the tutorials, describe a genre, and ask Brix to point at a control (point_at). It has no tool
 * that changes the project: pointing is recorded and shown to the person as a Show me button they press.
 */
export const BRIX_ROUNDS = 6;

const INSTRUCTIONS = `You are Brix, the friendly helper inside the Brick Worlds game editor. You answer questions about
how to use the editor. Rules:
- Answer only from Help: call search_help first, read_help_page when you need detail. Do not invent controls or menus.
- Keep answers short: one or two sentences, then numbered steps when the person asks how to do something.
- When a control on screen would help, call point_at with its Help entry id (the ids search_help returns as entry).
  The person sees a Show me button that walks them there. You cannot click or change anything yourself.
- Cite the pages you used: call cite with each page id (and anchor) you relied on.
- You never change the project. If asked to build or change something, say how to do it, and mention that the
  AI builder (Help › AI builder) can plan the change for them to approve.
- You know where the person is (below). When they say “this”, “it” or “here”, they mean what is selected or open.
  Answer for that screen and that thing; call get_context if they may have moved since.
- Write for beginners. Use the names the editor shows.`;

export type BrixRun = { answer: BrixAnswer; usage: AiUsage | null; turns: AiTurn[] };

export function brixTools(rec: { show: string[]; links: BrixLink[] }, now?: () => string): AiTool[] {
  return [
    ...(now
      ? [
          {
            name: 'get_context',
            description:
              'Where the person is right now: screen, what is selected or open, map, kind of game, project summary.',
            inputSchema: { type: 'object' as const, properties: {} },
            execute: () => now(),
          },
        ]
      : []),
    {
      name: 'search_help',
      description:
        'Search the editor Help. Returns the best sections with page id, anchor, title, snippet and entry id.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: ({ query }) =>
        helpIndex()
          .search(String(query ?? ''), 6)
          .map((h) => ({
            page: h.page,
            anchor: h.anchor,
            title: h.anchor ? `${h.pageTitle} › ${h.title}` : h.pageTitle,
            snippet: h.snippet,
            ...(h.page.startsWith('e/') ? { entry: h.page.slice(2), canPoint: !!showSteps(h.page.slice(2)) } : {}),
          })),
    },
    {
      name: 'read_help_page',
      description: 'Read one Help page (markdown) by its page id, e.g. "scene" or "e/scene.saving".',
      inputSchema: { type: 'object', properties: { page: { type: 'string' } }, required: ['page'] },
      execute: ({ page }) => {
        const p = helpPages().find((x) => x.id === page);
        if (!p) throw new Error(`No Help page "${String(page)}". Use search_help to find page ids.`);
        return p.md.length > 6000 ? `${p.md.slice(0, 6000)}\n…(cut; search for a section)` : p.md;
      },
    },
    {
      name: 'list_tutorials',
      description: 'The guided courses (Help menu) with their number of steps.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => Object.entries(TRACKS).map(([id, t]) => ({ id, title: t.title, steps: t.steps.length })),
    },
    {
      name: 'describe_genre',
      description: 'What a genre (kind of game) sets up and its checklist. Omit genre to list them.',
      inputSchema: { type: 'object', properties: { genre: { type: 'string' } } },
      execute: ({ genre }) => {
        if (!genre) return GENRES.map((g) => ({ id: g.id, name: g.name, blurb: g.blurb }));
        const g = GENRES.find((x) => x.id === genre || x.name.toLowerCase() === String(genre).toLowerCase());
        if (!g) throw new Error(`No genre "${String(genre)}".`);
        return { name: g.name, blurb: g.blurb, tabs: g.tabs, checklist: g.checklist, help: g.help, course: g.tutorial };
      },
    },
    {
      name: 'point_at',
      description:
        'Ask Brix to show the person where a control is (a Show me button they press). Give the Help entry id.',
      inputSchema: { type: 'object', properties: { entry: { type: 'string' } }, required: ['entry'] },
      execute: ({ entry }) => {
        const id = String(entry ?? '');
        if (!helpEntry(id)) throw new Error(`No Help entry "${id}".`);
        if (!showSteps(id)) throw new Error(`"${id}" has no control on screen to point at.`);
        if (!rec.show.includes(id)) rec.show.push(id);
        return 'The person will see a Show me button for it.';
      },
    },
    {
      name: 'cite',
      description: 'Add a link to a Help page you used (page id and optional anchor).',
      inputSchema: {
        type: 'object',
        properties: { page: { type: 'string' }, anchor: { type: 'string' } },
        required: ['page'],
      },
      execute: ({ page, anchor }) => {
        const p = helpPages().find((x) => x.id === page);
        if (!p) throw new Error(`No Help page "${String(page)}".`);
        const a = String(anchor ?? '');
        if (rec.links.length < 4 && !rec.links.some((l) => l.page === p.id && l.anchor === a))
          rec.links.push({ page: p.id, anchor: a, title: p.title });
        return 'ok';
      },
    },
  ];
}

export async function askBrix(o: {
  provider: AiProvider;
  question: string;
  history?: AiTurn[];
  /** where the person is (brix/context.ts), read again by get_context */
  context?: () => string;
  /** the thing a question saying “this” means, for Show me without a point_at */
  ctx?: BrixContext | null;
  signal: AbortSignal;
  onText?(t: string): void;
}): Promise<BrixRun> {
  const rec = { show: [] as string[], links: [] as BrixLink[] };
  const turns: AiTurn[] = [...(o.history ?? []), { role: 'user', content: o.question }];
  const r = await o.provider.run({
    instructions: o.context ? `${INSTRUCTIONS}\n\nWhere the person is now:\n${o.context()}` : INSTRUCTIONS,
    turns,
    tools: brixTools(rec, o.context),
    maxRounds: BRIX_ROUNDS,
    maxTokens: 1500,
    signal: o.signal,
    ...(o.onText ? { onText: o.onText } : {}),
  });
  const text = r.text.trim() || 'I couldn’t find an answer in Help.';
  // no point_at from the model: still offer Show me for what the question names
  const show = rec.show.length ? rec.show : showable(o.question, 2, o.ctx);
  return {
    answer: { text, steps: [], links: rec.links, show, offline: false },
    usage: r.usage,
    turns: [...turns, { role: 'assistant', content: text }],
  };
}
