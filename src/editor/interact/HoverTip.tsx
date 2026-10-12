import { useEffect, useRef, useState } from 'preact/hooks';
import type { ActionCtx } from '../actions/registry';
import { sceneHover } from './drag';
import { openMenuState } from './menu';

type Tip = { text: string; help?: string; x: number; y: number; below: boolean };

const SHOW_MS = 450;
const HIDE_MS = 250;

/**
 * P31 hover tips: any element with data-tip="…" gets a small tip after a short pause; with data-help="page"
 * the tip has a "?" that opens that Help page. The 3D view's object name tip is drawn here too.
 */
export function HoverTip({ c }: { c: ActionCtx }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const showT = useRef(0);
  const hideT = useRef(0);
  const cur = useRef<Element | null>(null);

  useEffect(() => {
    const over = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('.hovertip')) {
        clearTimeout(hideT.current);
        return;
      }
      const el = t.closest?.('[data-tip]');
      if (el === cur.current) return;
      cur.current = el ?? null;
      clearTimeout(showT.current);
      if (!el) {
        hideT.current = window.setTimeout(() => setTip(null), HIDE_MS);
        return;
      }
      clearTimeout(hideT.current);
      showT.current = window.setTimeout(() => {
        if (openMenuState.value || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 80;
        setTip({
          text: el.getAttribute('data-tip') ?? '',
          ...(el.getAttribute('data-help') ? { help: el.getAttribute('data-help')! } : {}),
          x: Math.max(8, Math.min(r.left, window.innerWidth - 300)),
          y: below ? r.bottom + 6 : r.top - 6,
          below,
        });
      }, SHOW_MS);
    };
    const hide = () => {
      clearTimeout(showT.current);
      cur.current = null;
      setTip(null);
    };
    document.addEventListener('mouseover', over);
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.hovertip')) hide();
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('blur', hide);
      clearTimeout(showT.current);
      clearTimeout(hideT.current);
    };
  }, []);

  const h = sceneHover.value;
  return (
    <>
      {tip && (
        <div
          class="hovertip"
          role="tooltip"
          style={`left:${tip.x}px;top:${tip.y}px;${tip.below ? '' : 'transform:translateY(-100%)'}`}
        >
          <span>{tip.text}</span>
          {tip.help && (
            <button
              type="button"
              class="tip-help"
              aria-label="Open help about this"
              onClick={() => {
                const page = tip.help!;
                setTip(null);
                c.ui.help(page);
              }}
            >
              ?
            </button>
          )}
        </div>
      )}
      {h && !openMenuState.value && (
        <div class="hovertip scene" style={`left:${h.x + 14}px;top:${h.y + 16}px`} aria-hidden="true">
          {h.name} · right-click for more
        </div>
      )}
    </>
  );
}
