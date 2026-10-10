import { useMemo, useRef, useState } from 'preact/hooks';
import { type Gates, type MapDoc, paths } from '../../core/schema';
import { validateWorld } from '../../core/world/validate';
import { type ActionCtx, action, runAction } from '../actions/registry';

type End = { map: string; spawn: string };
type Port = End & { x: number; y: number; side: -1 | 1 };

const NODE_W = 210;
const HEAD = 46;
const ROW = 24;
const GAP_X = 120;
const GAP_Y = 46;

/** Grid layout in mapOrder: node height grows with its spawn list. */
function layout(maps: MapDoc[]) {
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(maps.length))));
  const heights = maps.map((m) => HEAD + Math.max(1, m.spawns.length) * ROW + 12);
  const rows = Math.ceil(maps.length / cols);
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...heights.slice(r * cols, r * cols + cols)));
  const pos = new Map<string, { x: number; y: number; h: number }>();
  maps.forEach((m, i) => {
    const r = Math.floor(i / cols);
    const y = 30 + rowH.slice(0, r).reduce((a, b) => a + b + GAP_Y, 0);
    pos.set(m.id, { x: 30 + (i % cols) * (NODE_W + GAP_X), y, h: heights[i]! });
  });
  const w = 60 + cols * NODE_W + (cols - 1) * GAP_X;
  const h = 60 + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * GAP_Y;
  // Never zoom a small graph past 1:1-ish: pad the view and centre the nodes.
  const W = Math.max(w, 820);
  const H = Math.max(h, 420);
  const dx = (W - w) / 2;
  const dy = (H - h) / 2;
  for (const p of pos.values()) {
    p.x += dx;
    p.y += dy;
  }
  return { pos, W, H };
}

/**
 * World graph workspace (P2.5): maps as nodes with their spawn points as ports. Drag from one spawn's
 * port to another's to connect a gate; click a gate to make it one-way, reverse it or remove it.
 */
