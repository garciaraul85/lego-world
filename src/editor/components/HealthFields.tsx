import { BREAKABLE_PRESETS, DAMAGE_TYPES, type DamageType, type Health } from '../../core/combat/damage';
import { eventNames } from '../events';
import type { EditorState } from '../state';
import { assetNames } from '../workspaces/logic/pickers';
import { ChoiceOrText } from './ChoiceOrText';
import { EventPicker } from './EventPicker';
import { DraftText, FieldHelp } from './fields';

/**
 * P9a: health fields, shared by the Asset studio (objects) and the Character studio (neighbours that can be
 * harmed): hit points, armour, what each damage type does, and what happens at zero.
 */
export const HEALTH_HELP = {
  hp: 'Hit points: how much damage it takes before it reaches zero. A hit with bare hands or a hammer does 1, a sword 2, a sledgehammer 3.',
  armor: 'Taken off every hit. A hit weaker than the armour does nothing (armour 1 stops bare hands).',
  types:
    'What each kind of hit does to it: normal, weak (double damage), half, or immune (nothing). A stone wall is immune to everything but explosive.',
  breaks: 'At zero it breaks into loose bricks (the hero can rebuild them if “Can be rebuilt” is on).',
  drop: 'What it leaves at zero: an asset (by name) put where it was, or else an inventory item given to the hero (any word: coin, key).',
  emit: 'A custom event sent to logic at zero: On custom event nodes with exactly this name run.',
  sides:
    'How much gets through by where the hit comes from: Front (a shield or hard shell blocks), Back (a soft back takes double), Side (a tail), Above (a head hit from a plunge). Blocked hits clang and say where to hit instead.',
  stunBy:
    'Kinds of hit that stun it for a moment (a boomerang, a flash; fire on an ice creature). A stunned foe stops and can be hit freely.',
  loot: 'More it may leave at zero, each with its chance: a heart half the time, arrows sometimes, a rare gem.',
  respawn:
    'P27: at zero it leaves, then comes back healed at its home after this many seconds (out of the hero’s sight), or, at 0, when the player comes back to the map. Off: it is gone for this play.',
};

const SIDE_CHOICES: [string, number][] = [
  ['normal', 1],
  ['weak ×2', 2],
  ['half', 0.5],
  ['blocks', 0],
];

const RESIST_CHOICES: [string, number][] = [
  ['normal', 1],
  ['weak ×2', 2],
  ['half', 0.5],
  ['immune', 0],
];

