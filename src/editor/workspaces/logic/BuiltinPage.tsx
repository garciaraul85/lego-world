/**
 * Milestone 3b (B3): a built-in behaviour's page in Logic — what it does, its fields (its settings), the hooks a
 * behaviour that extends it can answer, and the events it sends; Extend makes a behaviour of the game's own on it.
 */

import { FIELD_TYPES } from '../../../core/logic/behaviours';
import { type Builtin, extendCode, lineageOf } from '../../../core/logic/builtins';
import { nodeDef } from '../../../core/logic/catalog';
import { parseBehaviour } from '../../../core/logic/code/behaviour';
import type { LogicGraph } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { graphs, newBehaviour } from './model';

export const BUILTIN_HELP =
  'A built-in behaviour is one of the engine’s own features (a lock, a switch, a push block…). An asset with its setting is one; its decisions (hooks) can be answered by a behaviour of the game’s own that extends it: class GemDoor extends Lock { canOpen(e) { … } }. Not answering keeps the engine’s answer (super.canOpen(e)).';

// biome-ignore lint/suspicious/noExplicitAny: an asset's built-in or a character's
export function extendBuiltin(c: ActionCtx, b: Builtin<any>): string | null {
  const { ed } = c;
  const taken = new Set(graphs(ed).map((g) => g.name));
  let name = `My ${b.name}`;
  for (let i = 2; taken.has(name); i++) name = `My ${b.name} ${i}`;
  const r = parseBehaviour(extendCode(b, name));
  if ('error' in r) return null;
  const g: LogicGraph = { ...newBehaviour(name), nodes: r.nodes, edges: r.edges, behaviour: r.behaviour };
  if (!ed.exec({ type: 'logic.create', payload: { graph: g } }, { label: `Extend ${b.name}` }).ok) return null;
  ed.logicGraph.value = g.id;
  ed.logicView.value = 'split';
  c.ui.workspace('Logic');
  return g.id;
}

// biome-ignore lint/suspicious/noExplicitAny: an asset's built-in or a character's
export function BuiltinPage({ c, b }: { c: ActionCtx; b: Builtin<any> }) {
  const { ed } = c;
  const mine = graphs(ed).filter((g) => g.behaviour?.extends === b.name);
  return (
    <div class="scroll builtin-page" data-tour="builtin-page" data-help="logic.builtin">
      <h2 style={{ margin: '4px 0 6px' }}>
        {b.name} <span class="chip">built-in</span>
      </h2>
      {/* Milestone 3b (B5a): what it extends (its class line) */}
      {lineageOf(b.name).length > 1 && (
        <p class="small" data-tour="builtin-lineage">
          {lineageOf(b.name)
            .map((x) => x.name)
            .join(' extends ')}
        </p>
      )}
      <p>{b.about}</p>
      <p class="small muted">
        {b.for === 'character'
          ? b.fixed
            ? `Every ${b.name === 'Hero' ? 'player character' : 'neighbour'} is one (its settings: ${b.editIn}). A behaviour that extends it goes on the character, in Characters › Behaviour.`
            : `A character with this setting is one (${b.editIn}, or Characters › Behaviour).`
          : `An asset with this setting is a ${b.name} (set in ${b.editIn}, or Scene › Inspector › Behaviours).`}
      </p>
      <div class="row" style={{ gap: '8px', margin: '8px 0 12px' }}>
        <button type="button" class="btn on" data-tour="builtin-extend" onClick={() => extendBuiltin(c, b)}>
          Extend: make your own {b.name}
        </button>
      </div>
      <h3>Fields</h3>
      {b.fields.length ? (
        <table class="builtin-table">
          <tbody>
            {b.fields.map((f) => (
              <tr>
                <td>
                  <code>{f.name}</code>
                </td>
                <td>{f.label}</td>
                <td class="muted">
                  {f.choices ? f.choices.join(' / ') : FIELD_TYPES.find((t) => t.type === f.type)?.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="muted small">None to set here (its settings are in {b.editIn}).</p>
      )}
      <h3>Hooks (its decisions you can make)</h3>
      {b.hooks.length ? (
        <table class="builtin-table">
          <tbody>
            {b.hooks.map((h) => (
              <tr>
                <td>
                  <code>
                    {h.method}(e) →{' '}
                    {h.returns === 'bool' ? 'true / false' : h.returns === 'name' ? 'a name' : 'a number'}
                  </code>
                </td>
                <td>
                  {h.doc}
                  <div class="small muted">
                    e:{' '}
                    {nodeDef(h.event)
                      ?.outputs.filter((o) => o.type !== 'exec')
                      .map((o) => o.name)
                      .join(', ')}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="muted small">None: it has no decisions to make. A behaviour on it can still use its events.</p>
      )}
      {/* Milestone 3b (B5a): the hooks of the ones it extends (answerable here too) */}
      {lineageOf(b.name)
        .slice(1)
        .filter((x) => x.hooks.length)
        .map((x) => (
          <>
            <h3>Hooks from {x.name}</h3>
            <table class="builtin-table">
              <tbody>
                {x.hooks.map((h) => (
                  <tr>
                    <td>
                      <code>
                        {h.method}(e) →{' '}
                        {h.returns === 'bool' ? 'true / false' : h.returns === 'name' ? 'a name' : 'a number'}
                      </code>
                    </td>
                    <td>{h.doc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ))}
      <h3>Events it sends</h3>
      <p class="small">
        {[...new Set(lineageOf(b.name).flatMap((x) => x.events))].map((e) => nodeDef(e)?.title ?? e).join(', ') ||
          'None.'}
      </p>
      {mine.length > 0 && (
        <>
          <h3>Your behaviours that extend it</h3>
          {mine.map((g) => (
            <button type="button" class="link" onClick={() => (ed.logicGraph.value = g.id)}>
              {g.name}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
