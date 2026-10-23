import { describe, expect, it } from 'vitest';
import { BodyPlan } from '../../src/core/character/body';
import { moodFace } from '../../src/core/character/faces';
import { FAMILY_PRESETS, makeFamily } from '../../src/core/character/families';
import { Character } from '../../src/core/schema';
import {
  aiPrompt,
  colorWords,
  familyOf,
  localCandidates,
  mainColors,
  nameOf,
  parseCandidates,
  sanitize,
} from '../../src/editor/workspaces/character-studio/picture-match';

/** P22 part 4: faces for moods, presets for every family, and characters from a picture or words. */
const CAT = {
  choices: {
    hat: ['None', 'Wizard hat', 'Crown', 'Knight helmet'],
    hair: ['Short', 'Long', 'Bald', 'Ponytail', 'Curly', 'Bun'],
    held: ['None', 'Sword', 'Wand', 'Map'],
    scarf: ['None', 'Short scarf', 'Long scarf'],
    gender: ['Male', 'Female'],
    expression: ['Smile', 'Big grin', 'Angry', 'Sad', 'Scared', 'Surprised'],
    eyes: ['Classic', 'Wide'],
    outfit: ['Separates', 'Armor', 'Dress'],
  },
  colorFields: ['shirtColor', 'pantsColor', 'hatColor', 'hairColor', 'accessoryColor', 'eyeColor'],
};

describe('faces for moods', () => {
  it('each mood has a default face; a character’s own face wins; neutral is the resting face', () => {
    expect(moodFace(undefined, 'happy')).toEqual({ expression: 'Big grin' });
    expect(moodFace({ happy: { expression: 'Laughing' } }, 'happy')).toEqual({ expression: 'Laughing' });
    expect(moodFace({ scared: { eyes: 'Closed' } }, 'scared')).toEqual({ expression: 'Scared', eyes: 'Closed' });
    expect(moodFace(undefined, 'neutral')).toEqual({});
  });
  it('faces are part of the character file', () => {
    const c = {
      id: 'chr_facetest01',
      name: 'Tom',
      role: 'npc',
      profile: {},
      faces: { angry: { expression: 'Angry', eyes: 'Wide' } },
    };
    expect(Character.safeParse(c).success).toBe(true);
    expect(Character.safeParse({ ...c, faces: { furious: {} } }).success).toBe(false);
  });
});

describe('presets', () => {
  it('every family has at least 8, and each makes a valid body', () => {
    for (const [fam, list] of Object.entries(FAMILY_PRESETS)) {
      expect(list.length, fam).toBeGreaterThanOrEqual(8);
      for (const p of list) {
        const made = makeFamily(fam as never, p.params)!;
        expect(
          BodyPlan.safeParse({ id: 'bpl_preset0001', name: p.name, family: fam, ...made }).success,
          `${fam} ${p.name}`,
        ).toBe(true);
        for (const col of Object.values(p.colors)) expect(col).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('a character from words and a picture (no AI)', () => {
  it('reads colours next to parts, the family, and a name', () => {
    expect(colorWords('a long red scarf and blue eyes')).toEqual([
      { color: '#c91a09', word: 'red', part: 'accessoryColor' },
      { color: '#0055bf', word: 'blue', part: 'eyeColor' },
    ]);
    expect(familyOf('a little orange fox')).toBe('fourLegs');
    expect(familyOf('a blue fox wizard')).toBeNull();
    expect(familyOf('a fire dragon')).toBe('dragon');
    expect(nameOf('a blue fox wizard with a long scarf')).toBe('Blue Fox Wizard');
  });
  it('an animal: the family, a named preset, colours from words then the picture; three different matches', () => {
    const k = localCandidates('a green owl', ['#112233', '#445566'], CAT);
    expect(k).toHaveLength(3);
    expect(k[0]!.body?.family).toBe('bird');
    expect(k[0]!.matched[0]![1]).toMatch(/Owl/);
    expect(k[0]!.body?.colors?.main).toBe('#237841');
    expect(k[0]!.body?.colors?.accent).toBe('#112233');
    expect(k[1]!.body?.colors?.accent).toBe('#237841');
    expect(JSON.stringify(k[2])).not.toBe(JSON.stringify(k[0]));
  });
  it('a person: parts from words, colours where they were said and from the picture', () => {
    const k = localCandidates('a queen with a sword and a long red scarf', ['#0055bf'], CAT);
    const p = k[0]!.profile!;
    expect(p).toMatchObject({
      hat: 'Crown',
      gender: 'Female',
      held: 'Sword',
      scarf: 'Long scarf',
      accessoryColor: '#c91a09',
      shirtColor: '#0055bf',
    });
    expect(k[0]!.matched.map((m) => m[0])).toContain('Hat');
  });
});

describe('a character from Claude', () => {
  it('the prompt lists the editor’s settings and asks for an original character', () => {
    const t = aiPrompt('a robot chef', true, CAT, ['#ff0000']);
    expect(t).toMatch(/Wizard hat \| Crown/);
    expect(t).toMatch(/ORIGINAL/);
    expect(t).toMatch(/#ff0000/);
    expect(t).toMatch(/robot \(Robot walker/);
  });
  it('keeps only settings the editor has', () => {
    const k = sanitize(
      {
        name: 'Zap',
        profile: { hat: 'Crown', hair: 'Rainbow', shirtColor: '#AA0000', laser: 'yes' },
        matched: [['Hat', 'gold crown']],
      },
      CAT,
    )!;
    expect(k.profile).toEqual({ name: 'Zap', hat: 'Crown', shirtColor: '#aa0000' });
    const b = sanitize(
      {
        name: 'Rex',
        body: { family: 'dragon', params: { size: 9, tail: 1.2 }, colors: { main: '#123456', accent: 'red' } },
      },
      CAT,
    )!;
    expect(b.body).toEqual({ family: 'dragon', params: { size: 2.5, tail: 1.2 }, colors: { main: '#123456' } });
    expect(sanitize({ body: { family: 'unicorn' } }, CAT)?.body).toBeUndefined();
  });
  it('reads three candidates out of an answer with other words around the JSON', () => {
    const answer =
      'Here you go:\n```json\n{"candidates":[{"name":"A","profile":{"hat":"Crown"}},{"name":"B","body":{"family":"slime"}},{"name":"C","profile":{}},{"name":"D"}]}\n```';
    const list = parseCandidates(answer, CAT);
    expect(list.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    expect(parseCandidates('no json', CAT)).toEqual([]);
  });
});

describe('the main colours of a picture', () => {
  it('leaves out the background and merges similar colours, most first', () => {
    const w = 20;
    const h = 20;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // white background, a red block, a smaller blue block
        let c = [255, 255, 255];
        if (x >= 3 && x < 15 && y >= 3 && y < 15) c = [200, 10, 10];
        if (x >= 15 && x < 18 && y >= 3 && y < 8) c = [10, 40, 200];
        d.set([...c, 255], i);
      }
    const cols = mainColors(d, w, h, 4);
    expect(cols[0]).toBe('#c80a0a');
    expect(cols[1]).toBe('#0a28c8');
    expect(cols).toHaveLength(2);
  });
});
