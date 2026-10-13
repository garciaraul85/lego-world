import { describe, expect, it } from 'vitest';
import { keysFor } from '../../src/editor/platform';

/** P32: on a Mac, key names are the Mac's own (Alt is ⌥ Option, the editor's Ctrl is ⌘). */
describe('key names for the keyboard in use', () => {
  it('rewrites Alt and Ctrl on a Mac only', () => {
    const t = 'Alt-click picks one brick; Ctrl Z undoes; Alt ← turns the view. Ctrl means ⌘ on a Mac.';
    expect(keysFor(t, false)).toBe(t);
    expect(keysFor(t, true)).toBe('⌥ Option-click picks one brick; ⌘ Z undoes; ⌥ Option ← turns the view.');
    expect(keysFor('Ctrl K (⌘K on a Mac) opens the palette', true)).toBe('⌘ K opens the palette');
    // words that only contain the letters are left alone
    expect(keysFor('Altitude and Ctrlx', true)).toBe('Altitude and Ctrlx');
  });
});
