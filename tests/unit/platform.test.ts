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

describe('keys any keyboard has', () => {
  it('every F-key and special-key shortcut has a Mac key, shown on a Mac', async () => {
    const { ACTIONS } = await import('../../src/editor/actions/registry');
    const { MAC_KEYS, anyKeyboard } = await import('../../src/editor/platform');
    const special = /^(Shift |Ctrl |Alt )*(F\d+|Home|End|PageUp|PageDown|Numpad\d|Insert)$/;
    for (const a of ACTIONS) if (a.key && special.test(a.key)) expect(MAC_KEYS[a.key], `${a.id} ${a.key}`).toBeTruthy();
    // no Mac key clashes with another action's shortcut
    const keys = new Map(ACTIONS.filter((a) => a.key).map((a) => [a.key!, a.id]));
    // (help.here is ⌘/ itself: the same as F1)
    for (const a of ACTIONS)
      if (a.key && MAC_KEYS[a.key] && a.id !== 'help.guide') expect(keys.get(anyKeyboard(a.key)), a.id).toBeUndefined();
    expect(keysFor('Shift F5 plays from the spawn; F5 stops', true)).toBe(
      '⌘ Shift ↩ Return plays from the spawn; ⌘ ↩ Return stops',
    );
  });
});
