import { describe, expect, it } from 'vitest';
import { cleanMarks, lookError, marksFromWords, shapeFromWords, withoutMarks } from '../../src/core/character/marks';
import { aiPrompt, localCandidates, sanitize } from '../../src/editor/workspaces/character-studio/picture-match';

/** Milestone 3, 10d: body shape and drawings said in words, or chosen by Claude, for From a picture. */
const CAT = {
  choices: {
    hat: ['None', 'Pirate hat', 'Crown'],
    hair: ['Short', 'Long', 'Ponytail'],
    held: ['None', 'Sword'],
    gender: ['Male', 'Female'],
    breastMode: ['Sculpted', 'Printed', 'Comic'],
    breastShape: ['Rounded', 'Natural', 'Angular', 'Teardrop', 'Wide', 'Compact', 'Perky', 'Pointy'],
    buttShape: ['Rounded', 'Athletic', 'Wide', 'Compact', 'Pear'],
    neckline: ['Closed', 'V-neck', 'Scoop', 'Sweetheart', 'Keyhole', 'Asymmetric'],
    lingerie: ['Lace set'],
  },
  colorFields: ['shirtColor', 'pantsColor', 'hatColor', 'hairColor', 'nippleColor'],
};

describe('drawings from words', () => {
  it('a red star on her left cheek: the head’s front, the figure’s own left (your right as you face it)', () => {
    const [m] = marksFromWords('a red star on her left cheek');
    expect(m).toMatchObject({ shape: 'star', part: 'head', side: 'front', color: '#c91a09' });
    expect(m!.x).toBeGreaterThan(0.5);
  });
  it('number 7 on his back: white text on the torso’s back', () => {
    expect(marksFromWords('number 7 on his back')).toEqual([
      expect.objectContaining({ shape: 'text', text: '7', part: 'torso', side: 'back', color: '#f4f4f4' }),
    ]);
  });
  it('freckles, a small scar on the chin, a heart tattoo on both arms', () => {
    const m = marksFromWords('freckles, a small scar on his chin and a heart tattoo on both arms');
    expect(m.map((x) => [x.shape, x.part])).toEqual([
      ['freckles', 'head'],
      ['scar', 'head'],
      ['heart', 'leftArm'],
      ['heart', 'rightArm'],
    ]);
    expect(m[1]!.size).toBeLessThan(0.3);
    expect(m[2]!.side).toBe('left');
    expect(m[3]!.side).toBe('right');
  });
  it('a word on the shirt; nothing to draw gives nothing', () => {
    expect(marksFromWords('a shirt that says BOSS')[0]).toMatchObject({ shape: 'text', text: 'BOSS' });
    expect(marksFromWords('a pirate with a sword')).toEqual([]);
  });
  it('Claude’s marks are kept in range; unknown shapes and parts are dropped', () => {
    const m = cleanMarks([
      { shape: 'star', part: 'head', x: 3, y: -1, size: 9, color: '#FF0000' },
      { shape: 'logo', part: 'head' },
      { shape: 'dot', part: 'tail' },
      { shape: 'text', part: 'torso', side: 'BACK', text: 'a very long word indeed' },
    ]);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ x: 1, y: 0, size: 1, color: '#ff0000', side: 'front' });
    expect(m[1]).toMatchObject({ side: 'back', text: 'a very lon' });
    expect(cleanMarks(Array.from({ length: 40 }, () => ({ shape: 'dot', part: 'head' })))).toHaveLength(16);
  });
});

