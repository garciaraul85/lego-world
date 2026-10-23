import type { Genre } from '../genres/types';
import type { ProjectStore } from '../project/store';
import { type Character, type Instances, paths } from '../schema';
import type { Asset } from '../schema/asset';
import { checkCondition } from './condition';
import { type Conversation, DEFAULT_LOOK, type DialogueLook, type DialogueStyle, type Step } from './schema';

/**
 * P22: what is wrong with a conversation, for the editor's checks list and Play's “Can this game be
 * finished?”: conditions with mistakes, jumps to sections that do not exist, sections nothing reaches,
 * lines by characters that were deleted, and conversations nothing starts.
 */
export type DialogueIssue = {
  level: 'error' | 'warn';
  section: string;
  /** step index in the section (-1: the section itself) */
  step: number;
  option?: number;
  message: string;
};

const targets = (st: Step): string[] =>
  st.k === 'goto' ? [st.to] : st.k === 'choice' ? st.options.map((o) => o.to).filter((t): t is string => !!t) : [];

export function checkConversation(
  c: Conversation,
  has: { character(id: string): boolean; file(path: string): boolean },
) {
  const out: DialogueIssue[] = [];
  const labels = new Set(c.sections.map((s) => s.label));
  const reached = new Set<string>([c.sections[0]!.label]);
  for (const s of c.sections) for (const st of s.steps) for (const t of targets(st)) reached.add(t);
  c.sections.forEach((s, si) => {
    if (si > 0 && !reached.has(s.label))
      out.push({
        level: 'warn',
        section: s.label,
        step: -1,
        message: `Nothing jumps to “${s.label}”, so it never plays.`,
      });
    if (!s.steps.length) out.push({ level: 'warn', section: s.label, step: -1, message: `“${s.label}” is empty.` });
    s.steps.forEach((st, i) => {
      const bad = checkCondition(st.if);
      if (bad) out.push({ level: 'error', section: s.label, step: i, message: `Condition: ${bad}` });
      if (st.k === 'line' && st.who.startsWith('chr_') && !has.character(st.who))
        out.push({ level: 'error', section: s.label, step: i, message: 'This line’s speaker was deleted.' });
      if (st.k === 'goto' && st.to !== 'end' && !labels.has(st.to))
        out.push({ level: 'error', section: s.label, step: i, message: `There is no section “${st.to}”.` });
      if (st.k === 'choice')
        st.options.forEach((o, oi) => {
          const ob = checkCondition(o.if);
          if (ob)
            out.push({ level: 'error', section: s.label, step: i, option: oi, message: `Option “${o.text}”: ${ob}` });
          if (o.to && o.to !== 'end' && !labels.has(o.to))
            out.push({
              level: 'error',
              section: s.label,
              step: i,
              option: oi,
              message: `Option “${o.text}” goes to “${o.to}”, which does not exist.`,
            });
        });
      if (st.k === 'do')
        for (const a of st.actions) {
          if (a.do === 'cinematic' && !has.file(paths.cinematic(a.cinematic)))
            out.push({ level: 'error', section: s.label, step: i, message: 'That cinematic does not exist.' });
          if (a.do === 'talk' && !has.file(paths.dialogue(a.conversation)))
            out.push({ level: 'error', section: s.label, step: i, message: 'That conversation does not exist.' });
        }
    });
  });
  return out;
}

/** Where a conversation is started from: characters, signs, objects' interactions, screens, logic, other talks. */
export function dialogueUses(store: ProjectStore, id: string): { what: string; path: string }[] {
  const out: { what: string; path: string }[] = [];
  for (const p of store.list('characters/')) {
    const c = store.get<Character>(p);
    if (c?.talk?.some((t) => t.conversation === id)) out.push({ what: `${c.name} (talk)`, path: p });
  }
  for (const p of store.list('maps/').filter((x) => x.endsWith('/instances.json'))) {
    const inst = store.get<Instances>(p);
    for (const it of inst?.items ?? [])
      if (it.kind === 'ui' && it.conversation === id) out.push({ what: `sign “${it.text.slice(0, 24)}”`, path: p });
  }
  for (const p of store.list('assets/')) {
    const a = store.get<Asset>(p);
    if (a?.interactions.some((x) => x.do.some((d) => d.do === 'talk' && d.conversation === id)))
      out.push({ what: `${a.name} (interaction)`, path: p });
  }
  for (const p of [...store.list('logic/'), ...store.list('screens/'), ...store.list('dialogue/')]) {
    if (p.endsWith(`${id}.json`)) continue;
    if (JSON.stringify(store.get(p) ?? '').includes(`"${id}"`))
      out.push({ what: p.startsWith('logic/') ? 'logic' : p, path: p });
  }
  return out;
}

/** The look a conversation plays with: defaults ← the genre's ← the game's (Project › Dialogue) ← its own style. */
export function lookOf(
  project: { dialogue?: Partial<DialogueLook> } | null | undefined,
  genre: Pick<Genre, 'dialogue'> | null | undefined,
  style?: DialogueStyle,
): DialogueLook {
  return { ...DEFAULT_LOOK, ...(genre?.dialogue ?? {}), ...(project?.dialogue ?? {}), ...(style ? { style } : {}) };
}
