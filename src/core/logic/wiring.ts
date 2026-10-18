import type { LogicGraph } from '../schema';

/**
 * P9c: wiring — “when this switch is used, open the gate” without writing logic. A wire is two cards in the
 * object's own script (a logic file owned by the placed object): a When event and one action wired after it.
 * The script is ordinary logic: it shows in the Logic workspace as cards and code, and can be extended there.
 */
export const WIRE_WHEN = {
  used: { event: 'event.onInteract', label: 'is used (E)' },
  hit: { event: 'event.onDamaged', label: 'is hit' },
  smashed: { event: 'event.onSmash', label: 'is smashed' },
  rebuilt: { event: 'event.onRebuildFinished', label: 'is rebuilt' },
  lockedOn: { event: 'event.onLockedOn', label: 'is locked on to (Z)' },
} as const;
export type WireWhen = keyof typeof WIRE_WHEN;

export type WireDo =
  | { kind: 'state'; target: string; state: string }
  | { kind: 'remove'; target: string }
  | { kind: 'emit'; event: string };

export type Wire = { when: WireWhen; do: WireDo; nodes: [string, string] };

const WHEN_OF = new Map<string, WireWhen>(Object.entries(WIRE_WHEN).map(([k, v]) => [v.event, k as WireWhen]));

/** the script owned by a placed object or neighbour (null: none yet) */
export const scriptOf = (graphs: readonly LogicGraph[], owner: string) => graphs.find((g) => g.owner === owner) ?? null;

/** the wires in a script: each When card followed by exactly one Set state / Remove / Send event card */
export function wiresOf(g: LogicGraph | null): Wire[] {
  if (!g) return [];
  const out: Wire[] = [];
  for (const ev of g.nodes) {
    const when = WHEN_OF.get(ev.type);
    if (!when) continue;
    const next = g.edges.filter((e) => e[0] === ev.id && e[1] === 'then');
    if (next.length !== 1) continue;
    const act = g.nodes.find((n) => n.id === next[0]![2]);
    if (!act || g.edges.some((e) => e[0] === act.id)) continue;
    const a = act.args ?? {};
    if (act.type === 'world.setState')
      out.push({
        when,
        do: { kind: 'state', target: String(a.target ?? ''), state: String(a.state ?? '') },
        nodes: [ev.id, act.id],
      });
    else if (act.type === 'world.despawn')
      out.push({ when, do: { kind: 'remove', target: String(a.target ?? '') }, nodes: [ev.id, act.id] });
    else if (act.type === 'misc.emit')
      out.push({ when, do: { kind: 'emit', event: String(a.event ?? '') }, nodes: [ev.id, act.id] });
  }
  return out;
}

/** the script with one more wire (a new script owned by `owner` when there is none) */
export function addWire(
  g: LogicGraph | null,
  owner: { id: string; name: string; newId: () => string },
  when: WireWhen,
  what: WireDo,
): LogicGraph {
  const base: LogicGraph = g ?? {
    id: owner.newId() as LogicGraph['id'],
    name: `${owner.name} script`,
    scope: 'global',
    owner: owner.id as LogicGraph['owner'],
    nodes: [],
    edges: [],
  };
  const used = new Set(base.nodes.map((n) => n.id));
  let k = base.nodes.length + 1;
  const fresh = () => {
    while (used.has(`n${k}`)) k++;
    used.add(`n${k}`);
    return `n${k}`;
  };
  const y = Math.max(40, ...base.nodes.map((n) => n.pos[1] + 140));
  const ev = fresh();
  const act = fresh();
  const action =
    what.kind === 'state'
      ? { type: 'world.setState', args: { target: what.target, state: what.state } }
      : what.kind === 'remove'
        ? { type: 'world.despawn', args: { target: what.target } }
        : { type: 'misc.emit', args: { event: what.event } };
  return {
    ...base,
    nodes: [
      ...base.nodes,
      { id: ev, type: WIRE_WHEN[when].event, pos: [40, y] },
      { id: act, type: action.type, pos: [300, y], args: action.args },
    ],
    edges: [...base.edges, [ev, 'then', act, 'in']],
  };
}

/** the script without that wire's two cards */
export function removeWire(g: LogicGraph, w: Wire): LogicGraph {
  const gone = new Set(w.nodes);
  return {
    ...g,
    nodes: g.nodes.filter((n) => !gone.has(n.id)),
    edges: g.edges.filter((e) => !gone.has(e[0]) && !gone.has(e[2])),
  };
}

/** a wire in words: “When used → Gate: open” */
export function wireText(w: Wire): string {
  const d = w.do;
  const what =
    d.kind === 'state' ? `${d.target}: ${d.state}` : d.kind === 'remove' ? `remove ${d.target}` : `send “${d.event}”`;
  return `When ${WIRE_WHEN[w.when].label} → ${what}`;
}
