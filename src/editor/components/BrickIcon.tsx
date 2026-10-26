import { useState } from 'preact/hooks';
import { type CustomBrick, customBrick, customIdOf, customType, parseBrickType } from '../../core/bricks/custom';
import { footprint } from '../../core/bricks/inspect';
import { BRICK_SIZES } from '../../core/schema';
import { endDrag, startDrag } from '../interact/drag';
import { matches, NoMatch, SearchBox } from './SearchBox';

const shade = (hex: string, f: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c.join(',')})`;
};

/**
 * P31: a small isometric picture of one brick, plate or tile in its color (with studs), so the brick
 * controls show what you will place before you place it.
 */
export function BrickIcon({
  type,
  color,
  rot = 0,
  size = 56,
}: {
  type: string;
  color: string;
  rot?: number;
  size?: number;
}) {
  const [w, d] = footprint({ type, rot });
  const kind = parseBrickType(type)?.kind ?? 'brick';
  const h = kind === 'brick' ? 1.2 : 0.4;
  // step 11: a custom brick shows its shape (drawn as it is before it is turned)
  const cid = customIdOf(type);
  const custom = cid ? customBrick(cid) : undefined;
  if (custom) return <CustomIcon b={custom} color={color} size={size} />;
  // fit the biggest brick (8×8) into the box; small ones stay small so sizes compare
  const s = size / 12;
  const P = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.87 * s, (x + z) * 0.5 * s - y * s];
  const pts = (list: [number, number, number][]) => list.map((p) => P(...p).join(',')).join(' ');
  const top = pts([
    [0, h, 0],
    [w, h, 0],
    [w, h, d],
    [0, h, d],
  ]);
  const right = pts([
    [w, 0, 0],
    [w, h, 0],
    [w, h, d],
    [w, 0, d],
  ]);
  const front = pts([
    [0, 0, d],
    [w, 0, d],
    [w, h, d],
    [0, h, d],
  ]);
  const studs: [number, number][] = [];
  if (kind !== 'tile') for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) studs.push(P(x + 0.5, h, z + 0.5));
  // bounds for the view box
  const corners = [P(0, 0, 0), P(w, 0, 0), P(0, 0, d), P(w, 0, d), P(0, h, 0), P(w, h, d), P(0, h + 0.2, d)];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const pad = s * 0.4;
  const vb = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + pad * 2,
    Math.max(...ys) - Math.min(...ys) + pad * 2,
  ];
  return (
    <svg
      class="brick-icon"
      width={Math.min(size, vb[2]!)}
      height={Math.min(size, vb[3]!)}
      viewBox={vb.join(' ')}
      aria-hidden="true"
    >
      <polygon points={front} fill={shade(color, 0.72)} />
      <polygon points={right} fill={shade(color, 0.55)} />
      <polygon points={top} fill={color} />
      {studs.map(([x, y]) => (
        <g>
          <ellipse cx={x} cy={y} rx={s * 0.26} ry={s * 0.15} fill={shade(color, 0.7)} />
          <ellipse cx={x} cy={y - s * 0.16} rx={s * 0.26} ry={s * 0.15} fill={shade(color, 1.12)} />
        </g>
      ))}
    </svg>
  );
}

const KINDS = [
  ['brick', 'Brick'],
  ['plate', 'Plate'],
  ['tile', 'Tile'],
] as const;

/** Kind buttons and size cards, each card a picture of that piece in the brush color. */
export function BrickPicker({
  type,
  color,
  rot,
  onPick,
  draggable = false,
  customs,
  onNewCustom,
  onEditCustom,
}: {
  type: string;
  color: string;
  rot: number;
  onPick: (type: string) => void;
  /** cards can be dragged straight onto the asset's build plate (Assets screen) */
  draggable?: boolean;
  /** step 11: the game's custom bricks, and making or changing one (the Custom group shows when given) */
  customs?: CustomBrick[];
  onNewCustom?: () => void;
  onEditCustom?: (b: CustomBrick) => void;
}) {
  const [customOpen, setCustomOpen] = useState(!!customIdOf(type));
  const kind = customOpen && customs ? 'custom' : (parseBrickType(type)?.kind ?? 'brick');
  const plain = customIdOf(type) ? `brick2x2` : type;
  // find a size by typing it: “2x4”, “2 4” or “4×2”
  const [q, setQ] = useState('');
  const sizeText = (r: number, cc: number) => `${r}x${cc} ${cc}x${r} ${r}×${cc} ${r} ${cc}`;
  const sizes = BRICK_SIZES.filter(([r, cc]) => matches(q.replace(/[×*]/g, 'x'), sizeText(r, cc)));
  return (
    <div class="brick-picker">
      <div class="row" role="radiogroup" aria-label="Piece kind">
        {KINDS.map(([k, label]) => (
          <button
            type="button"
            class={`btn kind ${kind === k ? 'on' : ''}`}
            role="radio"
            aria-checked={kind === k}
            data-tip={
              k === 'brick'
                ? 'Full-height bricks'
                : k === 'plate'
                  ? 'Plates: a third of a brick high'
                  : 'Tiles: flat, no studs on top'
            }
            onClick={() => {
              setCustomOpen(false);
              onPick(plain.replace(/^(brick|plate|tile)/, k));
            }}
          >
            <BrickIcon type={`${k}2x2`} color={color} size={22} />
            {label}
          </button>
        ))}
        {customs && (
          <button
            type="button"
            class={`btn kind ${kind === 'custom' ? 'on' : ''}`}
            role="radio"
            aria-checked={kind === 'custom'}
            data-tour="brick-kind-custom"
            data-tip="Bricks of the game's own shapes: slopes, curves, round bricks, arches… Make one with + New brick."
            onClick={() => setCustomOpen(true)}
          >
            <span aria-hidden="true">✚</span>
            Custom
          </button>
        )}
      </div>
      {kind === 'custom' && customs && (
        <div class="cards" role="listbox" aria-label="Custom bricks" data-tour="brick-customs">
          {customs.map((cb) => {
            const t = customType(cb);
            const on = type === t;
            return (
              <div class="brick-custom-card">
                <button
                  type="button"
                  class={`card ${on ? 'on' : ''}`}
                  role="option"
                  aria-selected={on}
                  data-tour={`brick-custom-${cb.id}`}
                  data-tip={`${cb.name}: ${cb.w}×${cb.d}${draggable ? '. Click it, then click the build plate, or drag it onto the plate.' : ''}`}
                  draggable={draggable}
                  onDragStart={(e) => {
                    if (!draggable) return;
                    onPick(t);
                    startDrag(e as unknown as DragEvent, { kind: 'brick', type: t, color, rot });
                  }}
                  onDragEnd={endDrag}
                  onClick={() => onPick(t)}
                >
                  <span class="thumb" aria-hidden="true">
                    <BrickIcon type={t} color={color} size={60} />
                  </span>
                  <span class="small">{cb.name}</span>
                </button>
                {onEditCustom && (
                  <button
                    type="button"
                    class="btn small icon brick-edit"
                    aria-label={`Change ${cb.name}`}
                    data-tour={`brick-edit-${cb.id}`}
                    onClick={() => onEditCustom(cb)}
                  >
                    ✎
                  </button>
                )}
              </div>
            );
          })}
          {onNewCustom && (
            <button type="button" class="card" data-tour="brick-new" onClick={onNewCustom}>
              <span class="thumb" aria-hidden="true" style={{ fontSize: '28px' }}>
                ＋
              </span>
              <span class="small">New brick…</span>
            </button>
          )}
        </div>
      )}
      {kind !== 'custom' && (
        <>
          <SearchBox label="piece sizes" value={q} onInput={setQ} tour="brick-size-search" />
          <NoMatch q={sizes.length ? '' : q} what="sizes" />
          <div class="cards" role="listbox" aria-label="Piece sizes">
            {sizes.map(([r, cc]) => {
              const t = `${kind}${r}x${cc}`;
              const on = type === t;
              return (
                <button
                  type="button"
                  class={`card ${on ? 'on' : ''}`}
                  role="option"
                  aria-selected={on}
                  data-tip={`${kind.charAt(0).toUpperCase() + kind.slice(1)} ${r}×${cc}: ${r} by ${cc} studs${draggable ? '. Click it, then click the build plate, or drag it straight onto the plate.' : ''}`}
                  draggable={draggable}
                  onDragStart={(e) => {
                    if (!draggable) return;
                    onPick(t);
                    startDrag(e as unknown as DragEvent, { kind: 'brick', type: t, color, rot });
                  }}
                  onDragEnd={endDrag}
                  onClick={() => onPick(t)}
                >
                  <span class="thumb" aria-hidden="true">
                    <BrickIcon type={t} color={color} rot={rot} size={60} />
                  </span>
                  <span class="small">
                    {kind.charAt(0).toUpperCase() + kind.slice(1)} {r}×{cc}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** step 11: a small picture of a custom brick's shape (iso, like BrickIcon) */
function CustomIcon({ b, color, size }: { b: CustomBrick; color: string; size: number }) {
  const { w, d } = b;
  const h = b.base === 'brick' ? 1.2 : 0.4;
  const s = size / 12;
  const P = (x: number, y: number, z: number): [number, number] => [(x - z) * 0.87 * s, (x + z) * 0.5 * s - y * s];
  const pts = (list: [number, number, number][]) => list.map((p) => P(...p).join(',')).join(' ');
  const parts: { pts: string; f: number }[] = [];
  const studs: [number, number][] = [];
  const lip = Math.min(h * 0.25, 0.15);
  const flat = d >= 2 ? 1 : 0;
  const stud = (x: number, y: number, z: number) => b.studs !== 'none' && b.base !== 'tile' && studs.push(P(x, y, z));
  if (b.shape === 'slope' || b.shape === 'curve') {
    parts.push({
      pts: pts([
        [0, 0, d],
        [w, 0, d],
        [w, lip, d],
        [0, lip, d],
      ]),
      f: 0.72,
    });
    parts.push({
      pts: pts([
        [w, 0, 0],
        [w, h, 0],
        [w, h, flat],
        [w, lip, d],
        [w, 0, d],
      ]),
      f: 0.55,
    });
    parts.push({
      pts: pts([
        [0, h, 0],
        [w, h, 0],
        [w, h, flat],
        [0, h, flat],
      ]),
      f: 1,
    });
    parts.push({
      pts: pts([
        [0, h, flat],
        [w, h, flat],
        [w, lip, d],
        [0, lip, d],
      ]),
      f: b.shape === 'curve' ? 0.9 : 0.85,
    });
    if (flat) for (let x = 0; x < w; x++) stud(x + 0.5, h, 0.5);
  } else if (b.shape === 'wedge') {
    parts.push({
      pts: pts([
        [0, 0, d],
        [w, 0, 0],
        [w, h, 0],
        [0, h, d],
      ]),
      f: 0.62,
    });
    parts.push({
      pts: pts([
        [0, h, 0],
        [w, h, 0],
        [0, h, d],
      ]),
      f: 1,
    });
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) if (z + 0.5 <= d * (1 - (x + 0.5) / w)) stud(x + 0.5, h, z + 0.5);
  } else if (b.shape === 'round' || b.shape === 'cone' || b.shape === 'dome') {
    const [cx, cy] = P(w / 2, 0, d / 2);
    const [, ty] = P(w / 2, h, d / 2);
    const r = (w / 2) * s * 1.23;
    const top = b.shape === 'cone' ? Math.max(0.3, (w / 2) * 0.35) / (w / 2) : b.shape === 'dome' ? 0 : 1;
    const shapes =
      b.shape === 'dome'
        ? `M ${cx - r} ${cy} A ${r} ${r * 0.58} 0 0 0 ${cx + r} ${cy} L ${cx + r} ${cy} A ${r} ${cy - ty + r * 0.3} 0 0 0 ${cx - r} ${cy} Z`
        : `M ${cx - r} ${cy} A ${r} ${r * 0.58} 0 0 0 ${cx + r} ${cy} L ${cx + r * top} ${ty} L ${cx - r * top} ${ty} Z`;
    return (
      <svg
        class="brick-icon"
        width={size}
        height={size}
        viewBox={`${cx - r * 1.2} ${ty - r * 1.1} ${r * 2.4} ${cy - ty + r * 1.9}`}
        aria-hidden="true"
      >
        <path d={shapes} fill={shade(color, 0.7)} />
        {b.shape !== 'dome' && <ellipse cx={cx} cy={ty} rx={r * top} ry={r * top * 0.58} fill={color} />}
      </svg>
    );
  } else {
    parts.push({
      pts: pts([
        [0, 0, d],
        [w, 0, d],
        [w, h, d],
        [0, h, d],
      ]),
      f: 0.72,
    });
    parts.push({
      pts: pts([
        [w, 0, 0],
        [w, h, 0],
        [w, h, d],
        [w, 0, d],
      ]),
      f: 0.55,
    });
    parts.push({
      pts: pts([
        [0, h, 0],
        [w, h, 0],
        [w, h, d],
        [0, h, d],
      ]),
      f: 1,
    });
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) stud(x + 0.5, h, z + 0.5);
    if (b.shape === 'arch') {
      const r = (w - 2) / 2;
      const hole: [number, number, number][] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        hole.push([w / 2 - Math.cos(a) * r, Math.min(h - 0.08, Math.sin(a) * Math.min(r, h * 0.75)), d]);
      }
      parts.push({ pts: pts(hole), f: 0.3 });
    }
  }
  const all = [P(0, 0, 0), P(w, 0, 0), P(0, 0, d), P(w, 0, d), P(0, h, 0), P(w, h, d), P(0, h + 0.2, d)];
  const xs = all.map((c) => c[0]);
  const ys = all.map((c) => c[1]);
  const pad = s * 0.4;
  const vb = [
    Math.min(...xs) - pad,
    Math.min(...ys) - pad,
    Math.max(...xs) - Math.min(...xs) + pad * 2,
    Math.max(...ys) - Math.min(...ys) + pad * 2,
  ];
  return (
    <svg
      class="brick-icon"
      width={Math.min(size, vb[2]!)}
      height={Math.min(size, vb[3]!)}
      viewBox={vb.join(' ')}
      aria-hidden="true"
    >
      {parts.map((p) => (
        <polygon points={p.pts} fill={shade(color, p.f)} />
      ))}
      {studs.map(([x, y]) => (
        <g>
          <ellipse cx={x} cy={y} rx={s * 0.26} ry={s * 0.15} fill={shade(color, 0.7)} />
          <ellipse cx={x} cy={y - s * 0.16} rx={s * 0.26} ry={s * 0.15} fill={shade(color, 1.12)} />
        </g>
      ))}
    </svg>
  );
}
