import { entryNear, helpEntries, SCREENS } from './entries';
import { entryPageId, guidePageId } from './entry-pages';

/**
 * P32 F1 on anything: remembers what was under the pointer (or focused) when F1 was pressed, so Help opens
 * on that control's own page; otherwise on the guide of the screen you are on.
 */
let x = -1;
let y = -1;
let pressed: { at: number; target: Element | null } | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX;
      y = e.clientY;
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'F1') return;
      const focused =
        document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      const hovered = x >= 0 ? document.elementFromPoint(x, y) : null;
      pressed = { at: performance.now(), target: hovered ?? focused };
    },
    { capture: true },
  );
}

/** The Help page for what F1 was pressed on, or for the screen (null when Help was opened another way). */
export function contextHelpPage(workspace: string): string | null {
  const p = pressed;
  pressed = null;
  if (!p || performance.now() - p.at > 500) return null;
  const e = entryNear(p.target, helpEntries());
  if (e) return entryPageId(e.id);
  const screen = SCREENS.find((s) => s.workspace === workspace)?.id;
  return screen ? guidePageId(screen) : null;
}
