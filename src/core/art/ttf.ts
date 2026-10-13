import type { ArtSource } from '../schema/art';

/**
 * P31: a pixel font designed in the editor, written out as a real TrueType (.ttf) font. Each lit pixel is
 * a square (runs of pixels in a row are merged), so the font draws crisp at any size, loads in every
 * browser with FontFace, and installs on a computer like any other font.
 */
type PixelFont = Extract<ArtSource, { type: 'pixelFont' }>;

const U = 100; // font units per pixel

class Out {
  private bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 255);
  }
  u16(v: number) {
    this.bytes.push((v >> 8) & 255, v & 255);
  }
  i16(v: number) {
    this.u16(v < 0 ? v + 65536 : v);
  }
  u32(v: number) {
    this.u16((v >>> 16) & 65535);
    this.u16(v & 65535);
  }
  tag(t: string) {
    for (let i = 0; i < 4; i++) this.u8(t.charCodeAt(i));
  }
  raw(b: Uint8Array | number[]) {
    for (const x of b) this.bytes.push(x);
  }
  pad4() {
    while (this.bytes.length % 4) this.bytes.push(0);
  }
  get length() {
    return this.bytes.length;
  }
  done(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

const sum32 = (b: Uint8Array) => {
  let s = 0;
  for (let i = 0; i < b.length; i += 4)
    s = (s + (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  return s;
};

type Glyph = { rects: [number, number, number, number][] };

/** The lit pixels of one character as rectangles in font units (y up, baseline at 0). */
export function glyphRects(rows: string[], baseline: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] !== '#') {
        c++;
        continue;
      }
      let e = c + 1;
      while (e < row.length && row[e] === '#') e++;
      const top = (baseline - r) * U;
      out.push([c * U, top - U, e * U, top]);
      c = e;
    }
  });
  return out;
}

