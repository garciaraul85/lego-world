import type { BodyBrick, BodyPlan } from '../../core/character/body';
import { type Made, Maker, makeFamily } from '../../core/character/families';

/**
 * Step 11, 4a: the adventure starter pack's creature bodies (all original). Some start from a family's skeleton and
 * are reshaped (one big glowing eye, a shell, embers, bat ears); the turret, the squid, the ghost and the lantern bug
 * are built bone by bone. Colours are slots (main, accent, belly, eye, dark): each character sets its own.
 */
const P = 0.4;
const BRICK = 1.2;

type Plan = Omit<BodyPlan, 'id'>;
const plan = (name: string, family: string, made: Made): Plan => ({ name, family, ...made });

/** a family skeleton with some bricks taken off and others added */
function reshape(
  base: Made,
  drop: (b: BodyBrick) => boolean,
  add: BodyBrick[],
  patch: (b: BodyBrick) => BodyBrick = (b) => b,
): Made {
  return { ...base, bricks: [...base.bricks.filter((b) => !drop(b)).map(patch), ...add] };
}

// ---------- Gloomweaver: the one-eyed spider boss ----------
function gloomweaver(): Made {
  const base = makeFamily('spider', { legs: 1.6, build: 1.6, head: 1.3 })!;
  return reshape(base, (b) => b.color === 'eye', [
    // one great eye, glowing, with a dark pupil
    { bone: 'head', w: 2, d: 1, kind: 'plate', x: -1, y: 1, z: 0.6, color: 'eye', glow: true },
    { bone: 'head', w: 2, d: 1, kind: 'plate', x: -1, y: 2, z: 0.6, color: 'eye', glow: true },
    { bone: 'head', w: 1, d: 1, kind: 'plate', x: -0.5, y: 1.5, z: 1.1, color: 'dark' },
    // fangs
    { bone: 'head', w: 1, d: 1, kind: 'brick', x: -1, y: -3, z: 0.8, color: 'accent', shape: 'cone', rot: 0 },
    { bone: 'head', w: 1, d: 1, kind: 'brick', x: 0, y: -3, z: 0.8, color: 'accent', shape: 'cone', rot: 0 },
    // a crown of spikes on the abdomen and glowing marks
    { bone: 'body', w: 2, d: 2, kind: 'brick', x: -1, y: 3, z: -4.5, color: 'accent', shape: 'cone' },
    { bone: 'body', w: 1, d: 1, kind: 'tile', x: -2, y: 3, z: -3.5, color: 'eye', glow: true },
    { bone: 'body', w: 1, d: 1, kind: 'tile', x: 1, y: 3, z: -3.5, color: 'eye', glow: true },
  ]);
}

// ---------- Threadback: a hanging spider with an armoured front ----------
function threadback(): Made {
  const base = makeFamily('spider', { legs: 1, build: 1, head: 0.9 })!;
  return reshape(
    base,
    () => false,
    [
      // the shell over its head and back (hits from the front glance off it)
      { bone: 'head', w: 2, d: 2, kind: 'brick', x: -1, y: 4, z: -0.6, color: 'accent', shape: 'curve', rot: 2 },
      { bone: 'body', w: 3, d: 3, kind: 'brick', x: -1.5, y: 3, z: -2.2, color: 'accent', shape: 'dome' },
      // a pale mark on its soft back
      { bone: 'body', w: 1, d: 1, kind: 'tile', x: -0.5, y: 3, z: -4.4, color: 'belly' },
    ],
    (b) => (b.color === 'eye' ? { ...b, glow: true } : b),
  );
}

// ---------- Flitterwing: a bat (plain, fire or ice by its colours) ----------
function flitterwing(): Made {
  const base = makeFamily('bird', { build: 0.7, legs: 0.6, wings: 1.4, head: 0.9 })!;
  return reshape(
    base,
    // no beak
    (b) => b.bone === 'head' && b.color === 'accent',
    [
      { bone: 'head', w: 1, d: 1, kind: 'brick', x: -1, y: 4, z: -0.5, color: 'main', shape: 'cone' },
      { bone: 'head', w: 1, d: 1, kind: 'brick', x: 0, y: 4, z: -0.5, color: 'main', shape: 'cone' },
      // little fangs
      { bone: 'head', w: 1, d: 1, kind: 'tile', x: -0.5, y: -1, z: 0.6, color: 'belly' },
    ],
    (b) => (b.color === 'eye' ? { ...b, glow: true } : b),
  );
}

// ---------- Cinderjaw: a fire lizard ----------
function cinderjaw(): Made {
  const base = makeFamily('dragon', { wings: 0, build: 1.5, legs: 0.8, neck: 0.6, tail: 1.6, head: 1.2 })!;
  return reshape(
    base,
    (b) => b.bone.includes('wing'),
    [
      // embers glowing along its back
      { bone: 'body', w: 1, d: 1, kind: 'brick', x: -0.5, y: 3, z: 1, color: 'accent', glow: true, shape: 'cone' },
      { bone: 'body', w: 1, d: 1, kind: 'brick', x: -0.5, y: 3, z: -0.5, color: 'accent', glow: true, shape: 'cone' },
      { bone: 'body', w: 1, d: 1, kind: 'brick', x: -0.5, y: 3, z: -2, color: 'accent', glow: true, shape: 'cone' },
    ],
    (b) => (b.color === 'eye' ? { ...b, glow: true } : b),
  );
}

