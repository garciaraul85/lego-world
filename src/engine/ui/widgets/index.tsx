import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Action, Widget } from '../../../core/schema';
import { asLines, asNumber, interpolate, type Lookup } from '../bindings';
import { effectiveWidget, widgetCss } from '../layout';

/** What widgets need from the game (or from the editor preview). */
export type ScreenHost = {
  lookup: Lookup;
  /** run a button's actions */
  run(actions: readonly Action[], screen: string): void;
  sound(event: string): void;
  /** a button was pressed (logic: On screen button) */
  pressed?(screen: string, widget: string): void;
  /** text set by logic (Set screen text) for screen + widget id */
  text?(screen: string, widget: string): string | undefined;
  /** object URL of an imported image */
  media?(ref: string): string | undefined;
  minimap?(canvas: HTMLCanvasElement): void;
  slot?(name: string): ComponentChildren;
  touch: boolean;
  /** editor preview: buttons do not run, widgets are selectable */
  preview?: { selected: string | null; select(path: string): void };
  /** P31: the screen is taller than wide (portrait layouts apply) */
  portrait?: boolean;
  /** P31: URL of an art file (a background, an icon) by id */
  art?(id: string): string | undefined;
  /** P31: CSS font-family for style.font (a built-in key or art:<id>) */
  font?(ref: string): string | undefined;
  /** step 11b part 1: the game's buttons now: name, key, what each does (the Action button's live label) */
  buttons?(): { id: string; name: string; key: string; label: string; count?: number }[];
  /** step 11b part 1: the items the hero has, and the item buttons (what is in each) */
  items?(): { name: string; count: number }[];
  slots?(): { slot: number; key: string; item: string | null }[];
  /** put an item in an item button */
  equip?(slot: number, item: string): void;
  /** step 11b part 1: every button's keys and gamepad buttons, and changing one (on this device) */
  bindings?(): { id: string; name: string; keys: string; pad: string }[];
  rebind?(id: string, key: string): void;
  resetBindings?(): void;
  /** step 11 (P24 part 3): who made the game's imported files (the Credits widget lists them) */
  credits?(): { name: string; kind: string; author: string; license: string; link?: string }[];
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
      style={{ ...widgetCss(p.w), ...artCss(p), ...extra }}
      data-path={p.path}
      data-widget={p.w.id}
      data-pin={p.w.pin ? JSON.stringify(p.w.pin) : undefined}
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

/** a background picture from an art file or an imported image (style.bgArt) */
function artCss(p: WidgetProps): Record<string, string> {
  const font = typeof p.w.style?.font === 'string' ? p.host.font?.(p.w.style.font) : undefined;
  const ref = p.w.style?.bgArt;
  if (typeof ref !== 'string') return font ? { fontFamily: font } : {};
  const url = ref.startsWith('art:') ? p.host.art?.(ref.slice(4)) : p.host.media?.(ref);
  if (!url) return font ? { fontFamily: font } : {};
  const fit = p.w.style?.bgFit === 'tile' ? 'auto' : p.w.style?.bgFit === 'fit' ? 'contain' : 'cover';
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: fit,
    backgroundRepeat: p.w.style?.bgFit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
    imageRendering: p.w.style?.pixel ? 'pixelated' : 'auto',
    ...(font ? { fontFamily: font } : {}),
  };
}

/** a button's icon (style.icon: an art file or an imported picture) */
function iconOf(p: WidgetProps) {
  const ref = p.w.style?.icon;
  if (typeof ref !== 'string') return null;
  const url = ref.startsWith('art:') ? p.host.art?.(ref.slice(4)) : p.host.media?.(ref);
  return url ? <img class="bw-btn-icon" src={url} alt="" /> : null;
}

