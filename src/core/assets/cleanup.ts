import type { Asset } from '../schema';

/**
 * P27 part 3d: what becomes of something once it breaks.
 * rebuild  kept until the player rebuilds it (hold E) — the LEGO way, and how v68 did it
 * gone     gone for good: its loose bricks fade, and only a note that it broke is kept
 * respawn  comes back after a while (respawnAfter seconds), or when the player comes back to the map (0)
 * rubble   a few of its bricks stay on the ground as scenery; the rest fade
 */
export const CLEANUP = ['rebuild', 'gone', 'respawn', 'rubble'] as const;
export type Cleanup = (typeof CLEANUP)[number];

export const CLEANUP_LABEL: Record<Cleanup, string> = {
  rebuild: 'Rebuildable (hold E)',
  gone: 'Gone for good',
  respawn: 'Comes back',
  rubble: 'Leaves rubble',
};

/** an asset's choice (assets made before P27 part 3d: rebuildable or not, as their Can be rebuilt says) */
export const cleanupOf = (def: Pick<Asset, 'smash'> | null | undefined): Cleanup =>
  def ? (def.smash.after ?? (def.smash.rebuild ? 'rebuild' : 'gone')) : 'rebuild';

/** bricks a broken thing with rubble leaves on the ground */
export const RUBBLE_BRICKS = 8;
/** breaks a map remembers (more: the oldest that need not be rebuilt are cleared, kept only as ids) */
export const MAX_BROKEN = 2000;
/** seconds the loose bricks of something gone (or coming back) stay before they fade */
export const DEBRIS_FADE = 3;
