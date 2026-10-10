import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Action, Widget } from '../../../core/schema';
import { asLines, asNumber, interpolate, type Lookup } from '../bindings';
import { widgetCss } from '../layout';

/** What widgets need from the game (or from the editor preview). */
export type ScreenHost = {
  lookup: Lookup;
  /** run a button's actions */
  run(actions: readonly Action[], screen: string): void;
  sound(event: string): void;
  /** text set by logic (Set screen text) for screen + widget id */
  text?(screen: string, widget: string): string | undefined;
  /** object URL of an imported image */
  media?(ref: string): string | undefined;
  minimap?(canvas: HTMLCanvasElement): void;
  slot?(name: string): ComponentChildren;
  touch: boolean;
  /** editor preview: buttons do not run, widgets are selectable */
  preview?: { selected: string | null; select(path: string): void };
};

export type WidgetProps = { w: Widget; path: string; screen: string; host: ScreenHost };

const CLICK = 'snd_uiclick000';

function textOf(p: WidgetProps, raw: string | undefined): string {
  const over = p.w.id ? p.host.text?.(p.screen, p.w.id) : undefined;
  return interpolate(over ?? raw ?? '', p.host.lookup);
}

function frame(p: WidgetProps, cls: string, children: ComponentChildren, extra: Record<string, string | number> = {}) {
  const pv = p.host.preview;
  const sel = pv?.selected === p.path;
  return (
    <div
      class={`bw-w bw-${p.w.type} ${cls}${sel ? ' bw-sel' : ''}`}
      style={{ ...widgetCss(p.w), ...extra }}
      data-path={p.path}
      data-widget={p.w.id}
      onPointerDown={
        pv
          ? (e) => {
              e.stopPropagation();
              pv.select(p.path);
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function WidgetView(p: WidgetProps) {
  const { w, host } = p;
  if (w.touchOnly && !host.touch && !host.preview) return null;
  switch (w.type) {
    case 'panel':
      return frame(
        p,
        '',
        (w.children ?? []).map((c, i) => (
          <WidgetView
            key={c.id ?? i}
            w={c}
            path={p.path ? `${p.path}.${i}` : String(i)}
            screen={p.screen}
            host={host}
          />
        )),
        p.path === '' ? { position: 'absolute', inset: 0 } : {},
      );
    case 'text': {
      const t = textOf(p, w.text);
      if (!t && w.style?.hideEmpty && !host.preview) return null;
      return frame(p, '', t || (host.preview ? (w.text ?? '') : ''));
    }
    case 'image': {
      const src = typeof w.style?.src === 'string' ? host.media?.(w.style.src) : undefined;
      return frame(p, '', src ? <img src={src} alt={w.label ?? ''} /> : <span class="bw-icon">{w.text ?? '🖼'}</span>);
    }
    case 'button': {
      const label = textOf(p, w.label ?? w.text ?? 'Button');
      const pv = host.preview;
      return (
        <button
          type="button"
          class={`bw-w bw-button${pv?.selected === p.path ? ' bw-sel' : ''}`}
          style={widgetCss(w)}
          data-path={p.path}
          data-widget={w.id}
          onPointerDown={
            pv
              ? (e) => {
                  e.stopPropagation();
                  pv.select(p.path);
                }
              : undefined
          }
          onClick={() => {
            if (pv) return;
            host.sound(w.sound ?? CLICK);
            if (w.onPress?.length) host.run(w.onPress, p.screen);
          }}
        >
          {label}
        </button>
      );
    }
    case 'hearts': {
      const [cur, max] = w.bind ?? ['hp', 'maxHp'];
      const n = Math.max(0, Math.round(asNumber(host.lookup(cur ?? 'hp'), 3)));
      const m = Math.max(n, Math.min(20, Math.round(asNumber(host.lookup(max ?? 'maxHp'), 3))));
      return frame(p, '', [
        ...Array.from({ length: m }, (_, i) => (
          <span class={i < n ? 'bw-heart on' : 'bw-heart'} aria-hidden="true">
            {i < n ? '♥' : '♡'}
          </span>
        )),
        <span class="bw-sr">{`${n} of ${m} hearts`}</span>,
      ]);
    }
    case 'bar': {
      const [cur, max] = w.bind ?? [];
      const v = asNumber(cur ? host.lookup(cur) : 0);
      const m = Math.max(0.0001, asNumber(max ? host.lookup(max) : (w.style?.max ?? 100), 100));
      const k = Math.max(0, Math.min(1, v / m));
      const color = typeof w.style?.color === 'string' ? w.style.color : '#4ade80';
      return frame(
        p,
        '',
        [
          <div class="bw-bar-fill" style={{ width: `${k * 100}%`, background: color }} />,
          w.label ? <span class="bw-bar-label">{interpolate(w.label, host.lookup)}</span> : null,
        ],
        { color: '#fff' },
      );
    }
    case 'list': {
      const lines = asLines(host.lookup(w.bind?.[0] ?? ''));
      const max = asNumber(w.style?.max, 8);
      if (!lines.length && w.style?.hideEmpty && !host.preview) return null;
      return frame(
        p,
        '',
        (lines.length ? lines : host.preview ? [`{${w.bind?.[0] ?? 'list'}}`] : [])
          .slice(0, max)
          .map((l) => <div class="bw-line">{l}</div>),
      );
    }
    case 'dialogue': {
      const [sp, tx] = w.bind ?? ['dialogue.speaker', 'dialogue.text'];
      const speaker = String(host.lookup(sp ?? '') ?? '');
      const text = String(host.lookup(tx ?? '') ?? '');
      if (!text && !host.preview) return null;
      return frame(p, '', [
        <div class="bw-speaker">{speaker || (host.preview ? 'Speaker' : '')}</div>,
        <div class="bw-say">{text || (host.preview ? 'What they say appears here.' : '')}</div>,
        <div class="bw-more">T to close</div>,
      ]);
    }
    case 'minimap':
      return frame(p, '', <Minimap host={host} />);
    case 'slot':
      return frame(
        p,
        '',
        host.slot?.(w.label ?? w.id ?? '') ?? (host.preview ? <span>slot · {w.label ?? w.id}</span> : null),
      );
  }
}

function Minimap({ host }: { host: ScreenHost }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) host.minimap?.(ref.current);
  });
  return <canvas ref={ref} width={150} height={150} class="bw-minimap" aria-label="Minimap" />;
}
