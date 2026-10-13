import { describe, expect, it } from 'vitest';
import {
  artSvg,
  decodePixels,
  encodePixels,
  floodFill,
  GLYPH_SET,
  patternSvg,
  pixelsSvg,
} from '../../src/core/art/render';
import { glyphRects, pixelFontTtf, starterGlyphs } from '../../src/core/art/ttf';
import { CommandBus, registerAll } from '../../src/core/commands';
import { ACCEPT_OF, importMedia } from '../../src/core/media/import';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Art, paths, type Screen, type Widget } from '../../src/core/schema';
import { nearestAnchor, setLayout } from '../../src/editor/workspaces/screens/model';
import { effectiveWidget, pinOrder, pinPlace, screenScale, widgetCss } from '../../src/engine/ui/layout';

/** P31 screen design: portrait layouts, pins, generated / drawn art and designed fonts. */

describe('Any size and orientation', () => {
  it('lays tall screens out at 720×1280 and merges the portrait layout there only', () => {
    const tall = screenScale(1080, 2340);
    expect(tall.portrait).toBe(true);
    expect(tall.scale).toBe(1.5);
    expect(tall.vw).toBe(720);
    expect(screenScale(1280, 720).portrait).toBe(false);
    const w: Widget = {
      type: 'button',
      anchor: [1, 1],
      offset: [-20, -20],
      style: { w: 200, fontSize: 20 },
      portrait: { anchor: [0.5, 1], style: { w: 300 } },
    };
    expect(effectiveWidget(w, false)).toBe(w);
    expect(effectiveWidget(w, true)).toMatchObject({
      anchor: [0.5, 1],
      offset: [-20, -20],
      style: { w: 300, fontSize: 20 },
    });
  });

  it('setLayout edits the landscape or the portrait layout, never both', () => {
    const w: Widget = { type: 'text', anchor: [0, 0], offset: [8, 8], style: { w: 100 } };
    const land = setLayout(w, false, { offset: [16, 24], style: { w: 120 } });
    expect(land).toMatchObject({ offset: [16, 24], style: { w: 120 } });
    expect(land.portrait).toBeUndefined();
    const up = setLayout(w, true, { offset: [0, 40], style: { h: 50 } });
    expect(up.offset).toEqual([8, 8]);
    expect(up.style).toEqual({ w: 100 });
    expect(up.portrait).toEqual({ offset: [0, 40], style: { h: 50 } });
    // clearing a portrait style value drops it
    expect(setLayout(up, true, { style: { h: undefined } }).portrait).toEqual({ offset: [0, 40] });
  });

  it('drops snap to the nearest of the nine anchors', () => {
    expect(nearestAnchor(0.1, 0.9)).toEqual([0, 1]);
    expect(nearestAnchor(0.5, 0.4)).toEqual([0.5, 0.5]);
    expect(nearestAnchor(0.95, 0.05)).toEqual([1, 0]);
  });
});

describe('Pins (widgets placed next to each other)', () => {
  const t = { x: 100, y: 50, w: 200, h: 40 };
  it('places below / above / right / left with start, center and end alignment and the gap', () => {
    expect(pinPlace({ to: 'a', side: 'below' }, t, 80, 20)).toEqual({ x: 100, y: 98 });
    expect(pinPlace({ to: 'a', side: 'below', align: 'center', gap: 0 }, t, 80, 20)).toEqual({ x: 160, y: 90 });
    expect(pinPlace({ to: 'a', side: 'above', align: 'end', gap: 4 }, t, 80, 20)).toEqual({ x: 220, y: 26 });
    expect(pinPlace({ to: 'a', side: 'right', gap: 10 }, t, 80, 20)).toEqual({ x: 310, y: 50 });
    expect(pinPlace({ to: 'a', side: 'left', align: 'center', gap: 10 }, t, 80, 20)).toEqual({ x: 10, y: 60 });
  });

  it('orders chains so targets come first and drops cycles', () => {
    const order = pinOrder(
      new Map([
        ['c', 'b'],
        ['b', 'a'],
        ['x', 'y'],
        ['y', 'x'],
      ]),
    );
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(order).not.toContain('x');
    expect(order).not.toContain('y');
  });

  it('a pinned widget is absolutely placed (ScreenView moves it after layout)', () => {
    expect(widgetCss({ type: 'text', pin: { to: 'a', side: 'below' } })).toMatchObject({ position: 'absolute' });
  });
});

describe('Generated and drawn art', () => {
  it('every pattern makes an SVG', () => {
    for (const pattern of [
      'solid',
      'linear',
      'radial',
      'stripes',
      'dots',
      'checks',
      'bricks',
      'waves',
      'grid',
      'stars',
    ] as const) {
      const svg = patternSvg({
        type: 'pattern',
        pattern,
        colors: ['#112233', '#445566', '#778899'],
        angle: 30,
        scale: 24,
      });
      expect(svg).toMatch(/^<svg /);
      expect(svg).toContain('#112233');
    }
  });

  it('pixels round-trip and draw as merged runs', () => {
    const rows = [
      [0, 0, 1, -1],
      [-1, 2, 2, 2],
    ];
    const data = encodePixels(rows);
    expect(data).toBe('001..222');
    expect(decodePixels({ w: 4, h: 2, data })).toEqual(rows);
    const svg = pixelsSvg({ type: 'pixels', w: 4, h: 2, palette: ['#000000', '#ffffff', '#ff0000'], data });
    expect(svg.match(/<rect/g)).toHaveLength(3); // "00", "1", "222"
    expect(artSvg({ type: 'image', media: 'x' as never })).toBeNull();
  });

  it('the paint bucket fills only the touching area of one colour', () => {
    const rows = [
      [0, 0, 1],
      [0, 1, -1],
      [1, -1, -1],
    ];
    expect(floodFill(rows, 2, 2, 3)).toEqual([
      [0, 0, 1],
      [0, 1, 3],
      [1, 3, 3],
    ]);
    expect(floodFill(rows, 0, 0, 0)).toEqual(rows);
  });
});

