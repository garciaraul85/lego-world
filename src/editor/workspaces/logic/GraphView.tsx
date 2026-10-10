import { useEffect, useRef, useState } from 'preact/hooks';
import { canConnect, nodeDef, type PinDef } from '../../../core/logic/catalog';
import { type Edge, edgeError } from '../../../core/logic/graph';
import type { LogicGraph } from '../../../core/schema';
import type { EditorState } from '../../state';
import { argChoices, CAT_COLOR, HEAD, NODE_W, nodeHeight, PIN_COLOR, pinPos, ROW } from './model';

type View = { x: number; y: number; k: number };
type DragWire = { node: string; pin: string; side: 'in' | 'out'; type: PinDef['type']; x: number; y: number };
const views = new Map<string, View>();

/** Short text under a node's pins: its settings (zone, variable, asset...). */
function summary(ed: EditorState, n: LogicGraph['nodes'][number]): string {
  const def = nodeDef(n.type);
  if (!def?.args?.length || def.kind === 'note') return '';
  return def.args
    .map((a) => {
      const v = n.args?.[a.name];
      if (v === undefined || v === '') return a.optional ? '' : `${a.label}: ?`;
      const label = argChoices(ed, a.kind)?.find((c) => c.value === v)?.label ?? String(v);
      return `${a.label}: ${label}`;
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * The node canvas (P4.3): pan (drag the background), zoom (wheel), drag nodes, wire pins by dragging
 * (incompatible pins are refused with the reason), click a wire to select it, Delete removes, F9
 * toggles a breakpoint. The minimap jumps around big graphs.
 */
export function GraphView({
  ed,
  graph,
  selected,
  setSelected,
  highlight,
}: {
  ed: EditorState;
  graph: LogicGraph;
  selected: ReadonlySet<string>;
  setSelected: (s: Set<string>) => void;
  highlight: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => views.get(graph.id) ?? { x: 40, y: 40, k: 1 });
  const [moving, setMoving] = useState<{ dx: number; dy: number } | null>(null);
  const [wire, setWire] = useState<DragWire | null>(null);
  const [edgeSel, setEdgeSel] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const bps = ed.breakpoints.value;
  useEffect(() => {
    views.set(graph.id, view);
  }, [view, graph.id]);
  useEffect(() => {
    setView(views.get(graph.id) ?? { x: 40, y: 40, k: 1 });
    setEdgeSel(null);
  }, [graph.id]);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 2500);
    return () => clearTimeout(t);
  }, [tip]);

  const toWorld = (cx: number, cy: number): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k];
  };
  const exec = (type: string, payload: Record<string, unknown>, label?: string) =>
    ed.exec({ type, payload: { graph: graph.id, ...payload } }, label ? { label } : {});

  // ---------- background: pan and box-free select ----------
  const onBgDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.lg-node,.lg-pin,.lg-edge,.lg-mini')) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    ref.current?.focus();
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    let moved = false;
    const move = (m: PointerEvent) => {
      if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 3) moved = true;
      setView((v) => ({ ...v, x: start.vx + m.clientX - start.x, y: start.vy + m.clientY - start.y }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (!moved) {
        setSelected(new Set());
        setEdgeSel(null);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView((v) => {
      const k = Math.max(0.25, Math.min(2, v.k * Math.exp(-e.deltaY * 0.0015)));
      return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k };
    });
  };
  useEffect(() => {
    const el = ref.current!;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- nodes: select and drag ----------
  const onNodeDown = (e: PointerEvent, id: string) => {
    if ((e.target as HTMLElement).closest('.lg-pin,input,textarea,select,button')) return;
    e.stopPropagation();
    ref.current?.focus();
    const sel = selected.has(id) ? new Set(selected) : e.shiftKey ? new Set([...selected, id]) : new Set([id]);
    setSelected(sel);
    setEdgeSel(null);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let d = { dx: 0, dy: 0 };
    const move = (m: PointerEvent) => {
      d = { dx: (m.clientX - start.x) / view.k, dy: (m.clientY - start.y) / view.k };
      setMoving(d);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setMoving(null);
      if (Math.hypot(d.dx, d.dy) < 2) return;
      const snap = (v: number) => Math.round(v / 10) * 10;
      exec('logic.moveNodes', {
        moves: graph.nodes
          .filter((n) => sel.has(n.id))
          .map((n) => ({ id: n.id, pos: [snap(n.pos[0] + d.dx), snap(n.pos[1] + d.dy)] })),
      });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const posOf = (n: LogicGraph['nodes'][number]) =>
    moving && selected.has(n.id) ? { ...n, pos: [n.pos[0] + moving.dx, n.pos[1] + moving.dy] as [number, number] } : n;

  // ---------- wires ----------
  const onPinDown = (e: PointerEvent, node: string, pin: PinDef, side: 'in' | 'out') => {
    e.stopPropagation();
    e.preventDefault();
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const [x, y] = toWorld(e.clientX, e.clientY);
    // dragging from a connected data input picks its wire up
    if (side === 'in' && pin.type !== 'exec') {
      const old = graph.edges.find((x) => x[2] === node && x[3] === pin.name);
      if (old) {
        exec('logic.disconnect', { edge: old }, 'Disconnect');
        setWire({ node: old[0], pin: old[1], side: 'out', type: pin.type, x, y });
      } else setWire({ node, pin: pin.name, side, type: pin.type, x, y });
    } else setWire({ node, pin: pin.name, side, type: pin.type, x, y });
    const move = (m: PointerEvent) => {
      const [wx, wy] = toWorld(m.clientX, m.clientY);
      setWire((w) => (w ? { ...w, x: wx, y: wy } : w));
    };
    const up = (u: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setWire((w) => {
        if (!w) return null;
        const hit = (document.elementFromPoint(u.clientX, u.clientY) as HTMLElement | null)?.closest('[data-pin]');
        const v = hit?.getAttribute('data-pin');
        if (!v) return null;
        const [tn, tp, ts] = v.split('|') as [string, string, 'in' | 'out'];
        if (ts === w.side) return null;
        const edge: Edge = w.side === 'out' ? [w.node, w.pin, tn, tp] : [tn, tp, w.node, w.pin];
        const err = edgeError(graph, edge);
        if (err) {
          const r = ref.current!.getBoundingClientRect();
          setTip({ x: u.clientX - r.left + 12, y: u.clientY - r.top + 12, text: err });
        } else exec('logic.connect', { edge }, 'Connect');
        return null;
      });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      if (edgeSel) {
        const edge = graph.edges.find((x) => x.join('|') === edgeSel);
        if (edge) exec('logic.disconnect', { edge }, 'Disconnect');
        setEdgeSel(null);
      } else if (selected.size) {
        exec('logic.removeNodes', { nodes: [...selected] });
        setSelected(new Set());
      }
    }
    if (e.key === 'F9' && selected.size === 1) {
      e.preventDefault();
      toggleBreakpoint(ed, graph.id, [...selected][0]!);
    }
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer?.getData('text/x-logic-node');
    if (!type) return;
    e.preventDefault();
    const [x, y] = toWorld(e.clientX, e.clientY);
    exec('logic.addNode', { node: { type, pos: [Math.round(x / 10) * 10, Math.round(y / 10) * 10] } });
  };

  const byId = new Map(graph.nodes.map((n) => [n.id, posOf(n)]));
  const wirePath = (a: [number, number], b: [number, number]) => {
    const k = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
    return `M${a[0]} ${a[1]} C${a[0] + k} ${a[1]} ${b[0] - k} ${b[1]} ${b[0]} ${b[1]}`;
  };
  const notes = graph.nodes.filter((n) => n.type === 'note.group');
  const rest = graph.nodes.filter((n) => n.type !== 'note.group');

  return (
    <div
      ref={ref}
      class="lg-canvas"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is an application widget that takes keys (Delete, F9)
      tabIndex={0}
      role="application"
      aria-label="Logic graph"
      onPointerDown={onBgDown}
      onKeyDown={onKey}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div class="lg-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {notes.map((n0) => {
          const n = posOf(n0);
          const a = n.args ?? {};
          return (
            <div
              class={`lg-node lg-group ${selected.has(n.id) ? 'sel' : ''}`}
              style={{
                left: `${n.pos[0]}px`,
                top: `${n.pos[1]}px`,
                width: `${Number(a.w ?? 480)}px`,
                height: `${Number(a.h ?? 260)}px`,
              }}
              onPointerDown={(e) => onNodeDown(e, n.id)}
            >
              <div class="lg-group-title">{String(a.title ?? 'Group')}</div>
            </div>
          );
        })}
        <svg class="lg-wires" width="1" height="1" aria-hidden="true">
          {graph.edges.map((e) => {
            const a = byId.get(e[0]);
            const b = byId.get(e[2]);
            const da = a && nodeDef(a.type);
            const db = b && nodeDef(b.type);
            if (!a || !b || !da || !db) return null;
            const pa = pinPos(a, da, e[1], 'out');
            const pb = pinPos(b, db, e[3], 'in');
            const type = da.outputs.find((p) => p.name === e[1])?.type ?? 'any';
            const key = e.join('|');
            const d = wirePath(pa, pb);
            return (
              <g class="lg-edge">
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  stroke-width="12"
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    setEdgeSel(key);
                    setSelected(new Set());
                    ref.current?.focus();
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={edgeSel === key ? '#f2b632' : PIN_COLOR[type]}
                  stroke-width={type === 'exec' ? 3 : 2}
                  opacity={type === 'exec' ? 0.9 : 0.75}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            );
          })}
          {wire &&
            (() => {
              const n = byId.get(wire.node);
              const d = n && nodeDef(n.type);
              if (!n || !d) return null;
              const p = pinPos(n, d, wire.pin, wire.side);
              const path = wire.side === 'out' ? wirePath(p, [wire.x, wire.y]) : wirePath([wire.x, wire.y], p);
              return (
                <path d={path} fill="none" stroke={PIN_COLOR[wire.type]} stroke-width="2" stroke-dasharray="5 4" />
              );
            })()}
        </svg>
        {rest.map((n0) => {
          const n = posOf(n0);
          const def = nodeDef(n.type);
          if (!def)
            return (
              <div class="lg-node bad" style={{ left: `${n.pos[0]}px`, top: `${n.pos[1]}px` }}>
                Unknown {n.type}
              </div>
            );
          if (n.type === 'note.comment')
            return (
              <div
                class={`lg-node lg-note ${selected.has(n.id) ? 'sel' : ''}`}
                style={{ left: `${n.pos[0]}px`, top: `${n.pos[1]}px` }}
                onPointerDown={(e) => onNodeDown(e, n.id)}
              >
                {String(n.args?.text ?? 'Note')}
              </div>
            );
          const sum = summary(ed, n);
          const bp = bps.has(`${graph.id}:${n.id}`);
          const pinRow = (p: PinDef, side: 'in' | 'out', i: number) => {
            const connected = graph.edges.some((e) =>
              side === 'in' ? e[2] === n.id && e[3] === p.name : e[0] === n.id && e[1] === p.name,
            );
            const ok =
              wire && wire.side !== side && wire.node !== n.id
                ? side === 'in'
                  ? canConnect(wire.type, p.type)
                  : canConnect(p.type, wire.type)
                : null;
            const literal =
              side === 'in' && p.type !== 'exec' && !connected ? (n.args?.[p.name] ?? p.default) : undefined;
            return (
              <div class={`lg-row ${side}`} style={{ top: `${HEAD + 4 + i * ROW}px` }}>
                <span
                  class={`lg-pin ${p.type === 'exec' ? 'exec' : ''} ${connected ? 'on' : ''} ${ok === true ? 'ok' : ok === false ? 'no' : ''}`}
                  style={{ '--c': PIN_COLOR[p.type] } as Record<string, string>}
                  data-pin={`${n.id}|${p.name}|${side}`}
                  title={`${p.label ?? p.name} · ${p.type}`}
                  onPointerDown={(e) => onPinDown(e, n.id, p, side)}
                />
                <span class="lg-pin-label">
                  {p.type === 'exec' && (p.name === 'in' || p.name === 'then') ? '' : (p.label ?? p.name)}
                  {literal !== undefined && <span class="lg-lit"> {JSON.stringify(literal)}</span>}
                </span>
              </div>
            );
          };
          return (
            <div
              class={`lg-node ${selected.has(n.id) ? 'sel' : ''} ${highlight === n.id ? 'hit' : ''}`}
              style={{
                left: `${n.pos[0]}px`,
                top: `${n.pos[1]}px`,
                width: `${NODE_W}px`,
                height: `${nodeHeight(def, !!sum)}px`,
              }}
              data-node={n.id}
              onPointerDown={(e) => onNodeDown(e, n.id)}
            >
              <div class="lg-head" style={{ background: CAT_COLOR[def.category] ?? '#9aa4b2' }}>
                {bp && <span class="lg-bp" title="Breakpoint (F9)" />}
                {def.title}
                <span class="lg-id">{n.id}</span>
              </div>
              {def.inputs.map((p, i) => pinRow(p, 'in', i))}
              {def.outputs.map((p, i) => pinRow(p, 'out', i))}
              {sum && (
                <div
                  class="lg-sum"
                  style={{ top: `${HEAD + 4 + Math.max(def.inputs.length, def.outputs.length, 1) * ROW}px` }}
                >
                  {sum}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tip && (
        <div class="lg-tip" role="alert" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>
          {tip.text}
        </div>
      )}
      <Minimap graph={graph} view={view} host={ref} onJump={(x, y) => setView((v) => ({ ...v, x, y }))} />
      {!graph.nodes.length && (
        <div class="lg-empty muted">Drag a node from the list on the left, or click one to add it here.</div>
      )}
    </div>
  );
}

function Minimap({
  graph,
  view,
  host,
  onJump,
}: {
  graph: LogicGraph;
  view: View;
  host: { current: HTMLDivElement | null };
  onJump: (x: number, y: number) => void;
}) {
  if (graph.nodes.length < 2) return null;
  const xs = graph.nodes.flatMap((n) => [n.pos[0], n.pos[0] + NODE_W]);
  const ys = graph.nodes.flatMap((n) => [n.pos[1], n.pos[1] + 100]);
  const x0 = Math.min(...xs) - 40;
  const y0 = Math.min(...ys) - 40;
  const w = Math.max(...xs) - x0 + 40;
  const h = Math.max(...ys) - y0 + 40;
  const W = 160;
  const H = 100;
  const s = Math.min(W / w, H / h);
  const r = host.current?.getBoundingClientRect();
  const vw = (r?.width ?? 800) / view.k;
  const vh = (r?.height ?? 500) / view.k;
  const vx = -view.x / view.k;
  const vy = -view.y / view.k;
  return (
    <svg
      class="lg-mini"
      width={W}
      height={H}
      aria-label="Minimap"
      onPointerDown={(e) => {
        e.stopPropagation();
        const b = (e.currentTarget as SVGElement).getBoundingClientRect();
        const wx = x0 + (e.clientX - b.left) / s;
        const wy = y0 + (e.clientY - b.top) / s;
        onJump(-(wx - vw / 2) * view.k, -(wy - vh / 2) * view.k);
      }}
    >
      {graph.nodes.map((n) => (
        <rect
          x={(n.pos[0] - x0) * s}
          y={(n.pos[1] - y0) * s}
          width={Math.max(2, NODE_W * s)}
          height={Math.max(2, 60 * s)}
          fill={CAT_COLOR[nodeDef(n.type)?.category ?? ''] ?? '#9aa4b2'}
          opacity="0.8"
        />
      ))}
      <rect
        x={(vx - x0) * s}
        y={(vy - y0) * s}
        width={vw * s}
        height={vh * s}
        fill="none"
        stroke="#f2b632"
        stroke-width="1"
      />
    </svg>
  );
}

export function toggleBreakpoint(ed: EditorState, graph: string, node: string) {
  const k = `${graph}:${node}`;
  const next = new Set(ed.breakpoints.value);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  ed.breakpoints.value = next;
}
