import { nodeDef } from '../../../core/logic/catalog';
import type { ActionCtx } from '../../actions/registry';
import { graphs, newGraph } from './model';

/**
 * P4.6 "Open in Logic": opens the graph that already handles this event for this thing, or makes a new
 * one with the event node filled in, then shows it in the Logic workspace.
 */
export function openLogicFor(c: ActionCtx, name: string, type: string, args: Record<string, unknown>) {
  const { ed } = c;
  const same = (a: Record<string, unknown> | undefined) => Object.entries(args).every(([k, v]) => a?.[k] === v);
  const existing = graphs(ed).find((g) => g.nodes.some((n) => n.type === type && same(n.args)));
  if (existing) {
    ed.logicGraph.value = existing.id;
  } else {
    const g = newGraph(name, { type, args });
    const r = ed.exec(
      { type: 'logic.create', payload: { graph: g } },
      { label: `Add logic: ${nodeDef(type)?.title ?? type}` },
    );
    if (!r.ok) return;
    ed.logicGraph.value = g.id;
  }
  c.ui.workspace('Logic');
}
