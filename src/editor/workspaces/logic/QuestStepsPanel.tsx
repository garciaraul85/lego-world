/**
 * Milestone 3b (B7a-2): a quest's steps, beside its code in Logic. They are written in its class
 * (steps = [{ name: "Talk to Mossbeard", do: "talk", at: "Mossbeard" }, …]); this edits the same list: a change
 * here rewrites that line. Also what the quest log says about it (its about).
 */
import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { isMainQuestClass, isQuestClass } from '../../../core/logic/builtins';
import { namedThings } from '../../../core/logic/code/names';
import {
  doOf,
  MAX_STEPS,
  QUEST_DO,
  QUEST_DO_INFO,
  type QuestDo,
  type QuestStepDef,
  stepsProblem,
} from '../../../core/quests/quest';
import type { Asset, Character, LogicGraph } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';
import type { EditorState } from '../../state';

export const STEPS_HELP =
  'A quest’s steps, in order. The quest log shows the one it is on (and those done); tracking it shows that step’s goal on both maps. Each step is done by itself when its Done when happens — the hero reaches a place, talks to someone, carries enough of an item, beats enough foes, uses an object — or, for By logic, when a script calls quest.advance(). In code they are the steps = [ … ] list at the top of the class.';

/** names to offer for a step's at: places (zones), characters, items, objects */
function namesFor(ed: EditorState, d: QuestDo): string[] {
  const out = new Set<string>();
  const chars = () => {
    for (const p of ed.store.list('characters/')) {
      const c = ed.store.get<Character>(p);
      if (c?.name) out.add(c.name);
    }
    for (const c of BUILTIN_CHARACTERS) if (c.name) out.add(c.name);
  };
  const assets = (pickupsOnly: boolean) => {
    for (const p of ed.store.list('assets/')) {
      const a = ed.store.get<Asset>(p);
      if (!a) continue;
      if (pickupsOnly) {
        if (a.pickup?.item) out.add(a.pickup.item);
      } else out.add(a.name);
    }
  };
  if (d === 'reach' || d === 'script') {
    for (const z of namedThings(ed.store).zone) out.add(z.name);
    chars();
    assets(false);
  } else if (d === 'talk' || d === 'beat') chars();
  else if (d === 'use') assets(false);
  else if (d === 'get') {
    assets(true);
    for (const i of ['Small key', 'Boss key', 'Glowcap', 'coin', 'Bombs', 'Arrows']) out.add(i);
  }
  return [...out].sort((a, b) => a.localeCompare(b)).slice(0, 300);
}

