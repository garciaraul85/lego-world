/**
 * Milestone 3b (B7a-1): drawing the maps — the pause map (grid of screens, parchment, sea chart, contour, room plan)
 * and the map in play (square, round with a compass ring, grid of screens) — from a MapModel, in a look
 * (core/maps/look). Canvas 2D; the editor's previews draw with it too.
 */
import type { FullMini, FullPause, MapColors } from '../../core/maps/look';
import { floorOf, type MapMarker, type MapModel, SEEN_CELL, type Top } from './model';

/** a screen of the grid-of-screens map, in studs */
export const SCREEN = 16;
/** a square of the sea chart, in studs */
export const CHART = 32;

type G = CanvasRenderingContext2D;
type Style = { type: string; colors: MapColors; fog: string; icons: string; markers: Record<string, boolean> };

// ---------- colours ----------

function rgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}
const alpha = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

// ---------- the land, drawn once per map, type and floor (one pixel a stud) ----------

const lands = new WeakMap<Top, Map<string, HTMLCanvasElement>>();

/** the land as this type draws it, one pixel a stud (fog is drawn over it later) */
function land(m: MapModel, st: Style, floor: number | null): { img: HTMLCanvasElement; top: Top } {
  const top = m.top(floor);
  let cache = lands.get(top);
  if (!cache) {
    cache = new Map();
    lands.set(top, cache);
  }
  const key = `${st.type}|${Object.values(st.colors).join('')}`;
  let img = cache.get(key);
  if (!img) {
    img = document.createElement('canvas');
    img.width = top.w;
    img.height = top.h;
    const g = img.getContext('2d');
    if (g) paintLand(g, top, st);
    cache.set(key, img);
  }
  return { img, top };
}

function paintLand(g: G, t: Top, st: Style) {
  const c = st.colors;
  const id = g.createImageData(t.w, t.h);
  const put = (i: number, col: [number, number, number], a = 255) => {
    id.data[i * 4] = col[0];
    id.data[i * 4 + 1] = col[1];
    id.data[i * 4 + 2] = col[2];
    id.data[i * 4 + 3] = a;
  };
  const back = rgb(c.back);
  const water = rgb(c.water);
  const wall = rgb(c.wall);
  const ink = rgb(c.ink);
  const range = Math.max(1, t.hi - t.lo);
  for (let z = 0; z < t.h; z++)
    for (let x = 0; x < t.w; x++) {
      const i = z * t.w + x;
      const col = t.color[i]!;
      const h = t.height[i]!;
      if (!col) {
        put(i, back, st.type === 'chart' || st.type === 'contour' ? 255 : 0);
        continue;
      }
      if (t.water[i]) {
        put(i, water);
        continue;
      }
      const own = rgb(col);
      const lift = (h - t.lo) / range;
      // a height line: this cell's height band differs from the one next to it
      // (a band a brick high: heights are in plates)
      const band = (v: number) => Math.floor(v / 3);
      const nb = (dx: number, dz: number) => {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= t.w || zz >= t.h) return h;
        const v = t.height[zz * t.w + xx]!;
        return Number.isNaN(v) ? t.lo - 2 : v;
      };
      const edge = band(h) !== band(nb(1, 0)) || band(h) !== band(nb(0, 1));
      const shore = !t.color[Math.min(t.w * t.h - 1, i + 1)] || (z + 1 < t.h && !t.color[i + t.w]);
      switch (st.type) {
        case 'parchment': {
          // the land in faded ink on paper, darker inked edges
          const k = 0.45 + lift * 0.2;
          const col2 = [0, 1, 2].map((j) => Math.round(back[j]! + (own[j]! - back[j]!) * k)) as [
            number,
            number,
            number,
          ];
          put(i, edge || shore ? ink : col2, edge || shore ? 200 : 255);
          break;
        }
        case 'chart':
          // islands in the chart's land colour on its sea, a dark shore line
          put(i, shore || edge ? ink : wall);
          break;
        case 'contour': {
          // dark land, glowing height lines
          if (edge) put(i, wall);
          else {
            const k = 0.12 + lift * 0.18;
            put(i, [0, 1, 2].map((j) => Math.round(back[j]! + (wall[j]! - back[j]!) * k)) as [number, number, number]);
          }
          break;
        }
        case 'floors':
          // a room's floor (lighter) and its walls (bricks that rise above the floor level)
          put(
            i,
            h - t.lo > 2 ? wall : ([0, 1, 2].map((j) => Math.round(back[j]! * 0.5 + 60)) as [number, number, number]),
          );
          break;
        default:
          // the land in its own colours (screens, square, round)
          put(
            i,
            [0, 1, 2].map((j) => Math.min(255, Math.round(own[j]! * (0.75 + lift * 0.35)))) as [number, number, number],
          );
      }
    }
  g.putImageData(id, 0, 0);
}