describe('Designed pixel fonts', () => {
  const src = { type: 'pixelFont' as const, cellW: 6, cellH: 9, baseline: 7, spacing: 1, glyphs: starterGlyphs() };

  it('the starter set covers every letter on the grid', () => {
    for (const ch of GLYPH_SET) {
      const rows = src.glyphs[ch]!.split('|'); // every letter, digit and sign has a starter shape
      expect(rows).toHaveLength(9);
      for (const r of rows) expect(r).toMatch(/^[#.]{6}$/);
    }
    expect(glyphRects(['#.', '##'], 2).length).toBeGreaterThan(0);
  });

  it('is written as a valid TrueType file (tables, checksums, a glyph for A)', () => {
    const ttf = pixelFontTtf(src, 'Test Font');
    const v = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
    expect(v.getUint32(0)).toBe(0x00010000);
    const n = v.getUint16(4);
    const tags: Record<string, { off: number; len: number; sum: number }> = {};
    for (let i = 0; i < n; i++) {
      const at = 12 + i * 16;
      const tag = String.fromCharCode(...ttf.slice(at, at + 4));
      tags[tag] = { sum: v.getUint32(at + 4), off: v.getUint32(at + 8), len: v.getUint32(at + 12) };
    }
    expect(Object.keys(tags).sort()).toEqual([
      'OS/2',
      'cmap',
      'glyf',
      'head',
      'hhea',
      'hmtx',
      'loca',
      'maxp',
      'name',
      'post',
    ]);
    const sum = (off: number, len: number) => {
      let s = 0;
      for (let i = 0; i < len; i += 4) s = (s + (i + 4 <= len ? v.getUint32(off + i) : 0)) >>> 0;
      return s;
    };
    // every table but head matches its checksum; the whole file adds up to the magic number
    for (const [tag, t] of Object.entries(tags)) if (tag !== 'head') expect(sum(t.off, (t.len + 3) & ~3)).toBe(t.sum);
    expect(sum(0, ttf.byteLength)).toBe(0xb1b0afba);
    expect(v.getUint16(tags.head!.off + 18)).toBe(900); // units per em = 9 rows × 100
    expect(v.getUint16(tags.maxp!.off + 4)).toBeGreaterThan(GLYPH_SET.length); // .notdef, space and the letters
  });
});

describe('Art commands and imports', () => {
  const setup = () => {
    const s = new ProjectStore(newProjectFiles({ name: 'A', random: () => 0.6 }));
    const bus = registerAll(new CommandBus(s));
    const run = (type: string, payload: unknown) => bus.execute({ type, payload }, { source: 'user' });
    return { s, bus, run };
  };
  const bg: Art = {
    id: 'art_bg00000001' as Art['id'],
    name: 'Sky',
    kind: 'background',
    source: { type: 'pattern', pattern: 'linear', colors: ['#000000', '#ffffff'], angle: 90, scale: 32 },
  };

  it('puts, refuses bad art, refuses deleting art in use, and undoes', () => {
    const { s, bus, run } = setup();
    expect(run('art.put', { art: bg }).ok).toBe(true);
    expect(s.get<Art>(paths.art(bg.id))!.name).toBe('Sky');
    expect(
      run('art.put', {
        art: {
          ...bg,
          id: 'art_px00000001',
          kind: 'icon',
          source: { type: 'pixels', w: 4, h: 4, palette: ['#000000'], data: '0' },
        },
      }).error,
    ).toMatch(/does not match/);
    expect(
      run('art.put', {
        art: {
          ...bg,
          id: 'art_fn00000001',
          kind: 'font',
          source: { type: 'pixelFont', cellW: 3, cellH: 4, baseline: 3, spacing: 1, glyphs: { A: '###' } },
        },
      }).error,
    ).toMatch(/does not fit/);
    const screen: Screen = {
      id: 'scr_test000001' as Screen['id'],
      kind: 'custom',
      name: 'Shop',
      music: null,
      pausesGame: true,
      root: { type: 'panel', children: [{ type: 'panel', portrait: { style: { bgArt: `art:${bg.id}` } } }] },
    };
    expect(run('screen.put', { screen }).ok).toBe(true);
    expect(run('art.delete', { id: bg.id }).error).toMatch(/Shop/);
    run('screen.delete', { id: screen.id });
    expect(run('art.delete', { id: bg.id }).ok).toBe(true);
    expect(s.has(paths.art(bg.id))).toBe(false);
    bus.undo();
    expect(s.has(paths.art(bg.id))).toBe(true);
  });

  it('imports pictures and fonts', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const img = await importMedia('sky.webp', png, { index: undefined });
    expect(img.ok && img.entry.kind).toBe('image');
    const font = await importMedia('Pixel.woff2', png, { index: undefined });
    expect(font.ok && font.entry.kind).toBe('font');
    expect(ACCEPT_OF('font')).toContain('.ttf');
    expect(ACCEPT_OF('image')).toContain('.svg');
  });
});
