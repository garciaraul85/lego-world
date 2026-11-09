import type { Asset } from '../schema';
import { expandAsset } from './expand';
import { bricksBox } from './tilt';

/**
 * Step 11 (P24 part 1b): moving parts in one click. A part of an asset (its bricks) becomes a door that swings on
 * its side, a drawbridge that lowers, a lid that opens, a lever that tips, a gate (portcullis) that slides up, or a
 * hatch that drops — with the asset's two states, the part's pose in each and its hinge set, and E in Play to open
 * and close it. Everything stays editable afterwards in the part's pose rows.
 */
export const MOVERS = ['door', 'drawbridge', 'lid', 'lever', 'gate', 'hatch'] as const;
export type Mover = (typeof MOVERS)[number];

export const MOVER_INFO: Record<Mover, { label: string; states: [string, string]; open: string; close: string }> = {
  door: { label: 'Door (swings on its side)', states: ['closed', 'open'], open: 'Open', close: 'Close' },
  drawbridge: { label: 'Drawbridge (lowers from up)', states: ['closed', 'open'], open: 'Lower', close: 'Raise' },
  lid: { label: 'Lid (lifts at the front)', states: ['closed', 'open'], open: 'Open', close: 'Close' },
  lever: { label: 'Lever (tips over)', states: ['off', 'on'], open: 'Pull', close: 'Pull' },
  gate: { label: 'Gate (slides up)', states: ['closed', 'open'], open: 'Open', close: 'Close' },
  hatch: { label: 'Trapdoor (drops open)', states: ['closed', 'open'], open: 'Open', close: 'Close' },
};

type V3 = [number, number, number];
type Part = NonNullable<Asset['parts']>[number];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** the box round some of the asset's bricks (every state), in the asset's frame: studs, heights in world units */
export function partBox(def: Asset, bricks: readonly number[]): [V3, V3] | null {
  const all = expandAsset({ ...def, onlyIn: undefined }, { pos: [0, 0, 0], rot: 0, idBase: 0 }).bricks;
  const mine = all.filter((b) => bricks.includes(b.id));
  return mine.length ? bricksBox(mine) : null;
}

/** the hinge and the pose in each of the two states for a kind of mover */
type Pose = { turn?: V3; move?: V3 };
export function moverPose(kind: Mover, lo: V3, hi: V3): { hinge: V3; closed?: Pose; open?: Pose } {
  const mx = r2((lo[0] + hi[0]) / 2);
  const mz = r2((lo[2] + hi[2]) / 2);
  const h = r2(hi[1] - lo[1]);
  switch (kind) {
    case 'door':
      // its left edge, turning a quarter about the up axis
      return { hinge: [r2(lo[0]), r2(lo[1]), mz], open: { turn: [0, -90, 0] } };
    case 'drawbridge':
      // built lying flat: closed it stands up on its back edge, open it lies down
      return { hinge: [mx, r2(lo[1]), r2(lo[2])], closed: { turn: [-90, 0, 0] } };
    case 'lid':
      // turning about the top of its back edge, the front lifts
      return { hinge: [mx, r2(lo[1]), r2(lo[2])], open: { turn: [-105, 0, 0] } };
    case 'lever':
      return { hinge: [mx, r2(lo[1]), mz], closed: { turn: [35, 0, 0] }, open: { turn: [-35, 0, 0] } };
    case 'gate':
      // it slides up by its own height (a portcullis)
      return { hinge: [mx, r2(lo[1]), mz], open: { move: [0, r2(h * 0.95), 0] } };
    case 'hatch':
      // a trapdoor in the floor: it swings down on its back edge
      return { hinge: [mx, r2(hi[1]), r2(lo[2])], open: { turn: [95, 0, 0] } };
  }
}

/** a part keeps a name of its own; one called “Part 3” or after a mover takes the new mover's name */
const renamed = (name: string, kind: Mover) =>
  /^Part \d+$/.test(name) || MOVERS.some((m) => MOVER_INFO[m].label.split(' (')[0] === name)
    ? MOVER_INFO[kind].label.split(' (')[0]!
    : name;

/**
 * The asset with part `index` made into a mover. Its first two states are used (a one-state asset gets the
 * mover's two, its old state becoming the first, bricks shown only in it kept there), the part's pose and hinge
 * set, and, unless the asset already has its own, an E socket and interactions that switch between them.
 */
export function makeMover(def: Asset, index: number, kind: Mover): Asset | string {
  const part = def.parts?.[index];
  if (!part) return 'That part is not in the asset.';
  const box = partBox(def, part.bricks);
  if (!box) return 'That part has no bricks.';
  const info = MOVER_INFO[kind];
  let next: Asset = def;
  let [a, b] = def.states as [string, string | undefined];
  if (!b) {
    // one state: it becomes the mover's first, and the second is added
    const old = a;
    [a, b] = info.states;
    const ren = (s: string) => (s === old ? a : s);
    next = {
      ...def,
      states: [a, b],
      initialState: a,
      ...(def.onlyIn ? { onlyIn: Object.fromEntries(Object.entries(def.onlyIn).map(([k, v]) => [ren(k), v])) } : {}),
      parts: def.parts?.map((p) =>
        p.pose ? { ...p, pose: Object.fromEntries(Object.entries(p.pose).map(([k, v]) => [ren(k), v])) } : p,
      ),
      interactions: def.interactions.map((x) => (x.when ? { ...x, when: { state: ren(x.when.state) } } : x)),
    };
  }
  const { hinge, closed, open } = moverPose(kind, box[0], box[1]);
  const pose: NonNullable<Part['pose']> = {};
  if (closed) pose[a] = closed;
  if (open) pose[b!] = open;
  next = {
    ...next,
    parts: next.parts!.map((p, i) =>
      i === index ? { ...p, name: renamed(p.name, kind), pose, hinge, ease: kind === 'gate' ? 1.2 : 0.6 } : p,
    ),
  };
  // E opens and closes it, unless the asset already says what E does
  if (!next.interactions.length) {
    const sock = `move-${index}`;
    const pos: V3 = [r2((box[0][0] + box[1][0]) / 2), r2(Math.min(box[1][1], box[0][1] + 1.6)), r2(box[1][2] + 0.4)];
    next = {
      ...next,
      sockets: [...next.sockets.filter((s) => s.id !== sock), { id: sock, kind: 'interact', pos, prompt: info.open }],
      interactions: [
        { socket: sock, when: { state: a }, do: [{ do: 'setState', state: b! }] },
        { socket: sock, when: { state: b! }, do: [{ do: 'setState', state: a }] },
      ],
    };
  }
  return next;
}
