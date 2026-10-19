import {
  type Body,
  type BodyBrick,
  type BodyFamily,
  type BodyParams,
  type BodyPlan,
  type Bone,
  type BoneRole,
  type MoveKind,
  PARAM_INFO,
  type ParamKey,
} from './body';

/**
 * P22 part 3: the built-in body families. Each is made from its sliders (leg length, neck, tail…) as a
 * skeleton with bricks; the Skeleton editor can copy one into a body plan of the project's own.
 */
export type FamilyInfo = {
  label: string;
  about: string;
  icon: string;
  move: MoveKind | null;
  /** the sliders it uses */
  params: ParamKey[];
  colors: { main: string; accent: string; belly: string; eye: string };
};

export const FAMILY_INFO: Record<BodyFamily, FamilyInfo> = {
  minifig: {
    label: 'Minifig',
    about: 'the classic figure: its look, outfits and clips are in the other tabs',
    icon: '🧍',
    move: null,
    params: [],
    colors: { main: '#f2cd37', accent: '#c91a09', belly: '#f2cd37', eye: '#1b1b1b' },
  },
  fourLegs: {
    label: 'Four legs',
    about: 'dogs, cats, horses, wolves: walks on four legs in a diagonal step',
    icon: '🐕',
    move: 'walk',
    params: ['size', 'legs', 'neck', 'tail', 'head', 'build'],
    colors: { main: '#a0724b', accent: '#5c3a21', belly: '#e4cd9e', eye: '#1b1b1b' },
  },
  bird: {
    label: 'Bird',
    about: 'hovers and flaps; short legs, a beak and a tail fan',
    icon: '🐦',
    move: 'fly',
    params: ['size', 'legs', 'wings', 'head', 'build'],
    colors: { main: '#0055bf', accent: '#fe8a18', belly: '#f4f4f4', eye: '#1b1b1b' },
  },
  fish: {
    label: 'Fish',
    about: 'floats and swims: its body snakes from head to tail fin',
    icon: '🐟',
    move: 'swim',
    params: ['size', 'tail', 'head', 'build'],
    colors: { main: '#fe8a18', accent: '#f4f4f4', belly: '#f2cd37', eye: '#1b1b1b' },
  },
  serpent: {
    label: 'Serpent',
    about: 'snakes and worms: a long chain of spine bones that slithers',
    icon: '🐍',
    move: 'slither',
    params: ['size', 'tail', 'head', 'build'],
    colors: { main: '#237841', accent: '#f2cd37', belly: '#bbe90b', eye: '#1b1b1b' },
  },
  spider: {
    label: 'Spider',
    about: 'eight legs with knees, stepping in two alternating sets',
    icon: '🕷️',
    move: 'walk',
    params: ['size', 'legs', 'head', 'build'],
    colors: { main: '#1b1b1b', accent: '#c91a09', belly: '#6c6e68', eye: '#c91a09' },
  },
  insect: {
    label: 'Insect',
    about: 'six legs in a tripod step; wings if you give it some',
    icon: '🐞',
    move: 'walk',
    params: ['size', 'legs', 'wings', 'head', 'build'],
    colors: { main: '#c91a09', accent: '#1b1b1b', belly: '#1b1b1b', eye: '#f4f4f4' },
  },
  slime: {
    label: 'Slime',
    about: 'a blob with eyes that bounces along',
    icon: '🟢',
    move: 'hop',
    params: ['size', 'build'],
    colors: { main: '#4b9f4a', accent: '#bbe90b', belly: '#bbe90b', eye: '#1b1b1b' },
  },
  dragon: {
    label: 'Dragon',
    about: 'four legs, a long neck and tail, horns and wings; it flies',
    icon: '🐉',
    move: 'fly',
    params: ['size', 'legs', 'neck', 'tail', 'wings', 'head', 'build'],
    colors: { main: '#c91a09', accent: '#f2cd37', belly: '#fe8a18', eye: '#f2cd37' },
  },
  robot: {
    label: 'Robot walker',
    about: 'six legs with knees and a turret that turns',
    icon: '🤖',
    move: 'walk',
    params: ['size', 'legs', 'head', 'build'],
    colors: { main: '#a0a5a9', accent: '#0055bf', belly: '#6c6e68', eye: '#c91a09' },
  },
};