// ---------- fog ----------

function fogOver(
  g: G,
  m: MapModel,
  st: Style,
  floor: number,
  toScreen: (x: number, z: number) => [number, number],
  k: number,
) {
  if (!m.seen || (m.dungeon && m.hasMap)) return;
  if (!m.dungeon && st.fog === 'none') return;
  const t = m.top(null);
  const c = st.colors;
  const cell = SEEN_CELL * k;
  const x0 = Math.floor(t.x0 / SEEN_CELL) - 1;
  const z0 = Math.floor(t.z0 / SEEN_CELL) - 1;
  const x1 = Math.ceil((t.x0 + t.w) / SEEN_CELL) + 1;
  const z1 = Math.ceil((t.z0 + t.h) / SEEN_CELL) + 1;
  for (let cz = z0; cz < z1; cz++)
    for (let cx = x0; cx < x1; cx++) {
      if (m.shows(cx * SEEN_CELL, cz * SEEN_CELL, floor)) continue;
      const [sx, sz] = toScreen(cx * SEEN_CELL, cz * SEEN_CELL);
      if (st.fog === 'cloud') {
        g.fillStyle = alpha(c.fog, 0.92);
        g.beginPath();
        g.ellipse(sx + cell / 2, sz + cell / 2, cell * 0.75, cell * 0.6, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = st.fog === 'paper' ? alpha(c.fog, 0.96) : c.fog;
        g.fillRect(sx - 0.5, sz - 0.5, cell + 1, cell + 1);
      }
    }
}

// ---------- icons ----------

/** a marker's icon, centred at (x, y), r across */
export function icon(g: G, m: MapMarker, x: number, y: number, r: number, st: Pick<Style, 'icons' | 'colors'>, t = 0) {
  const c = st.colors;
  const set = st.icons;
  const done = !!m.done;
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1, r / 6);
  const fillOf = (col: string) => (done ? mix(col, '#808080', 0.65) : col);
  const out = set === 'stamp' ? c.ink : '#000000';
  const shape = (draw: () => void, fill: string) => {
    g.beginPath();
    draw();
    if (set === 'stamp') {
      g.strokeStyle = fillOf(c.ink);
      g.fillStyle = alpha(set === 'stamp' ? c.accent : fill, done ? 0.25 : 0.6);
      g.fill();
      g.stroke();
    } else {
      g.fillStyle = fillOf(fill);
      g.fill();
      g.strokeStyle = out;
      g.stroke();
    }
  };
  const px = (rows: string[], col: string) => {
    // a pixel sprite, rows of '#'
    const n = rows.length;
    const s = (r * 2) / n;
    g.fillStyle = fillOf(col);
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '#') g.fillRect(-r + i * s, -r + j * s, s + 0.3, s + 0.3);
      });
    });
  };
  switch (m.kind) {
    case 'chest':
      if (set === 'pixel') px(['#######', '#.....#', '#######', '#..#..#', '#######'], '#e0a030');
      else
        shape(() => {
          g.rect(-r, -r * 0.6, r * 2, r * 1.3);
        }, '#e0a030');
      if (!done && set !== 'pixel') {
        g.beginPath();
        g.moveTo(-r, -r * 0.1);
        g.lineTo(r, -r * 0.1);
        g.strokeStyle = out;
        g.stroke();
      }
      break;
    case 'key':
    case 'boss-key': {
      const col = m.kind === 'boss-key' ? '#ff5050' : '#f2d240';
      if (set === 'pixel') px(['.##....', '#..####', '.##.#.#'], col);
      else {
        shape(() => g.arc(-r * 0.45, 0, r * 0.45, 0, Math.PI * 2), col);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(r, 0);
        g.lineTo(r, r * 0.45);
        g.strokeStyle = fillOf(col);
        g.lineWidth = Math.max(1.5, r / 4);
        g.stroke();
      }
      if (m.kind === 'boss-key' && set !== 'pixel') {
        g.fillStyle = fillOf(col);
        g.fillRect(r * 0.4, 0, r * 0.25, r * 0.5);
      }
      break;
    }
    case 'boss':
      if (set === 'pixel') px(['.#####.', '#.#.#.#', '#######', '.#.#.#.'], done ? '#777777' : '#ff3b3b');
      else {
        shape(() => g.arc(0, -r * 0.1, r * 0.85, 0, Math.PI * 2), '#ff3b3b');
        g.fillStyle = '#000000';
        g.beginPath();
        g.arc(-r * 0.32, -r * 0.2, r * 0.2, 0, Math.PI * 2);
        g.arc(r * 0.32, -r * 0.2, r * 0.2, 0, Math.PI * 2);
        g.fill();
      }
      if (done) {
        g.strokeStyle = c.ink;
        g.lineWidth = Math.max(1.5, r / 4);
        g.beginPath();
        g.moveTo(-r, -r);
        g.lineTo(r, r);
        g.moveTo(r, -r);
        g.lineTo(-r, r);
        g.stroke();
      }
      break;
    case 'door':
    case 'boss-door': {
      const col = m.kind === 'boss-door' ? '#ff5050' : '#c08040';
      shape(
        () => {
          g.moveTo(-r * 0.7, r);
          g.lineTo(-r * 0.7, -r * 0.2);
          g.arc(0, -r * 0.2, r * 0.7, Math.PI, 0);
          g.lineTo(r * 0.7, r);
          g.closePath();
        },
        done ? '#404040' : col,
      );
      break;
    }
    case 'exit':
      // stairs
      g.fillStyle = fillOf(c.ink);
      for (let i = 0; i < 3; i++)
        g.fillRect(-r + i * ((r * 2) / 3), -r + i * ((r * 2) / 3), r * 2 - i * ((r * 2) / 3), r * 0.5);
      break;
    case 'person':
    case 'foe':
      g.fillStyle = m.kind === 'foe' ? '#ff6a5a' : c.ink;
      g.beginPath();
      g.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      g.fill();
      break;
    case 'pin':
      stampShape(g, (m.stamp ?? 'star') as string, r, c);
      break;
    case 'goal': {
      // where to go next: a diamond in the highlight colour with a ring that breathes
      const pulse = 1 + 0.25 * Math.sin(t * 4);
      g.strokeStyle = c.accent;
      g.lineWidth = Math.max(1.5, r / 4);
      g.beginPath();
      g.arc(0, 0, r * 1.3 * pulse, 0, Math.PI * 2);
      g.stroke();
      shape(() => {
        g.moveTo(0, -r);
        g.lineTo(r * 0.7, 0);
        g.lineTo(0, r);
        g.lineTo(-r * 0.7, 0);
        g.closePath();
      }, c.accent);
      break;
    }
    case 'name':
      break;
  }
  g.restore();
}

