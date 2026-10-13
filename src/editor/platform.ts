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

/** Rewrites key names in a text for this keyboard (unchanged on Windows and Linux). */
export function keysFor(text: string, mac = IS_MAC): string {
  if (!mac || !text) return text;
  return text
    .replace(/\s*Ctrl means ⌘ on a Mac\.?/g, '')
    .replace(/\(⌘K on a Mac\)\s*/g, '')
    .replace(/\bCtrl\b/g, '⌘')
    .replace(/\bAlt\b/g, '⌥ Option');
}