export function pixelFontTtf(src: PixelFont, family: string): Uint8Array {
  const chars = Object.keys(src.glyphs)
    .filter((ch) => ch !== ' ' && ch.codePointAt(0)! <= 0xffff)
    .sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  const ascent = src.baseline * U;
  const descent = (src.cellH - src.baseline) * U;
  const advance = (src.cellW + src.spacing) * U;
  const glyphs: Glyph[] = [
    // .notdef: a hollow box
    {
      rects: [
        [U, 0, (src.cellW - 1) * U, U],
        [U, ascent - U, (src.cellW - 1) * U, ascent],
        [U, U, 2 * U, ascent - U],
        [(src.cellW - 2) * U, U, (src.cellW - 1) * U, ascent - U],
      ],
    },
    { rects: [] }, // space
    ...chars.map((ch) => ({ rects: glyphRects(src.glyphs[ch]!.split('|'), src.baseline) })),
  ];
  const cmap: [number, number][] = [[32, 1], ...chars.map((ch, i): [number, number] => [ch.codePointAt(0)!, i + 2])];

  // glyf + loca
  const glyf = new Out();
  const loca: number[] = [];
  let maxPoints = 0;
  let maxContours = 0;
  let xMin = 0;
  let yMin = 0;
  let xMax = 0;
  let yMax = 0;
  const lsb: number[] = [];
  for (const g of glyphs) {
    loca.push(glyf.length);
    if (!g.rects.length) {
      lsb.push(0);
      continue;
    }
    const gx0 = Math.min(...g.rects.map((r) => r[0]));
    const gy0 = Math.min(...g.rects.map((r) => r[1]));
    const gx1 = Math.max(...g.rects.map((r) => r[2]));
    const gy1 = Math.max(...g.rects.map((r) => r[3]));
    xMin = Math.min(xMin, gx0);
    yMin = Math.min(yMin, gy0);
    xMax = Math.max(xMax, gx1);
    yMax = Math.max(yMax, gy1);
    lsb.push(gx0);
    glyf.i16(g.rects.length);
    glyf.i16(gx0);
    glyf.i16(gy0);
    glyf.i16(gx1);
    glyf.i16(gy1);
    for (let i = 0; i < g.rects.length; i++) glyf.u16(i * 4 + 3);
    glyf.u16(0); // no instructions
    const pts = g.rects.flatMap(([x0, y0, x1, y1]) => [
      [x0, y0],
      [x0, y1],
      [x1, y1],
      [x1, y0],
    ]);
    for (let i = 0; i < pts.length; i++) glyf.u8(1); // on-curve, 16-bit deltas
    let px = 0;
    for (const [x] of pts) {
      glyf.i16(x! - px);
      px = x!;
    }
    let py = 0;
    for (const [, y] of pts) {
      glyf.i16(y! - py);
      py = y!;
    }
    glyf.pad4();
    maxPoints = Math.max(maxPoints, pts.length);
    maxContours = Math.max(maxContours, g.rects.length);
  }
  loca.push(glyf.length);
  const locaT = new Out();
  for (const o of loca) locaT.u32(o);

  // cmap (format 4, one segment per character)
  const cm = new Out();
  cm.u16(0);
  cm.u16(2);
  cm.u16(0);
  cm.u16(3);
  cm.u32(20);
  cm.u16(3);
  cm.u16(1);
  cm.u32(20);
  const segs = [...cmap, [0xffff, 0] as [number, number]];
  const segCount = segs.length;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segCount));
  cm.u16(4);
  cm.u16(16 + 8 * segCount);
  cm.u16(0);
  cm.u16(segCount * 2);
  cm.u16(searchRange);
  cm.u16(Math.log2(searchRange / 2));
  cm.u16(segCount * 2 - searchRange);
  for (const [c] of segs) cm.u16(c);
  cm.u16(0);
  for (const [c] of segs) cm.u16(c);
  for (const [c, g] of segs) cm.u16(c === 0xffff ? 1 : (g - c + 65536) % 65536);
  for (let i = 0; i < segCount; i++) cm.u16(0);

  // hmtx
  const hm = new Out();
  glyphs.forEach((_, i) => {
    hm.u16(advance);
    hm.i16(lsb[i]!);
  });

  const unitsPerEm = src.cellH * U;
  // head (checksum adjustment filled in at the end)
  const head = new Out();
  head.u32(0x00010000);
  head.u32(0x00010000);
  head.u32(0);
  head.u32(0x5f0f3cf5);
  head.u16(0x000b);
  head.u16(unitsPerEm);
  head.u32(0);
  head.u32(0);
  head.u32(0);
  head.u32(0);
  head.i16(xMin);
  head.i16(yMin);
  head.i16(xMax);
  head.i16(yMax);
  head.u16(0);
  head.u16(6);
  head.i16(2);
  head.i16(1); // long loca
  head.i16(0);

  const hhea = new Out();
  hhea.u32(0x00010000);
  hhea.i16(ascent);
  hhea.i16(-descent);
  hhea.i16(0);
  hhea.u16(advance);
  hhea.i16(0);
  hhea.i16(0);
  hhea.i16(xMax);
  hhea.i16(1);
  hhea.i16(0);
  hhea.i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0);
  hhea.u16(glyphs.length);

  const maxp = new Out();
  maxp.u32(0x00010000);
  maxp.u16(glyphs.length);
  maxp.u16(maxPoints);
  maxp.u16(maxContours);
  maxp.u16(0);
  maxp.u16(0);
  maxp.u16(2);
  for (let i = 0; i < 8; i++) maxp.u16(0);

  const os2 = new Out();
  os2.u16(4);
  os2.i16(advance);
  os2.u16(400);
  os2.u16(5);
  os2.u16(0);
  const sub = Math.round(unitsPerEm * 0.6);
  for (const v of [
    sub,
    sub,
    0,
    Math.round(unitsPerEm * 0.1),
    sub,
    sub,
    0,
    Math.round(unitsPerEm * 0.4),
    U,
    Math.round(ascent / 2),
  ])
    os2.i16(v);
  os2.i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(1);
  os2.u32(0);
  os2.u32(0);
  os2.u32(0);
  os2.tag('BWRK');
  os2.u16(0x0040);
  os2.u16(Math.min(...cmap.map((c) => c[0])));
  os2.u16(Math.max(...cmap.map((c) => c[0])));
  os2.i16(ascent);
  os2.i16(-descent);
  os2.i16(0);
  os2.u16(Math.max(ascent, yMax));
  os2.u16(Math.max(descent, -yMin));
  os2.u32(1);
  os2.u32(0);
  os2.i16(Math.round(ascent * 0.7));
  os2.i16(ascent);
  os2.u16(0);
  os2.u16(32);
  os2.u16(1);

  // name: family, style, unique, full, version, PostScript name (Windows Unicode)
  const ps = family.replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || 'BrickFont';
  const names: [number, string][] = [
    [1, family],
    [2, 'Regular'],
    [3, `${ps}-Regular`],
    [4, family],
    [5, 'Version 1.0'],
    [6, `${ps}-Regular`],
  ];
  const nm = new Out();
  nm.u16(0);
  nm.u16(names.length);
  nm.u16(6 + names.length * 12);
  const strings = new Out();
  for (const [id, text] of names) {
    nm.u16(3);
    nm.u16(1);
    nm.u16(0x409);
    nm.u16(id);
    nm.u16(text.length * 2);
    nm.u16(strings.length);
    for (const ch of text) strings.u16(ch.charCodeAt(0));
  }
  nm.raw(strings.done());

  const post = new Out();
  post.u32(0x00030000);
  post.u32(0);
  post.i16(-U);
  post.i16(Math.round(U / 2));
  post.u32(1);
  for (let i = 0; i < 4; i++) post.u32(0);

  const tables: [string, Uint8Array][] = [
    ['OS/2', os2.done()],
    ['cmap', cm.done()],
    ['glyf', glyf.done()],
    ['head', head.done()],
    ['hhea', hhea.done()],
    ['hmtx', hm.done()],
    ['loca', locaT.done()],
    ['maxp', maxp.done()],
    ['name', nm.done()],
    ['post', post.done()],
  ];
  const font = new Out();
  const n = tables.length;
  const sr = 16 * 2 ** Math.floor(Math.log2(n));
  font.u32(0x00010000);
  font.u16(n);
  font.u16(sr);
  font.u16(Math.log2(sr / 16));
  font.u16(n * 16 - sr);
  let offset = 12 + n * 16;
  const offsets: number[] = [];
  for (const [tag, data] of tables) {
    font.tag(tag);
    const padded = new Uint8Array(Math.ceil(data.length / 4) * 4);
    padded.set(data);
    font.u32(sum32(padded));
    font.u32(offset);
    font.u32(data.length);
    offsets.push(offset);
    offset += padded.length;
  }
  for (const [, data] of tables) {
    font.raw(data);
    font.pad4();
  }
  const bytes = font.done();
  // head.checkSumAdjustment = 0xB1B0AFBA − checksum of the whole font
  const headAt = offsets[3]! + 8;
  const adj = (0xb1b0afba - sum32(bytes)) >>> 0;
  bytes[headAt] = adj >>> 24;
  bytes[headAt + 1] = (adj >>> 16) & 255;
  bytes[headAt + 2] = (adj >>> 8) & 255;
  bytes[headAt + 3] = adj & 255;
  return bytes;
}

