import { describe, expect, it } from 'vitest';
import { levelOf, xpFor } from '../../src/core/character/sheet';
import { Character } from '../../src/core/schema';
import { afterDefence, movesOf, statsOf, wornOutfit, wornProfile } from '../../src/engine/runtime/sheet';

/** P22 part 2: the character sheet — stats with outfits, moves, defence and levels. */
const KNIGHT = {
  id: 'chr_knight0001',
  name: 'Knight',
  role: 'npc' as const,
  profile: { name: 'Knight', hat: 'None', shirtColor: '#aa0000' },
  stats: {
    health: 5,
    stamina: 120,
    speed: 1,
    jump: 1,
    strength: 1.2,
    defence: 2,
    level: 3,
    xpCurve: 'normal' as const,
  },
  outfits: [{ name: 'Armour', look: { hat: 'Helmet', shirtColor: '#888888' }, stats: { speed: -0.2, defence: 3 } }],
  moves: { style: 'heavy' as const, power: 1, speed: 1 },
  voice: { pitch: 0.7 },
  behaviour: { kind: 'shopkeeper' as const, routine: 'stand' as const },
};

describe('the character sheet', () => {
  it('is part of a character file; old characters without it are still valid', () => {
    expect(Character.safeParse(KNIGHT).success).toBe(true);
    expect(Character.safeParse({ id: 'chr_plain00001', name: 'Plain', role: 'npc', profile: {} }).success).toBe(true);
    expect(Character.safeParse({ ...KNIGHT, stats: { ...KNIGHT.stats, speed: 9 } }).success).toBe(false);
  });

  it('outfits change the look and add their bonuses only while worn', () => {
    expect(wornOutfit(KNIGHT)).toBeNull();
    expect(statsOf(KNIGHT)).toMatchObject({ speed: 1, defence: 2 });
    expect(wornProfile(KNIGHT).hat).toBe('None');
    const worn = { ...KNIGHT, outfit: 'Armour' };
    expect(wornProfile(worn)).toMatchObject({ hat: 'Helmet', shirtColor: '#888888', name: 'Knight' });
    expect(statsOf(worn)).toMatchObject({ speed: 0.8, defence: 5 });
    // no sheet: the defaults
    expect(statsOf(null)).toMatchObject({ health: 3, speed: 1, defence: 0 });
  });

  it('moves: strength × style × fine-tuning; defence takes 8% a point, at least a quarter heart', () => {
    expect(movesOf(KNIGHT).power).toBeCloseTo(1.2 * 1.5);
    expect(movesOf(KNIGHT).speed).toBeCloseTo(0.75);
    expect(movesOf({ moves: { style: 'defensive', power: 1, speed: 1 } }).guard).toBe(0.6);
    expect(afterDefence(1, 0)).toBe(1);
    expect(afterDefence(1, 5)).toBe(0.5);
    expect(afterDefence(2, 10)).toBe(0.5);
    expect(afterDefence(0.25, 10)).toBe(0.25);
    expect(afterDefence(0, 3)).toBe(0);
  });

  it('levels follow the experience curve', () => {
    expect(xpFor(1, 'normal')).toBe(0);
    expect(xpFor(2, 'normal')).toBe(100);
    expect(xpFor(3, 'fast')).toBeLessThan(xpFor(3, 'normal'));
    expect(xpFor(3, 'slow')).toBeGreaterThan(xpFor(3, 'normal'));
    expect(levelOf(0, 'normal')).toBe(1);
    expect(levelOf(100, 'normal')).toBe(2);
    expect(levelOf(xpFor(7, 'slow'), 'slow')).toBe(7);
    expect(levelOf(xpFor(7, 'slow') - 1, 'slow')).toBe(6);
  });
});
