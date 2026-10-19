import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import type { Conversation, Step } from '../../../core/dialogue/schema';
import type { ScriptNames } from '../../../core/dialogue/script';
import { type Character, paths } from '../../../core/schema';
import type { EditorState } from '../../state';

/** P22 dialogue editor helpers: the speakers a line can have, names both ways, and small edits. */
export type Speaker = { who: string; name: string };

export function characters(ed: EditorState): Character[] {
  ed.revision.value;
  return ed.store
    .list('characters/')
    .map((p) => ed.store.get<Character>(p)!)
    .filter(Boolean);
}

/** who can speak: the game's characters (and the narrator) */
export function speakers(ed: EditorState, extra: string[] = []): Speaker[] {
  const out: Speaker[] = [{ who: '', name: 'Narrator' }];
  for (const c of characters(ed)) out.push({ who: c.id, name: c.name });
  for (const e of extra)
    if (e && !out.some((s) => s.who === e)) out.push({ who: e, name: e.startsWith('chr_') ? `${e} (deleted)` : e });
  return out;
}

export function scriptNames(ed: EditorState): ScriptNames {
  const own = characters(ed);
  const all = [...own, ...BUILTIN_CHARACTERS.filter((b) => !own.some((o) => o.id === b.id))];
  return {
    nameOf: (who) => all.find((c) => c.id === who)?.name ?? who,
    whoOf: (name) => {
      const hits = own.filter((c) => c.name.toLowerCase() === name.toLowerCase());
      return hits.length === 1 ? hits[0]!.id : name;
    },
  };
}

export const conversations = (ed: EditorState): Conversation[] => {
  ed.revision.value;
  return ed.store
    .list(paths.dialogueDir)
    .map((p) => ed.store.get<Conversation>(p)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** a copy with one step of one section replaced (null removes it) */
export function withStep(c: Conversation, si: number, i: number, next: Step | null): Conversation {
  return {
    ...c,
    sections: c.sections.map((s, k) =>
      k !== si
        ? s
        : { ...s, steps: next ? s.steps.map((x, j) => (j === i ? next : x)) : s.steps.filter((_, j) => j !== i) },
    ),
  };
}

export function moveStep(c: Conversation, si: number, i: number, by: number): Conversation {
  const steps = [...c.sections[si]!.steps];
  const j = i + by;
  if (j < 0 || j >= steps.length) return c;
  [steps[i], steps[j]] = [steps[j]!, steps[i]!];
  return { ...c, sections: c.sections.map((s, k) => (k === si ? { ...s, steps } : s)) };
}

/** a free section name like “new-2” */
export function freeLabel(c: Conversation, base = 'section'): string {
  for (let n = 1; ; n++) {
    const l = n === 1 ? base : `${base}-${n}`;
    if (!c.sections.some((s) => s.label === l)) return l;
  }
}

/** sections in the order the graph lays them out: by how many jumps they are from the start */
export function layers(c: Conversation): string[][] {
  const depth = new Map<string, number>([[c.sections[0]!.label, 0]]);
  const queue = [c.sections[0]!.label];
  while (queue.length) {
    const l = queue.shift()!;
    const s = c.sections.find((x) => x.label === l);
    for (const st of s?.steps ?? []) {
      const ts = st.k === 'goto' ? [st.to] : st.k === 'choice' ? st.options.map((o) => o.to ?? '') : [];
      for (const t of ts)
        if (t && t !== 'end' && !depth.has(t) && c.sections.some((x) => x.label === t)) {
          depth.set(t, depth.get(l)! + 1);
          queue.push(t);
        }
    }
  }
  const max = Math.max(0, ...depth.values());
  const out: string[][] = Array.from({ length: max + 2 }, () => []);
  for (const s of c.sections) out[depth.get(s.label) ?? max + 1]!.push(s.label);
  return out.filter((l) => l.length);
}