// ---------- Watcher Eye: a stone sentinel that turns to watch ----------
function watcherEye(): Made {
  const m = new Maker();
  const base = m.bone('base', undefined, [0, 0, 0], 'root', 0);
  m.block(base, 3, 3, 3, 0, 0, 0, 'main');
  m.block(base, 2, 2, 3, 0, BRICK, 0, 'belly');
  const eye = m.bone('eye', base, [0, 2 * BRICK, 0], 'turret', 40);
  m.block(eye, 3, 3, 6, 0, 0, 0, 'main');
  m.bricks.push(
    // the great eye: it glows red and sweeps
    { bone: eye, w: 1, d: 1, kind: 'plate', x: -0.5, y: 2, z: 1.1, color: 'eye', glow: true },
    { bone: eye, w: 1, d: 1, kind: 'plate', x: -0.5, y: 3, z: 1.1, color: 'eye', glow: true },
    // a hood over the eye and a cap on top
    { bone: eye, w: 3, d: 1, kind: 'plate', x: -1.5, y: 4, z: 1.2, color: 'accent' },
    { bone: eye, w: 2, d: 2, kind: 'brick', x: -1, y: 6, z: -1, color: 'accent', shape: 'dome' },
    // runes on the sides
    { bone: eye, w: 1, d: 1, kind: 'tile', x: -1.9, y: 2, z: -0.5, color: 'eye', glow: true },
    { bone: eye, w: 1, d: 1, kind: 'tile', x: 0.9, y: 2, z: -0.5, color: 'eye', glow: true },
  );
  return { move: 'walk', bones: m.bones, bricks: m.bricks, stride: 1, hover: 0 };
}

// ---------- Pebblespout: a squid that pops up and spits rocks ----------
function pebblespout(): Made {
  const m = new Maker();
  const body = m.bone('body', undefined, [0, 0.8, 0], 'root', 6);
  m.bricks.push(
    { bone: body, w: 3, d: 3, kind: 'brick', x: -1.5, y: 0, z: -1.5, color: 'main', shape: 'round' },
    { bone: body, w: 3, d: 3, kind: 'brick', x: -1.5, y: 3, z: -1.5, color: 'main', shape: 'round' },
    { bone: body, w: 3, d: 3, kind: 'brick', x: -1.5, y: 6, z: -1.5, color: 'main', shape: 'dome' },
    // round eyes bulging at the front
    { bone: body, w: 1, d: 1, kind: 'plate', x: -1.4, y: 4, z: 0.7, color: 'belly', shape: 'round' },
    { bone: body, w: 1, d: 1, kind: 'plate', x: 0.4, y: 4, z: 0.7, color: 'belly', shape: 'round' },
    { bone: body, w: 1, d: 1, kind: 'plate', x: -1.4, y: 5, z: 0.9, color: 'eye', shape: 'round' },
    { bone: body, w: 1, d: 1, kind: 'plate', x: 0.4, y: 5, z: 0.9, color: 'eye', shape: 'round' },
    // spots
    { bone: body, w: 1, d: 1, kind: 'tile', x: -0.5, y: 9, z: -0.5, color: 'accent' },
  );
  // its spout: a short tube, open at the end
  const snout = m.bone('snout', body, [0, 0.6, 1.2], 'jaw', 12);
  m.bricks.push(
    { bone: snout, w: 1, d: 1, kind: 'plate', x: -0.5, y: 0, z: 0, color: 'accent', shape: 'round' },
    { bone: snout, w: 1, d: 1, kind: 'plate', x: -0.5, y: 0, z: 0.6, color: 'accent', shape: 'round' },
    { bone: snout, w: 1, d: 1, kind: 'tile', x: -0.5, y: 1, z: 0.9, color: 'dark', shape: 'round' },
  );
  // four short legs under it
  for (const [i, sx, sz] of [
    [1, -1, 1],
    [2, 1, 1],
    [3, -1, -1],
    [4, 1, -1],
  ] as const) {
    const leg = m.bone(`leg ${i}`, body, [sx * 1, 0, sz * 1], 'leg', 22, {
      phase: i % 2 ? 0 : 0.5,
      side: sx as -1 | 1,
    });
    m.block(leg, 1, 1, 2, sx * 0.4, -0.8, sz * 0.4, 'belly');
  }
  return { move: 'hop', bones: m.bones, bricks: m.bricks, stride: 2, hover: 0 };
}