/** a player's stamp */
export function stampShape(g: G, stamp: string, r: number, c: MapColors) {
  g.save();
  g.fillStyle = c.accent;
  g.strokeStyle = '#000000';
  g.lineWidth = Math.max(1, r / 6);
  g.beginPath();
  switch (stamp) {
    case 'heart':
      g.moveTo(0, r * 0.8);
      g.bezierCurveTo(-r * 1.2, -r * 0.1, -r * 0.5, -r * 1.1, 0, -r * 0.35);
      g.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.2, -r * 0.1, 0, r * 0.8);
      g.fillStyle = '#ff4f6d';
      break;
    case 'flag':
      g.rect(-r * 0.6, -r, r * 0.15, r * 2);
      g.moveTo(-r * 0.45, -r);
      g.lineTo(r * 0.8, -r * 0.6);
      g.lineTo(-r * 0.45, -r * 0.2);
      break;
    case 'cross':
      g.rect(-r, -r * 0.25, r * 2, r * 0.5);
      g.rect(-r * 0.25, -r, r * 0.5, r * 2);
      g.fillStyle = '#e83b3b';
      break;
    case 'skull':
      g.arc(0, -r * 0.1, r * 0.8, 0, Math.PI * 2);
      g.fillStyle = '#e8e8e8';
      break;
    case 'chest':
      g.rect(-r, -r * 0.6, r * 2, r * 1.3);
      g.fillStyle = '#e0a030';
      break;
    case 'eye':
      g.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
      g.fillStyle = '#7fd0ff';
      break;
    case 'leaf':
      g.ellipse(0, 0, r * 0.5, r, Math.PI / 4, 0, Math.PI * 2);
      g.fillStyle = '#5fcf5a';
      break;
    default: {
      // star
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = '#ffd23f';
    }
  }
  g.fill();
  g.stroke();
  g.restore();
}

