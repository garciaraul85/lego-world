import { describe, expect, it } from 'vitest';
import { BodyPlan, checkPlan } from '../../src/core/character/body';
import { creaturePlan, specFromWords } from '../../src/core/character/compose';
import { newId } from '../../src/core/ids';

/** Milestone 3, 10d part 1: any figure from a few words, as a body plan of its own */
const WILD = [
  'a walking teapot',
  'a three-headed robot snake',
  'an octopus chef',
  'a living cloud',
  'a giant red t-rex',
  'a long-neck sauropod',
  'a triceratops',
  'a green stegosaurus',
  'a six-legged purple cat with four eyes',
  'a cyclops dog',
  'a flying toaster with four wings',
  'a tiny blue jellyfish',
  'a pumpkin on legs with a crown',
  'a car with eyes',
  'a ghost',
  'a starfish',
  'a dragon',
  'a lighthouse that walks',
];

describe('a figure of its own from words', () => {
  it.each(WILD)('“%s” makes a valid body plan', (words) => {
    const spec = specFromWords(words);
    const plan = creaturePlan(spec, newId('bodyplan'));
    const r = BodyPlan.safeParse(plan);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues[0])).toBe(true);
    expect(checkPlan(plan)).toEqual([]);
    expect(plan.bricks.length).toBeGreaterThan(3);
  });

  it('reads counts, kinds, colours and moves from the words', () => {
    const snake = specFromWords('a three-headed robot snake');
    expect(snake.heads).toBe(3);
    expect(snake.shape).toBe('long');
    expect(specFromWords('an octopus chef')).toMatchObject({ tentacles: 8, extras: expect.arrayContaining(['hat']) });
    expect(specFromWords('a walking teapot').extras).toEqual(expect.arrayContaining(['spout', 'handle', 'lid']));
    expect(specFromWords('a living cloud').move).toBe('fly');
    const cat = specFromWords('a six-legged purple cat with four eyes');
    expect([cat.legs, cat.eyes, cat.colors.main]).toEqual([6, 4, '#81007b']);
    expect(specFromWords('a giant red t-rex')).toMatchObject({ legs: 2, arms: 2, size: 8, colors: { main: '#c91a09' } });
    expect(specFromWords('a long-neck sauropod').neck).toBeGreaterThanOrEqual(8);
  });

  it('a three-headed one has three heads and three necks; tentacles whip as chains', () => {
    const plan = creaturePlan(specFromWords('a three-headed robot snake'), newId('bodyplan'));
    expect(plan.bones.filter((b) => b.role === 'head')).toHaveLength(3);
    const octo = creaturePlan(specFromWords('an octopus chef'), newId('bodyplan'));
    expect(octo.bones.filter((b) => b.name.startsWith('tentacle'))).toHaveLength(24);
  });
});
