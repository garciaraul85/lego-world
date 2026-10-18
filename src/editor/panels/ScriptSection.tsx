import { useState } from 'preact/hooks';
import { BUILTIN_ASSETS } from '../../builtin/assets';
import { newId } from '../../core/ids';
import {
  addWire,
  removeWire,
  scriptOf,
  WIRE_WHEN,
  type WireDo,
  type WireWhen,
  wiresOf,
  wireText,
} from '../../core/logic/wiring';
import { type Asset, type Instances, type LogicGraph, paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp, TextField } from '../components/fields';
import { eventNames } from '../events';
import { shows } from '../genres/view';
import type { EditorState } from '../state';
import { graphs } from '../workspaces/logic/model';

/** P9c: what the Script section's controls mean (their “?”) */
export const SCRIPT_HELP = {
  name: 'This copy’s own name, so logic and wires can point at exactly this one (“Gate switch”). Without a name, logic finds copies by their asset’s name (the one nearest the hero).',
  script:
    'A logic file that belongs to this one object. Its events about objects — used, hit, smashed, rebuilt, locked on — run only for this copy, and “this” in it means this copy. It shows in Logic like any file (cards and code).',
  wire: 'Connect this object to another without writing logic: when this one is used, hit, smashed, rebuilt or locked on, another object changes state, is removed, or a custom event is sent. Each wire is two cards in this object’s script.',
};

type Placed = { id: string; label: string; ref: string; asset: Asset | undefined; named: boolean };

const assetOf = (ed: EditorState, id: string) =>
  ed.store.get<Asset>(paths.asset(id)) ?? (BUILTIN_ASSETS.find((a) => a.id === id) as Asset | undefined);

/** the placed copies on this map, with the name logic uses for each */
function placed(ed: EditorState, map: string): Placed[] {
  const items = ed.store.get<Instances>(paths.instances(map))?.items ?? [];
  return items.flatMap((i) => {
    if (i.kind !== 'asset') return [];
    const a = assetOf(ed, i.asset);
    const label = i.name ?? a?.name ?? i.asset;
    return [
      { id: i.id, label: i.name ? `${i.name} (${a?.name ?? ''})` : label, ref: label, asset: a, named: !!i.name },
    ];
  });
}

