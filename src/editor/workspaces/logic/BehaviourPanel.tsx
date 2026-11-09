/**
 * Milestone 3b (B1): a behaviour's fields (its settings in the Inspector, wherever it is attached) and its own
 * variables (each copy keeps its own), edited beside its cards and code; and where it is used.
 */
import { useState } from 'preact/hooks';
import { BUILTIN_ASSETS } from '../../../builtin/assets';
import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { coerce, DEFAULT_OF, FIELD_TYPES } from '../../../core/logic/behaviours';
import { isGameClass } from '../../../core/logic/builtins';
import {
  type Asset,
  type BehaviourField,
  type Character,
  type FieldType,
  type FieldValue,
  type Instances,
  type LogicGraph,
  type MapDoc,
  paths,
} from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { FieldHelp } from '../../components/fields';
import type { EditorState } from '../../state';
import { BossPhasesPanel } from './BossPhasesPanel';
import { QuestStepsPanel } from './QuestStepsPanel';

export const BEHAVIOUR_HELP = {
  what: 'A behaviour is a script you attach to things — an asset (every copy of it), a character, or one placed copy — like a component in Unity. Each copy runs its own: “this” is that copy, its fields are its settings, and its own variables are its own.',
  fields:
    'Fields are the behaviour’s settings. They show in the Inspector wherever it is attached, and each asset, character or copy can set its own value (a door that needs 3 gems, another that needs 5). In code: this.name; on cards: Get field.',
  vars: 'Own variables belong to each copy that runs the behaviour (how many times this one was used, a timer). They start at the value given here every time play starts. In code: this.name = …',
  used: 'Where the behaviour is attached. Attach it with + Script in the Inspector (a placed object) or in a character’s Scripts.',
};

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** where a behaviour is attached: assets, characters and single placed copies */
export function usedOn(
  ed: EditorState,
  id: string,
): { assets: string[]; characters: string[]; copies: number; maps: string[] } {
  const assets: string[] = [];
  const maps: string[] = [];
  const characters: string[] = [];
  let copies = 0;
  for (const p of ed.store.list('assets/')) {
    const a = ed.store.get<Asset>(p);
    if (a?.scripts?.some((s) => s.use === id && !s.off)) assets.push(a.name);
  }
  for (const p of ed.store.list('characters/')) {
    const c = ed.store.get<Character>(p);
    if (c?.scripts?.some((s) => s.use === id && !s.off)) characters.push(c.name);
  }
  for (const p of ed.store.list('maps/')) {
    // Milestone 3b (B7a-3): a map's own behaviours
    if (p.endsWith('/map.json')) {
      const m = ed.store.get<MapDoc>(p);
      if (m?.scripts?.some((s) => s.use === id && !s.off)) maps.push(m.name);
      continue;
    }
    if (!p.endsWith('/instances.json')) continue;
    for (const i of ed.store.get<Instances>(p)?.items ?? []) {
      const s = (i as { scripts?: { use: string; off?: boolean }[] }).scripts;
      if (s?.some((x) => x.use === id && !x.off)) copies++;
    }
  }
  return { assets, characters, copies, maps };
}

/** the asset or character from the project, else the built-in one */
export const assetOrBuiltin = (ed: EditorState, id: string) =>
  ed.store.get<Asset>(paths.asset(id)) ?? (BUILTIN_ASSETS.find((a) => a.id === id) as Asset | undefined);
export const characterOrBuiltin = (ed: EditorState, id: string) =>
  ed.store.get<Character>(paths.character(id)) ??
  (BUILTIN_CHARACTERS.find((c) => c.id === id) as Character | undefined);

