import { useMemo, useState } from 'preact/hooks';
import { CATALOG, nodeDef } from '../../../core/logic/catalog';
import { graphProblems } from '../../../core/logic/graph';
import type { LogicGraph, Variables } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { CodeView } from './CodeView';
import { GraphView, toggleBreakpoint } from './GraphView';
import { argChoices, CAT_COLOR, graphs, newGraph, nodeHeight, variables } from './model';

type Mode = 'graph' | 'code' | 'split';

/** Logic workspace (P4.3–P4.5): graphs, variables and the node palette; graph, code or both; node inspector. */
export function LogicWorkspace({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const list = graphs(ed);
  const graph = list.find((g) => g.id === ed.logicGraph.value) ?? list[0] ?? null;
  const mode: Mode = ed.logicView.value;
  const setMode = (m: Mode) => (ed.logicView.value = m);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const brk = ed.logicBreak.value;
  const highlight = brk && graph && brk.graph === graph.id ? brk.node : null;
  const problems = useMemo(() => (graph ? graphProblems(graph) : []), [graph]);

  const create = () => {
    const g = newGraph(`Logic ${list.length + 1}`, { type: 'event.onStart' });
    if (ed.exec({ type: 'logic.create', payload: { graph: g } }).ok) ed.logicGraph.value = g.id;
  };

  return (
    <div class="studio logic-ws">
      <Sidebar c={c} list={list} graph={graph} onCreate={create} />
      <section class="panel studio-main" aria-label="Logic editor">
        <div class="ptabs studio-head">
          {graph ? (
            <input
              class="inp lg-name"
              aria-label="Graph name"
              value={graph.name}
              onChange={(e) => {
                const name = (e.target as HTMLInputElement).value.trim().slice(0, 80);
                if (name)
                  ed.exec({ type: 'logic.replace', payload: { graph: { ...graph, name } } }, { label: 'Rename logic' });
              }}
            />
          ) : (
            <strong class="studio-title">Logic</strong>
          )}
          <span class="group" role="radiogroup" aria-label="View">
            {(['graph', 'code', 'split'] as const).map((m) => (
              <button
                type="button"
                role="radio"
                aria-checked={mode === m}
                class={`btn ${mode === m ? 'on' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'graph' ? 'Graph' : m === 'code' ? 'Code' : 'Split'}
              </button>
            ))}
          </span>
          <span class={`chip ${problems.length ? 'warn' : ''}`} title={problems.map((p) => p.message).join('\n')}>
            {problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'}` : 'Graph OK'}
          </span>
          <button type="button" class="btn go" style={{ marginLeft: 'auto' }} onClick={() => c.ui.play('engine')}>
            ▶ Play &amp; trace
          </button>
        </div>
        {brk && (
          <div class="lg-break" role="alert">
            Play is paused at a breakpoint:{' '}
            <strong>
              {nodeDef(
                graphs(ed)
                  .find((g) => g.id === brk.graph)
                  ?.nodes.find((n) => n.id === brk.node)?.type ?? '',
              )?.title ?? brk.node}
            </strong>{' '}
            ·{' '}
            {Object.entries(brk.values)
              .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
              .join(', ') || 'no inputs'}
          </div>
        )}
        {!graph ? (
          <div class="placeholder">
            <strong>No logic yet</strong>
            <span class="muted">
              Logic graphs react to events (start, entering a zone, opening a chest, rebuilding) and change the game.
            </span>
            <button type="button" class="btn on" onClick={create}>
              + New logic graph
            </button>
          </div>
        ) : (
          <div class={`lg-views ${mode}`}>
            {mode !== 'code' && (
              <GraphView ed={ed} graph={graph} selected={selected} setSelected={setSelected} highlight={highlight} />
            )}
            {mode !== 'graph' && (
              <CodeView ed={ed} graph={graph} selected={selected} setSelected={setSelected} highlight={highlight} />
            )}
          </div>
        )}
        {graph && problems.length > 0 && (
          <div class="lg-problems scroll">
            {problems.map((p) => (
              <button type="button" class="problem" onClick={() => p.node && setSelected(new Set([p.node]))}>
                <span style={{ color: 'var(--warn)' }}>▲</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{p.message}</span>
                <span class="mono small muted">{p.node}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <NodeInspector c={c} graph={graph} selected={selected} />
    </div>
  );
}

function Sidebar({
  c,
  list,
  graph,
  onCreate,
}: {
  c: ActionCtx;
  list: LogicGraph[];
  graph: LogicGraph | null;
  onCreate: () => void;
}) {
  const { ed } = c;
  const [q, setQ] = useState('');
  const [newVar, setNewVar] = useState('');
  const vars = variables(ed);
  const nodes = CATALOG.filter((d) => `${d.title} ${d.category} ${d.type}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(nodes.map((d) => d.category))];
  const add = (type: string) => {
    if (!graph) return;
    // below everything already in the left column, so nothing is covered
    const y = Math.max(
      40,
      ...graph.nodes
        .filter((n) => n.pos[0] < 300)
        .map((n) => {
          const d = nodeDef(n.type);
          return n.pos[1] + (d ? nodeHeight(d, true) : 80) + 20;
        }),
    );
    ed.exec({
      type: 'logic.addNode',
      payload: { graph: graph.id, node: { type, pos: [80, Math.round(y / 10) * 10] } },
    });
  };
  return (
    <section class="panel studio-lib" aria-label="Logic graphs, variables and nodes">
      <div class="ptabs">
        <span class="tab on">Logic</span>
      </div>
      <div class="scroll">
        <div class="sech" style={{ padding: '8px 10px 4px' }}>
          <span>Graphs</span>
          <button type="button" class="link" onClick={onCreate}>
            + New
          </button>
        </div>
        {list.map((g) => (
          <div class={`lib-item ${g.id === graph?.id ? 'on' : ''}`}>
            <button type="button" class="link lg-graph-name" onClick={() => (ed.logicGraph.value = g.id)}>
              {g.name}
            </button>
            <span class="mono small muted">{g.nodes.length}</span>
            <button
              type="button"
              class="link"
              aria-label={`Delete ${g.name}`}
              onClick={() => ed.exec({ type: 'logic.delete', payload: { graph: g.id } })}
            >
              ×
            </button>
          </div>
        ))}
        {!list.length && (
          <div class="hint" style={{ padding: '4px 10px' }}>
            No graphs yet.
          </div>
        )}

        <div class="sech" style={{ padding: '12px 10px 4px' }}>
          <span>Variables</span>
        </div>
        {Object.entries(vars).map(([name, v]) => (
          <div class="lg-var">
            <span class="mono small">{name}</span>
            <select
              class="inp"
              aria-label={`${name} type`}
              value={v.type}
              onChange={(e) => {
                const type = (e.target as HTMLSelectElement).value as Variables['vars'][string]['type'];
                const def = type === 'number' ? 0 : type === 'bool' ? false : '';
                ed.exec({ type: 'logic.setVariable', payload: { name, def: { ...v, type, default: def } } });
              }}
            >
              <option value="number">number</option>
              <option value="bool">true/false</option>
              <option value="string">text</option>
            </select>
            <input
              class="inp mono"
              aria-label={`${name} starts at`}
              value={String(v.default)}
              onChange={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                const value = v.type === 'number' ? Number(raw) || 0 : v.type === 'bool' ? raw === 'true' : raw;
                ed.exec({ type: 'logic.setVariable', payload: { name, def: { ...v, default: value } } });
              }}
            />
            <button
              type="button"
              class="link"
              aria-label={`Remove ${name}`}
              onClick={() => ed.exec({ type: 'logic.setVariable', payload: { name, def: null } })}
            >
              ×
            </button>
          </div>
        ))}
        <div class="row" style={{ padding: '4px 10px' }}>
          <input
            class="inp"
            style={{ flex: 1 }}
            placeholder="New variable (e.g. repaired)"
            aria-label="New variable name"
            value={newVar}
            onInput={(e) => setNewVar((e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="btn"
            disabled={!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newVar) || newVar in vars}
            onClick={() => {
              ed.exec({
                type: 'logic.setVariable',
                payload: { name: newVar, def: { type: 'number', default: 0, scope: 'global' } },
              });
              setNewVar('');
            }}
          >
            Add
          </button>
        </div>

        <div class="sech" style={{ padding: '12px 10px 4px' }}>
          <span>Nodes</span>
          <span>{CATALOG.length}</span>
        </div>
        <div style={{ padding: '0 10px 6px' }}>
          <input
            class="inp"
            placeholder="Find a node"
            aria-label="Find a node"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          />
        </div>
        {cats.map((cat) => (
          <>
            <div class="sech" style={{ padding: '4px 10px 2px' }}>
              <span>{cat}</span>
            </div>
            {nodes
              .filter((d) => d.category === cat)
              .map((d) => (
                <button
                  type="button"
                  class="lg-pal"
                  draggable
                  disabled={!graph}
                  title={d.doc}
                  onDragStart={(e) => e.dataTransfer?.setData('text/x-logic-node', d.type)}
                  onClick={() => add(d.type)}
                >
                  <span class="lg-dot" style={{ background: CAT_COLOR[d.category] }} />
                  {d.title}
                </button>
              ))}
          </>
        ))}
      </div>
    </section>
  );
}

function NodeInspector({
  c,
  graph,
  selected,
}: {
  c: ActionCtx;
  graph: LogicGraph | null;
  selected: ReadonlySet<string>;
}) {
  const { ed } = c;
  const node = graph && selected.size === 1 ? graph.nodes.find((n) => n.id === [...selected][0]) : null;
  const def = node ? nodeDef(node.type) : null;
  const set = (args: Record<string, unknown>) =>
    graph && node && ed.exec({ type: 'logic.setArgs', payload: { graph: graph.id, node: node.id, args } });
  const bp = !!(graph && node && ed.breakpoints.value.has(`${graph.id}:${node.id}`));
  return (
    <section class="panel right studio-props" aria-label="Node inspector">
      <div class="ptabs">
        <span class="tab on">Node</span>
      </div>
      <div class="scroll">
        {!node || !def ? (
          <div class="sec">
            <div class="muted">{selected.size > 1 ? `${selected.size} nodes selected.` : 'Nothing selected.'}</div>
            <p class="hint">
              Events (teal) start a chain; flow (purple) decides where it goes; actions change the world. Drag from a
              pin to another to wire them. Delete removes, F9 sets a breakpoint, the wheel zooms.
            </p>
          </div>
        ) : (
          <>
            <div class="sec">
              <div class="row" style={{ alignItems: 'center' }}>
                <span class="lg-dot" style={{ background: CAT_COLOR[def.category] }} />
                <strong>{def.title}</strong>
                <span class="mono small muted" style={{ marginLeft: 'auto' }}>
                  {node.id}
                </span>
              </div>
              <div class="hint">{def.doc}</div>
            </div>
            {(def.args?.length ?? 0) > 0 && (
              <div class="sec">
                <div class="sech">
                  <span>Settings</span>
                </div>
                {def.args!.map((a) => {
                  const v = node.args?.[a.name] ?? a.default;
                  const choices = argChoices(ed, a.kind);
                  return (
                    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the select/input chosen below
                    <label class="field">
                      {a.label}
                      {a.kind === 'bool' ? (
                        <input type="checkbox" checked={!!v} onChange={() => set({ [a.name]: !v })} />
                      ) : choices ? (
                        <select
                          class="inp"
                          value={String(v ?? '')}
                          onChange={(e) => set({ [a.name]: (e.target as HTMLSelectElement).value || undefined })}
                        >
                          <option value="">{a.optional ? 'any' : 'choose…'}</option>
                          {choices.map((ch) => (
                            <option value={ch.value}>{ch.label}</option>
                          ))}
                          {v && !choices.some((ch) => ch.value === v) && <option value={String(v)}>{String(v)}</option>}
                        </select>
                      ) : a.kind === 'number' ? (
                        <input
                          class="inp mono"
                          value={String(v ?? '')}
                          onChange={(e) => set({ [a.name]: Number((e.target as HTMLInputElement).value) })}
                        />
                      ) : (
                        <input
                          class="inp"
                          value={String(v ?? '')}
                          onChange={(e) => set({ [a.name]: (e.target as HTMLInputElement).value })}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {def.inputs.some((p) => p.type !== 'exec') && (
              <div class="sec">
                <div class="sech">
                  <span>Values</span>
                  <span>used when nothing is wired in</span>
                </div>
                {def.inputs
                  .filter((p) => p.type !== 'exec')
                  .map((p) => {
                    const wired = graph!.edges.some((e) => e[2] === node.id && e[3] === p.name);
                    const v = node.args?.[p.name] ?? p.default;
                    return (
                      // biome-ignore lint/a11y/noLabelWithoutControl: the control is the select/input chosen below
                      <label class="field">
                        {p.label ?? p.name}
                        {wired ? (
                          <span class="muted small">wired</span>
                        ) : p.type === 'bool' ? (
                          <input type="checkbox" checked={!!v} onChange={() => set({ [p.name]: !v })} />
                        ) : (
                          <input
                            class="inp mono"
                            value={typeof v === 'string' ? v : JSON.stringify(v ?? null)}
                            onChange={(e) => {
                              const raw = (e.target as HTMLInputElement).value;
                              let val: unknown = raw;
                              if (p.type === 'number') val = Number(raw) || 0;
                              else if (p.type !== 'string')
                                try {
                                  val = JSON.parse(raw);
                                } catch {
                                  val = raw;
                                }
                              set({ [p.name]: val });
                            }}
                          />
                        )}
                      </label>
                    );
                  })}
              </div>
            )}
            {def.kind !== 'note' && (
              <div class="sec">
                <label class="lbl">
                  <input
                    type="checkbox"
                    checked={bp}
                    onChange={() => graph && toggleBreakpoint(ed, graph.id, node.id)}
                  />{' '}
                  Breakpoint (pause Play here, F9)
                </label>
              </div>
            )}
            <div class="sec" style={{ borderBottom: 0 }}>
              <button
                type="button"
                class="btn danger"
                onClick={() =>
                  graph && ed.exec({ type: 'logic.removeNodes', payload: { graph: graph.id, nodes: [node.id] } })
                }
              >
                Delete node
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