export function HealthFields({
  ed,
  health,
  onChange,
  tour,
  respawn = false,
}: {
  ed: EditorState;
  health: Health;
  onChange: (h: Health, label: string) => void;
  tour: string;
  /** P27 part 3d: show “Comes back” (characters) */
  respawn?: boolean;
}) {
  const set = (patch: Partial<Health>, label = 'Edit health') => onChange({ ...health, ...patch }, label);
  const resist = (t: DamageType) => health.resist?.[t] ?? 1;
  const items = assetNames(ed);
  return (
    <div class="health-fields" data-tour={tour}>
      <div class="health-row">
        <DraftText
          class="inp mono"
          aria-label="Hit points"
          tour={`${tour}-hp`}
          value={String(health.hp)}
          onCommit={(t) => {
            const n = Number(t);
            if (!Number.isFinite(n) || n < 1) return false;
            set({ hp: Math.min(9999, n) }, 'Hit points');
          }}
        />
        <span class="small">
          hit points
          <FieldHelp label="Hit points" text={HEALTH_HELP.hp} />
        </span>
        <DraftText
          class="inp mono"
          aria-label="Armour"
          tour={`${tour}-armor`}
          value={String(health.armor ?? 0)}
          onCommit={(t) => {
            const n = Number(t);
            if (!Number.isFinite(n) || n < 0) return false;
            const { armor: _a, ...rest } = health;
            onChange(n ? { ...rest, armor: n } : rest, 'Armour');
          }}
        />
        <span class="small">
          armour
          <FieldHelp label="Armour" text={HEALTH_HELP.armor} />
        </span>
      </div>
      <div class="small muted">
        Hits by type
        <FieldHelp label="Hits by type" text={HEALTH_HELP.types} />
      </div>
      <div class="health-types" role="group" aria-label="Hits by type">
        {DAMAGE_TYPES.map((t) => (
          <label class="small">
            {t}
            <select
              class="inp"
              aria-label={`${t} hits`}
              value={String(resist(t))}
              onChange={(e) => {
                const v = Number((e.target as HTMLSelectElement).value);
                const next = { ...(health.resist ?? {}), [t]: v };
                if (v === 1) delete next[t];
                const { resist: _r, ...rest } = health;
                onChange(Object.keys(next).length ? { ...rest, resist: next } : rest, `${t} hits`);
              }}
            >
              {RESIST_CHOICES.map(([l, v]) => (
                <option value={String(v)}>{l}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {respawn && (
        <>
          <div class="small muted">
            Hits by side
            <FieldHelp label="Hits by side" text={HEALTH_HELP.sides} />
          </div>
          <div class="health-types" role="group" aria-label="Hits by side" data-tour={`${tour}-sides`}>
            {(['front', 'back', 'side', 'above'] as const).map((sd) => (
              <label class="small">
                {sd}
                <select
                  class="inp"
                  aria-label={`Hits from the ${sd}`}
                  value={String(health.sides?.[sd] ?? 1)}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLSelectElement).value);
                    const next = { ...(health.sides ?? {}), [sd]: v };
                    if (v === 1) delete next[sd];
                    const { sides: _s, ...rest } = health;
                    onChange(Object.keys(next).length ? { ...rest, sides: next } : rest, `Hits from the ${sd}`);
                  }}
                >
                  {SIDE_CHOICES.map(([l, v]) => (
                    <option value={String(v)}>{l}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div class="small muted">
            Stunned by
            <FieldHelp label="Stunned by" text={HEALTH_HELP.stunBy} />
          </div>
          <div class="health-types" role="group" aria-label="Stunned by" data-tour={`${tour}-stun`}>
            {DAMAGE_TYPES.filter((t) => t !== 'stun').map((t) => (
              <label class="lbl small">
                <input
                  type="checkbox"
                  aria-label={`Stunned by ${t}`}
                  checked={!!health.stunBy?.includes(t)}
                  onChange={() => {
                    const has = health.stunBy?.includes(t);
                    const next = has ? health.stunBy!.filter((x) => x !== t) : [...(health.stunBy ?? []), t];
                    const { stunBy: _s, ...rest } = health;
                    onChange(next.length ? { ...rest, stunBy: next } : rest, `Stunned by ${t}`);
                  }}
                />
                {t}
              </label>
            ))}
            <label class="small">
              for{' '}
              <input
                type="number"
                class="inp mono"
                style={{ width: '56px' }}
                aria-label="Stun lasts (seconds)"
                min={0.2}
                max={10}
                step={0.5}
                value={health.stunFor ?? 2}
                onChange={(e) =>
                  set(
                    { stunFor: Math.max(0.2, Math.min(10, Number((e.target as HTMLInputElement).value) || 2)) },
                    'Stun lasts',
                  )
                }
              />{' '}
              s
            </label>
          </div>
        </>
      )}
      <div class="small muted">At zero</div>
      <label class="lbl">
        <input
          type="checkbox"
          checked={health.atZero.break}
          onChange={() => set({ atZero: { ...health.atZero, break: !health.atZero.break } }, 'Breaks at zero')}
        />{' '}
        Breaks into bricks
        <FieldHelp label="Breaks into bricks" text={HEALTH_HELP.breaks} />
      </label>
      <div class="health-row">
        <span class="small">
          Leaves
          <FieldHelp label="Leaves" text={HEALTH_HELP.drop} />
        </span>
        <ChoiceOrText
          label="Leaves at zero"
          tour={`${tour}-drop`}
          empty="nothing"
          value={health.atZero.drop?.item ?? ''}
          choices={health.atZero.drop ? [{ value: '', label: 'nothing' }, ...items] : items}
          onChange={(item) => {
            const { drop: _d, ...rest } = health.atZero;
            set(
              { atZero: item ? { ...rest, drop: { item, count: health.atZero.drop?.count ?? 1 } } : rest },
              'Leaves at zero',
            );
          }}
        />
      </div>
      {respawn && (
        <div class="health-loot" data-tour={`${tour}-loot`}>
          <span class="small">
            Loot
            <FieldHelp label="Loot" text={HEALTH_HELP.loot} />
          </span>
          {(health.atZero.loot ?? []).map((l, i) => {
            const put = (next: typeof l | null, label: string) => {
              const list = health.atZero.loot ?? [];
              const out = next ? list.map((x, j) => (j === i ? next : x)) : list.filter((_, j) => j !== i);
              const { loot: _l, ...rest } = health.atZero;
              set({ atZero: out.length ? { ...rest, loot: out } : rest }, label);
            };
            return (
              <div class="health-row" role="group" aria-label={`Loot ${i + 1}`}>
                <ChoiceOrText
                  label={`Loot ${i + 1}`}
                  tour={`${tour}-loot-${i}`}
                  empty="nothing"
                  value={l.item}
                  choices={items}
                  onChange={(item) => (item ? put({ ...l, item }, 'Loot') : put(null, 'Remove loot'))}
                />
                <input
                  type="number"
                  class="inp mono"
                  style={{ width: '48px' }}
                  aria-label={`Loot ${i + 1} count`}
                  min={1}
                  max={99}
                  value={l.count}
                  onChange={(e) =>
                    put(
                      {
                        ...l,
                        count: Math.max(1, Math.min(99, Math.round(Number((e.target as HTMLInputElement).value) || 1))),
                      },
                      'Loot count',
                    )
                  }
                />
                <input
                  type="number"
                  class="inp mono"
                  style={{ width: '56px' }}
                  aria-label={`Loot ${i + 1} chance (percent)`}
                  min={1}
                  max={100}
                  value={Math.round(l.chance * 100)}
                  onChange={(e) =>
                    put(
                      {
                        ...l,
                        chance: Math.max(1, Math.min(100, Number((e.target as HTMLInputElement).value) || 50)) / 100,
                      },
                      'Loot chance',
                    )
                  }
                />
                <span class="small">%</span>
                <button
                  type="button"
                  class="link"
                  aria-label={`Remove loot ${i + 1}`}
                  onClick={() => put(null, 'Remove loot')}
                >
                  ×
                </button>
              </div>
            );
          })}
          {(health.atZero.loot?.length ?? 0) < 6 && (
            <button
              type="button"
              class="link small"
              onClick={() =>
                set(
                  {
                    atZero: {
                      ...health.atZero,
                      loot: [...(health.atZero.loot ?? []), { item: 'heart', count: 1, chance: 0.5 }],
                    },
                  },
                  'Add loot',
                )
              }
            >
              + loot
            </button>
          )}
        </div>
      )}
      <div class="health-row">
        <span class="small">
          Sends
          <FieldHelp label="Sends" text={HEALTH_HELP.emit} />
        </span>
        {health.atZero.emit ? (
          <>
            <EventPicker
              label="Event at zero"
              value={health.atZero.emit}
              events={eventNames(ed.store)}
              onChange={(emit) => set({ atZero: { ...health.atZero, emit } }, 'Event at zero')}
            />
            <button
              type="button"
              class="link"
              aria-label="Send no event at zero"
              onClick={() => {
                const { emit: _e, ...rest } = health.atZero;
                set({ atZero: rest }, 'Event at zero');
              }}
            >
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            class="link small"
            onClick={() => set({ atZero: { ...health.atZero, emit: 'defeated' } }, 'Event at zero')}
          >
            + an event
          </button>
        )}
      </div>
      {respawn && (
        <div class="health-row" data-tour={`${tour}-respawn`}>
          <label class="lbl">
            <input
              type="checkbox"
              checked={health.atZero.respawn !== undefined}
              onChange={() => {
                const { respawn: _r, ...rest } = health.atZero;
                set({ atZero: health.atZero.respawn !== undefined ? rest : { ...rest, respawn: 60 } }, 'Comes back');
              }}
            />{' '}
            Comes back
            <FieldHelp label="Comes back" text={HEALTH_HELP.respawn} />
          </label>
          {health.atZero.respawn !== undefined && (
            <label class="small">
              after{' '}
              <input
                type="number"
                class="inp mono"
                style={{ width: '64px' }}
                aria-label="Comes back after (seconds)"
                data-tour={`${tour}-respawn-after`}
                min={0}
                max={3600}
                value={health.atZero.respawn}
                onChange={(e) =>
                  set(
                    {
                      atZero: {
                        ...health.atZero,
                        respawn: Math.max(0, Math.min(3600, Number((e.target as HTMLInputElement).value) || 0)),
                      },
                    },
                    'Comes back after',
                  )
                }
              />{' '}
              s {health.atZero.respawn === 0 ? '(when the player comes back)' : ''}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** “Make breakable”: one click gives an object health from a preset. */
export function MakeBreakable({ onPick, tour }: { onPick: (h: Health, name: string) => void; tour: string }) {
  return (
    <label class="field">
      Make breakable
      <select
        class="inp"
        data-tour={tour}
        aria-label="Make breakable"
        value=""
        onChange={(e) => {
          const p = BREAKABLE_PRESETS[(e.target as HTMLSelectElement).value];
          if (p) onPick(structuredClone(p.health), p.name);
        }}
      >
        <option value="">choose how it breaks…</option>
        {Object.entries(BREAKABLE_PRESETS).map(([id, p]) => (
          <option value={id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}