const P = 0.4;
const BRICK = 1.2;

class Maker {
  bones: Bone[] = [];
  bricks: BodyBrick[] = [];
  bone(
    name: string,
    parent: string | undefined,
    at: [number, number, number],
    role: BoneRole,
    swing: number,
    more: Partial<Bone> = {},
  ) {
    const r = (v: number) => Math.round(v * 100) / 100;
    this.bones.push({ name, ...(parent ? { parent } : {}), at: [r(at[0]), r(at[1]), r(at[2])], role, swing, ...more });
    return name;
  }
  /**
   * A block w×d studs, `plates` tall, centred on (cx, cz) with its bottom at y (world units, from the joint);
   * stacked from bricks and plates.
   */
  block(
    bone: string,
    w: number,
    d: number,
    plates: number,
    cx: number,
    y: number,
    cz: number,
    color: BodyBrick['color'],
  ) {
    w = Math.max(1, Math.min(8, Math.round(w)));
    d = Math.max(1, Math.min(8, Math.round(d)));
    let left = Math.max(1, Math.round(plates));
    let at = y / P;
    while (left > 0) {
      const kind = left >= 3 ? 'brick' : 'plate';
      this.bricks.push({
        bone,
        w,
        d,
        kind,
        x: round2(cx - w / 2),
        y: round2(at),
        z: round2(cz - d / 2),
        color,
      });
      const h = kind === 'brick' ? 3 : 1;
      at += h;
      left -= h;
    }
  }
  tile(bone: string, cx: number, y: number, cz: number, color: BodyBrick['color'], w = 1, d = 1) {
    this.bricks.push({
      bone,
      w,
      d,
      kind: 'tile',
      x: round2(cx - w / 2),
      y: round2(y / P),
      z: round2(cz - d / 2),
      color,
    });
  }
}
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Two eyes on a face `faceW` studs wide whose front is at z = front: on the front when it is wide enough to
 * leave a gap between them, otherwise one on each side near the front. Each just shows through the face.
 */
function eyes(m: Maker, bone: string, faceW: number, y: number, front: number) {
  for (const s of [-1, 1]) {
    if (faceW >= 3) m.tile(bone, s * (faceW / 2 - 0.5), y, front - 0.4, 'eye');
    else m.tile(bone, s * (faceW / 2 - 0.4), y, front - 0.6, 'eye');
  }
}

type Made = Pick<BodyPlan, 'move' | 'bones' | 'bricks' | 'stride' | 'hover'>;

function param(p: BodyParams | undefined, k: ParamKey): number {
  const v = p?.[k];
  return typeof v === 'number' ? v : PARAM_INFO[k].def;
}

/** a head with eyes: block, snout (optional), ears or horns */
function head(
  m: Maker,
  bone: string,
  size: number,
  opts: { snout?: boolean; ears?: 'ears' | 'horns' | null; beak?: boolean },
) {
  const w = Math.max(2, Math.round(2 * size));
  const plates = Math.max(3, Math.round(4 * size));
  m.block(bone, w, w, plates, 0, 0, 0, 'main');
  const top = plates * P;
  const front = w / 2;
  // eyes on the front face, near the top
  eyes(m, bone, w, top - 2 * P, front);
  if (opts.snout) {
    m.block(bone, Math.max(1, w - 1), 1, 2, 0, 0, front + 0.5, 'belly');
    m.tile(bone, 0, 2 * P, front + 0.5, 'dark');
  }
  if (opts.beak) m.block(bone, 1, 1, 1, 0, top / 2 - P, front + 0.5, 'accent');
  if (opts.ears === 'ears')
    for (const s of [-1, 1]) m.block(bone, 1, 1, 2, s * (w / 2 - 0.5), top, -0.5 + 0.5, 'accent');
  if (opts.ears === 'horns')
    for (const s of [-1, 1]) m.block(bone, 1, 1, 4, s * (w / 2 - 0.5), top, -w / 2 + 0.5, 'accent');
  return { w, top };
}

