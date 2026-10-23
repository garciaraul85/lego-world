import type { ResolvedBody } from '../../../core/character/resolve';
import { resolveBody } from '../../../core/character/resolve';
import type { Character } from '../../../core/schema';

/** the body of the character as drawn now (or null: the minifig) */
const resolved = new Map<string, ResolvedBody | null>();
export function bodyOfChr(chr: Pick<Character, 'body'>, get: (p: string) => unknown): ResolvedBody | null {
  if (!chr.body) return null;
  // the same body (and the same plan and build) is the same object, so the preview keeps its camera
  const b = chr.body;
  const key = JSON.stringify([
    b,
    b.plan ? get(`bodyplans/${b.plan}.json`) : 0,
    b.asset ? get(`assets/${b.asset}.json`) : 0,
  ]);
  if (!resolved.has(key)) {
    let r: ResolvedBody | null = null;
    try {
      r = resolveBody(b, get);
    } catch {
      r = null;
    }
    if (resolved.size > 60) resolved.delete(resolved.keys().next().value!);
    resolved.set(key, r);
  }
  return resolved.get(key)!;
}
