/**
 * Milestone 3b (14a-2): a boss's phases, beside its code in Logic. They are written in its class
 * (phases = [{ from: 100, fights: "melee" }, …]); this edits the same list: a change here rewrites that line.
 */
import { PHASE_STYLES, type PhaseDef } from '../../../core/combat/enemy';
import { HURT_REACTIONS } from '../../../core/combat/hurt';
import { ATTACKS, MOVERS, SENSES } from '../../../core/combat/parts';
import { bossHowOf } from '../../../core/logic/boss';
import type { LogicGraph } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';
import type { EditorState } from '../../state';

export const PHASES_HELP =
  'A boss’s phases, in order. Each starts when its health falls to its From (100: its first phase) and fights as its kind of fighter with its parts, faster or harder (times its own). In code they are the phases = [ … ] list at the top of the class; when it can be hurt is the template it extends (PhasedBoss: always, WeakPointBoss: just after it attacks, PuzzleBoss: only stunned).';
const HOW_TEXT = {
  always: 'always (PhasedBoss)',
  afterAttack: 'just after it attacks (WeakPointBoss)',
  stunned: 'only while stunned (PuzzleBoss)',
} as const;

const AS_BEFORE = '(as before)';
type Key = Exclude<keyof PhaseDef, 'from'>;

export function BossPhasesPanel({ ed, graph }: { ed: EditorState; graph: LogicGraph }) {
  const b = graph.behaviour!;
  const how = bossHowOf(b.extends);
  if (!how) return null;
  const list = b.phases ?? [];
  const put = (phases: PhaseDef[], label: string) =>
    ed.exec(
      {
        type: 'logic.replace',
        payload: {
          graph: {
            ...graph,
            behaviour: { ...b, ...(phases.length ? { phases: [...phases].sort((x, y) => y.from - x.from) } : {}) },
          },
        },
      },
      { label },
    );
  const without = (phases: PhaseDef[]) => {
    if (phases.length) return phases;
    const { phases: _p, ...rest } = b;
    ed.exec({ type: 'logic.replace', payload: { graph: { ...graph, behaviour: rest } } }, { label: 'Remove phases' });
    return null;
  };
  const set = (i: number, k: Key | 'from', v: unknown) => {
    const next = list.map((p, j) => {
      if (j !== i) return p;
      const q = { ...p } as Record<string, unknown>;
      if (v === undefined || v === '' || v === AS_BEFORE) delete q[k];
      else q[k] = v;
      return q as PhaseDef;
    });
    put(next, `Phase ${i + 1}: ${k}`);
  };
  const pick = (i: number, k: Key, options: readonly string[], label: string) => (
    <label class="field">
      {label}
      <select
        class="inp"
        aria-label={`Phase ${i + 1} ${label}`}
        value={(list[i]![k] as string | undefined) ?? AS_BEFORE}
        onChange={(e) => set(i, k, (e.target as HTMLSelectElement).value)}
      >
        {[AS_BEFORE, ...options].map((o) => (
          // (the first phase has nothing before it: it keeps the character's own)
          <option value={o}>{o === AS_BEFORE && i === 0 ? '(its own)' : o}</option>
        ))}
      </select>
    </label>
  );
  const num = (i: number, k: 'from' | 'speed' | 'power', label: string, min: number, max: number, step = 0.1) => (
    <label class="field">
      {label}
      <input
        class="inp"
        type="number"
        min={min}
        max={max}
        step={step}
        aria-label={`Phase ${i + 1} ${label}`}
        value={(list[i]![k] as number | undefined) ?? ''}
        placeholder={k === 'from' ? '' : '1'}
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          if (raw === '' && k !== 'from') return set(i, k, undefined);
          const n = Math.max(min, Math.min(max, Number(raw)));
          if (!Number.isFinite(n)) return;
          if (k === 'from' && list.some((p, j) => j !== i && p.from === Math.round(n))) return;
          set(i, k, k === 'from' ? Math.round(n) : n);
        }}
      />
    </label>
  );
  return (
    <div data-tour="boss-phases">
      <div class="sech" style={{ padding: '12px 10px 4px' }}>
        <span>
          Phases
          <FieldHelp label="Phases" text={PHASES_HELP} />
        </span>
        <span>{list.length}</span>
      </div>
      <div class="hint" style={{ padding: '0 10px 6px' }}>
        It can be hurt {HOW_TEXT[how]}. {list.length ? '' : 'No phases yet: it fights as its own kind all through.'}
      </div>
      {list.map((p, i) => (
        <fieldset class="bhv-field" aria-label={`Phase ${i + 1}`}>
          <div class="row" style={{ gap: '6px' }}>
            <strong>Phase {i + 1}</strong>
            {p.name && <span class="small muted">{p.name}</span>}
            <button
              type="button"
              class="link"
              style={{ marginLeft: 'auto' }}
              aria-label={`Remove phase ${i + 1}`}
              onClick={() => {
                const rest = without(list.filter((_, j) => j !== i));
                if (rest) put(rest, `Remove phase ${i + 1}`);
              }}
            >
              ×
            </button>
          </div>
          {num(i, 'from', 'From (health %)', 1, 100, 1)}
          {pick(i, 'fights', PHASE_STYLES, 'Fights as')}
          {pick(i, 'attack', ATTACKS, 'Attack')}
          {pick(i, 'mover', MOVERS, 'Mover')}
          {pick(i, 'senses', SENSES, 'Senses')}
          {pick(i, 'hurt', HURT_REACTIONS, 'Hurt reaction')}
          {num(i, 'speed', 'Speed (times)', 0.2, 4)}
          {num(i, 'power', 'Power (times)', 0, 5)}
          <label class="field">
            Name
            <input
              class="inp"
              aria-label={`Phase ${i + 1} name`}
              value={p.name ?? ''}
              onChange={(e) => set(i, 'name', (e.target as HTMLInputElement).value.trim().slice(0, 40))}
            />
          </label>
        </fieldset>
      ))}
      <div style={{ padding: '0 10px 6px' }}>
        <button
          type="button"
          class="btn"
          aria-label="Add phase"
          disabled={list.length >= 5}
          onClick={() => {
            const froms = new Set(list.map((p) => p.from));
            let from = list.length ? Math.max(1, Math.round(Math.min(...list.map((p) => p.from)) / 2)) : 100;
            while (froms.has(from) && from > 1) from--;
            if (froms.has(from)) return;
            put([...list, { from }], 'Add phase');
          }}
        >
          + Phase
        </button>
      </div>
    </div>
  );
}