/** the hero: an arrow pointing the way it faces */
function hero(g: G, x: number, y: number, heading: number, r: number, c: MapColors, t: number, blink: boolean) {
  if (blink && Math.floor(t * 3) % 2 === 1) return;
  g.save();
  g.translate(x, y);
  g.rotate(-heading);
  g.beginPath();
  g.moveTo(0, r * 1.2);
  g.lineTo(r * 0.8, -r * 0.8);
  g.lineTo(0, -r * 0.35);
  g.lineTo(-r * 0.8, -r * 0.8);
  g.closePath();
  g.fillStyle = c.accent;
  g.strokeStyle = '#000000';
  g.lineWidth = Math.max(1, r / 5);
  g.fill();
  g.stroke();
  g.restore();
}

function frameOf(g: G, x: number, y: number, w: number, h: number, frame: string, c: MapColors, round = false) {
  if (frame === 'none') return;
  const col =
    frame === 'wood'
      ? '#6b4423'
      : frame === 'stone'
        ? '#77746c'
        : frame === 'gold'
          ? '#c9a23a'
          : frame === 'slate'
            ? '#3a6f78'
            : c.ink;
  const lw = frame === 'thin' ? 2 : frame === 'slate' ? 3 : 6;
  g.save();
  g.lineWidth = lw;
  g.strokeStyle = col;
  g.beginPath();
  if (round) g.arc(x + w / 2, y + h / 2, w / 2 - lw / 2, 0, Math.PI * 2);
  else g.rect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  g.stroke();
  if (frame === 'gold' || frame === 'wood') {
    g.lineWidth = 1;
    g.strokeStyle = alpha('#000000', 0.5);
    g.beginPath();
    if (round) g.arc(x + w / 2, y + h / 2, w / 2 - lw - 1, 0, Math.PI * 2);
    else g.rect(x + lw + 1, y + lw + 1, w - lw * 2 - 2, h - lw * 2 - 2);
    g.stroke();
  }
  g.restore();
}

// ---------- the pause map ----------

export type PauseOptions = {
  /** the floor shown (a dungeon) */
  floor?: number;
  /** seconds (the hero blinks, the goal breathes) */
  t?: number;
  /** what the dungeon has given the hero (shown under its room plan) */
  legend?: { keys: number; bossKey: boolean; map: boolean; compass: boolean } | null;
  /** the area to draw in (default: all of the canvas) */
  box?: { x: number; y: number; w: number; h: number };
};

/** where the pause map put the land: studs to canvas pixels and back (for placing pins) */
export type MapPlace = { x0: number; z0: number; k: number; ox: number; oy: number };

