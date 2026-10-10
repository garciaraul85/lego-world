import type { LogicGraph } from '../schema';

type N = [string, Record<string, unknown>?];
type E = [number, string, number, string];

/** A logic graph from nodes in order (n1, n2…) and edges by node number; laid out left to right. */
export function graphOf(id: string, name: string, nodes: N[], edges: E[]): LogicGraph {
  return {
    id: id as LogicGraph['id'],
    name,
    scope: 'global',
    nodes: nodes.map(([type, args], i) => ({
      id: `n${i + 1}`,
      type,
      pos: [60 + (i % 4) * 230, 60 + Math.floor(i / 4) * 170] as [number, number],
      ...(args ? { args } : {}),
    })),
    edges: edges.map(([a, ap, b, bp]) => [`n${a}`, ap, `n${b}`, bp]),
  };
}

/**
 * Quest graphs (P7.1 recipes). Counting quests: the event adds 1 to a variable; when it reaches the
 * target, the reward cinematic plays once. Reaching quests: entering the zone plays it.
 */
export function countQuest(o: {
  id: string;
  name: string;
  event: N;
  counter: string;
  target: number;
  cinematic: string;
}): LogicGraph {
  return graphOf(
    o.id,
    o.name,
    [
      o.event,
      ['var.add', { var: o.counter }],
      ['flow.branch'],
      ['compare.gte', { b: o.target }],
      ['var.get', { var: o.counter }],
      ['flow.once'],
      ['cinematic.play', { cinematic: o.cinematic, once: true }],
      ['world.give', { item: 'medal', count: 1 }],
    ],
    [
      [1, 'then', 2, 'in'],
      [2, 'then', 3, 'in'],
      [5, 'value', 4, 'a'],
      [4, 'out', 3, 'cond'],
      [3, 'true', 6, 'in'],
      [6, 'then', 7, 'in'],
      [7, 'then', 8, 'in'],
    ],
  );
}

export function reachQuest(o: { id: string; name: string; zone: string; cinematic: string }): LogicGraph {
  return graphOf(
    o.id,
    o.name,
    [
      ['event.onEnterZone', { zone: o.zone }],
      ['flow.once'],
      ['cinematic.play', { cinematic: o.cinematic, once: true }],
      ['world.give', { item: 'medal', count: 1 }],
    ],
    [
      [1, 'then', 2, 'in'],
      [2, 'then', 3, 'in'],
      [3, 'then', 4, 'in'],
    ],
  );
}

/** Logic that celebrates the end: when the reward scene finishes, say so and play the victory stinger. */
export function endingGraph(o: { id: string; cinematic: string; text: string }): LogicGraph {
  return graphOf(
    o.id,
    'Ending',
    [
      ['event.onCinematicDone', { cinematic: o.cinematic }],
      ['misc.log', { value: o.text }],
      ['var.set', { var: 'questDone', value: true }],
    ],
    [
      [1, 'then', 2, 'in'],
      [2, 'then', 3, 'in'],
    ],
  );
}