export function BehaviourPanel({ c, graph }: { c: ActionCtx; graph: LogicGraph }) {
  const { ed } = c;
  const b = graph.behaviour!;
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('number');
  const [vName, setVName] = useState('');
  const [vStart, setVStart] = useState('0');
  const taken = new Set([...b.fields.map((f) => f.name), ...Object.keys(b.vars ?? {})]);
  const put = (behaviour: NonNullable<LogicGraph['behaviour']>, label: string) =>
    ed.exec({ type: 'logic.replace', payload: { graph: { ...graph, behaviour } } }, { label });
  const setField = (i: number, f: Partial<BehaviourField>) =>
    put({ ...b, fields: b.fields.map((x, k) => (k === i ? ({ ...x, ...f } as BehaviourField) : x)) }, 'Edit field');
  const okName = (n: string) => IDENT.test(n) && !taken.has(n);
  const addField = () => {
    if (!okName(name)) return;
    const label = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (m) => m.toUpperCase());
    if (put({ ...b, fields: [...b.fields, { name, type, default: DEFAULT_OF[type], label }] }, `Add field ${name}`).ok)
      setName('');
  };
  const addVar = () => {
    if (!okName(vName)) return;
    const v: FieldValue =
      vStart === 'true' || vStart === 'false'
        ? vStart === 'true'
        : Number.isFinite(Number(vStart))
          ? Number(vStart)
          : vStart;
    if (put({ ...b, vars: { ...(b.vars ?? {}), [vName]: v } }, `Add variable ${vName}`).ok) {
      setVName('');
      setVStart('0');
    }
  };
  const where = usedOn(ed, graph.id);
  const whereText = [
    where.assets.length ? `${where.assets.join(', ')} (every copy)` : '',
    where.characters.length ? where.characters.join(', ') : '',
    where.copies ? `${where.copies} placed cop${where.copies === 1 ? 'y' : 'ies'}` : '',
    where.maps.length ? `the map${where.maps.length === 1 ? '' : 's'} ${where.maps.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div class="bhv-panel" data-tour="behaviour-fields" data-help="logic.behaviour">
      <div class="sech" style={{ padding: '8px 10px 4px' }}>
        <span>
          Fields
          <FieldHelp label="Fields" text={BEHAVIOUR_HELP.fields} />
        </span>
        <span>{b.fields.length}</span>
      </div>
      {b.fields.map((f, i) => (
        <fieldset class="bhv-field" aria-label={`Field ${f.name}`}>
          <div class="row" style={{ gap: '6px' }}>
            <code class="mono">{f.name}</code>
            <span class="small muted">{FIELD_TYPES.find((t) => t.type === f.type)?.label}</span>
            <button
              type="button"
              class="link"
              style={{ marginLeft: 'auto' }}
              aria-label={`Remove field ${f.name}`}
              onClick={() => put({ ...b, fields: b.fields.filter((_, k) => k !== i) }, `Remove field ${f.name}`)}
            >
              ×
            </button>
          </div>
          <label class="field">
            Label
            <input
              class="inp"
              aria-label={`${f.name} label`}
              value={f.label}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value.trim().slice(0, 60);
                if (v) setField(i, { label: v });
              }}
            />
          </label>
          <label class="field">
            Default
            <ValueInput
              ed={ed}
              type={f.type}
              label={`${f.name} default`}
              value={f.default}
              onCommit={(v) => setField(i, { default: v })}
            />
          </label>
          {f.type === 'number' && (
            <div class="row" style={{ gap: '6px' }}>
              <label class="field" style={{ flex: 1 }}>
                Min
                <input
                  class="inp"
                  type="number"
                  aria-label={`${f.name} min`}
                  value={f.min ?? ''}
                  onChange={(e) => {
                    const t = (e.target as HTMLInputElement).value;
                    const { min: _m, ...rest } = f;
                    put(
                      {
                        ...b,
                        fields: b.fields.map((x, k) => (k === i ? (t === '' ? rest : { ...f, min: Number(t) }) : x)),
                      },
                      'Edit field',
                    );
                  }}
                />
              </label>
              <label class="field" style={{ flex: 1 }}>
                Max
                <input
                  class="inp"
                  type="number"
                  aria-label={`${f.name} max`}
                  value={f.max ?? ''}
                  onChange={(e) => {
                    const t = (e.target as HTMLInputElement).value;
                    const { max: _m, ...rest } = f;
                    put(
                      {
                        ...b,
                        fields: b.fields.map((x, k) => (k === i ? (t === '' ? rest : { ...f, max: Number(t) }) : x)),
                      },
                      'Edit field',
                    );
                  }}
                />
              </label>
            </div>
          )}
        </fieldset>
      ))}
      <fieldset class="lg-var-new" aria-label="New field">
        <legend>New field</legend>
        <div class="row" style={{ gap: '6px' }}>
          <input
            class="inp mono"
            style={{ flex: 1 }}
            placeholder="e.g. gemsNeeded"
            aria-label="New field name"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && addField()}
          />
          <select
            class="inp"
            aria-label="New field type"
            value={type}
            onChange={(e) => setType((e.target as HTMLSelectElement).value as FieldType)}
          >
            {FIELD_TYPES.map((t) => (
              <option value={t.type}>{t.label}</option>
            ))}
          </select>
        </div>
        {name && !okName(name) && (
          <div class="field-warn">
            {taken.has(name) ? `${name} is already used.` : 'A name is one word: letters, digits and _ (gemsNeeded).'}
          </div>
        )}
        <button type="button" class="btn" aria-label="Add field" disabled={!okName(name)} onClick={addField}>
          Add field
        </button>
      </fieldset>

      <div class="sech" style={{ padding: '12px 10px 4px' }}>
        <span>
          Own variables
          <FieldHelp label="Own variables" text={BEHAVIOUR_HELP.vars} />
        </span>
        <span>{Object.keys(b.vars ?? {}).length}</span>
      </div>
      {Object.entries(b.vars ?? {}).map(([k, v]) => (
        <div class="row small" style={{ gap: '6px', padding: '2px 10px' }} role="group" aria-label={`Variable ${k}`}>
          <code class="mono">{k}</code>
          <span class="muted">starts at</span>
          <input
            class="inp"
            style={{ width: '70px' }}
            aria-label={`${k} starts at`}
            value={String(v)}
            onChange={(e) => {
              const t = (e.target as HTMLInputElement).value;
              const nv: FieldValue = typeof v === 'number' ? Number(t) || 0 : typeof v === 'boolean' ? t === 'true' : t;
              put({ ...b, vars: { ...(b.vars ?? {}), [k]: nv } }, `Edit variable ${k}`);
            }}
          />
          <button
            type="button"
            class="link"
            aria-label={`Remove variable ${k}`}
            onClick={() => {
              const { [k]: _gone, ...rest } = b.vars ?? {};
              put({ ...b, vars: rest }, `Remove variable ${k}`);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <fieldset class="lg-var-new" aria-label="New own variable">
        <div class="row" style={{ gap: '6px' }}>
          <input
            class="inp mono"
            style={{ flex: 1 }}
            placeholder="e.g. uses"
            aria-label="New own variable name"
            value={vName}
            onInput={(e) => setVName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && addVar()}
          />
          <input
            class="inp"
            style={{ width: '60px' }}
            aria-label="New own variable starts at"
            value={vStart}
            onInput={(e) => setVStart((e.target as HTMLInputElement).value)}
          />
        </div>
        <button type="button" class="btn" aria-label="Add own variable" disabled={!okName(vName)} onClick={addVar}>
          Add variable
        </button>
      </fieldset>
      {/* Milestone 3b (14a-2): a boss's phases (written in its class) */}
      <BossPhasesPanel ed={ed} graph={graph} />
      {/* Milestone 3b (B7a-2): a quest's steps (written in its class) */}
      <QuestStepsPanel ed={ed} graph={graph} />
      <div class="sech" style={{ padding: '12px 10px 4px' }}>
        <span>
          Used on
          <FieldHelp label="Used on" text={BEHAVIOUR_HELP.used} />
        </span>
      </div>
      <div class="hint" style={{ padding: '0 10px 8px' }} data-tour="behaviour-used">
        {isGameClass(b.extends)
          ? 'The whole game: it is in the game as written (nothing to attach).'
          : whereText || 'Nothing yet. Select a placed object and press + Script in the Inspector.'}
      </div>
    </div>
  );
}

/** a field's value: a number, yes/no, text, or picked from the project's things */
export function ValueInput({
  ed,
  type,
  label,
  value,
  onCommit,
  min,
  max,
}: {
  ed: EditorState;
  type: FieldType;
  label: string;
  value: FieldValue;
  onCommit: (v: FieldValue) => void;
  min?: number;
  max?: number;
}) {
  if (type === 'bool')
    return (
      <input
        type="checkbox"
        aria-label={label}
        checked={value === true}
        onChange={(e) => onCommit((e.target as HTMLInputElement).checked)}
      />
    );
  if (type === 'number')
    return (
      <input
        class="inp"
        type="number"
        aria-label={label}
        value={Number(value)}
        min={min}
        max={max}
        onChange={(e) => {
          let n = Number((e.target as HTMLInputElement).value);
          if (!Number.isFinite(n)) return;
          if (min !== undefined) n = Math.max(min, n);
          if (max !== undefined) n = Math.min(max, n);
          onCommit(n);
        }}
      />
    );
  const choices = pickChoices(ed, type);
  if (choices)
    return (
      <select
        class="inp"
        aria-label={label}
        value={String(value)}
        onChange={(e) => onCommit((e.target as HTMLSelectElement).value)}
      >
        <option value="">(none)</option>
        {!choices.some((x) => x.value === value) && value !== '' && (
          <option value={String(value)}>{String(value)}</option>
        )}
        {choices.map((x) => (
          <option value={x.value}>{x.label}</option>
        ))}
      </select>
    );
  return (
    <input
      class="inp"
      aria-label={label}
      value={String(value)}
      onChange={(e) => onCommit(coerce(type, (e.target as HTMLInputElement).value))}
    />
  );
}

/** lists for the field types that name things (by name: a script finds them the way logic does) */
function pickChoices(ed: EditorState, type: FieldType): { value: string; label: string }[] | null {
  const names = (list: { name: string }[]) =>
    [...new Set(list.map((x) => x.name))].sort().map((n) => ({ value: n, label: n }));
  if (type === 'asset')
    return names([...ed.store.list('assets/').map((p) => ed.store.get<Asset>(p)!), ...BUILTIN_ASSETS]);
  if (type === 'character')
    return names([...ed.store.list('characters/').map((p) => ed.store.get<Character>(p)!), ...BUILTIN_CHARACTERS]);
  if (type === 'object') {
    const items = ed.store.get<Instances>(paths.instances(ed.mapId.value))?.items ?? [];
    return names(items.flatMap((i) => (i.kind === 'asset' && i.name ? [{ name: i.name }] : [])));
  }
  if (type === 'item') {
    const items = new Set<string>();
    for (const a of [...ed.store.list('assets/').map((p) => ed.store.get<Asset>(p)!), ...BUILTIN_ASSETS])
      if (a.pickup?.item) items.add(a.pickup.item);
    return [...items].sort().map((n) => ({ value: n, label: n }));
  }
  return null;
}