export function drawPause(g: G, W: number, H: number, m: MapModel, look: FullPause, o: PauseOptions = {}): MapPlace {
  const st: Style = look;
  const c = look.colors;
  const t = o.t ?? 0;
  const box = o.box ?? { x: 0, y: 0, w: W, h: H };
  const floor = o.floor ?? (m.dungeon ? (m.hero ? floorOf(m.hero.y) : (m.floors[0] ?? 0)) : 0);
  const useFloor = m.dungeon && look.type === 'floors' ? floor : null;
  g.save();
  g.fillStyle = look.type === 'chart' ? c.water : c.back;
  g.fillRect(box.x, box.y, box.w, box.h);
  if (look.type === 'parchment') {
    // the paper's grain
    g.fillStyle = alpha(c.ink, 0.04);
    for (let i = 0; i < 40; i++) g.fillRect(box.x, box.y + ((i * 37) % box.h), box.w, 1);
  }
  const { img, top } = land(m, st, useFloor);
  const pad = 26;
  const side = look.type === 'floors' && m.dungeon ? 56 : 0;
  const k = Math.min((box.w - pad * 2 - side) / top.w, (box.h - pad * 2 - (o.legend ? 28 : 0)) / top.h);
  const ox = box.x + side + pad + (box.w - pad * 2 - side - top.w * k) / 2;
  const oy = box.y + pad + (box.h - pad * 2 - (o.legend ? 28 : 0) - top.h * k) / 2;
  const toScreen = (x: number, z: number): [number, number] => [ox + (x - top.x0) * k, oy + (z - top.z0) * k];
  g.imageSmoothingEnabled = look.type === 'parchment' || look.type === 'contour';
  if (look.type === 'screens') {
    // each screen a tile with a gap between, unseen ones grey
    const s = SCREEN;
    const sx0 = Math.floor(top.x0 / s);
    const sz0 = Math.floor(top.z0 / s);
    const sx1 = Math.ceil((top.x0 + top.w) / s);
    const sz1 = Math.ceil((top.z0 + top.h) / s);
    for (let sz = sz0; sz < sz1; sz++)
      for (let sx = sx0; sx < sx1; sx++) {
        const [px, py] = toScreen(sx * s, sz * s);
        const seen = screenSeen(m, sx, sz, floor);
        const gap = Math.max(1, k * 0.8);
        if (seen) {
          g.drawImage(
            img,
            sx * s - top.x0,
            sz * s - top.z0,
            s,
            s,
            px + gap / 2,
            py + gap / 2,
            s * k - gap,
            s * k - gap,
          );
        } else if (look.fog !== 'none') {
          g.fillStyle = c.fog;
          g.fillRect(px + gap / 2, py + gap / 2, s * k - gap, s * k - gap);
        } else
          g.drawImage(
            img,
            sx * s - top.x0,
            sz * s - top.z0,
            s,
            s,
            px + gap / 2,
            py + gap / 2,
            s * k - gap,
            s * k - gap,
          );
      }
  } else {
    g.drawImage(img, ox, oy, top.w * k, top.h * k);
    fogOver(g, m, st, useFloor ?? 0, toScreen, k);
  }
  if (look.type === 'floors' && m.dungeon) roomLines(g, m, useFloor ?? 0, toScreen, k, c);
  if (look.grid || look.type === 'chart')
    gridOver(g, top, toScreen, k, look.type === 'chart' ? CHART : SCREEN * 2, c, look.type === 'chart');
  // names
  if (look.markers.names)
    for (const mk of m.markers)
      if (mk.kind === 'name' && m.showsMarker(mk, floor)) {
        const [x, y] = toScreen(mk.x, mk.z);
        g.font = look.type === 'parchment' ? 'italic 600 15px Georgia, serif' : '600 13px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = c.ink;
        g.strokeStyle = alpha(look.type === 'parchment' ? c.back : '#000000', 0.7);
        g.lineWidth = 3;
        g.strokeText(mk.label ?? '', x, y);
        g.fillText(mk.label ?? '', x, y);
      }
  // markers
  const r = Math.max(6, Math.min(11, k * 2.6));
  for (const mk of m.markers) {
    if (mk.kind === 'name' || !showsKind(look.markers, mk)) continue;
    if (!m.showsMarker(mk, floor)) continue;
    const [x, y] = toScreen(mk.x, mk.z);
    icon(g, mk, x, y, r, st, t);
    if (mk.kind === 'pin' && mk.label) {
      g.font = '12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = c.ink;
      g.fillText(mk.label, x, y + r + 12);
    }
  }
  if (m.hero && (!m.dungeon || look.type !== 'floors' || floorOf(m.hero.y) === floor)) {
    const [x, y] = toScreen(m.hero.x, m.hero.z);
    hero(g, x, y, m.hero.heading, r * 1.1, c, t, true);
  }
  if (look.type === 'parchment' || look.type === 'chart') compassRose(g, box.x + box.w - 46, box.y + 46, 26, c);
  if (look.type === 'floors' && m.dungeon) floorTabs(g, m, floor, box, c);
  if (o.legend) legendRow(g, o.legend, box, c, st);
  frameOf(g, box.x, box.y, box.w, box.h, look.frame, c);
  g.restore();
  return { x0: top.x0, z0: top.z0, k, ox, oy };
}

const showsKind = (on: Record<string, boolean>, mk: MapMarker) => {
  switch (mk.kind) {
    case 'chest':
      return on.chests !== false;
    case 'key':
    case 'boss-key':
      return on.keys !== false;
    case 'boss':
      return on.boss !== false;
    case 'door':
    case 'boss-door':
      return on.doors !== false;
    case 'exit':
      return on.exits !== false;
    case 'person':
    case 'foe':
      return on.people === true;
    case 'pin':
      return on.pins !== false;
    case 'goal':
      return on.goal !== false;
    default:
      return true;
  }
};

