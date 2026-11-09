import { describe, expect, it } from 'vitest';
import {
  cleanHair,
  describeHair,
  drawHair,
  HAIR_BEARDS,
  HAIR_DEFAULT,
  HAIR_FRINGES,
  HAIR_PRESETS,
  HAIR_TIES,
  HAIR_TOPS,
  hairError,
  hairFromV68,
  hairFromWords,
  lookForV68,
  presetHair,
  v68Hair,
} from '../../src/core/character/hair';
import { lookError } from '../../src/core/character/marks';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { legacyRuntime } from '../../src/engine/legacy/runtime-modules';

/** counts what drawHair draws, and checks every shape is somewhere on or round the figure */
function shapes(h: unknown) {
  const out = { n: 0, colors: new Set<string>(), bad: [] as string[] };
  let color = '';
  const at = (x: number, y: number, z: number, what: string) => {
    out.n++;
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 1.5 || Math.abs(z) > 1.5 || y < 1.5 || y > 5.5)
      out.bad.push(`${what} at ${x},${y},${z}`);
  };
  drawHair(h, '#654027', {
    part: (_j, c) => {
      color = c;
      out.colors.add(c);
    },
    lathe: (x, z, prof) => at(x, prof[prof.length - 1]![1], z, 'lathe'),
    sphere: (x, y, z) => at(x, y, z, 'sphere'),
    box: (x, y, z) => at(x, y, z, 'box'),
    cyl: (x, y, z) => at(x, y, z, 'cyl'),
  });
  void color;
  return out;
}

describe('custom hair', () => {
  it('draws every top, fringe, tie and beard on the head', () => {
    for (const top of HAIR_TOPS)
      for (const fringe of HAIR_FRINGES)
        for (const tie of HAIR_TIES)
          for (const beard of HAIR_BEARDS) {
            const r = shapes({ ...HAIR_DEFAULT, top, fringe, tie, beard, length: 90, volume: 100 });
            expect(r.bad, `${top}/${fringe}/${tie}/${beard}`).toEqual([]);
            expect(r.n).toBeGreaterThan(0);
          }
  });
  it('draws the tips, band and beard in their own colours', () => {
    const r = shapes({
      ...HAIR_DEFAULT,
      length: 80,
      tips: '#1e5aa8',
      tie: 'None',
      beard: 'Braided',
      band: '#ff0000',
      beardColor: '#eeeeee',
    });
    expect([...r.colors]).toEqual(expect.arrayContaining(['#654027', '#1e5aa8', '#ff0000', '#eeeeee']));
  });
  it('cleans anything into settings', () => {
    const h = cleanHair({
      top: 'Nope',
      length: 140,
      volume: -3,
      tips: 'blue',
      band: '#ABCDEF',
      extra: 1,
      name: '  Mine ',
      from: 'x',
    });
    expect(h).toEqual({ ...HAIR_DEFAULT, length: 100, volume: 0, band: '#abcdef', name: 'Mine' });
  });
  it('has 16 presets that are all valid', () => {
    expect(HAIR_PRESETS).toHaveLength(16);
    for (const p of HAIR_PRESETS) expect(hairError({ hair: 'Custom', customHair: presetHair(p.name) })).toBeNull();
  });
  it('checks a look: custom hair only with the Custom choice, settings in range', () => {
    expect(lookError({ hair: 'Custom', customHair: { ...HAIR_DEFAULT } })).toBeNull();
    expect(lookError({ hair: 'Long', customHair: { ...HAIR_DEFAULT } })).toMatch(/Custom/);
    expect(lookError({ hair: 'Custom', customHair: { ...HAIR_DEFAULT, length: 120 } })).toMatch(/length/);
  });
  it('gives v68 its nearest hairstyle (Play in v68)', () => {
    expect(v68Hair({ ...HAIR_DEFAULT, tie: 'Two buns' })).toBe('Bun');
    expect(v68Hair({ ...HAIR_DEFAULT, length: 80 })).toBe('Long');
    const look = lookForV68({ hair: 'Custom', customHair: { ...HAIR_DEFAULT, top: 'Mohawk' }, facialHair: 'None' });
    expect(look.hair).toBe('Mohawk');
    expect(look.customHair).toBeUndefined();
    expect(lookForV68({ hair: 'Long' })).toEqual({ hair: 'Long' });
    for (const name of legacyRuntime().CharacterCatalog.choices.hair!.filter((x) => x !== 'Custom'))
      expect(hairError({ hair: 'Custom', customHair: hairFromV68(name) })).toBeNull();
  });
  it('reads hairstyles from words, and leaves plain ones to v68', () => {
    expect(hairFromWords('a girl with space buns')?.tie).toBe('Two buns');
    expect(hairFromWords('a warrior with a high ponytail and red ribbons')).toMatchObject({
      tie: 'High ponytail',
      band: '#c91a09',
    });
    expect(hairFromWords('a viking with a braided beard')?.beard).toBe('Braided');
    expect(hairFromWords('long hair with blue tips')).toMatchObject({ length: 65, tips: '#1e5aa8' });
    expect(hairFromWords('a singer with curtain bangs')?.fringe).toBe('Curtain');
    expect(hairFromWords('a monk with a top knot')?.tie).toBe('Top knot');
    expect(hairFromWords('a girl with a ponytail')).toBeNull();
    expect(hairFromWords('a knight with a long beard')).toBeNull();
    expect(describeHair({ ...HAIR_DEFAULT, tie: 'Two buns' })).toBe('smooth, two buns');
  });
  it('v68 catalog keeps custom hair, and its model draws it', () => {
    const L = legacyRuntime();
    expect(L.CharacterCatalog.choices.hair).toContain('Custom');
    const p = L.CharacterCatalog.validate({
      ...L.CharacterCatalog.defaults,
      hair: 'Custom',
      customHair: { ...HAIR_DEFAULT, tie: 'Bun', junk: 1 },
    });
    expect(p.customHair).toEqual({ ...HAIR_DEFAULT, tie: 'Bun' });
    const plain = L.CharacterCatalog.validate({
      ...L.CharacterCatalog.defaults,
      hair: 'Long',
      customHair: HAIR_DEFAULT,
    });
    expect(plain.customHair).toBeUndefined();
  });
  it('keeps hairstyles in My library with commands, one undo step each', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'T' }));
    const bus = registerAll(new CommandBus(store));
    const style = { ...presetHair('Space buns')!, id: 'hst_aaaaaaaaaa', name: 'Space buns', color: '#8a4fbf' };
    expect(bus.execute([{ type: 'hairstyle.put', payload: { style } }], { source: 'user' }).ok).toBe(true);
    expect(store.get('hairstyles/hst_aaaaaaaaaa.json')).toMatchObject({ name: 'Space buns', tie: 'Two buns' });
    expect(
      bus.execute([{ type: 'hairstyle.put', payload: { style: { ...style, length: 200 } } }], { source: 'user' }).ok,
    ).toBe(false);
    expect(bus.execute([{ type: 'hairstyle.delete', payload: { id: 'hst_aaaaaaaaaa' } }], { source: 'user' }).ok).toBe(
      true,
    );
    expect(store.has('hairstyles/hst_aaaaaaaaaa.json')).toBe(false);
    bus.undo();
    expect(store.has('hairstyles/hst_aaaaaaaaaa.json')).toBe(true);
  });
});
