import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Screen, Widget } from '../../../core/schema';
import { effectiveWidget } from '../../../engine/ui/layout';
import type { ScreenHost } from '../../../engine/ui/ScreenRenderer';
import { resolveScreen, screenOfKind } from '../../../engine/ui/screens';
import type { EditorState } from '../../state';
import { CanvasHandles, mainScreen } from './CanvasHandles';
import { DeviceFrame } from './DeviceFrames';
import {
  ALL_SIZES,
  canvasPortrait,
  DEVICES,
  type Device,
  nearestAnchor,
  replaceAt,
  rotated,
  SAMPLE,
  setLayout,
  widgetAt,
} from './model';
import { WIDGET_DRAG } from './Palette';

/**
 * The screen canvas (board 6, P31): device frames in both orientations and any custom size, the selected
 * widget's move and size handles, widgets dropped from the palette, and Check all sizes.
 */
export function ScreenCanvas({
  ed,
  screen,
  onPlay,
  onChange,
  onDrop,
  artUrl,
  artFont,
}: {
  ed: EditorState;
  screen: Screen;
  onPlay: () => void;
  /** a widget changed on the canvas (one undo step) */
  onChange: (path: string, w: Widget, label: string) => void;
  /** a widget type dropped from the palette at an anchor and offset */
  onDrop: (type: Widget['type'], anchor: [number, number], offset: [number, number], portrait: boolean) => void;
  artUrl: (id: string) => string | undefined;
  artFont: (ref: string) => string | undefined;
}) {
  const [deviceId, setDeviceId] = useState<string>('desktop');
  const [upright, setUpright] = useState(false);
  const [custom, setCustom] = useState({ w: 1366, h: 768 });
  const [sample, setSample] = useState(true);
  const [overHud, setOverHud] = useState(screen.kind === 'pause' || screen.kind === 'dialogue');
  const [checking, setChecking] = useState(false);
  const [draft, setDraft] = useState<Widget | null>(null);
  const path = ed.widgetPath.value ?? '';
  const base: Device =
    deviceId === 'custom'
      ? {
          id: 'custom',
          name: `Custom ${custom.w}×${custom.h}`,
          w: custom.w,
          h: custom.h,
          safe: { top: 0, right: 0, bottom: 0, left: 0 },
        }
      : (DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]!);
  const dev = upright && base.w > base.h ? rotated(base) : base;
  const portrait = dev.h > dev.w;
  useEffect(() => {
    canvasPortrait.value = portrait;
  }, [portrait]);
  useEffect(
    () => () => {
      canvasPortrait.value = false;
    },
    [],
  );
  const host: ScreenHost = {
    lookup: (n) => (sample ? SAMPLE[n] : `{${n}}`),
    run: () => {},
    sound: (id) => ed.audio.previewEvent(id),
    media: (ref) => ed.media?.url(ref),
    art: artUrl,
    font: artFont,
    touch: dev.id !== 'desktop' && dev.id !== 'laptop',
    preview: { selected: path, select: (p) => (ed.widgetPath.value = p) },
  };
  const hud = screenOfKind(ed.store, 'hud');
  const under = overHud && hud && hud.id !== screen.id ? [resolveScreen(ed.store, hud.id)!] : [];
  const widget = widgetAt(screen.root, path);
  const shown = draft && widget ? { ...screen, root: replaceAt(screen.root, path, draft) } : screen;

  // arrows nudge the selected widget (Shift: 8 px)
  const nudge = (e: KeyboardEvent) => {
    if (!widget || path === '' || (e.target as HTMLElement).closest('input,textarea,select')) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    const eff = effectiveWidget(widget, portrait);
    if (!eff.anchor || eff.pin) return;
    e.preventDefault();
    const step = e.shiftKey ? 8 : 1;
    const o = eff.offset ?? [0, 0];
    onChange(path, setLayout(widget, portrait, { offset: [o[0] + d[0]! * step, o[1] + d[1]! * step] }), 'Nudge widget');
  };

  return (
    <>
      <div class="studio-tools" role="toolbar" aria-label="Screen canvas">
        <span class="group" role="radiogroup" aria-label="Device">
          {[...DEVICES, { id: 'custom', name: 'Custom' } as Device].map((d) => (
            <button
              type="button"
              role="radio"
              aria-checked={deviceId === d.id}
              class={`btn ${deviceId === d.id ? 'on' : ''}`}
              onClick={() => setDeviceId(d.id)}
            >
              {d.name}
            </button>
          ))}
        </span>
        {deviceId === 'custom' && (
          <span class="row small" style={{ gap: '4px' }}>
            <input
              class="inp mono"
              type="number"
              min="200"
              max="4000"
              aria-label="Custom width"
              style={{ width: '70px' }}
              value={custom.w}
              onChange={(e) =>
                setCustom({ ...custom, w: Math.max(200, Number((e.target as HTMLInputElement).value) || 1280) })
              }
            />
            ×
            <input
              class="inp mono"
              type="number"
              min="200"
              max="4000"
              aria-label="Custom height"
              style={{ width: '70px' }}
              value={custom.h}
              onChange={(e) =>
                setCustom({ ...custom, h: Math.max(200, Number((e.target as HTMLInputElement).value) || 720) })
              }
            />
          </span>
        )}
        <button
          type="button"
          class={`btn ${upright ? 'on' : ''}`}
          aria-pressed={upright}
          data-tip="Rotate the device: see the screen held upright (portrait). Edits made upright only change the portrait layout."
          onClick={() => setUpright(!upright)}
        >
          ⟳ {upright ? 'Upright' : 'Sideways'}
        </button>
        <span class="sep" />
        <label class="row small">
          <input type="checkbox" checked={sample} onChange={(e) => setSample((e.target as HTMLInputElement).checked)} />
          Sample values
        </label>
        <label class="row small">
          <input
            type="checkbox"
            checked={overHud}
            onChange={(e) => setOverHud((e.target as HTMLInputElement).checked)}
          />
          Over the HUD
        </label>
        <button
          type="button"
          class={`btn ${checking ? 'on' : ''}`}
          aria-pressed={checking}
          data-tip="See the screen on every device both ways, with anything off screen, overlapping or cut off"
          onClick={() => setChecking(!checking)}
        >
          ✓ Check all sizes
        </button>
        <span class="sep" />
        <button type="button" class="btn go" onClick={onPlay} title="Play the game from its first screen (Ctrl F5)">
          ▶ Play from first screen
        </button>
      </div>
      {portrait && (
        <div class="sc-mode small" role="note">
          Upright: moves, sizes and anchors you change now are the portrait layout; sideways screens keep theirs.
        </div>
      )}
      <div
        class="sc-canvas"
        role="application"
        aria-label="Screen canvas: arrows nudge the selected widget"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is an application area that takes arrow keys
        tabIndex={0}
        onKeyDown={nudge}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) ed.widgetPath.value = '';
        }}
        onDragOver={(e) => {
          if (e.dataTransfer?.types.includes(WIDGET_DRAG)) e.preventDefault();
        }}
        onDrop={(e) => {
          const type = e.dataTransfer?.getData(WIDGET_DRAG) as Widget['type'] | undefined;
          const devEl = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.sc-device');
          const scr = devEl && mainScreen(devEl);
          if (!type || !scr) return;
          e.preventDefault();
          const r = scr.getBoundingClientRect();
          const fx = (e.clientX - r.left) / r.width;
          const fy = (e.clientY - r.top) / r.height;
          const anchor = nearestAnchor(fx, fy);
          const k = r.width / scr.offsetWidth || 1;
          const offset: [number, number] = [
            Math.round(((fx - anchor[0]) * r.width) / k / 8) * 8,
            Math.round(((fy - anchor[1]) * r.height) / k / 8) * 8,
          ];
          onDrop(type, anchor, offset, portrait);
        }}
      >
        <DeviceFrame
          device={dev}
          screen={shown}
          host={host}
          under={under}
          overlay={({ el, scale }) =>
            widget && (
              <CanvasHandles
                dev={el}
                scale={scale}
                path={path}
                widget={widget}
                onDraft={setDraft}
                onCommit={(w, label) => onChange(path, w, label)}
              />
            )
          }
        />
      </div>
      {checking && (
        <SizeCheck
          screen={screen}
          host={{ ...host, preview: { selected: null, select: () => {} } }}
          onPick={(d, p) => {
            const b = DEVICES.find((x) => d.id.startsWith(x.id)) ?? DEVICES[0]!;
            setDeviceId(b.id);
            setUpright(d.h > d.w);
            ed.widgetPath.value = p;
          }}
        />
      )}
      <div class="studio-foot muted small">
        Laid out at {portrait ? '720×1280 (upright)' : '1280×720'} and scaled to fit · drag widgets to move, handles to
        size · {dev.name} {dev.w}×{dev.h}
      </div>
    </>
  );
}