/** a free name for a copy: “Door 1”, “Door 2”… */
function freeName(list: Placed[], base: string): string {
  const taken = new Set(list.filter((p) => p.named).map((p) => p.ref.toLowerCase()));
  for (let n = 1; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** Name, script and wires of the selected placed object. */
export function ScriptSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const e = ed.selectedInstance.value!;
  const map = ed.mapId.value;
  const [when, setWhen] = useState<WireWhen>(e.def.interactions.length ? 'used' : 'hit');
  const [target, setTarget] = useState('');
  const [doKind, setDoKind] = useState<'state' | 'remove' | 'emit'>('state');
  const [state, setState] = useState('');
  const [event, setEvent] = useState('');
  if (!shows(ed, 'section', 'object.script')) return null;
  const others = placed(ed, map).filter((p) => p.id !== e.inst.id);
  const script = scriptOf(graphs(ed), e.inst.id);
  const wires = wiresOf(script);
  const myName = e.inst.name ?? e.def.name;
  const tgt = others.find((p) => p.id === target);
  const states = tgt?.asset?.states ?? [];

  const openScript = (g: LogicGraph) => {
    ed.logicGraph.value = g.id;
    c.ui.workspace('Logic');
  };
  const makeScript = () => {
    const ev = e.def.interactions.length
      ? 'event.onInteract'
      : e.def.health
        ? 'event.onDamaged'
        : e.def.lockOn
          ? 'event.onLockedOn'
          : 'event.onSmash';
    const g: LogicGraph = {
      id: newId('logic') as LogicGraph['id'],
      name: `${myName} script`,
      scope: 'global',
      owner: e.inst.id as LogicGraph['owner'],
      nodes: [{ id: 'n1', type: ev, pos: [40, 60] }],
      edges: [],
    };
    if (ed.exec({ type: 'logic.create', payload: { graph: g } }, { label: `Script on ${myName}` }).ok) openScript(g);
  };
  const wire = () => {
    let what: WireDo;
    const cmds: { type: string; payload: unknown }[] = [];
    if (doKind === 'emit') {
      if (!event.trim()) return;
      what = { kind: 'emit', event: event.trim() };
    } else {
      if (!tgt) return;
      // the target needs its own name so the wire points at exactly that copy
      let ref = tgt.ref;
      if (!tgt.named) {
        ref = freeName(placed(ed, map), tgt.asset?.name ?? 'Object');
        cmds.push({ type: 'instance.rename', payload: { map, instance: tgt.id, name: ref } });
      }
      if (doKind === 'state') {
        const s = state || states.find((x) => x !== (tgt.asset?.initialState ?? '')) || states[0];
        if (!s) return;
        what = { kind: 'state', target: ref, state: s };
      } else what = { kind: 'remove', target: ref };
    }
    const g = addWire(script, { id: e.inst.id, name: myName, newId: () => newId('logic') }, when, what);
    cmds.push(
      script ? { type: 'logic.replace', payload: { graph: g } } : { type: 'logic.create', payload: { graph: g } },
    );
    ed.exec(cmds, { label: `Wire: ${myName} → ${what.kind === 'emit' ? what.event : what.target}` });
  };

  return (
    <div class="sec" data-tour="object-script" data-help="scene.script">
      <div class="sech">
        <span>
          Name, script &amp; wires
          <FieldHelp label="Script" text={SCRIPT_HELP.script} />
        </span>
      </div>
      <div class="field">
        <span>
          Name
          <FieldHelp label="Name" text={SCRIPT_HELP.name} />
        </span>
        <TextField
          label="Object name"
          value={e.inst.name ?? ''}
          onCommit={(v) =>
            ed.exec({ type: 'instance.rename', payload: { map, instance: e.inst.id, name: v.trim() || null } })
          }
        />
      </div>
      <div class="row" style={{ gap: '6px' }}>
        {script ? (
          <button type="button" class="btn" data-tour="open-script" onClick={() => openScript(script)}>
            Open script ({script.nodes.length} card{script.nodes.length === 1 ? '' : 's'})
          </button>
        ) : (
          <button type="button" class="btn" data-tour="add-script" onClick={makeScript}>
            + Script on this object
          </button>
        )}
      </div>
      <div class="small muted" style={{ marginTop: '8px' }}>
        Wires
        <FieldHelp label="Wires" text={SCRIPT_HELP.wire} />
      </div>
      {wires.map((w) => (
        <div class="row small" style={{ gap: '6px' }} role="group" aria-label={wireText(w)}>
          <span style={{ flex: 1 }}>{wireText(w)}</span>
          <button
            type="button"
            class="link"
            aria-label={`Remove wire: ${wireText(w)}`}
            onClick={() =>
              script &&
              ed.exec({ type: 'logic.replace', payload: { graph: removeWire(script, w) } }, { label: 'Remove wire' })
            }
          >
            ×
          </button>
        </div>
      ))}
      <fieldset class="wire-new" aria-label="New wire" data-tour="wire-new">
        <label class="field">
          When this
          <select
            class="inp"
            aria-label="Wire when"
            value={when}
            onChange={(ev) => setWhen((ev.target as HTMLSelectElement).value as WireWhen)}
          >
            {Object.entries(WIRE_WHEN).map(([k, v]) => (
              <option value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label class="field">
          Then
          <select
            class="inp"
            aria-label="Wire does"
            value={doKind}
            onChange={(ev) => setDoKind((ev.target as HTMLSelectElement).value as typeof doKind)}
          >
            <option value="state">set another object's state</option>
            <option value="remove">remove another object</option>
            <option value="emit">send a custom event</option>
          </select>
        </label>
        {doKind === 'emit' ? (
          <label class="field">
            Event
            <input
              class="inp"
              list="wire-events"
              aria-label="Wire event"
              placeholder="e.g. gateOpened"
              value={event}
              onInput={(ev) => setEvent((ev.target as HTMLInputElement).value)}
            />
            <datalist id="wire-events">
              {eventNames(ed.store).map((n) => (
                <option value={n} />
              ))}
            </datalist>
          </label>
        ) : (
          <>
            <label class="field">
              Object
              <select
                class="inp"
                aria-label="Wire target"
                value={target}
                onChange={(ev) => {
                  setTarget((ev.target as HTMLSelectElement).value);
                  setState('');
                }}
              >
                <option value="">choose…</option>
                {others.map((p) => (
                  <option value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            {doKind === 'state' && (
              <label class="field">
                State
                <select
                  class="inp"
                  aria-label="Wire state"
                  value={state}
                  disabled={!states.length}
                  onChange={(ev) => setState((ev.target as HTMLSelectElement).value)}
                >
                  <option value="">{states.length ? 'choose…' : 'it has no states'}</option>
                  {states.map((s) => (
                    <option value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <button
          type="button"
          class="btn on"
          aria-label="Add wire"
          disabled={doKind === 'emit' ? !event.trim() : !tgt || (doKind === 'state' && !states.length)}
          onClick={wire}
        >
          + Wire
        </button>
      </fieldset>
    </div>
  );
}
