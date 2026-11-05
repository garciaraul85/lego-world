/**
 * Milestone 3b (B1): the behaviours a selected placed object runs (Unity's components in the Inspector): its
 * asset's (on every copy) and its own (only this copy), each with its fields; + Script attaches another.
 */
import { useState } from 'preact/hooks';
import type { ScriptTarget } from '../../core/commands/handlers/scripts';
import { attachmentsOf, startValues } from '../../core/logic/behaviours';
import { BUILTINS, type Builtin } from '../../core/logic/builtins';
import type { Asset, FieldValue, LogicGraph, ScriptAttachment } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { shows } from '../genres/view';
import type { EditorState } from '../state';
import { BEHAVIOUR_HELP, ValueInput } from '../workspaces/logic/BehaviourPanel';
import { extendBuiltin } from '../workspaces/logic/BuiltinPage';
import { graphs, newBehaviour } from '../workspaces/logic/model';

export const SCRIPTS_HELP = {
  section:
    'Behaviours this object runs, like components in Unity: scripts with settings (fields). Its asset’s behaviours run on every copy; one added “only on this copy” runs here alone. Each copy has its own values and its own variables.',
  add: 'Attach a behaviour. On every copy: the asset gets it, so every copy of it runs it. Only this copy: just this one.',
  scope:
    'Which values you change: this copy’s own (they win over the asset’s), or the asset’s, which every copy without its own value uses.',
};

const behaviours = (ed: EditorState) => graphs(ed).filter((g) => g.behaviour);