export type SizeIssue = { device: Device; path: string; name: string; problem: string };

/** What looks wrong on one rendered device: widgets off screen or under the notch, overlapping, or cut off. */
export function issuesIn(devEl: HTMLElement, device: Device, k: number): SizeIssue[] {
  const scr = mainScreen(devEl);
  if (!scr) return [];
  const d = devEl.getBoundingClientRect();
  const inner = {
    l: d.left + device.safe.left * k,
    t: d.top + device.safe.top * k,
    r: d.right - device.safe.right * k,
    b: d.bottom - device.safe.bottom * k,
  };
  const out: SizeIssue[] = [];
  const els = [...scr.querySelectorAll<HTMLElement>('[data-path]')].filter((el) => el.dataset.path !== '');
  const name = (el: HTMLElement) => el.dataset.widget || el.className.match(/bw-(\w+)/g)?.[1]?.slice(3) || 'widget';
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const p = el.dataset.path!;
    if (r.left < inner.l - 1 || r.top < inner.t - 1 || r.right > inner.r + 1 || r.bottom > inner.b + 1)
      out.push({
        device,
        path: p,
        name: name(el),
        problem:
          r.right < inner.l || r.left > inner.r || r.bottom < inner.t || r.top > inner.b
            ? 'off screen'
            : 'past the edge or safe area',
      });
    if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
      out.push({ device, path: p, name: name(el), problem: 'text or content cut off' });
  }
  // overlaps between widgets placed freely on the screen (not full-screen panels)
  const free = els.filter((el) => !el.dataset.path!.includes('.') && el.style.position === 'absolute');
  const area = d.width * d.height;
  for (let i = 0; i < free.length; i++)
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i]!.getBoundingClientRect();
      const b = free[j]!.getBoundingClientRect();
      if (a.width * a.height > area * 0.6 || b.width * b.height > area * 0.6) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2)
        out.push({
          device,
          path: free[i]!.dataset.path!,
          name: `${name(free[i]!)} and ${name(free[j]!)}`,
          problem: 'overlap',
        });
    }
  return out;
}

