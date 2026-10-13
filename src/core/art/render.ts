import { type ArtSource, PIXEL_KEYS } from '../schema/art';

/**
 * P31 art as SVG: generated backgrounds and drawn pixel art become small SVG pictures, so the same
 * art file shows the same in the editor, in Play and in an exported game, at any size.
 */
type Pattern = Extract<ArtSource, { type: 'pattern' }>;
type Pixels = Extract<ArtSource, { type: 'pixels' }>;

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
/** #rrggbbaa → fill + opacity attributes (SVG 1.1 viewers ignore 8-digit hex) */
function fill(hex: string, attr = 'fill'): string {
  if (hex.length === 9) {
    const a = Number.parseInt(hex.slice(7), 16) / 255;
    return `${attr}="${hex.slice(0, 7)}" ${attr}-opacity="${a.toFixed(3)}"`;
  }
  return `${attr}="${esc(hex)}"`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A generated background, as one repeat tile (or a full picture for gradients), sized w×h. */
export function patternSvg(p: Pattern, w = 640, h = 360): string {
  const a = p.colors[0] ?? '#000000';
  const b = p.colors[1] ?? '#ffffff';
  const c = p.colors[2] ?? b;
  const s = p.scale;
  const rot = `rotate(${p.angle})`;
  const tile = (body: string, tw = s, th = s, transform = '') =>
    `<defs><pattern id="p" width="${tw}" height="${th}" patternUnits="userSpaceOnUse"${transform ? ` patternTransform="${transform}"` : ''}>${body}</pattern></defs><rect width="100%" height="100%" fill="url(#p)"/>`;
  let body: string;
  switch (p.pattern) {
    case 'solid':
      body = `<rect width="100%" height="100%" ${fill(a)}/>`;
      break;
    case 'linear': {
      const rad = ((p.angle - 90) * Math.PI) / 180;
      const x = Math.cos(rad) / 2;
      const y = Math.sin(rad) / 2;
      body = `<defs><linearGradient id="g" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}"><stop offset="0" stop-color="${a.slice(0, 7)}"/>${p.colors.length > 2 ? `<stop offset="0.5" stop-color="${b.slice(0, 7)}"/>` : ''}<stop offset="1" stop-color="${(p.colors.length > 2 ? c : b).slice(0, 7)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>`;
      break;
    }
    case 'radial':
      body = `<defs><radialGradient id="g" cx="0.5" cy="0.5" r="${Math.max(0.2, s / 200)}"><stop offset="0" stop-color="${a.slice(0, 7)}"/><stop offset="1" stop-color="${b.slice(0, 7)}"/></radialGradient></defs><rect width="100%" height="100%" ${fill(b)}/><rect width="100%" height="100%" fill="url(#g)"/>`;
      break;
    case 'stripes':
      body = tile(
        `<rect width="${s}" height="${s}" ${fill(a)}/><rect width="${s / 2}" height="${s}" ${fill(b)}/>`,
        s,
        s,
        rot,
      );
      break;
    case 'dots':
      body = tile(
        `<rect width="${s}" height="${s}" ${fill(a)}/><circle cx="${s / 2}" cy="${s / 2}" r="${s / 5}" ${fill(b)}/>`,
      );
      break;
    case 'checks':
      body = tile(
        `<rect width="${s}" height="${s}" ${fill(a)}/><rect width="${s / 2}" height="${s / 2}" ${fill(b)}/><rect x="${s / 2}" y="${s / 2}" width="${s / 2}" height="${s / 2}" ${fill(b)}/>`,
        s,
        s,
        rot,
      );
      break;
    case 'bricks': {
      const bh = s / 2;
      body = tile(
        `<rect width="${s}" height="${s}" ${fill(b)}/><rect x="1" y="1" width="${s - 2}" height="${bh - 2}" rx="2" ${fill(a)}/><rect x="${-s / 2 + 1}" y="${bh + 1}" width="${s - 2}" height="${bh - 2}" rx="2" ${fill(a)}/><rect x="${s / 2 + 1}" y="${bh + 1}" width="${s - 2}" height="${bh - 2}" rx="2" ${fill(a)}/>`,
      );
      break;
    }
    case 'waves':
      body = tile(
        `<rect width="${s * 2}" height="${s}" ${fill(a)}/><path d="M0 ${s * 0.6} Q ${s / 2} ${s * 0.2} ${s} ${s * 0.6} T ${s * 2} ${s * 0.6} V ${s} H 0 Z" ${fill(b)}/>`,
        s * 2,
        s,
        rot,
      );
      break;
    case 'grid':
      body = tile(
        `<rect width="${s}" height="${s}" ${fill(a)}/><path d="M ${s} 0 V ${s} H 0" fill="none" ${fill(b, 'stroke')} stroke-width="${Math.max(1, s / 24)}"/>`,
      );
      break;
    case 'stars':
      body = tile(
        `<rect width="${s * 2}" height="${s * 2}" ${fill(a)}/>${[
          [0.3, 0.4, 0.06],
          [1.4, 0.2, 0.04],
          [0.9, 1.1, 0.08],
          [1.7, 1.5, 0.05],
          [0.2, 1.7, 0.035],
        ]
          .map(([x, y, r]) => `<circle cx="${x! * s}" cy="${y! * s}" r="${r! * s}" ${fill(b)}/>`)
          .join('')}`,
        s * 2,
        s * 2,
      );
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`;
}

/** Pixel grid → rows of palette indexes (-1 = see-through). */
export function decodePixels(p: Pick<Pixels, 'w' | 'h' | 'data'>): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < p.h; y++) {
    const row: number[] = [];
    for (let x = 0; x < p.w; x++) {
      const ch = p.data[y * p.w + x] ?? '.';
      row.push(ch === '.' ? -1 : PIXEL_KEYS.indexOf(ch));
    }
    rows.push(row);
  }
  return rows;
}

export function encodePixels(rows: number[][]): string {
  return rows.map((r) => r.map((i) => (i < 0 ? '.' : PIXEL_KEYS[i]!)).join('')).join('');
}

/** Drawn pixel art as crisp SVG: one rectangle per run of same-colour pixels in a row. */
export function pixelsSvg(p: Pixels): string {
  const rows = decodePixels(p);
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x]!;
      let e = x + 1;
      while (e < row.length && row[e] === c) e++;
      if (c >= 0 && p.palette[c])
        parts.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" ${fill(p.palette[c]!)}/>`);
      x = e;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w * 8}" height="${p.h * 8}" viewBox="0 0 ${p.w} ${p.h}" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

/** The SVG for art that is drawn or generated (not imported files). */
export function artSvg(src: ArtSource): string | null {
  if (src.type === 'pattern') return patternSvg(src);
  if (src.type === 'pixels') return pixelsSvg(src);
  return null;
}

/** CSS font-family of a font art file. */
export const fontFamilyOf = (artId: string) => `bwf_${artId}`;

export const GLYPH_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?\'"-+=/()%&#@*<>_[]';

/** Paint bucket: the touching pixels of the same colour as (x, y) become c. */
export function floodFill(rows: number[][], x: number, y: number, c: number): number[][] {
  const out = rows.map((r) => [...r]);
  const from = out[y]?.[x];
  if (from === undefined || from === c) return out;
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (out[py]?.[px] !== from) continue;
    out[py]![px] = c;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return out;
}