function tailChain(m: Maker, parent: string, at: [number, number, number], n: number, width: number, swing = 22) {
  let prev = parent;
  for (let i = 0; i < n; i++) {
    const name = m.bone(`tail ${i + 1}`, prev, i === 0 ? at : [0, 0, -1], 'tail', swing, { phase: (i * 0.12) % 1 });
    m.block(name, i === n - 1 ? 1 : width, 1, 1, 0, 0, -0.5, i === n - 1 ? 'accent' : 'main');
    prev = name;
  }
}

function fourLegs(p: BodyParams | undefined, dragon: boolean): Made {
  const m = new Maker();
  const build = param(p, 'build');
  const legH = BRICK * Math.max(1, Math.round(1.5 * param(p, 'legs') * (dragon ? 1.2 : 1)));
  const w = Math.max(2, Math.round(2 * build * (dragon ? 1.3 : 1)));
  const len = dragon ? 5 : 4;
  const body = m.bone('body', undefined, [0, legH, 0], 'root', 4);
  m.block(body, w, len, 3, 0, 0, 0, 'main');
  m.block(body, Math.max(1, w - 1), len - 1, 1, 0, -P, 0, 'belly');
  const legs: [string, number, number, number][] = [
    ['front left leg', -1, 1, 0],
    ['front right leg', 1, 1, 0.5],
    ['back left leg', -1, -1, 0.5],
    ['back right leg', 1, -1, 0],
  ];
  for (const [name, sx, sz, phase] of legs) {
    m.bone(name, body, [sx * (w / 2 - 0.5), 0, sz * (len / 2 - 0.6)], 'leg', 28, { phase, side: sx as -1 | 1 });
    const plates = Math.round(legH / P);
    m.block(name, 1, 1, plates - 1, 0, -legH + P, 0, 'main');
    m.block(name, 1, 1, 1, 0, -legH, 0.15, 'dark');
  }
  const neckLen = param(p, 'neck') * (dragon ? 1.6 : 1);
  const neckPlates = Math.round(neckLen * 4);
  const neck = m.bone('neck', body, [0, BRICK - P, len / 2 - 0.5], 'neck', 10);
  if (neckPlates > 0) m.block(neck, 1, 1, neckPlates, 0, 0, 0, 'main');
  const hd = m.bone('head', neck, [0, neckPlates * P, 0.6], 'head', 14);
  const h = head(m, hd, param(p, 'head') * (dragon ? 1.2 : 1), { snout: true, ears: dragon ? 'horns' : 'ears' });
  if (dragon) {
    const jaw = m.bone('jaw', hd, [0, 0, h.w / 2], 'jaw', 18);
    m.block(jaw, Math.max(1, h.w - 1), 2, 1, 0, -P, 0.5, 'accent');
  }
  const tailN = Math.round(param(p, 'tail') * (dragon ? 5 : 3));
  if (tailN > 0) tailChain(m, body, [0, BRICK - 2 * P, -len / 2], tailN, dragon ? 2 : 1);
  if (dragon) wings(m, body, w, param(p, 'wings') * 1.4, BRICK, 0.5);
  return { move: dragon ? 'fly' : 'walk', bones: m.bones, bricks: m.bricks, stride: legH * 1.6, hover: dragon ? 2 : 0 };
}

function wings(m: Maker, body: string, bodyW: number, span: number, y: number, z: number) {
  const sw = Math.round(3 * span);
  if (sw < 1) return;
  for (const s of [-1, 1] as const) {
    const n = m.bone(s < 0 ? 'left wing' : 'right wing', body, [s * (bodyW / 2), y, z], 'wing', 38, { side: s });
    m.block(n, sw, 2, 1, s * (sw / 2), 0, 0, 'main');
    if (sw > 1) m.block(n, sw - 1, 1, 1, s * (sw / 2 + 0.5), -P, -0.5, 'accent');
  }
}