export function WidgetView(props: WidgetProps) {
  // P31: portrait screens use the widget's portrait layout
  const p = props.host.portrait ? { ...props, w: effectiveWidget(props.w, true) } : props;
  const { w, host } = p;
  if (w.touchOnly && !host.touch && !host.preview) return null;
  // P26: shown only while its value is on (Continue only when there is a save); the editor shows it always
  if (w.showIf && !host.preview) {
    const v = host.lookup(w.showIf);
    if (!v || v === 'false' || v === '0') return null;
  }
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
      const ref = typeof w.style?.src === 'string' ? w.style.src : undefined;
      const src = ref ? (ref.startsWith('art:') ? host.art?.(ref.slice(4)) : host.media?.(ref)) : undefined;
      return frame(p, '', src ? <img src={src} alt={w.label ?? ''} /> : <span class="bw-icon">{w.text ?? '🖼'}</span>);
    }
    case 'button': {
      const label = textOf(p, w.label ?? w.text ?? 'Button');
      const pv = host.preview;
      return (
        <button
          type="button"
          class={`bw-w bw-button${pv?.selected === p.path ? ' bw-sel' : ''}`}
          style={{ ...widgetCss(w), ...artCss(p) }}
          data-path={p.path}
          data-widget={w.id}
          data-pin={w.pin ? JSON.stringify(w.pin) : undefined}
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
            host.pressed?.(p.screen, w.id ?? '');
          }}
        >
          {iconOf(p)}
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
      // P9c: a bar that only shows while it is not full (stamina while guarding)
      if (w.style?.hideFull && k >= 1 && !host.preview) return null;
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
    case 'video':
      return frame(p, '', <VideoView p={p} />);
    case 'buttons': {
      // step 11b part 1: the game's buttons, like Zelda's corner of the screen
      const list =
        host.buttons?.() ??
        (host.preview
          ? [
              { id: 'attack', name: 'Attack', key: 'F', label: 'Attack' },
              { id: 'action', name: 'Action', key: 'E', label: 'Open' },
              { id: 'item1', name: 'Item 1', key: 'J', label: 'Bow', count: 12 },
              { id: 'item2', name: 'Item 2', key: 'K', label: '' },
            ]
          : []);
      return frame(
        p,
        '',
        list.map((b) => (
          <div class={`bw-btn-slot bw-btn-${b.id.replace(/\d$/, '')}`} data-button={b.id}>
            <span class="bw-btn-key">{b.key}</span>
            <span class="bw-btn-label">{b.label || '—'}</span>
            {b.count !== undefined && <span class="bw-btn-count">{b.count}</span>}
          </div>
        )),
      );
    }
    case 'items': {
      // step 11b part 1: the item menu: each item the hero has, and a button to put it in each item button
      const items = host.items?.() ?? (host.preview ? [{ name: 'Bow', count: 12 }, { name: 'Bomb', count: 5 }] : []);
      const slots =
        host.slots?.() ??
        (host.preview
          ? [
              { slot: 1, key: 'J', item: 'Bow' },
              { slot: 2, key: 'K', item: null },
            ]
          : []);
      return frame(p, '', [
        <div class="bw-items-slots">
          {slots.map((sl) => (
            <span class="bw-btn-slot">
              <span class="bw-btn-key">{sl.key}</span>
              <span class="bw-btn-label">{sl.item ?? '—'}</span>
            </span>
          ))}
        </div>,
        items.length ? (
          items.map((it) => (
            <div class="bw-item-row">
              <span class="bw-item-name">
                {it.name} <span class="bw-btn-count">×{it.count}</span>
              </span>
              {slots.map((sl) => (
                <button
                  type="button"
                  class={`bw-item-put${sl.item === it.name ? ' on' : ''}`}
                  aria-label={`Put ${it.name} in item button ${sl.slot} (${sl.key})`}
                  onClick={() => !host.preview && host.equip?.(sl.slot, it.name)}
                >
                  {sl.key}
                </button>
              ))}
            </div>
          ))
        ) : (
          <div class="bw-item-row">Nothing yet: items the hero finds show here.</div>
        ),
      ]);
    }
    case 'controls':
      return frame(p, '', <ControlsList host={host} />);
    case 'credits': {
      const rows = host.credits?.() ?? [];
      const lines = (w.text ?? '').split('\n').filter((x) => x.trim());
      return frame(p, '', [
        ...lines.map((l) => <div class="bw-credit-line">{interpolate(l, host.lookup)}</div>),
        ...rows.map((r) => (
          <div class="bw-credit">
            <b>{r.name}</b>
            {r.author ? ` by ${r.author}` : ''}
            {r.license ? <span class="bw-credit-license"> · {r.license}</span> : null}
          </div>
        )),
        !rows.length && host.preview ? (
          <div class="bw-credit muted">Imported files with a credit (File › Media library) are listed here.</div>
        ) : null,
      ]);
    }
  }
}

