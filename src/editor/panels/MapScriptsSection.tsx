/**
 * Milestone 3b (B7a-3): a map's own behaviours, in the Inspector's Map tab. A behaviour that extends MapScript
 * (or a plain one) attached here runs while the hero is on this map: mapEnter as it arrives, mapLeave as it goes,
 * foesCleared when the last foe falls, and every other event. Each with its fields; + New map script makes one.
 */
import { useState } from 'preact/hooks';
import type { ScriptTarget } from '../../core/commands/handlers/scripts';
import { isMapScriptClass } from '../../core/logic/builtins';
import { className, parseBehaviour } from '../../core/logic/code/behaviour';
import type { LogicGraph, MapDoc } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { ValueInput } from '../workspaces/logic/BehaviourPanel';
import { graphs, newBehaviour } from '../workspaces/logic/model';

export const MAP_SCRIPTS_HELP =
  'This map’s own behaviours. One that extends MapScript (or a plain behaviour) runs while the hero is on this map: mapEnter(e) as the hero arrives (music, a title, a quest to start), mapLeave(e) as it goes, foesCleared(e) when the last foe here is beaten (the doors open), and any other event. Its own variables start again each visit; keep what must last in game variables.';

/** a new map script: the three events, to fill in */
function newMapScript(name: string): LogicGraph {
  const g = newBehaviour(name);
  const code = [
    `class ${className(name)} extends MapScript {`,
    '  mapEnter(e) {',
    '    say("Welcome!", 2);',
    '  }',
    '',
    '  foesCleared(e) {',
    '    say("All clear!", 2);',
    '  }',
    '}',
  ].join('\n');
  const r = parseBehaviour(code);
  return 'error' in r ? g : { ...g, nodes: r.nodes, edges: r.edges, behaviour: r.behaviour };
}

export function MapScriptsSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  ed.revision.value;
  const [pick, setPick] = useState('');
  const target: ScriptTarget = { kind: 'map', id: m.id };
  const all = graphs(ed).filter((g) => g.behaviour && (isMapScriptClass(g.behaviour.extends) || !g.behaviour.extends));
  const on = m.scripts ?? [];
  const free = all.filter((g) => !on.some((a) => a.use === g.id));
  const open = (id: string) => {
    ed.logicGraph.value = id;
    c.ui.workspace('Logic');
  };
  const attach = () => {
    const use = pick || free[0]?.id;
    if (!use) return;
    ed.exec({ type: 'script.attach', payload: { target, use } }, { label: 'Attach map script' });
    setPick('');
  };
  const makeNew = () => {
    const g = newMapScript(`${m.name} script`);
    const ok = ed.exec(
      [
        { type: 'logic.create', payload: { graph: g } },
        { type: 'script.attach', payload: { target, use: g.id } },
      ],
      { label: 'New map script' },
    );
    if (ok.ok) open(g.id);
  };
  return (
    <div class="sec" data-tour="map-scripts" data-help="scene.map.scripts">
      <div class="sech">
        <span>
          Behaviours
          <FieldHelp label="Map behaviours" text={MAP_SCRIPTS_HELP} />
        </span>
        <span>{on.length}</span>
      </div>
      {!on.length && <div class="hint">None yet: + New map script makes one that runs on this map.</div>}
      {on.map((a) => {
        const g = all.find((x) => x.id === a.use) ?? graphs(ed).find((x) => x.id === a.use);
        if (!g?.behaviour) return null;
        return (
          <fieldset class="bhv-field" aria-label={`Map behaviour ${g.name}`}>
            <div class="row" style={{ gap: '6px' }}>
              <button type="button" class="link" onClick={() => open(g.id)} title="Open it in Logic">
                {g.name}
              </button>
              <span class="small muted">{g.behaviour.extends ?? 'Behaviour'}</span>
              <button
                type="button"
                class="link"
                style={{ marginLeft: 'auto' }}
                aria-label={`Remove ${g.name} from the map`}
                onClick={() =>
                  ed.exec({ type: 'script.detach', payload: { target, use: g.id } }, { label: 'Remove map script' })
                }
              >
                ×
              </button>
            </div>
            {g.behaviour.fields.map((f) => (
              <label class="field">
                {f.label}
                <ValueInput
                  ed={ed}
                  type={f.type}
                  label={`${g.name} ${f.label}`}
                  value={a.fields?.[f.name] ?? f.default}
                  min={f.min}
                  max={f.max}
                  onCommit={(v) =>
                    ed.exec(
                      { type: 'script.setField', payload: { target, use: g.id, name: f.name, value: v } },
                      { label: `Set ${f.label}` },
                    )
                  }
                />
              </label>
            ))}
          </fieldset>
        );
      })}
      <div class="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {free.length > 0 && (
          <>
            <select
              class="inp"
              aria-label="Map behaviour to attach"
              value={pick}
              onChange={(e) => setPick((e.target as HTMLSelectElement).value)}
            >
              {free.map((g) => (
                <option value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" class="btn" onClick={attach}>
              + Script
            </button>
          </>
        )}
        <button type="button" class="btn" aria-label="New map script" onClick={makeNew}>
          + New map script
        </button>
      </div>
    </div>
  );
}