export function WorldGraph({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const rev = ed.revision.value;
  const maps = ed.maps.value;
  const gates = ed.store.get<Gates>(paths.gates)?.gates ?? [];
  const entry = ed.store.manifest.entry;
  const issues = useMemo(() => validateWorld(ed.store), [rev]);
  const { pos, W, H } = useMemo(() => layout(maps), [maps]);
  const [selGate, setSelGate] = useState<string | null>(null);
  const [selMap, setSelMap] = useState<string | null>(null);
  const [link, setLink] = useState<{ from: End; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const spawnY = (m: MapDoc, spawn: string) => {
    const p = pos.get(m.id)!;
    const i = Math.max(
      0,
      m.spawns.findIndex((s) => s.id === spawn),
    );
    return p.y + HEAD + i * ROW + ROW / 2;
  };
  const mapOf = (id: string) => maps.find((m) => m.id === id);
  /** The port of `end` on the side facing `toward`. */
  const portOf = (end: End, toward?: { x: number }): Port | null => {
    const m = mapOf(end.map);
    const p = pos.get(end.map);
    if (!m || !p) return null;
    const side: -1 | 1 = toward && toward.x < p.x + NODE_W / 2 ? -1 : 1;
    return { ...end, x: side < 0 ? p.x : p.x + NODE_W, y: spawnY(m, end.spawn), side };
  };
  const centre = (map: string) => {
    const p = pos.get(map)!;
    return { x: p.x + NODE_W / 2 };
  };

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };

  const connect = (from: End, to: End) => {
    setLink(null);
    if (from.spawn === to.spawn) return;
    const r = ed.exec({ type: 'gate.connect', payload: { from, to, twoWay: true } });
    if (r.ok) {
      const g = ed.store.get<Gates>(paths.gates)!.gates.at(-1)!;
      setSelGate(g.id);
      setSelMap(null);
    }
  };

  const portAt = (e: PointerEvent): End | null => {
    const el = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-port]');
    const v = el?.getAttribute('data-port');
    if (!v) return null;
    const [map, spawn] = v.split('|') as [string, string];
    return { map, spawn };
  };

  const onPortDown = (end: End) => (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current!.setPointerCapture(e.pointerId);
    setLink({ from: end, ...toSvg(e) });
  };
  const onMove = (e: PointerEvent) => {
    if (link) setLink({ ...link, ...toSvg(e) });
  };
  const onUp = (e: PointerEvent) => {
    if (!link) return;
    const to = portAt(e);
    if (to) connect(link.from, to);
    else setLink(null);
  };
  /** Keyboard: Enter on a port starts a link, Enter on another port finishes it, Esc cancels. */
  const onPortKey = (end: End) => (e: KeyboardEvent) => {
    if (e.key === 'Escape') setLink(null);
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (link) connect(link.from, end);
    else {
      const p = portOf(end)!;
      setLink({ from: end, x: p.x + 60, y: p.y });
    }
  };

  const curve = (a: Port, b: { x: number; y: number; side: number }) => {
    const k = Math.max(50, Math.abs(b.x - a.x) * 0.4);
    return `M${a.x} ${a.y} C${a.x + a.side * k} ${a.y} ${b.x + b.side * k} ${b.y} ${b.x} ${b.y}`;
  };

  const gate = gates.find((g) => g.id === selGate) ?? null;
  const map = selMap ? mapOf(selMap) : null;
  const spawnName = (e: End) => mapOf(e.map)?.spawns.find((s) => s.id === e.spawn)?.name ?? '?';
  const mapName = (id: string) => mapOf(id)?.name ?? '?';
  const issueMaps = new Set(issues.filter((i) => i.level === 'warn').map((i) => i.map));

  return (
    <section class="panel graphws" aria-label="World graph">
      <div class="graph-side" role="toolbar" aria-label="World graph tools">
        <button type="button" class="btn" onClick={() => runAction(action('world.addMap'), c)}>
          + Add map
        </button>
        <span class="muted small">
          {maps.length} map{maps.length === 1 ? '' : 's'} · {gates.length} gate{gates.length === 1 ? '' : 's'} ·{' '}
          {issues.length ? `${issues.length} route issue${issues.length === 1 ? '' : 's'}` : 'routes OK'}
        </span>
        {gate && (
          <span class="group" role="group" aria-label="Selected gate">
            <span class="small">
              {mapName(gate.from.map)} · {spawnName(gate.from)} {gate.twoWay ? '⇄' : '→'} {mapName(gate.to.map)} ·{' '}
              {spawnName(gate.to)}
            </span>
            <button
              type="button"
              class={`btn ${gate.twoWay ? 'on' : ''}`}
              aria-pressed={gate.twoWay}
              onClick={() => ed.exec({ type: 'gate.update', payload: { gate: gate.id, twoWay: !gate.twoWay } })}
            >
              Two-way
            </button>
            <button
              type="button"
              class="btn"
              disabled={gate.twoWay}
              onClick={() => ed.exec({ type: 'gate.update', payload: { gate: gate.id, reverse: true } })}
            >
              Reverse
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => {
                ed.exec({ type: 'gate.delete', payload: { gate: gate.id } });
                setSelGate(null);
              }}
            >
              Remove gate
            </button>
          </span>
        )}
        {map && (
          <span class="group" role="group" aria-label="Selected map">
            <strong class="small">{map.name}</strong>
            <button
              type="button"
              class="btn"
              onClick={() => {
                ed.openMap(map.id);
                c.ui.workspace('Scene');
              }}
            >
              Edit in Scene
            </button>
            <button
              type="button"
              class="btn"
              disabled={entry.map === map.id}
              onClick={() =>
                ed.exec({
                  type: 'project.update',
                  payload: { entryMap: map.id, entrySpawn: map.spawns[0]?.id ?? null },
                })
              }
            >
              {entry.map === map.id ? 'Start map' : 'Make start map'}
            </button>
            <button
              type="button"
              class="btn"
              disabled={!map.spawns.length}
              onClick={() => {
                ed.openMap(map.id);
                ed.selectedSpawn.value = map.spawns[0]?.id ?? null;
                c.ui.play('engine', { fromSelectedSpawn: true });
              }}
            >
              Play here
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => {
                if (ed.exec({ type: 'map.delete', payload: { map: map.id } }).ok) {
                  setSelMap(null);
                  if (ed.mapId.value === map.id) ed.openMap(entry.map);
                }
              }}
            >
              Delete map
            </button>
          </span>
        )}
        {!gate && !map && (
          <span class="muted small opt">
            Drag from one spawn’s dot to another’s to connect a gate. Click a gate or a map to edit it.
          </span>
        )}
      </div>
      <div class="viewport-wrap" style={{ display: 'flex', flexDirection: 'column' }}>
        <div class="svgview" style={{ flex: 1, minHeight: 0 }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            role="application"
            aria-label="Maps, spawn points and gates"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerDown={() => {
              setSelGate(null);
              setSelMap(null);
            }}
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="#6aa7ff" />
              </marker>
            </defs>
            {gates.map((g) => {
              const a = portOf(g.from, centre(g.to.map));
              const b = portOf(g.to, centre(g.from.map));
              if (!a || !b) return null;
              const on = g.id === selGate;
              const d = curve(a, b);
              const pick = (e: Event) => {
                e.stopPropagation();
                setSelGate(g.id);
                setSelMap(null);
              };
              return (
                <g
                  class="gate"
                  role="button"
                  tabIndex={0}
                  aria-label={`Gate ${mapName(g.from.map)} ${spawnName(g.from)} ${g.twoWay ? 'both ways' : 'to'} ${mapName(g.to.map)} ${spawnName(g.to)}`}
                  aria-pressed={on}
                  onPointerDown={pick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') pick(e);
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      ed.exec({ type: 'gate.delete', payload: { gate: g.id } });
                      setSelGate(null);
                    }
                  }}
                >
                  <path d={d} fill="none" stroke="transparent" stroke-width="14" />
                  <path
                    d={d}
                    fill="none"
                    stroke={on ? '#f2b632' : g.twoWay ? '#4fd1c5' : '#6aa7ff'}
                    stroke-width={on ? 3.5 : 2.5}
                    stroke-dasharray={g.twoWay ? undefined : '7 5'}
                    marker-end={g.twoWay ? undefined : 'url(#arrow)'}
                  />
                </g>
              );
            })}
            {maps.map((m) => {
              const p = pos.get(m.id)!;
              const here = m.id === ed.mapId.value;
              const sel = m.id === selMap;
              const start = m.id === entry.map;
              const pick = (e: Event) => {
                e.stopPropagation();
                setSelMap(m.id);
                setSelGate(null);
              };
              return (
                <g>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Map ${m.name}${start ? ', start map' : ''}`}
                    aria-pressed={sel}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={pick}
                    onDblClick={() => {
                      ed.openMap(m.id);
                      c.ui.workspace('Scene');
                    }}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(e)}
                  >
                    <rect
                      x={p.x}
                      y={p.y}
                      width={NODE_W}
                      height={p.h}
                      rx="9"
                      fill="#1b2028"
                      stroke={sel ? '#f2b632' : issueMaps.has(m.id) ? '#ff8a7a' : here ? '#6f7a89' : '#303844'}
                      stroke-width={sel ? 2.5 : 1.5}
                    />
                    <text x={p.x + 12} y={p.y + 21} fill="#e6eaf0" font-weight="600" font-size="13">
                      {start ? '★ ' : ''}
                      {m.name}
                    </text>
                    <text x={p.x + 12} y={p.y + 37} fill="#7f8a99" font-size="11">
                      {m.generator ? m.generator.environments.slice(0, 2).join(' + ') : 'free build'}
                      {here ? ' · open' : ''}
                    </text>
                  </g>
                  {!m.spawns.length && (
                    <text x={p.x + 12} y={p.y + HEAD + 15} fill="#ff8a7a" font-size="11">
                      No spawn points — add one with the Spawn tool
                    </text>
                  )}
                  {m.spawns.map((s, i) => {
                    const y = p.y + HEAD + i * ROW + ROW / 2;
                    const end = { map: m.id, spawn: s.id };
                    const linking = link?.from.spawn === s.id;
                    return (
                      <g>
                        <text x={p.x + 18} y={y + 4} fill="#c3cad5" font-size="12">
                          {s.name}
                          {start && entry.spawn === s.id ? ' (start)' : ''}
                        </text>
                        {([p.x, p.x + NODE_W] as const).map((x) => (
                          <circle
                            class="port"
                            data-port={`${m.id}|${s.id}`}
                            cx={x}
                            cy={y}
                            r="7"
                            fill={linking ? '#f2b632' : '#12161b'}
                            stroke="#4fd1c5"
                            stroke-width="2"
                            role="button"
                            tabIndex={0}
                            aria-label={`${link ? 'Connect to' : 'Start a gate from'} ${m.name} · ${s.name}`}
                            onPointerDown={onPortDown(end)}
                            onKeyDown={onPortKey(end)}
                          />
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {link &&
              (() => {
                const a = portOf(link.from, link);
                if (!a) return null;
                return (
                  <path
                    d={curve(a, { x: link.x, y: link.y, side: link.x < a.x ? 1 : -1 })}
                    fill="none"
                    stroke="#f2b632"
                    stroke-width="2"
                    stroke-dasharray="4 4"
                    pointer-events="none"
                  />
                );
              })()}
          </svg>
        </div>
        {issues.length > 0 && (
          <div class="graph-issues scroll" style={{ maxHeight: '96px', borderTop: '1px solid var(--line2)' }}>
            {issues.map((i) => (
              <div class="problem">
                <span aria-hidden="true" style={{ color: i.level === 'warn' ? 'var(--warn)' : 'var(--info)' }}>
                  {i.level === 'warn' ? '▲' : '●'}
                </span>
                <span style={{ flex: 1 }}>{i.message}</span>
                <button
                  type="button"
                  class="btn"
                  style={{ minHeight: '24px', fontSize: '11px' }}
                  onClick={() => {
                    setSelMap(i.map);
                    setSelGate(null);
                  }}
                >
                  Show
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