function bird(p: BodyParams | undefined): Made {
  const m = new Maker();
  const build = param(p, 'build');
  const legH = P * Math.max(2, Math.round(3 * param(p, 'legs')));
  const w = Math.max(2, Math.round(2 * build));
  const body = m.bone('body', undefined, [0, legH, 0], 'root', 4);
  m.block(body, w, 3, 3, 0, 0, 0, 'main');
  m.block(body, Math.max(1, w - 1), 2, 1, 0, -P, 0.3, 'belly');
  for (const s of [-1, 1] as const) {
    const n = m.bone(s < 0 ? 'left leg' : 'right leg', body, [s * 0.5, 0, 0], 'leg', 20, {
      phase: s < 0 ? 0 : 0.5,
      side: s,
    });
    m.block(n, 1, 1, Math.round(legH / P), 0, -legH, 0.2, 'accent');
  }
  const hd = m.bone('head', body, [0, BRICK, 1], 'head', 16);
  head(m, hd, param(p, 'head'), { beak: true });
  wings(m, body, w, param(p, 'wings'), BRICK - P, 0);
  const tail = m.bone('tail 1', body, [0, P * 2, -1.5], 'tail', 14);
  m.block(tail, 2, 2, 1, 0, 0, -1, 'accent');
  return { move: 'fly', bones: m.bones, bricks: m.bricks, stride: 2, hover: 2.2 };
}

function fish(p: BodyParams | undefined): Made {
  const m = new Maker();
  const build = param(p, 'build');
  const w = Math.max(1, Math.round(2 * build));
  const body = m.bone('body', undefined, [0, 0.4, 0], 'root', 4);
  const hs = param(p, 'head');
  const hw = Math.max(2, Math.round(2 * hs));
  m.block(body, hw, 2, 4, 0, 0, 0.5, 'main');
  m.block(body, hw - 1, 1, 1, 0, -P, 0.5, 'belly');
  eyes(m, body, hw, 2 * P, 1.5);
  const segs = Math.max(2, Math.round(2 + param(p, 'tail') * 2));
  let prev = body;
  for (let i = 0; i < segs; i++) {
    const n = m.bone(`spine ${i + 1}`, prev, i === 0 ? [0, 0, -0.6] : [0, 0, -1], 'spine', 18, {
      phase: (i * 0.15) % 1,
    });
    const sw = Math.max(1, Math.round(w * (1 - i / (segs + 1))));
    m.block(
      n,
      sw,
      1,
      i < segs - 1 ? 4 - Math.floor(i / 2) : 2,
      0,
      i < segs - 1 ? 0 : P,
      -0.5,
      i % 2 ? 'accent' : 'main',
    );
    prev = n;
  }
  const fin = m.bone('tail fin', prev, [0, 0, -1], 'tail', 30);
  m.block(fin, 1, 1, 6, 0, -P, -0.5, 'accent');
  for (const s of [-1, 1] as const) {
    const n = m.bone(s < 0 ? 'left fin' : 'right fin', body, [s * (hw / 2), 0.4, 0], 'fin', 30, { side: s });
    m.block(n, 1, 1, 1, s * 0.5, 0, -0.5, 'accent');
  }
  const top = m.bone('top fin', body, [0, 4 * P, -0.5], 'other', 0);
  m.block(top, 1, 2, 2, 0, 0, -0.5, 'accent');
  return { move: 'swim', bones: m.bones, bricks: m.bricks, stride: 3, hover: 1 };
}

function serpent(p: BodyParams | undefined): Made {
  const m = new Maker();
  const w = Math.max(1, Math.round(1.4 * param(p, 'build')));
  const body = m.bone('body', undefined, [0, 0, 0], 'root', 2);
  const hd = m.bone('head', body, [0, 0, 0.5], 'head', 12);
  const hw = Math.max(2, Math.round(2 * param(p, 'head')));
  m.block(hd, hw, 2, 3, 0, 0, 0.5, 'main');
  eyes(m, hd, hw, 1.2 - 2 * P, 1.5);
  const jaw = m.bone('jaw', hd, [0, 0, 1], 'jaw', 20);
  m.block(jaw, hw, 1, 1, 0, 0, 0.5, 'accent');
  const n = 6 + Math.round(param(p, 'tail') * 4);
  let prev = body;
  for (let i = 0; i < n; i++) {
    const s = m.bone(`spine ${i + 1}`, prev, [0, 0, -1], 'spine', 24, { phase: (i * 0.11) % 1 });
    m.block(s, i > n - 3 ? 1 : w, 1, i > n - 3 ? 1 : 2, 0, 0, -0.5, i % 3 === 2 ? 'accent' : 'main');
    prev = s;
  }
  return { move: 'slither', bones: m.bones, bricks: m.bricks, stride: 3, hover: 0 };
}

