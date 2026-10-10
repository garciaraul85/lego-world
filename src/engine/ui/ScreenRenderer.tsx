import { useEffect, useRef, useState } from 'preact/hooks';
import type { Screen } from '../../core/schema';
import { type Insets, NO_INSETS, screenScale } from './layout';
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
  return (
    <div
      class={`bw-screen bw-kind-${screen.kind}${screen.pausesGame ? ' bw-pausing' : ''}`}
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
      <WidgetView w={screen.root} path="" screen={screen.id} host={host} />
    </div>
  );
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
}: {
  screens: Screen[];
  host: ScreenHost;
  safe?: Insets;
  /** changes every frame so bound values refresh */
  tick?: number;
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
    <div ref={ref} class="bw-layer">
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
