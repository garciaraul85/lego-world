import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Widget } from '../../../core/schema';
import { effectiveWidget, type screenScale } from '../../../engine/ui/layout';
import { setLayout } from './model';

/**
 * P31: move and size screen widgets on the canvas, like world assets in the 3D view. The selected widget
 * gets a box: drag inside it to move (its offset from its anchor), drag one of 8 handles to size it (the far
 * edge stays put). Edges and centres snap to other widgets and the screen (guide lines show it), else to an
 * 8 px grid; hold Alt for no snapping. One undo step per drag.
 */
type Box = { x: number; y: number; w: number; h: number };
type HandleId = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_PX = 6;

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

export function CanvasHandles({
  dev,
  scale,
  path,
  widget,
  onDraft,
  onCommit,
}: {
  dev: HTMLDivElement | null;
  scale: ReturnType<typeof screenScale>;
  path: string;
  widget: Widget;
  onDraft: (w: Widget | null) => void;
  onCommit: (w: Widget, label: string) => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [tag, setTag] = useState<string | null>(null);
  const drag = useRef<{
    kind: 'move' | HandleId;
    sx: number;
    sy: number;
    box: Box;
    w0: number;
    h0: number;
    o0: [number, number];
    targets: { x: number[]; y: number[] };
  } | null>(null);
  const last = useRef<Widget | null>(null);
  const portrait = !!scale.portrait;
  const eff = effectiveWidget(widget, portrait);
  const k = scale.scale || 1;

  // where the selected widget is now (after every render, so it follows edits and window sizes)
  useLayoutEffect(() => {
    if (!dev || path === '') return setBox(null);
    const el = mainScreen(dev)?.querySelector<HTMLElement>(`[data-path="${path}"]`);
    if (!el) return setBox(null);
    const d = dev.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height };
    if (
      !box ||
      Math.abs(box.x - next.x) + Math.abs(box.y - next.y) + Math.abs(box.w - next.w) + Math.abs(box.h - next.h) > 0.5
    )
      setBox(next);
  });
  if (!box || path === '') return null;
  const movable = !!eff.anchor && !eff.pin;

  const start = (kind: 'move' | HandleId, e: PointerEvent) => {
    if (kind === 'move' && !movable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      sx: e.clientX,
      sy: e.clientY,
      box,
      w0: num(eff.style?.w) ?? box.w / k,
      h0: num(eff.style?.h) ?? box.h / k,
      o0: [eff.offset?.[0] ?? 0, eff.offset?.[1] ?? 0],
      targets: snapTargets(dev!, path),
    };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    let dxs = e.clientX - d.sx;
    let dys = e.clientY - d.sy;
    const free = e.altKey;
    const gx: number[] = [];
    const gy: number[] = [];
    // snap the moving edges (screen px) to other widgets and the screen
    const snapAxis = (lines: number[], targets: number[], out: number[]) => {
      let best: { d: number; t: number } | null = null;
      for (const l of lines)
        for (const t of targets) {
          const dd = t - l;
          if (Math.abs(dd) <= SNAP_PX && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, t };
        }
      if (best) out.push(best.t);
      return best?.d ?? 0;
    };
    const b = d.box;
    let next: Widget;
    let label: string;
    if (d.kind === 'move') {
      if (!free) {
        dxs += snapAxis([b.x + dxs, b.x + dxs + b.w / 2, b.x + dxs + b.w], d.targets.x, gx);
        dys += snapAxis([b.y + dys, b.y + dys + b.h / 2, b.y + dys + b.h], d.targets.y, gy);
      }
      let ox = d.o0[0] + dxs / k;
      let oy = d.o0[1] + dys / k;
      ox = !free && !gx.length ? Math.round(ox / 8) * 8 : Math.round(ox);
      oy = !free && !gy.length ? Math.round(oy / 8) * 8 : Math.round(oy);
      next = setLayout(widget, portrait, { offset: [ox, oy] });
      label = `${ox}, ${oy}`;
    } else {
      const h = d.kind;
      if (!free) {
        if (h.includes('e')) dxs += snapAxis([b.x + b.w + dxs], d.targets.x, gx);
        if (h.includes('w')) dxs += snapAxis([b.x + dxs], d.targets.x, gx);
        if (h.includes('s')) dys += snapAxis([b.y + b.h + dys], d.targets.y, gy);
        if (h.includes('n')) dys += snapAxis([b.y + dys], d.targets.y, gy);
      }
      const [ax, ay] = eff.anchor ?? [0, 0];
      let w = d.w0;
      let hh = d.h0;
      let [ox, oy] = d.o0;
      const round = (v: number, snapped: boolean) => (free || snapped ? Math.round(v) : Math.round(v / 4) * 4);
      if (h.includes('e')) w = Math.max(8, round(d.w0 + dxs / k, gx.length > 0));
      if (h.includes('w')) w = Math.max(8, round(d.w0 - dxs / k, gx.length > 0));
      if (h.includes('s')) hh = Math.max(8, round(d.h0 + dys / k, gy.length > 0));
      if (h.includes('n')) hh = Math.max(8, round(d.h0 - dys / k, gy.length > 0));
      // keep the far edge where it was: an anchored widget grows around its anchor point
      if (eff.anchor) {
        if (h.includes('e')) ox = d.o0[0] + ax * (w - d.w0);
        if (h.includes('w')) ox = d.o0[0] - (1 - ax) * (w - d.w0);
        if (h.includes('s')) oy = d.o0[1] + ay * (hh - d.h0);
        if (h.includes('n')) oy = d.o0[1] - (1 - ay) * (hh - d.h0);
      }
      const style: Record<string, number> = {};
      if (h.includes('e') || h.includes('w')) style.w = w;
      if (h.includes('n') || h.includes('s')) style.h = hh;
      next = setLayout(widget, portrait, {
        style,
        ...(eff.anchor ? { offset: [Math.round(ox), Math.round(oy)] as [number, number] } : {}),
      });
      label = `${Math.round(w)} × ${Math.round(hh)}`;
    }
    setGuides({ x: gx, y: gy });
    setTag(label);
    last.current = next;
    onDraft(next);
  };

  const end = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    setTag(null);
    if (!d) return;
    const moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) >= 2;
    const final = last.current;
    last.current = null;
    onDraft(null);
    // the release commits exactly what the draft showed, as one change
    if (moved && final) onCommit(final, d.kind === 'move' ? 'Move widget' : 'Resize widget');
  };

  return (
    <div class="sc-handles" aria-hidden="false">
      {guides.x.map((x) => (
        <div class="sc-guide v" style={{ left: `${x}px` }} />
      ))}
      {guides.y.map((y) => (
        <div class="sc-guide h" style={{ top: `${y}px` }} />
      ))}
      <div
        class={`sc-box${movable ? ' movable' : ''}`}
        role="group"
        aria-label={`Selected ${widget.type}${widget.id ? ` ${widget.id}` : ''}: drag to move, handles to size`}
        style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }}
        data-tip={
          movable
            ? 'Drag to move · handles to size · Alt: no snapping · arrows nudge'
            : eff.pin
              ? `Pinned next to ${eff.pin.to}: change it in Properties, or size it with the handles`
              : 'In a row or column: size it with the handles; give it an anchor to place it freely'
        }
        onPointerDown={(e) => start('move', e as unknown as PointerEvent)}
        onPointerMove={(e) => move(e as unknown as PointerEvent)}
        onPointerUp={(e) => end(e as unknown as PointerEvent)}
      >
        {HANDLES.map((h) => (
          <span
            class={`sc-h sc-h-${h}`}
            aria-hidden="true"
            title={`Size from the ${h} handle`}
            onPointerDown={(e) => start(h, e as unknown as PointerEvent)}
            onPointerMove={(e) => move(e as unknown as PointerEvent)}
            onPointerUp={(e) => end(e as unknown as PointerEvent)}
          />
        ))}
        {eff.pin && (
          <span class="sc-pin-chip">
            ⛓ {eff.pin.side} {eff.pin.to}
          </span>
        )}
      </div>
      {tag && (
        <div class="sc-tag mono" style={{ left: `${box.x}px`, top: `${Math.max(0, box.y - 22)}px` }}>
          {tag}
        </div>
      )}
    </div>
  );
}

/** The screen being edited (not the HUD drawn under it). */
export function mainScreen(dev: HTMLElement): HTMLElement | null {
  return dev.querySelector<HTMLElement>(':scope > .bw-screen');
}

/** Lines to snap to (device px): other widgets' edges and centres, and the screen's edges and centre. */
function snapTargets(dev: HTMLElement, path: string): { x: number[]; y: number[] } {
  const d = dev.getBoundingClientRect();
  const x = [0, d.width / 2, d.width];
  const y = [0, d.height / 2, d.height];
  const screen = mainScreen(dev);
  for (const el of screen?.querySelectorAll<HTMLElement>('[data-path]') ?? []) {
    const p = el.dataset.path ?? '';
    // not itself, its own children, or what contains it
    if (p === '' || p === path || p.startsWith(`${path}.`) || path.startsWith(`${p}.`)) continue;
    const r = el.getBoundingClientRect();
    x.push(r.left - d.left, r.left - d.left + r.width / 2, r.right - d.left);
    y.push(r.top - d.top, r.top - d.top + r.height / 2, r.bottom - d.top);
  }
  return { x, y };
}