/** step 11b part 1: every button and its keys; click one, then press the key it should be */
function ControlsList({ host }: { host: ScreenHost }) {
  const [wait, setWait] = useState<string | null>(null);
  useEffect(() => {
    if (!wait) return;
    const key = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key !== 'Escape') host.rebind?.(wait, e.key.toLowerCase());
      setWait(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [wait]);
  const list =
    host.bindings?.() ??
    (host.preview
      ? [
          { id: 'action', name: 'Action', keys: 'E', pad: 'A' },
          { id: 'attack', name: 'Attack', keys: 'F', pad: 'X' },
        ]
      : []);
  return (
    <>
      {list.map((b) => (
        <div class="bw-bind-row">
          <span class="bw-bind-name">{b.name}</span>
          <button
            type="button"
            class={`bw-bind-key${wait === b.id ? ' on' : ''}`}
            aria-label={`${b.name}: ${b.keys}. Press to change`}
            onClick={() => !host.preview && setWait(b.id)}
          >
            {wait === b.id ? 'Press a key…' : b.keys}
          </button>
          <span class="bw-bind-pad">{b.pad}</span>
        </div>
      ))}
      <button type="button" class="bw-bind-reset" onClick={() => !host.preview && host.resetBindings?.()}>
        Back to the game’s keys
      </button>
    </>
  );
}

/**
 * Step 11 (P24 part 3): an imported video (style.src). It plays when the screen shows; with style.loop it repeats,
 * otherwise its "when it ends" actions run (also when skipped with a click, Enter, Space or Escape, if style.skip).
 * Sound is off unless style.sound; a browser that blocks sound before the first click plays it muted.
 */
function VideoView({ p }: { p: WidgetProps }) {
  const { w, host } = p;
  const ref = useRef<HTMLVideoElement>(null);
  const ended = useRef(false);
  const src = typeof w.style?.src === 'string' ? host.media?.(w.style.src) : undefined;
  const loop = !!w.style?.loop;
  const end = () => {
    if (ended.current || host.preview) return;
    ended.current = true;
    if (w.onEnd?.length) host.run(w.onEnd, p.screen);
  };
  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    ended.current = false;
    v.muted = !w.style?.sound || !!host.preview;
    const play = v.play();
    play?.catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [src, w.style?.sound]);
  useEffect(() => {
    if (!w.style?.skip || host.preview) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') end();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [w.style?.skip]);
  if (!src) return <span class="bw-icon">{host.preview ? '🎬' : ''}</span>;
  return (
    <video
      ref={ref}
      class="bw-video-el"
      src={src}
      loop={loop}
      playsInline
      muted
      autoPlay
      aria-label={w.label ?? 'Video'}
      style={{ objectFit: w.style?.fit === 'fit' ? 'contain' : 'cover' }}
      onEnded={loop ? undefined : end}
      onClick={w.style?.skip ? end : undefined}
    />
  );
}

function Minimap({ host }: { host: ScreenHost }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) host.minimap?.(ref.current);
  });
  return <canvas ref={ref} width={150} height={150} class="bw-minimap" aria-label="Minimap" />;
}