/** a screen of the grid has been seen (any of its cells) */
function screenSeen(m: MapModel, sx: number, sz: number, floor: number) {
  if (!m.seen) return true;
  for (let x = sx * SCREEN; x < (sx + 1) * SCREEN; x += SEEN_CELL)
    for (let z = sz * SCREEN; z < (sz + 1) * SCREEN; z += SEEN_CELL) if (m.shows(x, z, floor)) return true;
  return false;
}

function gridOver(
  g: G,
  top: Top,
  toScreen: (x: number, z: number) => [number, number],
  k: number,
  s: number,
  c: MapColors,
  letters: boolean,
) {
  const x0 = Math.floor(top.x0 / s) * s;
  const z0 = Math.floor(top.z0 / s) * s;
  const x1 = top.x0 + top.w;
  const z1 = top.z0 + top.h;
  g.save();
  g.strokeStyle = alpha(c.ink, letters ? 0.45 : 0.12);
  g.lineWidth = 1;
  g.font = '600 11px system-ui, sans-serif';
  g.fillStyle = alpha(c.ink, 0.8);
  g.textAlign = 'center';
  let col = 0;
  for (let x = x0; x <= x1; x += s, col++) {
    const [px, py] = toScreen(x, z0);
    const [, py1] = toScreen(x, z1);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px, py1);
    g.stroke();
    if (letters && x + s <= x1 + s) g.fillText(String.fromCharCode(65 + (col % 26)), px + (s * k) / 2, py - 6);
  }
  let row = 1;
  for (let z = z0; z <= z1; z += s, row++) {
    const [px, py] = toScreen(x0, z);
    const [px1] = toScreen(x1, z);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px1, py);
    g.stroke();
    if (letters) g.fillText(String(row), px - 10, py + (s * k) / 2 + 4);
  }
  g.restore();
}

/** the room plan's rooms: each seen cell's outline where the next cell is not a room */
function roomLines(
  g: G,
  m: MapModel,
  floor: number,
  toScreen: (x: number, z: number) => [number, number],
  k: number,
  c: MapColors,
) {
  const top = m.top(floor);
  const room = (cx: number, cz: number) => {
    if (!m.shows(cx * SEEN_CELL, cz * SEEN_CELL, floor)) return false;
    // a room: the cell has any floor bricks
    for (let x = cx * SEEN_CELL; x < (cx + 1) * SEEN_CELL; x += 2)
      for (let z = cz * SEEN_CELL; z < (cz + 1) * SEEN_CELL; z += 2) {
        const ix = x - top.x0;
        const iz = z - top.z0;
        if (ix >= 0 && iz >= 0 && ix < top.w && iz < top.h && top.color[iz * top.w + ix]) return true;
      }
    return false;
  };
  const s = SEEN_CELL * k;
  g.save();
  g.strokeStyle = c.ink;
  g.lineWidth = Math.max(1.5, k * 0.6);
  for (let cz = Math.floor(top.z0 / SEEN_CELL); cz <= Math.ceil((top.z0 + top.h) / SEEN_CELL); cz++)
    for (let cx = Math.floor(top.x0 / SEEN_CELL); cx <= Math.ceil((top.x0 + top.w) / SEEN_CELL); cx++) {
      if (!room(cx, cz)) continue;
      const [x, y] = toScreen(cx * SEEN_CELL, cz * SEEN_CELL);
      g.beginPath();
      if (!room(cx, cz - 1)) {
        g.moveTo(x, y);
        g.lineTo(x + s, y);
      }
      if (!room(cx, cz + 1)) {
        g.moveTo(x, y + s);
        g.lineTo(x + s, y + s);
      }
      if (!room(cx - 1, cz)) {
        g.moveTo(x, y);
        g.lineTo(x, y + s);
      }
      if (!room(cx + 1, cz)) {
        g.moveTo(x + s, y);
        g.lineTo(x + s, y + s);
      }
      g.stroke();
    }
  g.restore();
}

