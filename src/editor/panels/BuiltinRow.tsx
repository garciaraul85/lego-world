/**
 * Milestone 3b (B3, B4): a built-in behaviour something has (an asset's Lock, a character's Hero), with its fields
 * (its settings), Extend (a behaviour of your own on it, attached at once) and × (not one any more).
 */
import { type Builtin, lineageOf } from '../../core/logic/builtins';
import type { FieldValue } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { ValueInput } from '../workspaces/logic/BehaviourPanel';
import { extendBuiltin } from '../workspaces/logic/BuiltinPage';

export function BuiltinRow<T extends { id: string; name: string }>({
  c,
  b,
  it,
  on,
  where,
}: {
  c: ActionCtx;
  b: Builtin<T>;
  it: T;
  /** what the built-in commands name: the asset or the character */
  on: { asset: string } | { character: string };
  /** said beside its name: “every Rock”, “Rook” */
  where: string;
}) {
  const { ed } = c;
  const target =
    'asset' in on ? { kind: 'asset' as const, id: on.asset } : { kind: 'character' as const, id: on.character };
  const set = (owner: string, field: string, label: string, value: FieldValue) =>
    ed.exec(
      { type: 'builtin.setField', payload: { ...on, name: owner, field, value } },
      { label: `${label}: ${String(value)}` },
    );
  // Milestone 3b (B5a): the fields of the ones it extends too (a PopUp's EnemyBrain settings)
  const line = lineageOf(b.name) as unknown as Builtin<T>[];
  const fields = (line.length ? line : [b]).flatMap((x) => x.fields.map((f) => ({ owner: x.name, f })));
  const chain = line.slice(1).map((x) => x.name);
  return (
    <fieldset class="bhv-attached bhv-builtin" aria-label={`Built-in ${b.name}`}>
      <div class="row" style={{ gap: '6px' }}>
        <button
          type="button"
          class="link"
          title="Read about it in Logic"
          onClick={() => {
            ed.logicGraph.value = `builtin:${b.name}`;
            c.ui.workspace('Logic');
          }}
        >
          <strong>{b.name}</strong>
        </button>
        <span class="small muted">
          built-in{chain.length ? ` · extends ${chain.join(' › ')}` : ''} · {where}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        {b.hooks.length > 0 && (
          <button
            type="button"
            class="link small"
            title={`Make a behaviour of your own that extends ${b.name} and put it on ${where}`}
            onClick={() => {
              const id = extendBuiltin(c, b);
              if (id) ed.exec({ type: 'script.attach', payload: { target, use: id } });
            }}
          >
            Extend
          </button>
        )}
        {b.name !== 'Interactable' && !b.fixed && (
          <button
            type="button"
            class="link"
            aria-label={`Remove ${b.name} from ${where}`}
            onClick={() => ed.exec({ type: 'builtin.detach', payload: { ...on, name: b.name } })}
          >
            ×
          </button>
        )}
      </div>
      {fields.map(({ owner, f }) => (
        <label class="field">
          <span>{f.label}</span>
          {f.choices ? (
            <select
              class="inp"
              aria-label={`${b.name} ${f.label}`}
              value={String(f.get(it))}
              onChange={(ev) => set(owner, f.name, f.label, (ev.target as HTMLSelectElement).value)}
            >
              {f.choices.map((ch) => (
                <option value={ch}>{ch}</option>
              ))}
            </select>
          ) : (
            <ValueInput
              ed={ed}
              type={f.type}
              label={`${b.name} ${f.label}`}
              value={f.get(it)}
              min={f.min}
              max={f.max}
              onCommit={(v) => set(owner, f.name, f.label, v)}
            />
          )}
        </label>
      ))}
      {!fields.length && <div class="hint small">Its settings are in {b.editIn}.</div>}
    </fieldset>
  );
}
