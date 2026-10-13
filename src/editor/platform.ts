/**
 * P32: key names as the person's keyboard prints them. On a Mac, Alt is the ⌥ Option key and the editor's
 * Ctrl shortcuts are ⌘ Command (the browser reports Option as Alt, and the editor treats ⌘ like Ctrl), so
 * the text says so. `?mac` in the address forces the Mac wording (for tests and screenshots).
 */
export const IS_MAC =
  typeof navigator !== 'undefined' &&
  ((typeof location !== 'undefined' && /[?&]mac\b/.test(location.search)) ||
    /Mac|iPhone|iPad|iPod/.test(
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        navigator.userAgent,
    ));

/**
 * Keys a Mac keyboard lacks or keeps for itself (F-keys are brightness and media keys unless fn is held;
 * laptops have no Home, Page Up/Down or number pad), with the key that does the same everywhere. Both work
 * on every computer; a Mac shows the second one.
 */
export const MAC_KEYS: Record<string, string> = {
  'Shift F5': 'Ctrl Shift Enter',
  'Ctrl F5': 'Ctrl Alt Enter',
  F5: 'Ctrl Enter',
  'Shift F6': 'Ctrl Alt Shift P',
  F6: 'Ctrl Alt P',
  F1: 'Ctrl /',
  F9: 'Shift B',
  'Shift F10': 'Shift M',
  Home: 'H',
  PageUp: 'Shift ArrowUp',
  PageDown: 'Shift ArrowDown',
  Numpad7: 'Shift T',
};

/** The key that works on any keyboard for a shortcut (itself when it already does). */
export const anyKeyboard = (key: string) => MAC_KEYS[key] ?? key;

const MAC_RE = new RegExp(
  `(^|[^\\w])(${Object.keys(MAC_KEYS)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/ /g, '[ +]'))
    .join('|')})(?![\\w])`,
  'g',
);

/** Rewrites key names in a text for this keyboard (unchanged on Windows and Linux). */
export function keysFor(text: string, mac = IS_MAC): string {
  if (!mac || !text) return text;
  return text
    .replace(/\s*Ctrl means ⌘ on a Mac\.?/g, '')
    .replace(/\(⌘K on a Mac\)\s*/g, '')
    .replace(/\(on a Mac: \*\*⌘ \/\*\*, or fn F1\)/g, '')
    .replace(MAC_RE, (_, pre: string, k: string) => `${pre}${MAC_KEYS[k.replace('+', ' ')] ?? k}`)
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥ Option')
    .replace(/\bArrowUp\b/g, '↑')
    .replace(/\bArrowDown\b/g, '↓')
    .replace(/\bEnter\b/g, '↩ Return');
}