/** A starter pixel font (5×7 letters in a 6×9 cell) so designing starts from something readable. */
export function starterGlyphs(): Record<string, string> {
  const F: Record<string, string[]> = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
    '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
    ';': ['.....', '.##..', '.##..', '.....', '.##..', '..#..', '.#...'],
    '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
    ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
    '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
    '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
    '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
    ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  };
  // lowercase: 5 rows tall above the baseline, with descenders in the 2 rows below it
  const lower: Record<string, string[]> = {
    a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####', '.....', '.....'],
    b: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.', '.....', '.....'],
    c: ['.....', '.....', '.###.', '#....', '#....', '#...#', '.###.', '.....', '.....'],
    d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####', '.....', '.....'],
    e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.', '.....', '.....'],
    f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...', '.....', '.....'],
    g: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
    h: ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#', '.....', '.....'],
    i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.', '.....', '.....'],
    j: ['...#.', '.....', '..##.', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '.....', '.....'],
    l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.', '.....', '.....'],
    m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#.#.#', '#...#', '.....', '.....'],
    n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#', '.....', '.....'],
    o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.', '.....', '.....'],
    p: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '####.', '#....', '#....'],
    q: ['.....', '.....', '.####', '#...#', '#...#', '#...#', '.####', '....#', '....#'],
    r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....', '.....', '.....'],
    s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.', '.....', '.....'],
    t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.', '.....', '.....'],
    u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '.....', '.....'],
    v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..', '.....', '.....'],
    w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.', '.....', '.....'],
    x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....', '.....'],
    y: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
    z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####', '.....', '.....'],
  };
  const out: Record<string, string> = {};
  for (const [ch, rows] of Object.entries(F)) {
    // 6×9 cell: one column of space on the right, the letter's 7 rows above the baseline, 2 rows below
    const cell = [...rows.map((r) => `${r}.`), '......', '......'];
    out[ch] = cell.join('|');
  }
  for (const [ch, rows] of Object.entries(lower)) out[ch] = rows.map((r) => `${r}.`).join('|');
  return out;
}
