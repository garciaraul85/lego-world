import type { GameOptions } from '../../core/gamegen/recipes';

/**
 * Templates (P7.2): games built by the generator with fixed seeds, so every template is the same
 * game on every device. Built when picked (a few hundred ms) instead of shipping .bwproj files.
 */
export const TEMPLATES: { id: string; title: string; blurb: string; seed: number; options: GameOptions }[] = [
  {
    id: 'treasure',
    title: 'Treasure hunt',
    blurb: 'Two town maps, chests hidden around them, a reward scene when you open the last one.',
    seed: 1101,
    options: { theme: 'town', maps: 2, length: 'short', difficulty: 1, quest: 'collect' },
  },
  {
    id: 'summit',
    title: 'Volcano climb',
    blurb: 'Reach the beacon on the highest point of a volcanic world.',
    seed: 2202,
    options: { theme: 'volcano', maps: 2, length: 'short', difficulty: 2, quest: 'summit' },
  },
  {
    id: 'repair',
    title: 'Repair crew',
    blurb: 'Smash and rebuild houses in a patchwork village until it is whole again.',
    seed: 3303,
    options: { theme: 'mixed', maps: 1, length: 'short', difficulty: 1, quest: 'repair' },
  },
];