function manyLegs(p: BodyParams | undefined, kind: 'spider' | 'insect' | 'robot'): Made {
  const m = new Maker();
  const pairs = kind === 'spider' ? 4 : 3;
  const legH = BRICK * Math.max(1, Math.round(param(p, 'legs') * (kind === 'robot' ? 2 : 1.2)));
  const build = param(p, 'build');
  const w = Math.max(2, Math.round((kind === 'robot' ? 3 : 2) * build));
  const len = pairs + (kind === 'robot' ? 1 : 0);
  const body = m.bone('body', undefined, [0, legH, 0], 'root', 3);
  m.block(body, w, len, kind === 'robot' ? 4 : 3, 0, 0, 0, kind === 'robot' ? 'main' : 'main');
  if (kind !== 'robot') m.block(body, w + 1, 3, 3, 0, 0, -len / 2 - 1.5, 'belly');
  for (let i = 0; i < pairs; i++)
    for (const s of [-1, 1] as const) {
      // two sets that step in turn: left 0, right 1, left 2 … with the other side opposite
      const phase = (i + (s > 0 ? 1 : 0)) % 2 ? 0.5 : 0;
      // legs a little apart, so each one shows
      const z = ((pairs - 1) / 2 - i) * 1.6;
      const up = m.bone(`${s < 0 ? 'left' : 'right'} leg ${i + 1}`, body, [s * (w / 2), P, z], 'leg', 22, {
        phase,
        side: s,
      });
      m.block(up, 2, 1, 1, s * 1, 0, 0, kind === 'robot' ? 'accent' : 'main');
      const low = m.bone(`${s < 0 ? 'left' : 'right'} foot ${i + 1}`, up, [s * 2, 0, 0], 'leg', 26, { phase, side: s });
      m.block(low, 1, 1, Math.round(legH / P), 0, -legH, 0, kind === 'robot' ? 'belly' : 'main');
    }
  const hd =
    kind === 'robot'
      ? m.bone('turret', body, [0, 4 * P, 0.5], 'turret', 40)
      : m.bone('head', body, [0, P, len / 2], 'head', 10);
  if (kind === 'robot') {
    m.block(hd, 2, 2, 3, 0, 0, 0, 'accent');
    m.block(hd, 1, 2, 1, 0, P, 1.5, 'dark');
    m.tile(hd, 0, 2 * P, 0.6, 'eye');
  } else head(m, hd, param(p, 'head') * 0.8, {});
  if (kind === 'insect') {
    for (const s of [-1, 1] as const) {
      const a = m.bone(s < 0 ? 'left antenna' : 'right antenna', hd, [s * 0.5, 4 * P, 0.5], 'other', 0);
      m.block(a, 1, 1, 2, 0, 0, 0.5, 'accent');
    }
    if (param(p, 'wings') > 0) wings(m, body, w, param(p, 'wings') * 0.8, BRICK, -0.5);
  }
  return { move: 'walk', bones: m.bones, bricks: m.bricks, stride: legH * 1.4, hover: 0 };
}

function slime(p: BodyParams | undefined): Made {
  const m = new Maker();
  const b = param(p, 'build');
  const w = Math.max(2, Math.round(3 * b));
  const body = m.bone('blob', undefined, [0, 0, 0], 'root', 6);
  m.block(body, w, w, 3, 0, 0, 0, 'main');
  m.block(body, w, w, 3, 0, BRICK, 0, 'main');
  m.block(body, Math.max(1, w - 1), Math.max(1, w - 1), 1, 0, 2 * BRICK, 0, 'accent');
  eyes(m, body, w, BRICK + P, w / 2);
  return { move: 'hop', bones: m.bones, bricks: m.bricks, stride: 2.5, hover: 0 };
}

/** A family's skeleton and bricks for these sliders (minifig: none — v68's model draws it). */
export function makeFamily(family: BodyFamily, p?: BodyParams): Made | null {
  switch (family) {
    case 'minifig':
      return null;
    case 'fourLegs':
      return fourLegs(p, false);
    case 'dragon':
      return fourLegs(p, true);
    case 'bird':
      return bird(p);
    case 'fish':
      return fish(p);
    case 'serpent':
      return serpent(p);
    case 'spider':
    case 'insect':
    case 'robot':
      return manyLegs(p, family);
    case 'slime':
      return slime(p);
  }
}

