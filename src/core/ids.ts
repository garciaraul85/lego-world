/** Typed ids: `<prefix>_<10 base36 chars>`. The id is the file name; renaming never changes it. */
export const ID_PREFIX = {
  project: 'prj',
  map: 'map',
  asset: 'ast',
  character: 'chr',
  clip: 'clp',
  logic: 'lg',
  screen: 'scr',
  cinematic: 'cin',
  sound: 'snd',
  music: 'mus',
  instance: 'ins',
  zone: 'zn',
  spawn: 'sp',
  gate: 'gt',
} as const;

export type IdKind = keyof typeof ID_PREFIX;
export type Id<K extends IdKind = IdKind> = `${(typeof ID_PREFIX)[K]}_${string}`;

const BODY = /^[0-9a-z]{10}$/;

export function idPattern(kind: IdKind): RegExp {
  return new RegExp(`^${ID_PREFIX[kind]}_[0-9a-z]{10}$`);
}

export function isId<K extends IdKind>(kind: K, value: unknown): value is Id<K> {
  return typeof value === 'string' && idPattern(kind).test(value);
}

/** Random id. `random` is injectable so tests and generators can be deterministic. */
export function newId<K extends IdKind>(kind: K, random: () => number = Math.random): Id<K> {
  let body = '';
  for (let i = 0; i < 10; i++) body += Math.floor(random() * 36).toString(36);
  return `${ID_PREFIX[kind]}_${body}` as Id<K>;
}

/** Deterministic id derived from a legacy integer id (used by migration so re-imports are stable). */
export function legacyId<K extends IdKind>(kind: K, n: number): Id<K> {
  if (!Number.isInteger(n) || n < 0) throw new Error(`legacy id must be a non-negative integer, got ${n}`);
  const body = n.toString(36).padStart(10, '0');
  if (!BODY.test(body)) throw new Error(`legacy id ${n} too large`);
  return `${ID_PREFIX[kind]}_${body}` as Id<K>;
}
