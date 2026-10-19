import { DEFAULT_STATS, STYLE_MOVES, type Stats } from '../../core/character/sheet';
import type { Character } from '../../core/schema';

/**
 * P22 part 2: what a character's sheet means in Play — its stats with the worn outfit's bonuses, the
 * look with the outfit on, and the hit power and swing speed of its moves.
 */
export function wornOutfit(chr: Pick<Character, 'outfits' | 'outfit'> | null | undefined) {
  return chr?.outfit ? (chr.outfits?.find((o) => o.name === chr.outfit) ?? null) : null;
}

/** The look in Play: its own, with the worn outfit's parts on top. */
export function wornProfile(chr: Pick<Character, 'profile' | 'outfits' | 'outfit'> | null | undefined) {
  const o = wornOutfit(chr);
  return { ...(chr?.profile ?? {}), ...(o?.look ?? {}) };
}

/** Its stats with the outfit's bonuses (defaults where the sheet has none). */
export function statsOf(chr: Pick<Character, 'stats' | 'outfits' | 'outfit'> | null | undefined): Stats {
  const s = { ...DEFAULT_STATS, ...(chr?.stats ?? {}) };
  const b = wornOutfit(chr)?.stats;
  if (!b) return s;
  return {
    ...s,
    speed: Math.max(0.3, s.speed + (b.speed ?? 0)),
    jump: Math.max(0.3, s.jump + (b.jump ?? 0)),
    strength: Math.max(0.2, s.strength + (b.strength ?? 0)),
    defence: Math.max(0, Math.min(10, s.defence + (b.defence ?? 0))),
  };
}

/** Hit power (× strength × moves) and swing speed of its moves. */
export function movesOf(chr: Pick<Character, 'stats' | 'outfits' | 'outfit' | 'moves'> | null | undefined) {
  const st = statsOf(chr);
  const m = chr?.moves;
  const style = STYLE_MOVES[m?.style ?? 'balanced'];
  return {
    power: st.strength * style.power * (m?.power ?? 1),
    speed: style.speed * (m?.speed ?? 1),
    guard: m?.style === 'defensive' ? 0.6 : 1,
  };
}

/** Damage after defence: each point takes 8% off, at most 80%; a hit always does at least a quarter. */
export function afterDefence(n: number, defence: number): number {
  if (n <= 0) return 0;
  const k = 1 - Math.min(0.8, Math.max(0, defence) * 0.08);
  return Math.max(0.25, Math.round(n * k * 4) / 4);
}