/** colours of the slots (dark is always near-black) */
export function slotColors(body: Pick<Body, 'family' | 'colors'>): Record<string, string> {
  const base = (FAMILY_INFO[body.family as BodyFamily] ?? FAMILY_INFO.fourLegs).colors;
  return { ...base, ...(body.colors ?? {}), dark: '#2b2b2b' };
}

/** P22 part 4: presets for each family — sliders and colours that make a known kind of creature (all original). */
export type BodyPreset = {
  name: string;
  params?: BodyParams;
  colors: { main: string; accent: string; belly: string; eye?: string };
};
const c = (main: string, accent: string, belly: string, eye?: string) => ({
  main,
  accent,
  belly,
  ...(eye ? { eye } : {}),
});
export const FAMILY_PRESETS: Record<Exclude<BodyFamily, 'minifig'>, BodyPreset[]> = {
  fourLegs: [
    { name: 'Dog', colors: c('#a0724b', '#5c3a21', '#e4cd9e') },
    {
      name: 'Cat',
      params: { legs: 0.8, tail: 1.6, head: 0.9, build: 0.8 },
      colors: c('#fe8a18', '#c55a00', '#f4f4f4'),
    },
    {
      name: 'Horse',
      params: { size: 1.6, legs: 1.8, neck: 1.6, tail: 1, build: 1.2 },
      colors: c('#6b3f1f', '#1b1b1b', '#6b3f1f'),
    },
    {
      name: 'Wolf',
      params: { size: 1.2, legs: 1.2, tail: 1.4 },
      colors: c('#6c6e68', '#3c3e3a', '#a0a5a9', '#f2cd37'),
    },
    { name: 'Fox', params: { legs: 0.9, tail: 2, head: 0.9, build: 0.8 }, colors: c('#d67923', '#f4f4f4', '#f4f4f4') },
    {
      name: 'Cow',
      params: { size: 1.5, legs: 1.1, neck: 0.4, tail: 0.8, build: 1.5 },
      colors: c('#f4f4f4', '#1b1b1b', '#fc97ac'),
    },
    { name: 'Pig', params: { legs: 0.6, neck: 0, tail: 0.3, build: 1.4 }, colors: c('#fc97ac', '#e4637e', '#fc97ac') },
    {
      name: 'Bear',
      params: { size: 1.6, legs: 0.9, neck: 0.3, tail: 0, head: 1.3, build: 1.6 },
      colors: c('#583927', '#352100', '#a0724b'),
    },
  ],
  bird: [
    { name: 'Bluebird', colors: c('#0055bf', '#fe8a18', '#f4f4f4') },
    { name: 'Parrot', params: { wings: 1.3, head: 1.1 }, colors: c('#4b9f4a', '#c91a09', '#f2cd37') },
    {
      name: 'Owl',
      params: { size: 1.2, legs: 0.6, head: 1.4, build: 1.3 },
      colors: c('#a0724b', '#f2cd37', '#e4cd9e', '#f2cd37'),
    },
    { name: 'Crow', params: { wings: 1.4 }, colors: c('#1b1b1b', '#3c3e3a', '#3c3e3a', '#f4f4f4') },
    { name: 'Duck', params: { legs: 0.6, wings: 0.8, build: 1.3 }, colors: c('#f4f4f4', '#fe8a18', '#f4f4f4') },
    { name: 'Flamingo', params: { legs: 2, wings: 1.2, build: 0.8 }, colors: c('#fc97ac', '#1b1b1b', '#fc97ac') },
    { name: 'Eagle', params: { size: 1.6, wings: 2, head: 1.1 }, colors: c('#583927', '#f2cd37', '#f4f4f4') },
    { name: 'Canary', params: { size: 0.7 }, colors: c('#f2cd37', '#fe8a18', '#f2cd37') },
  ],
  fish: [
    { name: 'Goldfish', colors: c('#fe8a18', '#f4f4f4', '#f2cd37') },
    { name: 'Shark', params: { size: 2.2, tail: 1.6, build: 1.2 }, colors: c('#6c6e68', '#3c3e3a', '#f4f4f4') },
    { name: 'Clownfish', params: { size: 0.8 }, colors: c('#fe8a18', '#f4f4f4', '#fe8a18') },
    { name: 'Tuna', params: { size: 1.5, tail: 1.4 }, colors: c('#0a3463', '#a0a5a9', '#f4f4f4') },
    { name: 'Piranha', params: { head: 1.4, tail: 0.6 }, colors: c('#6c6e68', '#c91a09', '#c91a09') },
    { name: 'Angelfish', params: { tail: 0.8, build: 0.7 }, colors: c('#f2cd37', '#1b1b1b', '#f4f4f4') },
    { name: 'Pufferfish', params: { tail: 0, head: 1.6, build: 1.6 }, colors: c('#e4cd9e', '#583927', '#f4f4f4') },
    { name: 'Swordfish', params: { size: 1.8, tail: 2, build: 0.8 }, colors: c('#0055bf', '#a0a5a9', '#f4f4f4') },
  ],
  serpent: [
    { name: 'Grass snake', colors: c('#237841', '#f2cd37', '#bbe90b') },
    { name: 'Cobra', params: { size: 1.3, head: 1.4 }, colors: c('#352100', '#e4cd9e', '#e4cd9e') },
    { name: 'Python', params: { size: 1.6, tail: 2, build: 1.5 }, colors: c('#a0724b', '#583927', '#e4cd9e') },
    {
      name: 'Earthworm',
      params: { size: 0.6, tail: 0.5, head: 0.6, build: 0.6 },
      colors: c('#fc97ac', '#e4637e', '#fc97ac'),
    },
    { name: 'Sea serpent', params: { size: 2.4, tail: 2, build: 1.6 }, colors: c('#0055bf', '#4fd1c5', '#a0a5a9') },
    { name: 'Coral snake', colors: c('#c91a09', '#1b1b1b', '#f2cd37') },
    { name: 'Viper', params: { head: 1.3 }, colors: c('#6c6e68', '#1b1b1b', '#a0a5a9', '#f2cd37') },
    { name: 'Eel', params: { tail: 1.5, head: 0.8, build: 0.9 }, colors: c('#3c3e3a', '#4b9f4a', '#a0a5a9') },
  ],
  spider: [
    { name: 'Black widow', colors: c('#1b1b1b', '#c91a09', '#1b1b1b') },
    { name: 'Tarantula', params: { size: 1.4, build: 1.3 }, colors: c('#583927', '#fe8a18', '#352100') },
    {
      name: 'Jumping spider',
      params: { size: 0.8, legs: 0.7, head: 1.3 },
      colors: c('#6c6e68', '#f4f4f4', '#3c3e3a', '#4fd1c5'),
    },
    { name: 'Cave spider', params: { legs: 1.6 }, colors: c('#a0a5a9', '#6c6e68', '#a0a5a9', '#f4f4f4') },
    { name: 'Ice spider', colors: c('#9fc3e9', '#f4f4f4', '#4fd1c5') },
    { name: 'Lava spider', colors: c('#c91a09', '#fe8a18', '#1b1b1b', '#f2cd37') },
    { name: 'Garden spider', params: { size: 0.8 }, colors: c('#f2cd37', '#1b1b1b', '#a0724b') },
    { name: 'Giant spider', params: { size: 2.4, legs: 1.4, build: 1.4 }, colors: c('#3c3e3a', '#4b9f4a', '#1b1b1b') },
  ],
  insect: [
    { name: 'Ladybird', colors: c('#c91a09', '#1b1b1b', '#1b1b1b') },
    { name: 'Beetle', params: { wings: 0, build: 1.3 }, colors: c('#237841', '#1b1b1b', '#1b1b1b') },
    { name: 'Ant', params: { size: 0.7, wings: 0, build: 0.7 }, colors: c('#1b1b1b', '#3c3e3a', '#3c3e3a', '#c91a09') },
    { name: 'Bee', params: { wings: 1.3 }, colors: c('#f2cd37', '#1b1b1b', '#1b1b1b') },
    { name: 'Firefly', params: { wings: 1 }, colors: c('#1b1b1b', '#bbe90b', '#bbe90b', '#bbe90b') },
    { name: 'Stag beetle', params: { size: 1.3, wings: 0, head: 1.4 }, colors: c('#583927', '#352100', '#352100') },
    { name: 'Grasshopper', params: { legs: 1.6, wings: 0.8, build: 0.7 }, colors: c('#4b9f4a', '#bbe90b', '#237841') },
    { name: 'Moth', params: { wings: 2 }, colors: c('#e4cd9e', '#a0724b', '#a0724b') },
  ],
  slime: [
    { name: 'Green slime', colors: c('#4b9f4a', '#bbe90b', '#bbe90b') },
    { name: 'Lava slime', colors: c('#c91a09', '#fe8a18', '#fe8a18', '#f2cd37') },
    { name: 'Ice slime', colors: c('#9fc3e9', '#f4f4f4', '#f4f4f4', '#0055bf') },
    { name: 'Poison slime', colors: c('#81007b', '#bbe90b', '#bbe90b', '#bbe90b') },
    { name: 'Gold slime', params: { size: 0.8 }, colors: c('#f2cd37', '#f4f4f4', '#f4f4f4') },
    { name: 'Shadow slime', colors: c('#1b1b1b', '#3c3e3a', '#3c3e3a', '#c91a09') },
    { name: 'Jelly slime', params: { build: 0.8 }, colors: c('#fc97ac', '#f4f4f4', '#f4f4f4') },
    { name: 'King slime', params: { size: 2.4, build: 1.6 }, colors: c('#0055bf', '#f2cd37', '#f2cd37') },
  ],
  dragon: [
    { name: 'Red dragon', colors: c('#c91a09', '#f2cd37', '#fe8a18', '#f2cd37') },
    { name: 'Ice dragon', colors: c('#9fc3e9', '#f4f4f4', '#f4f4f4', '#0055bf') },
    { name: 'Forest dragon', colors: c('#237841', '#a0724b', '#bbe90b', '#f2cd37') },
    { name: 'Gold dragon', params: { size: 1.4 }, colors: c('#f2cd37', '#a0724b', '#f4f4f4', '#c91a09') },
    { name: 'Shadow dragon', params: { wings: 1.6 }, colors: c('#1b1b1b', '#81007b', '#3c3e3a', '#c91a09') },
    { name: 'Sea dragon', params: { legs: 0.6, tail: 2, wings: 0.6 }, colors: c('#0055bf', '#4fd1c5', '#9fc3e9') },
    { name: 'Baby dragon', params: { size: 0.6, head: 1.5, wings: 0.7 }, colors: c('#4b9f4a', '#f2cd37', '#bbe90b') },
    {
      name: 'Elder dragon',
      params: { size: 2.4, neck: 2, tail: 2, wings: 2 },
      colors: c('#6c6e68', '#f4f4f4', '#a0a5a9', '#f2cd37'),
    },
  ],
  robot: [
    { name: 'Scout walker', colors: c('#a0a5a9', '#0055bf', '#6c6e68') },
    { name: 'Tank walker', params: { size: 1.6, legs: 0.6, build: 1.6 }, colors: c('#4b5320', '#1b1b1b', '#3c3e3a') },
    { name: 'Spider bot', params: { legs: 1.6, build: 0.7 }, colors: c('#3c3e3a', '#c91a09', '#6c6e68') },
    { name: 'Guardian', params: { size: 2, head: 1.4 }, colors: c('#f4f4f4', '#f2cd37', '#a0a5a9', '#4fd1c5') },
    { name: 'Rust bucket', colors: c('#a0724b', '#583927', '#6c6e68') },
    { name: 'Gold walker', colors: c('#f2cd37', '#f4f4f4', '#a0724b') },
    { name: 'Mini walker', params: { size: 0.6 }, colors: c('#fe8a18', '#1b1b1b', '#a0a5a9') },
    {
      name: 'Heavy walker',
      params: { size: 2.4, legs: 1.4, build: 1.6 },
      colors: c('#1b1b1b', '#c91a09', '#3c3e3a', '#c91a09'),
    },
  ],
};
