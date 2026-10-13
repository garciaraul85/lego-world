import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { closeMenu, openMenuState, type ResolvedItem, runMenuItem } from './menu';

/**
 * The one right-click menu (P31). Draws whatever is in `openMenuState`, kept inside the window.
 * Keyboard: arrows move, Enter runs, Esc closes. Clicking anywhere outside closes it.
 */
export function ContextMenu() {
  const m = openMenuState.value;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!m || !ref.current) {
      setPos(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(m.x, window.innerWidth - r.width - 4));
    const y = Math.max(4, Math.min(m.y, window.innerHeight - r.height - 4));
    setPos({ x, y });
  }, [m]);

  // focus once it is placed and visible (a hidden element cannot take focus)
  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLButtonElement>('button.mi:not([disabled])')?.focus();
  }, [pos]);

  useEffect(() => {
    if (!m) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.ctxmenu')) closeMenu();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    const blur = () => closeMenu();
    // capture so a click that closes the menu does not also start a drag in the 3D view
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', blur);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', blur);
    };
  }, [m]);

  if (!m) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button.mi:not([disabled])') ?? [])];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const n =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? btns.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
    btns[n]?.focus();
  };

  return (
    <div
      ref={ref}
      class="popmenu ctxmenu"
      role="menu"
      aria-label={m.title}
      data-tour="context-menu"
      style={pos ? `left:${pos.x}px;top:${pos.y}px` : `left:${m.x}px;top:${m.y}px;visibility:hidden`}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div class="ctx-title">{m.title}</div>
      {m.items.map((it, i) =>
        'sep' in it ? <div key={`s${i}`} class="sep" role="separator" /> : <Item key={it.id} it={it} />,
      )}
    </div>
  );
}

function Item({ it }: { it: ResolvedItem }) {
  return (
    <button
      type="button"
      role="menuitem"
      class={`mi${it.danger ? ' danger' : ''}`}
      data-menu-id={it.id}
      disabled={it.disabled}
      title={it.later ? `Arrives in ${it.later}` : undefined}
      onClick={() => runMenuItem(it.id)}
    >
      <span>{it.label}</span>
      {it.later ? <span class="later">{it.later}</span> : it.key ? <span class="k">{it.key}</span> : null}
    </button>
  );
}