/** the dungeon's floors down the side: B1, 1F, 2F; the one shown lit, the hero's marked */
function floorTabs(
  g: G,
  m: MapModel,
  floor: number,
  box: { x: number; y: number; w: number; h: number },
  c: MapColors,
) {
  const fs = [...m.floors].reverse();
  g.save();
  g.font = '700 13px system-ui, sans-serif';
  g.textAlign = 'center';
  fs.forEach((f, i) => {
    const x = box.x + 14;
    const y = box.y + 30 + i * 30;
    g.fillStyle = f === floor ? c.accent : alpha(c.ink, 0.15);
    g.fillRect(x, y, 40, 24);
    g.fillStyle = f === floor ? '#000000' : c.ink;
    g.fillText(floorName(f), x + 20, y + 16);
    if (m.hero && floorOf(m.hero.y) === f) {
      g.fillStyle = c.accent;
      g.beginPath();
      g.moveTo(x + 44, y + 12);
      g.lineTo(x + 52, y + 6);
      g.lineTo(x + 52, y + 18);
      g.fill();
    }
  });
  g.restore();
}

/** a floor's name: 1F, 2F… above ground, B1, B2… below */
export const floorName = (f: number) => (f >= 0 ? `${f + 1}F` : `B${-f}`);

/** where the floor tabs are (for clicking them) */
export function floorTabAt(m: MapModel, box: { x: number; y: number }, px: number, py: number): number | null {
  const fs = [...m.floors].reverse();
  for (let i = 0; i < fs.length; i++) {
    const x = box.x + 14;
    const y = box.y + 30 + i * 30;
    if (px >= x && px <= x + 40 && py >= y && py <= y + 24) return fs[i]!;
  }
  return null;
}

function legendRow(
  g: G,
  l: { keys: number; bossKey: boolean; map: boolean; compass: boolean },
  box: { x: number; y: number; w: number; h: number },
  c: MapColors,
  st: Pick<Style, 'icons' | 'colors'>,
) {
  const y = box.y + box.h - 26;
  let x = box.x + 70;
  g.save();
  g.font = '600 13px system-ui, sans-serif';
  g.fillStyle = c.ink;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  // each part: its icon, then its words, then a gap
  const part = (kind: 'key' | 'boss-key' | null, done: boolean, text: string) => {
    if (kind) {
      icon(g, { kind, x: 0, z: 0, done }, x + 7, y, 7, st);
      x += 18;
    }
    g.fillStyle = c.ink;
    g.fillText(text, x, y);
    x += g.measureText(text).width + 22;
  };
  part('key', false, `× ${l.keys}`);
  part('boss-key', !l.bossKey, l.bossKey ? 'Boss key' : 'No boss key');
  part(null, false, `${l.map ? '✓' : '·'} Dungeon map`);
  part(null, false, `${l.compass ? '✓' : '·'} Compass`);
  g.restore();
}

function compassRose(g: G, x: number, y: number, r: number, c: MapColors) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = c.ink;
  g.fillStyle = c.ink;
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.18, 0);
    g.lineTo(-r * 0.18, 0);
    g.closePath();
    g.fill();
  }
  g.font = '700 11px Georgia, serif';
  g.textAlign = 'center';
  g.rotate(0);
  g.restore();
  g.save();
  g.fillStyle = c.ink;
  g.font = '700 12px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('N', x, y - r - 4);
  g.restore();
}

// ---------- the map in play ----------

