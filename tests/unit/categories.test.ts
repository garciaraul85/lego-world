import { expect, it } from 'vitest';
import { categoryOf } from '../../src/editor/categories';
/** The Hierarchy's groups: v68's names and things made from words. */
it('a kind word anywhere in a group’s name puts it in its group', () => {
  expect(categoryOf('house-3')).toBe('buildings');
  expect(categoryOf('red-house-7')).toBe('buildings');
  expect(categoryOf('Red House')).toBe('buildings');
  expect(categoryOf('lighthouse-2')).toBe('buildings');
  expect(categoryOf('tree-oak-12')).toBe('nature');
  expect(categoryOf('pirate-ship-1')).toBe('vehicles');
  expect(categoryOf('carpet-1')).toBe('other');
  expect(categoryOf(undefined)).toBe('terrain');
});
