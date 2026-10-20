import { useState } from 'preact/hooks';
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
  const kind = type.replace(/\d.*$/, '');
  const h = kind === 'brick' ? 1.2 : 0.4;
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
}: {
  type: string;
  color: string;
  rot: number;
  onPick: (type: string) => void;
  /** cards can be dragged straight onto the asset's build plate (Assets screen) */
  draggable?: boolean;
}) {
  const kind = type.replace(/\d.*$/, '');
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
            onClick={() => onPick(type.replace(/^(brick|plate|tile)/, k))}
          >
            <BrickIcon type={`${k}2x2`} color={color} size={22} />
            {label}
          </button>
        ))}
      </div>
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
    </div>
  );
}