/** draws the map in play into a size×size canvas; camYaw turns a round one that turns with the camera */
export function drawMini(g: G, size: number, m: MapModel, look: FullMini, camYaw = 0, t = 0) {
  const st: Style = look;
  const c = look.colors;
  g.clearRect(0, 0, size, size);
  if (look.type === 'off' || !m.hero) return;
  const h = m.hero;
  const floor = m.dungeon ? floorOf(h.y) : 0;
  const round = look.type === 'round';
  g.save();
  g.beginPath();
  if (round) g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  else g.rect(0, 0, size, size);
  g.clip();
  g.fillStyle = c.back;
  g.fillRect(0, 0, size, size);
  if (look.type === 'screens') {
    miniScreens(g, size, m, st, floor, t);
  } else {
    const k = size / look.span;
    const { img, top } = land(m, st, m.dungeon ? floor : null);
    g.save();
    g.translate(size / 2, size / 2);
    // a round map that turns: the way the camera looks is up
    // (the camera looks along (-sin camYaw, -cos camYaw): turning the map by camYaw puts that way up)
    const turn = round && look.turns ? camYaw : 0;
    g.rotate(turn);
    g.imageSmoothingEnabled = false;
    g.drawImage(img, (top.x0 - h.x) * k, (top.z0 - h.z) * k, top.w * k, top.h * k);
    const toScreen = (x: number, z: number): [number, number] => [(x - h.x) * k, (z - h.z) * k];
    fogOver(g, m, st, floor, toScreen, k);
    for (const mk of m.markers) {
      if (mk.kind === 'name' || !showsKind(look.markers, mk) || !m.showsMarker(mk, floor)) continue;
      const [x, y] = toScreen(mk.x, mk.z);
      const far = Math.hypot(x, y) > size / 2 - 8;
      if (far && mk.kind !== 'goal') continue;
      g.save();
      g.translate(x, y);
      g.rotate(-turn);
      if (far) {
        // where to go next, off the map: an arrow at its edge, pointing to it
        g.restore();
        const a = Math.atan2(y, x);
        const rr = size / 2 - 10;
        g.save();
        g.translate(Math.cos(a) * rr, Math.sin(a) * rr);
        g.rotate(a + Math.PI / 2);
        g.beginPath();
        g.moveTo(0, -8);
        g.lineTo(6, 5);
        g.lineTo(-6, 5);
        g.closePath();
        g.fillStyle = c.accent;
        g.strokeStyle = '#000000';
        g.fill();
        g.stroke();
        g.restore();
        continue;
      }
      icon(g, mk, 0, 0, 5.5, st, t);
      g.restore();
    }
    g.restore();
    // the hero in the middle (pointing its way; up when the map turns with the camera)
    hero(g, size / 2, size / 2, round && look.turns ? h.heading - camYaw : h.heading, 6, c, t, false);
  }
  g.restore();
  if (round) compassRing(g, size, look.turns ? camYaw : 0, c);
  frameOf(g, 0, 0, size, size, look.frame, c, round);
}

/** the screens around the hero's, its own lit */
function miniScreens(g: G, size: number, m: MapModel, st: Style, floor: number, t: number) {
  const h = m.hero!;
  const n = 5;
  const tile = size / n;
  const hx = Math.floor(h.x / SCREEN);
  const hz = Math.floor(h.z / SCREEN);
  const { img, top } = land(m, st, m.dungeon ? floor : null);
  g.imageSmoothingEnabled = false;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const sx = hx + i - 2;
      const sz = hz + j - 2;
      const x = i * tile;
      const y = j * tile;
      if (screenSeen(m, sx, sz, floor))
        g.drawImage(img, sx * SCREEN - top.x0, sz * SCREEN - top.z0, SCREEN, SCREEN, x + 1, y + 1, tile - 2, tile - 2);
      else {
        g.fillStyle = st.colors.fog;
        g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
  // the hero's screen blinks
  if (Math.floor(t * 2) % 2 === 0) {
    g.strokeStyle = st.colors.accent;
    g.lineWidth = 2;
    g.strokeRect(2 * tile + 1, 2 * tile + 1, tile - 2, tile - 2);
  }
  const px = 2 * tile + ((h.x - hx * SCREEN) / SCREEN) * tile;
  const py = 2 * tile + ((h.z - hz * SCREEN) / SCREEN) * tile;
  hero(g, px, py, h.heading, 4.5, st.colors, t, false);
}

function compassRing(g: G, size: number, turn: number, c: MapColors) {
  g.save();
  g.translate(size / 2, size / 2);
  g.strokeStyle = alpha(c.ink, 0.6);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, size / 2 - 9, 0, Math.PI * 2);
  g.stroke();
  g.font = '700 11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const dirs: [string, number][] = [
    ['N', Math.PI],
    ['E', Math.PI / 2],
    ['S', 0],
    ['W', -Math.PI / 2],
  ];
  for (const [d, a0] of dirs) {
    // north is -z (the map's top): on the ring at the angle the map is turned
    const a = a0 - turn;
    const x = Math.sin(a) * (size / 2 - 9);
    const y = Math.cos(a) * (size / 2 - 9);
    g.fillStyle = d === 'N' ? c.accent : c.ink;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fillStyle = d === 'N' ? c.accent : alpha('#000000', 0.6);
    g.fill();
    g.fillStyle = d === 'N' ? '#000000' : c.ink;
    g.fillText(d, x, y + 0.5);
  }
  g.restore();
}
