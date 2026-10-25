import { describe, expect, it } from 'vitest';
import { cleanMapSpec, describeMap, mapSpecFromWords } from '../../src/core/gamegen/map-spec';

/** Milestone 3, 10d part 5: a whole map from words — land, sky, buildings and people. */
describe('maps from words', () => {
  it('a snowy mountain village with a lighthouse and three houses at night, a blacksmith and two guards', () => {
    const s = mapSpecFromWords(
      'a snowy mountain village with a lighthouse and three red houses at night, a blacksmith and two guards',
    );
    expect(s.biomes).toEqual(expect.arrayContaining(['prairie', 'mountains']));
    expect(s.biomes).not.toContain('city');
    expect(s).toMatchObject({ time: 'night', snow: true, rain: false, name: 'Snowy Mountain Village' });
    expect(s.buildings.map((b) => [b.spec.kind, b.count, b.spec.name])).toEqual([
      ['lighthouse', 1, 'Lighthouse'],
      ['house', 3, 'Red House'],
    ]);
    expect(s.buildings[1]!.spec.colors.main).toBe('#c91a09');
    expect(s.people).toEqual([
      { words: 'a blacksmith', count: 1 },
      { words: 'a guard', count: 2 },
    ]);
  });
  it('a pirate island at sunset with a ship and palm trees; a misty swamp; a big desert with a pyramid', () => {
    const p = mapSpecFromWords('a pirate island at sunset with a ship and some palm trees');
    expect(p.biomes).toEqual(['beach']);
    expect(p.time).toBe('evening');
    expect(p.buildings.map((b) => b.spec.kind)).toEqual(['ship', 'tree']);
    expect(mapSpecFromWords('a misty swamp').fog).toBe('swamp');
    const d = mapSpecFromWords('a big desert with a pyramid');
    expect(d).toMatchObject({ biomes: ['desert'], size: 32 });
    expect(d.buildings[0]!.spec.kind).toBe('pyramid');
  });
  it('a town with nothing named gets a few houses; nothing said is a prairie by day', () => {
    expect(mapSpecFromWords('a quiet town').buildings[0]).toMatchObject({ count: 3 });
    expect(mapSpecFromWords('somewhere nice')).toMatchObject({ biomes: ['prairie'], time: 'day', size: 24 });
  });
  it('Claude’s map specs are kept in range', () => {
    const s = cleanMapSpec({
      biomes: ['moon', 'forest', 'forest', 'beach', 'city', 'desert'],
      size: 99,
      time: 'dawn',
      fog: 'pea soup',
      buildings: Array.from({ length: 12 }, () => ({ spec: { kind: 'tower' }, count: 40 })),
      people: [{ words: 'a knight', count: 0 }, { nope: 1 }],
    });
    expect(s).toMatchObject({ biomes: ['forest', 'beach', 'city'], size: 24, time: 'day', fog: 'none' });
    expect(s.buildings).toHaveLength(8);
    expect(s.buildings[0]!.count).toBe(6);
    expect(s.people).toEqual([{ words: 'a knight', count: 1 }]);
    expect(describeMap(s)[0]![1]).toMatch(/forest, beach, city/);
  });
});

describe('what is said about each one stays with it', () => {
  it('a blacksmith with a long beard keeps the beard; a house with a red roof keeps the roof', () => {
    const s = mapSpecFromWords('a village with a blacksmith with a long beard and a house with a red roof');
    expect(s.people[0]!.words).toBe('a blacksmith with a long beard');
    expect(s.buildings[0]!.spec.colors.roof).toBe('#c91a09');
  });
});