export function BehaviourSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const e = ed.selectedInstance.value!;
  const map = ed.mapId.value;
  const [pick, setPick] = useState('');
  const [every, setEvery] = useState(true);
  if (!shows(ed, 'section', 'object.behaviours')) return null;
  const all = behaviours(ed);
  const copy: ScriptTarget = { kind: 'instance', map, id: e.inst.id };
  const asset: ScriptTarget = { kind: 'asset', id: e.def.id };
  const base = e.def.scripts ?? [];
  const own = e.inst.scripts ?? [];
  const running = attachmentsOf(base, own);
  const offHere = base.filter((a) => own.some((o) => o.use === a.use && o.off));
  const name = e.def.name;
  const open = (id: string) => {
    ed.logicGraph.value = id;
    c.ui.workspace('Logic');
  };
  const builtins = BUILTINS.filter((b) => b.on(e.def as Asset));
  const notYet = BUILTINS.filter((b) => !b.on(e.def as Asset) && b.name !== 'Interactable');
  const attach = () => {
    const use = pick || all[0]?.id || (notYet[0] && `builtin:${notYet[0].name}`);
    if (!use) return;
    // Milestone 3b (B3): a built-in is a setting of the asset, so it is on every copy
    if (use.startsWith('builtin:')) {
      ed.exec(
        { type: 'builtin.attach', payload: { asset: e.def.id, name: use.slice(8) } },
        { label: `Make it a ${use.slice(8)}` },
      );
      setPick('');
      return;
    }
    ed.exec(
      { type: 'script.attach', payload: { target: every ? asset : copy, use } },
      { label: `Attach ${all.find((g) => g.id === use)?.name ?? 'behaviour'}` },
    );
  };
  const makeNew = () => {
    const g = newBehaviour(`${name} behaviour`);
    const ok = ed.exec(
      [
        { type: 'logic.create', payload: { graph: g } },
        { type: 'script.attach', payload: { target: every ? asset : copy, use: g.id } },
      ],
      { label: 'New behaviour' },
    );
    if (ok.ok) open(g.id);
  };
  return (
    <div class="sec" data-tour="object-behaviours" data-help="scene.behaviours">
      <div class="sech">
        <span>
          Behaviours
          <FieldHelp label="Behaviours" text={SCRIPTS_HELP.section} />
        </span>
        <span>{running.length + builtins.length}</span>
      </div>
      {builtins.map((b) => (
        <BuiltinRow key={`${e.def.id}:${b.name}`} c={c} b={b} a={e.def as Asset} />
      ))}
      {running.map((a) => {
        const g = all.find((x) => x.id === a.use);
        if (!g) return null;
        const fromAsset = base.some((b) => b.use === a.use);
        return (
          <Attached
            key={`${e.inst.id}:${a.use}`}
            c={c}
            g={g}
            a={a}
            fromAsset={fromAsset}
            assetName={name}
            ownFields={own.find((o) => o.use === a.use)?.fields ?? {}}
            assetFields={base.find((b) => b.use === a.use)?.fields ?? {}}
            copy={copy}
            asset={asset}
            onOpen={() => open(g.id)}
          />
        );
      })}
      {offHere.map((a) => (
        <div class="row small" style={{ gap: '6px' }}>
          <span class="muted" style={{ flex: 1 }}>
            {all.find((g) => g.id === a.use)?.name} is off on this copy
          </span>
          <button
            type="button"
            class="link"
            onClick={() => ed.exec({ type: 'script.attach', payload: { target: copy, use: a.use } })}
          >
            Turn on
          </button>
        </div>
      ))}
      <fieldset class="wire-new" aria-label="Attach a behaviour" data-tour="behaviour-attach">
        <div class="row" style={{ gap: '6px' }}>
          <select
            class="inp"
            style={{ flex: 1 }}
            aria-label="Behaviour to attach"
            value={pick || all[0]?.id || (notYet[0] && `builtin:${notYet[0].name}`)}
            onChange={(ev) => setPick((ev.target as HTMLSelectElement).value)}
          >
            {all.length > 0 && (
              <optgroup label="Yours">
                {all.map((g) => (
                  <option value={g.id}>{g.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Built-in (every copy)">
              {notYet.map((b) => (
                <option value={`builtin:${b.name}`}>{b.name}</option>
              ))}
            </optgroup>
          </select>
          <button
            type="button"
            class="btn on"
            disabled={!all.length && !notYet.length}
            onClick={attach}
            data-tour="behaviour-add"
          >
            + Script
          </button>
        </div>
        <div class="row small" role="radiogroup" aria-label="Attach to" style={{ gap: '10px' }}>
          <label>
            <input type="radio" name="bhv-every" checked={every} onChange={() => setEvery(true)} /> Every {name}
          </label>
          <label>
            <input type="radio" name="bhv-every" checked={!every} onChange={() => setEvery(false)} /> Only this copy
          </label>
          <FieldHelp label="Attach to" text={SCRIPTS_HELP.add} />
        </div>
        <button type="button" class="link small" onClick={makeNew} data-tour="behaviour-make">
          + New behaviour for this…
        </button>
      </fieldset>
    </div>
  );
}

function Attached({
  c,
  g,
  a,
  fromAsset,
  assetName,
  ownFields,
  assetFields,
  copy,
  asset,
  onOpen,
}: {
  c: ActionCtx;
  g: LogicGraph;
  a: ScriptAttachment;
  fromAsset: boolean;
  assetName: string;
  ownFields: Record<string, FieldValue>;
  assetFields: Record<string, FieldValue>;
  copy: ScriptTarget;
  asset: ScriptTarget;
  onOpen: () => void;
}) {
  const { ed } = c;
  // values for every copy, unless this copy has its own (then those are what it runs with); a pick wins
  const [picked, setScope] = useState<'copy' | 'asset' | null>(null);
  const scope = picked ?? (!fromAsset || Object.keys(ownFields).length ? 'copy' : 'asset');
  const values = startValues(g, a.fields);
  const target = fromAsset && scope === 'asset' ? asset : copy;
  return (
    <fieldset class="bhv-attached" aria-label={`Behaviour ${g.name}`}>
      <div class="row" style={{ gap: '6px' }}>
        <button type="button" class="link" onClick={onOpen} title="Open its cards and code in Logic">
          <strong>{g.name}</strong>
        </button>
        <span class="small muted">{fromAsset ? `every ${assetName}` : 'this copy'}</span>
        <span style={{ marginLeft: 'auto' }} />
        {fromAsset ? (
          <>
            <button
              type="button"
              class="link small"
              title="This copy does not run it"
              onClick={() => ed.exec({ type: 'script.detach', payload: { target: copy, use: g.id, off: true } })}
            >
              Off here
            </button>
            <button
              type="button"
              class="link"
              aria-label={`Remove ${g.name} from every ${assetName}`}
              onClick={() => ed.exec({ type: 'script.detach', payload: { target: asset, use: g.id } })}
            >
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            class="link"
            aria-label={`Remove ${g.name}`}
            onClick={() => ed.exec({ type: 'script.detach', payload: { target: copy, use: g.id } })}
          >
            ×
          </button>
        )}
      </div>
      {fromAsset && g.behaviour!.fields.length > 0 && (
        <div class="row small" role="radiogroup" aria-label={`${g.name} values for`} style={{ gap: '10px' }}>
          <label>
            <input type="radio" checked={scope === 'asset'} onChange={() => setScope('asset')} /> Every {assetName}
          </label>
          <label>
            <input type="radio" checked={scope === 'copy'} onChange={() => setScope('copy')} /> This copy
          </label>
          <FieldHelp label="Values for" text={SCRIPTS_HELP.scope} />
        </div>
      )}
      {g.behaviour!.fields.map((f) => {
        const mine = scope === 'copy' && f.name in ownFields;
        const shown = scope === 'asset' && fromAsset ? (assetFields[f.name] ?? f.default) : values[f.name]!;
        return (
          <label class="field">
            <span>
              {f.label}
              {f.help && <FieldHelp label={f.label} text={f.help} />}
              {mine && fromAsset && (
                <button
                  type="button"
                  class="link small"
                  title={`Back to every ${assetName}'s value`}
                  aria-label={`Reset ${f.label}`}
                  onClick={(ev) => {
                    ev.preventDefault();
                    ed.exec({
                      type: 'script.setField',
                      payload: { target: copy, use: g.id, name: f.name, value: null },
                    });
                  }}
                >
                  ↺
                </button>
              )}
            </span>
            <ValueInput
              ed={ed}
              type={f.type}
              label={`${g.name} ${f.label}`}
              value={shown}
              min={f.min}
              max={f.max}
              onCommit={(v) =>
                ed.exec(
                  { type: 'script.setField', payload: { target, use: g.id, name: f.name, value: v } },
                  { label: `${f.label}: ${String(v)}` },
                )
              }
            />
          </label>
        );
      })}
      {!g.behaviour!.fields.length && (
        <div class="hint small">No fields. Add some in Logic (Fields, left) to set them here.</div>
      )}
    </fieldset>
  );
}

/** Milestone 3b (B3): a built-in behaviour the asset has (its settings), on every copy */
function BuiltinRow({ c, b, a }: { c: ActionCtx; b: Builtin; a: Asset }) {
  const { ed } = c;
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
        <span class="small muted">built-in · every {a.name}</span>
        <span style={{ marginLeft: 'auto' }} />
        {b.hooks.length > 0 && (
          <button
            type="button"
            class="link small"
            title={`Make a behaviour of your own that extends ${b.name} and put it on every ${a.name}`}
            onClick={() => {
              const id = extendBuiltin(c, b);
              if (id) ed.exec({ type: 'script.attach', payload: { target: { kind: 'asset', id: a.id }, use: id } });
            }}
          >
            Extend
          </button>
        )}
        {b.name !== 'Interactable' && (
          <button
            type="button"
            class="link"
            aria-label={`Remove ${b.name} from every ${a.name}`}
            onClick={() => ed.exec({ type: 'builtin.detach', payload: { asset: a.id, name: b.name } })}
          >
            ×
          </button>
        )}
      </div>
      {b.fields.map((f) => (
        <label class="field">
          <span>{f.label}</span>
          {f.choices ? (
            <select
              class="inp"
              aria-label={`${b.name} ${f.label}`}
              value={String(f.get(a))}
              onChange={(ev) =>
                ed.exec(
                  {
                    type: 'builtin.setField',
                    payload: {
                      asset: a.id,
                      name: b.name,
                      field: f.name,
                      value: (ev.target as HTMLSelectElement).value,
                    },
                  },
                  { label: `${f.label}: ${(ev.target as HTMLSelectElement).value}` },
                )
              }
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
              value={f.get(a)}
              min={f.min}
              max={f.max}
              onCommit={(v) =>
                ed.exec(
                  { type: 'builtin.setField', payload: { asset: a.id, name: b.name, field: f.name, value: v } },
                  { label: `${f.label}: ${String(v)}` },
                )
              }
            />
          )}
        </label>
      ))}
      {!b.fields.length && <div class="hint small">Its settings are in {b.editIn}.</div>}
    </fieldset>
  );
}

export { BEHAVIOUR_HELP };
