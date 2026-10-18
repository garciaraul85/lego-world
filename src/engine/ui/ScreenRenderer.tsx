import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Screen, Widget } from '../../core/schema';
import { type Insets, NO_INSETS, pinOrder, pinPlace, screenScale } from './layout';
import { type ScreenHost, WidgetView } from './widgets';

export type { ScreenHost } from './widgets';

/** One screen, laid out at the 1280×720 reference inside a box of the given real size. */
export function ScreenView({
  screen,
  host,
  scale,
}: {
  screen: Screen;
  host: ScreenHost;
  scale: ReturnType<typeof screenScale>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // P31: pinned widgets go next to their targets once everything else is laid out
  useLayoutEffect(() => placePins(ref.current, scale.scale));
  const h = scale.portrait ? { ...host, portrait: true } : host;
  return (
    <div
      ref={ref}
      class={`bw-screen bw-kind-${screen.kind}${screen.pausesGame ? ' bw-pausing' : ''}${scale.portrait ? ' bw-portrait' : ''}`}
      data-screen={screen.id}
      role="region"
      aria-label={screen.name}
      style={{
        position: 'absolute',
        left: `${scale.x}px`,
        top: `${scale.y}px`,
        width: `${scale.vw}px`,
        height: `${scale.vh}px`,
        transform: `scale(${scale.scale})`,
        transformOrigin: '0 0',
      }}
    >
      <WidgetView w={screen.root} path="" screen={screen.id} host={h} />
    </div>
  );
}

/** Places every pinned widget of a screen next to its target (targets first; a missing target leaves it hidden). */
export function placePins(root: HTMLElement | null, scale: number) {
  if (!root) return;
  const pinned = [...root.querySelectorAll<HTMLElement>('[data-pin]')];
  if (!pinned.length) return;
  const byId = new Map<string, HTMLElement>();
  for (const el of root.querySelectorAll<HTMLElement>('[data-widget]')) byId.set(el.dataset.widget!, el);
  const pins = new Map<string, string>();
  const info = new Map<string, { el: HTMLElement; pin: NonNullable<Widget['pin']> }>();
  pinned.forEach((el, i) => {
    const pin = JSON.parse(el.dataset.pin!) as NonNullable<Widget['pin']>;
    const key = el.dataset.widget || `#${i}`;
    pins.set(key, pin.to);
    info.set(key, { el, pin });
  });
  const k = scale || 1;
  for (const key of pinOrder(pins)) {
    const { el, pin } = info.get(key)!;
    const target = byId.get(pin.to);
    const parent = el.offsetParent as HTMLElement | null;
    if (!target || !parent || target === el) {
      el.style.visibility = 'hidden';
      continue;
    }
    const pr = parent.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const t = { x: (tr.left - pr.left) / k, y: (tr.top - pr.top) / k, w: tr.width / k, h: tr.height / k };
    const at = pinPlace(pin, t, el.offsetWidth, el.offsetHeight);
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    el.style.visibility = '';
  }
}

/**
 * Screens render from JSON as DOM over the game canvas (P5.7), bottom to top. Keyboard and gamepad
 * focus follow tree order; arrows move between buttons of the top screen.
 */
export function ScreenLayer({
  screens,
  host,
  safe = NO_INSETS,
  tick,
  textScale = 1,
}: {
  screens: Screen[];
  host: ScreenHost;
  safe?: Insets;
  /** changes every frame so bound values refresh */
  tick?: number;
  /** P26: the player's text size (1, or 1.25 for large) */
  textScale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  void tick;
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);
  const top = screens.at(-1);
  // focus the first button when a menu screen comes up
  useEffect(() => {
    if (!top || host.preview) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-screen="${top.id}"] button.bw-button`);
    if (el && top.pausesGame) el.focus({ preventScroll: true });
  }, [top?.id]);
  const topId = useRef<string | undefined>(undefined);
  topId.current = top?.id;
  useEffect(() => {
    const el = ref.current!;
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (!(e.target as HTMLElement).closest?.('.bw-button')) return;
      moveFocus(el, topId.current, e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1);
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);
  const scale = screenScale(size.w, size.h, safe);
  return (
    <div ref={ref} class="bw-layer" style={textScale !== 1 ? { '--bw-text': String(textScale) } : undefined}>
      {screens.map((s) => (
        <ScreenView key={s.id} screen={s} host={host} scale={scale} />
      ))}
    </div>
  );
}

/** Moves focus to the next/previous button of the top screen (keyboard arrows, gamepad d-pad). */
export function moveFocus(layer: HTMLElement, screenId: string | undefined, dir: 1 | -1) {
  if (!screenId) return;
  const list = [...layer.querySelectorAll<HTMLElement>(`[data-screen="${screenId}"] button.bw-button`)];
  if (!list.length) return;
  const i = list.indexOf(document.activeElement as HTMLElement);
  list[(i + dir + list.length) % list.length]!.focus({ preventScroll: true });
}
