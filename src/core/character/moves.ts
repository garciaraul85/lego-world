import type { Bone } from './body';

/**
 * Milestone 3, 10d part 2: moves for anything. Any body — a family's or one made from words — gets the moves
 * its parts can do: whatever has a head can roar, a jaw bites, horns charge, a tail swipes, wings flap and
 * glide, arms wave and punch, tentacles grab, legs stomp, and everything can spin, dance and nod off. The
 * moves are worked out from the bones' roles, played by the body's generated motion, previewed in the Body
 * tab, and started in the game from logic (Do a move) or chosen as its strike when it fights.
 */
export const BODY_MOVES = [
  'attack',
  'hurt',
  'roar',
  'charge',
  'swipe',
  'stomp',
  'flap',
  'glide',
  'wave',
  'grab',
  'spin',
  'dance',
  'sleep',
] as const;
export type BodyMove = (typeof BODY_MOVES)[number];

/** seconds each move takes */
export const MOVE_LENGTH: Record<BodyMove, number> = {
  attack: 0.5,
  hurt: 0.45,
  roar: 1.4,
  charge: 0.9,
  swipe: 0.7,
  stomp: 0.8,
  flap: 1,
  glide: 1.8,
  wave: 1.2,
  grab: 0.9,
  spin: 0.9,
  dance: 2.4,
  sleep: 3,
};

export type MoveInfo = { move: BodyMove; label: string; about: string };

/** the moves a body can do, with what each is called for it (a bite for a jaw, a punch for arms…) */
export function movesOf(bones: readonly Pick<Bone, 'role' | 'name'>[]): MoveInfo[] {
  const has = (r: Bone['role']) => bones.some((b) => b.role === r);
  const tentacles = bones.some((b) => /^tentacle/i.test(b.name));
  const horns = bones.some((b) => /horn/i.test(b.name));
  const out: MoveInfo[] = [];
  const strike = has('jaw')
    ? { label: 'Bite', about: 'lunges and snaps its jaw' }
    : has('arm')
      ? { label: 'Punch', about: 'swings its arms forward' }
      : has('head')
        ? { label: 'Headbutt', about: 'lunges with its head' }
        : { label: 'Strike', about: 'lunges forward' };
  out.push({ move: 'attack', ...strike });
  if (has('head') || has('jaw') || bones.length <= 2)
    out.push({ move: 'roar', label: has('jaw') ? 'Roar' : 'Shout', about: 'rears its head and calls out' });
  if (has('head') || horns) out.push({ move: 'charge', label: 'Charge', about: 'lowers its head and rushes forward' });
  if (has('tail') && !tentacles) out.push({ move: 'swipe', label: 'Tail swipe', about: 'whips its tail round' });
  if (has('leg')) out.push({ move: 'stomp', label: 'Stomp', about: 'rears up and stamps down' });
  if (has('wing')) {
    out.push({ move: 'flap', label: 'Flap', about: 'beats its wings hard and lifts' });
    out.push({ move: 'glide', label: 'Glide', about: 'spreads its wings wide and sways' });
  }
  if (has('arm')) out.push({ move: 'wave', label: 'Wave', about: 'waves an arm' });
  if (tentacles || has('arm')) out.push({ move: 'grab', label: 'Grab', about: 'reaches out and curls in' });
  out.push({ move: 'spin', label: 'Spin', about: 'spins round on the spot' });
  out.push({ move: 'dance', label: 'Dance', about: 'bounces and sways' });
  out.push({ move: 'sleep', label: 'Sleep', about: 'droops and dozes' });
  out.push({ move: 'hurt', label: 'Flinch', about: 'rocks back when hit' });
  return out;
}