// ---------- Lanternwisp: a see-through ghost with a lantern ----------
function lanternwisp(): Made {
  const m = new Maker();
  const ghost = 0.45;
  const robe = m.bone('robe', undefined, [0, 0, 0], 'root', 6);
  for (const [x, z] of [
    [-1.5, -1.5],
    [0.5, -1.5],
    [-1.5, 0.5],
    [0.5, 0.5],
  ] as const)
    m.bricks.push({ bone: robe, w: 1, d: 1, kind: 'plate', x, y: -1, z, color: 'main', alpha: 0.3 });
  m.bricks.push(
    { bone: robe, w: 3, d: 3, kind: 'brick', x: -1.5, y: 0, z: -1.5, color: 'main', alpha: ghost },
    { bone: robe, w: 3, d: 3, kind: 'brick', x: -1.5, y: 3, z: -1.5, color: 'main', alpha: ghost },
    { bone: robe, w: 2, d: 2, kind: 'brick', x: -1, y: 6, z: -1, color: 'belly', alpha: ghost },
  );
  const head = m.bone('head', robe, [0, 3 * BRICK, 0], 'head', 14);
  m.bricks.push(
    { bone: head, w: 3, d: 3, kind: 'brick', x: -1.5, y: 0, z: -1.5, color: 'main', alpha: 0.55, shape: 'round' },
    { bone: head, w: 3, d: 3, kind: 'brick', x: -1.5, y: 3, z: -1.5, color: 'main', alpha: 0.55, shape: 'dome' },
    // two small glowing eyes, apart, and a hollow mouth
    { bone: head, w: 1, d: 1, kind: 'plate', x: -1.3, y: 1.5, z: 0.9, color: 'eye', glow: true, shape: 'round' },
    { bone: head, w: 1, d: 1, kind: 'plate', x: 0.3, y: 1.5, z: 0.9, color: 'eye', glow: true, shape: 'round' },
    { bone: head, w: 1, d: 1, kind: 'plate', x: -0.5, y: 0, z: 0.9, color: 'dark', alpha: 0.7, shape: 'round' },
  );
  // the arm that swings its lantern
  const arm = m.bone('lantern arm', robe, [1.6, 2.6 * BRICK - 0.6, 0.4], 'arm', 30, { side: 1 });
  m.bricks.push(
    { bone: arm, w: 1, d: 1, kind: 'brick', x: 0, y: -3, z: -0.5, color: 'main', alpha: ghost },
    { bone: arm, w: 1, d: 1, kind: 'plate', x: 0, y: -4, z: -0.5, color: 'dark' },
    { bone: arm, w: 1, d: 1, kind: 'brick', x: 0, y: -7, z: -0.5, color: 'accent', glow: true, shape: 'round' },
    { bone: arm, w: 1, d: 1, kind: 'plate', x: 0, y: -8, z: -0.5, color: 'dark' },
  );
  return { move: 'fly', bones: m.bones, bricks: m.bricks, stride: 2.5, hover: 1.4 };
}

// ---------- Glim: the lantern-bug companion ----------
function glim(): Made {
  const m = new Maker();
  const body = m.bone('body', undefined, [0, 0, 0], 'root', 4);
  m.bricks.push(
    { bone: body, w: 1, d: 2, kind: 'brick', x: -0.5, y: 0, z: -0.5, color: 'main', shape: 'curve' },
    // its glowing tail lamp
    { bone: body, w: 1, d: 1, kind: 'brick', x: -0.5, y: 0, z: -1.5, color: 'accent', glow: true, shape: 'round' },
    { bone: body, w: 1, d: 1, kind: 'tile', x: -0.9, y: 2, z: 0.9, color: 'eye' },
    { bone: body, w: 1, d: 1, kind: 'tile', x: -0.1, y: 2, z: 0.9, color: 'eye' },
  );
  for (const s of [-1, 1] as const) {
    const w = m.bone(s < 0 ? 'left wing' : 'right wing', body, [s * 0.5, 3 * P, 0], 'wing', 45, { side: s });
    m.bricks.push({ bone: w, w: 2, d: 1, kind: 'plate', x: s < 0 ? -2 : 0, y: 0, z: -0.5, color: 'belly', alpha: 0.4 });
    const a = m.bone(s < 0 ? 'left antenna' : 'right antenna', body, [s * 0.3, 3 * P, 1], 'other', 0);
    m.bricks.push({ bone: a, w: 1, d: 1, kind: 'plate', x: -0.5, y: 0, z: 0, color: 'dark' });
  }
  return { move: 'fly', bones: m.bones, bricks: m.bricks, stride: 2, hover: 2.6 };
}

export const STARTER_PLANS: Record<string, Plan> = {
  gloomweaver: plan('Gloomweaver', 'spider', gloomweaver()),
  threadback: plan('Threadback', 'spider', threadback()),
  flitterwing: plan('Flitterwing', 'bird', flitterwing()),
  cinderjaw: plan('Cinderjaw', 'dragon', cinderjaw()),
  'watcher-eye': plan('Watcher Eye', 'robot', watcherEye()),
  pebblespout: plan('Pebblespout', 'slime', pebblespout()),
  lanternwisp: plan('Lanternwisp', 'custom', lanternwisp()),
  glim: plan('Glim', 'insect', glim()),
};
