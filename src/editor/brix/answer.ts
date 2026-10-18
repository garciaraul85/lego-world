import { helpEntry } from '../help/entries';
import { entryPageId } from '../help/entry-pages';
import { helpPages } from '../help/pages';
import { HelpIndex, type Hit } from '../help/search';
import { showSteps } from './views';

/**
 * P19 Brix answers without an API key: the question is looked up in Help (the same search as the Help
 * guide), the best section is quoted with its steps, and up to three links go to the pages it came from.
 * When the answer is about a control on screen, Show me can point at it. Brix only reads Help and moves
 * around the editor; it never changes the project.
 */
export type BrixLink = { page: string; anchor: string; title: string };
export type BrixAnswer = {
  text: string;
  /** steps to follow, from the Help entry (when the answer is about a control) */
  steps: string[];
  links: BrixLink[];
  /** Help entries Show me can point at, best first */
  show: string[];
  /** the answer came from Help search (no AI) */
  offline: boolean;
};

let index: HelpIndex | null = null;
let entriesOnly: HelpIndex | null = null;
export const helpIndex = () => (index ??= new HelpIndex(helpPages()));
const entryIndex = () => (entriesOnly ??= new HelpIndex(helpPages().filter((p) => p.id.startsWith('e/'))));

/**
 * The words that carry the question: “how do I add a checkpoint?” → “checkpoint”. Help search wants every
 * word, so filler verbs would pull in pages that merely say “add” (logic nodes say “add it to the graph”).
 */
const FILLER = new Set(
  'add make create use using get put set change where what which can could would should please want need find show me there here this that game my your some new way'.split(
    ' ',
  ),
);
export function focusWords(q: string): string {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((w) => !FILLER.has(w));
  return (kept.length ? kept : words).join(' ');
}
/** Brix explains controls first: node and command reference pages rank lower than the screens' own entries. */
const KIND_WEIGHT: Record<string, number> = { node: 0.55, command: 0.3, action: 0.8 };
function entryHits(q: string, limit: number): Hit[] {
  return entryIndex()
    .search(q, 24)
    .map((h) => ({ ...h, score: h.score * (KIND_WEIGHT[helpEntry(h.page.slice(2))?.kind ?? ''] ?? 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const entryOf = (h: Hit) => (h.page.startsWith('e/') ? h.page.slice(2) : null);
const linkOf = (h: Hit): BrixLink => ({
  page: h.page,
  anchor: h.anchor,
  title: h.anchor ? `${h.pageTitle} › ${h.title}` : h.pageTitle,
});
/** `help:` reference the Help guide opens */
export const linkRef = (l: BrixLink) => (l.anchor ? `${l.page}#${l.anchor}` : l.page);

/** Help entries with a control Show me can find, for the words asked. */
export function showable(question: string, limit = 3): string[] {
  const out: string[] = [];
  for (const h of entryHits(focusWords(question), 12)) {
    const id = entryOf(h);
    if (id && !out.includes(id) && showSteps(id)) out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

const SMALL_TALK: [RegExp, string][] = [
  [
    /^(hi|hello|hey|yo|hola)\b/i,
    'Hi! I’m Brix. Ask me how to do something (“how do I add a checkpoint?”) or press Explain and click any part of the editor.',
  ],
  [/^(thanks|thank you|thx|ty)\b/i, 'Happy to help! Ask me anything else about the editor.'],
  [
    /^(who|what) are you\b/i,
    'I’m Brix, the editor’s helper. I answer from Help, point at where things are, and explain any control you click. I never change your project.',
  ],
];

export function answerOffline(question: string): BrixAnswer {
  const q = question.trim();
  for (const [re, text] of SMALL_TALK) if (re.test(q)) return { text, steps: [], links: [], show: [], offline: true };
  const hits = helpIndex().search(focusWords(q), 8);
  if (!hits.length)
    return {
      text: 'I couldn’t find that in Help. Try other words (say “checkpoint”, “music”, “enemy”), or press Explain and click the part you’re curious about.',
      steps: [],
      links: [{ page: 'start', anchor: '', title: 'Help: Start here' }],
      show: [],
      offline: true,
    };
  const show = showable(q);
  // the entry Show me points at leads: its text and steps fit a “how do I” question
  const top = hits[0]!;
  const e = show[0] ? helpEntry(show[0]) : entryOf(top) ? helpEntry(entryOf(top)!) : null;
  const text = e ? `${e.name}: ${e.purpose}` : `${top.title}: ${top.snippet.replace(/^…/, '')}`;
  const links: BrixLink[] = [];
  const add = (l: BrixLink) => {
    if (!links.some((x) => x.page === l.page && x.anchor === l.anchor)) links.push(l);
  };
  if (e) add({ page: entryPageId(e.id), anchor: '', title: e.name });
  for (const h of hits) {
    if (links.length >= 3) break;
    add(linkOf(h));
  }
  return { text, steps: e?.steps ?? [], links, show, offline: true };
}