describe('body shape from words', () => {
  it('curvy, a deep V-neck: sizes for a Female body, the chest left out for a Male one', () => {
    expect(shapeFromWords('a curvy pirate in a deep v-neck', true)).toMatchObject({
      breastShape: 'Natural',
      breastSize: 75,
      buttSize: 55,
      neckline: 'V-neck',
      necklineDepth: 75,
    });
    const male = shapeFromWords('a curvy pirate', false);
    expect(male.breastSize).toBeUndefined();
    expect(male.buttSize).toBe(55);
    expect(shapeFromWords('an athletic runner', true)).toMatchObject({ buttShape: 'Athletic', breastShape: 'Compact' });
    expect(shapeFromWords('a pirate', true)).toEqual({});
  });
  it('the engine refuses shapes out of range or not in v68’s lists, and drawings that are not pictures', () => {
    expect(lookError({ breastSize: 151 })).toMatch(/0 to 150/);
    expect(lookError({ buttSize: 12.5 })).toMatch(/whole number/);
    expect(lookError({ neckline: 'Turtle' })).toMatch(/one of/);
    expect(lookError({ paint: { head: 'not a picture' } })).toMatch(/not a PNG/);
    expect(lookError({ paint: { wing: 'data:image/png;base64,AAAA' } })).toMatch(/no part/);
    expect(lookError({ breastSize: 70, neckline: 'Scoop', paint: { head: 'data:image/png;base64,AAAA' } })).toBeNull();
  });
});

describe('From a picture with body shape and drawings', () => {
  it('words: a curvy pirate woman in a deep V-neck with a red star on her left cheek and number 7 on her back', () => {
    const [k] = localCandidates(
      'a curvy pirate woman in a deep V-neck with a red star on her left cheek and number 7 on her back',
      [],
      CAT,
    );
    expect(k!.profile).toMatchObject({ gender: 'Female', breastSize: 75, neckline: 'V-neck', necklineDepth: 75 });
    expect(k!.marks?.map((m) => m.shape)).toEqual(['star', 'text']);
    expect(k!.matched).toEqual(
      expect.arrayContaining([
        ['Body shape', expect.stringContaining('breast size 75')],
        ['Drawn', 'a star on the head (front)'],
        ['Drawn', '“7” on the torso (back)'],
      ]),
    );
  });
  it('Claude may choose shapes and marks: sizes are rounded and clamped, the chest only for a Female body', () => {
    const k = sanitize(
      {
        name: 'Ada',
        profile: { gender: 'Female', breastSize: 210.4, buttSize: 33.6, neckline: 'Scoop', necklineDepth: -5 },
        marks: [{ shape: 'heart', part: 'torso', x: 0.5, y: 0.4, size: 0.3, color: '#fc97ac' }],
      },
      CAT,
    )!;
    expect(k.profile).toMatchObject({ breastSize: 150, buttSize: 34, neckline: 'Scoop', necklineDepth: 0 });
    expect(k.marks).toHaveLength(1);
    const man = sanitize({ name: 'Bo', profile: { gender: 'Male', breastSize: 90 } }, CAT)!;
    expect(man.profile?.breastSize).toBeUndefined();
  });
  it('the prompt offers body shape and marks, but not lingerie or nipples', () => {
    const t = aiPrompt('a runner', false, CAT, []);
    expect(t).toMatch(/breastSize 0-150/);
    expect(t).toMatch(/"marks": up to 16/);
    expect(t).toMatch(/buttShape: Rounded/);
    expect(t).not.toMatch(/lingerie:/);
    expect(t).not.toMatch(/nippleColor/);
  });
});

describe('what it is, without its drawings', () => {
  it('a drawing in the words does not change what is made', () => {
    expect(withoutMarks('a knight with a red star on his cheek')).toBe('a knight');
    expect(withoutMarks('a curvy pirate woman, freckles and number 7 on her back')).toBe('a curvy pirate woman');
    expect(withoutMarks('a walking teapot')).toBe('a walking teapot');
  });
});

describe('names', () => {
  it('the name stops before what it wears or has', async () => {
    const { nameOf } = await import('../../src/editor/workspaces/character-studio/picture-match');
    expect(nameOf('a curvy pirate woman in a deep V-neck with a red star')).toBe('Curvy Pirate Woman');
    expect(nameOf('Sam the gardener')).toBe('Sam The Gardener');
  });
});