export function QuestStepsPanel({ ed, graph }: { ed: EditorState; graph: LogicGraph }) {
  const b = graph.behaviour!;
  if (!isQuestClass(b.extends)) return null;
  const list = b.steps ?? [];
  const main = isMainQuestClass(b.extends);
  const put = (steps: QuestStepDef[], label: string) => {
    const { steps: _s, ...rest } = b;
    return ed.exec(
      { type: 'logic.replace', payload: { graph: { ...graph, behaviour: steps.length ? { ...rest, steps } : rest } } },
      { label },
    );
  };
  const set = (i: number, k: keyof QuestStepDef, v: unknown) => {
    const next = list.map((s, j) => {
      if (j !== i) return s;
      const q = { ...s } as Record<string, unknown>;
      if (v === undefined || v === '') delete q[k];
      else q[k] = v;
      return q as QuestStepDef;
    });
    put(next, `Step ${i + 1}: ${k}`);
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    put(next, `Move step ${i + 1}`);
  };
  const problem = list.length ? stepsProblem(list) : null;
  const listId = (i: number) => `quest-at-${graph.id}-${i}`;
  return (
    <div data-tour="quest-steps" data-help="logic.quest.steps">
      <div class="sech" style={{ padding: '12px 10px 4px' }}>
        <span>
          Steps
          <FieldHelp label="Steps" text={STEPS_HELP} />
        </span>
        <span>{list.length}</span>
      </div>
      <div class="hint" style={{ padding: '0 10px 6px' }}>
        {main
          ? 'A main quest: listed first in the quest log and tracked as soon as it starts.'
          : 'A side quest: listed after the main ones; tracked when nothing else is.'}{' '}
        It is in the game as written — start it with <code>quest.start("{graph.name}")</code> (from a talk, a zone, or
        its own <code>start(e)</code>).
      </div>
      <label class="field" style={{ padding: '0 10px 6px' }}>
        What the quest log says about it
        <textarea
          class="inp"
          rows={2}
          maxLength={400}
          aria-label="Quest description"
          placeholder="Mossbeard lost his lamp somewhere near the old well."
          value={b.about ?? ''}
          onChange={(e) => {
            const about = (e.target as HTMLTextAreaElement).value.trim().slice(0, 400);
            const { about: _a, ...rest } = b;
            ed.exec(
              { type: 'logic.replace', payload: { graph: { ...graph, behaviour: about ? { ...rest, about } : rest } } },
              { label: 'Quest description' },
            );
          }}
        />
      </label>
      {problem && (
        <div class="hint warn" role="alert" style={{ padding: '0 10px 6px' }}>
          {problem}
        </div>
      )}
      {!list.length && (
        <div class="hint" style={{ padding: '0 10px 6px' }}>
          No steps yet: a quest needs at least one to start.
        </div>
      )}
      {list.map((st, i) => {
        const d = doOf(st);
        return (
          <fieldset class="bhv-field" aria-label={`Step ${i + 1}`}>
            <div class="row" style={{ gap: '6px' }}>
              <strong>Step {i + 1}</strong>
              <button
                type="button"
                class="link"
                style={{ marginLeft: 'auto' }}
                aria-label={`Move step ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                class="link"
                aria-label={`Move step ${i + 1} down`}
                disabled={i === list.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                class="link"
                aria-label={`Remove step ${i + 1}`}
                onClick={() =>
                  put(
                    list.filter((_, j) => j !== i),
                    `Remove step ${i + 1}`,
                  )
                }
              >
                ×
              </button>
            </div>
            <label class="field">
              Says
              <input
                class="inp"
                aria-label={`Step ${i + 1} says`}
                maxLength={60}
                value={st.name}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim().slice(0, 60);
                  if (v) set(i, 'name', v);
                }}
              />
            </label>
            <label class="field">
              Done when
              <select
                class="inp"
                aria-label={`Step ${i + 1} done when`}
                value={d}
                onChange={(e) => set(i, 'do', (e.target as HTMLSelectElement).value)}
              >
                {QUEST_DO.map((k) => (
                  <option value={k}>{QUEST_DO_INFO[k].label}</option>
                ))}
              </select>
            </label>
            <div class="hint small" style={{ margin: '-2px 0 4px' }}>
              Done when {QUEST_DO_INFO[d].about}.
            </div>
            <label class="field">
              {QUEST_DO_INFO[d].at}
              <input
                class="inp"
                aria-label={`Step ${i + 1} ${QUEST_DO_INFO[d].at.toLowerCase()}`}
                list={listId(i)}
                maxLength={60}
                placeholder={d === 'script' ? '(optional)' : 'its name'}
                value={st.at ?? ''}
                onChange={(e) => set(i, 'at', (e.target as HTMLInputElement).value.trim().slice(0, 60))}
              />
              <datalist id={listId(i)}>
                {namesFor(ed, d).map((n) => (
                  <option value={n} />
                ))}
              </datalist>
            </label>
            {(d === 'get' || d === 'beat') && (
              <label class="field">
                How many
                <input
                  class="inp"
                  type="number"
                  min={1}
                  max={99}
                  aria-label={`Step ${i + 1} how many`}
                  value={st.count ?? 1}
                  onChange={(e) => {
                    const n = Math.round(Number((e.target as HTMLInputElement).value));
                    if (Number.isFinite(n)) set(i, 'count', n <= 1 ? undefined : Math.min(99, n));
                  }}
                />
              </label>
            )}
            <label
              class="field"
              title="Where the goal shows on the maps when not where the step’s name points (a get: where the item is found)."
            >
              Goal on the maps
              <input
                class="inp"
                aria-label={`Step ${i + 1} goal on the maps`}
                list={`quest-where-${graph.id}`}
                maxLength={60}
                placeholder={
                  d === 'get' ? 'where it lies (else: its pickup)' : st.at ? `${st.at} (where it is)` : 'none'
                }
                value={st.where ?? ''}
                onChange={(e) => set(i, 'where', (e.target as HTMLInputElement).value.trim().slice(0, 60))}
              />
            </label>
          </fieldset>
        );
      })}
      <datalist id={`quest-where-${graph.id}`}>
        {namesFor(ed, 'reach').map((n) => (
          <option value={n} />
        ))}
      </datalist>
      <div style={{ padding: '0 10px 6px' }}>
        <button
          type="button"
          class="btn"
          aria-label="Add step"
          disabled={list.length >= MAX_STEPS}
          onClick={() => put([...list, { name: `Step ${list.length + 1}`, do: 'script' }], 'Add step')}
        >
          + Step
        </button>
      </div>
    </div>
  );
}