/** Every device both ways, small, with a list of problems to click. */
function SizeCheck({
  screen,
  host,
  onPick,
}: {
  screen: Screen;
  host: ScreenHost;
  onPick: (d: Device, path: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<SizeIssue[]>([]);
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      const all: SizeIssue[] = [];
      for (const el of grid.current?.querySelectorAll<HTMLElement>('.sc-device') ?? []) {
        const d = ALL_SIZES.find((x) => x.id === el.dataset.device);
        if (d) all.push(...issuesIn(el, d, el.getBoundingClientRect().width / d.w));
      }
      setIssues(all);
    }, 60);
    return () => clearTimeout(t);
  }, [screen]);
  return (
    <section class="sc-check" aria-label="Check all sizes">
      <div class="sc-check-grid" ref={grid}>
        {ALL_SIZES.map((d) => (
          <figure class="sc-check-cell">
            <div class="sc-check-frame" style={{ aspectRatio: `${d.w} / ${d.h}` }}>
              <DeviceFrame device={d} screen={screen} host={host} compact />
            </div>
            <figcaption class="small muted">
              {d.name} {issues.some((i) => i.device.id === d.id) ? '⚠' : '✓'}
            </figcaption>
          </figure>
        ))}
      </div>
      <div class="sc-check-list" role="group" aria-label="Problems">
        {issues.length ? (
          issues.map((i) => (
            <button type="button" class="link small" onClick={() => onPick(i.device, i.path)}>
              ⚠ {i.device.name}: {i.name} — {i.problem}
            </button>
          ))
        ) : (
          <span class="small">✓ Looks right on every size and both ways.</span>
        )}
      </div>
    </section>
  );
}
