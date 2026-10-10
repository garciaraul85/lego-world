import { describe, expect, it } from 'vitest';
import { legacyColorIndex } from '../../src/core/bridge/legacy-bridge';

describe('legacyColorIndex', () => {
  it('maps v68 colors exactly and snaps other colors to the nearest v68 color', () => {
    expect(legacyColorIndex('#D20C20')).toBe(0);
    expect(legacyColorIndex('#f2b632')).toBe(2); // amber → Sunshine yellow
    expect(legacyColorIndex('#000000')).toBe(6); // → Black
    expect(() => legacyColorIndex('red')).toThrow();
  });
});
