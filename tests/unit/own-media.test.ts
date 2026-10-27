import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { importMedia, isAnimated, isBigPicture, MAX_BYTES, sniff } from '../../src/core/media/import';
import { mediaCredits, mediaTotals, mediaUses, sizeText } from '../../src/core/media/uses';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type MediaIndex, paths } from '../../src/core/schema';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const GIF1 = bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0], [0x2c]);
const GIF2 = bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0], [0x2c, 0x21, 0xf9, 0x04, 0]);
const MP4 = bytes([0, 0, 0, 0x18], 'ftypisom', [0, 0, 0, 0]);
const AVIF = bytes([0, 0, 0, 0x18], 'ftypavif', [0, 0, 0, 0]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const BMP = bytes('BM', [0, 0, 0, 0, 0, 0]);
const measure = async () => ({ w: 640, h: 360, duration: 4.5 });

describe('Your own media: kinds and checks', () => {
  it('knows a file by its first bytes', () => {
    expect(sniff(GIF1)).toBe('gif');
    expect(sniff(MP4)).toBe('mp4');
    expect(sniff(AVIF)).toBe('avif');
    expect(sniff(WEBM)).toBe('webm');
    expect(sniff(BMP)).toBe('bmp');
    expect(sniff(bytes('hello'))).toBeNull();
    expect(isAnimated('gif', GIF1)).toBe(false);
    expect(isAnimated('gif', GIF2)).toBe(true);
  });
  it('imports GIF, AVIF, BMP and video, measured; refuses a file named for another kind', async () => {
    const gif = await importMedia('spin.gif', GIF2, { index: undefined, measure });
    expect(gif.ok && gif.entry).toMatchObject({ kind: 'image', mime: 'image/gif', animated: true, w: 640, h: 360 });
    const avif = await importMedia('sky.avif', AVIF, { index: undefined, measure });
    expect(avif.ok && avif.warnings.join(' ')).toMatch(/recent browser/);
    const bmp = await importMedia('old.bmp', BMP, { index: undefined, measure });
    expect(bmp.ok && bmp.warnings.join(' ')).toMatch(/shrink/);
    const mp4 = await importMedia('intro.mp4', MP4, { index: undefined, measure });
    expect(mp4.ok && mp4.entry).toMatchObject({ kind: 'video', mime: 'video/mp4', duration: 4.5, w: 640 });
    const webm = await importMedia('loop.webm', WEBM, { index: undefined, measure });
    expect(webm.ok && webm.entry.kind).toBe('video');
    const wrong = await importMedia('intro.webm', MP4, { index: undefined, measure });
    expect(!wrong.ok && wrong.error).toMatch(/really a \.mp4/);
    const junk = await importMedia('intro.mp4', bytes('not a video'), { index: undefined, measure });
    expect(junk.ok).toBe(false);
    const broken = await importMedia('intro.mp4', MP4, {
      index: undefined,
      measure: () => Promise.reject(new Error('no')),
    });
    expect(!broken.ok && broken.error).toMatch(/H\.264/);
  });
  it('calls a picture big by its bytes or pixels, never an animated one', () => {
    const e = { name: 'a.png', kind: 'image' as const, mime: 'image/png', bytes: 1000 };
    expect(isBigPicture(e)).toBe(false);
    expect(isBigPicture({ ...e, w: 4000, h: 100 })).toBe(true);
    expect(isBigPicture({ ...e, bytes: 3_000_000 })).toBe(true);
    expect(isBigPicture({ ...e, bytes: 3_000_000, animated: true })).toBe(false);
    expect(sizeText(1536)).toBe('2 KB');
    expect(sizeText(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('Your own media: limits', () => {
  it('limits each kind as planned, and warns (never refuses) past the 300 MB budget', async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    big.set([0x89, 0x50, 0x4e, 0x47]);
    const pic = await importMedia('big.png', big, { index: undefined, measure });
    expect(!pic.ok && pic.error).toMatch(/over 10 MB/);
    const full = {
      items: {
        [`sha256:${'c'.repeat(64)}`]: {
          name: 'x.mp4',
          kind: 'video' as const,
          mime: 'video/mp4',
          bytes: 300 * 1024 * 1024 - 8,
        },
      },
    };
    const over = await importMedia('spin.gif', GIF2, { index: full, measure });
    expect(over.ok).toBe(true);
    expect(over.ok && over.warnings.join(' ')).toMatch(/over 300 MB/);
    expect(MAX_BYTES).toMatchObject({ image: 10485760, audio: 26214400, video: 104857600 });
  });
});

describe('Your own media: uses, credits, replacing', () => {
  const setup = () => {
    const store = new ProjectStore(newProjectFiles({ name: 'T' }));
    const bus = registerAll(new CommandBus(store));
    const run = (type: string, payload: unknown) => bus.execute([{ type, payload }], { source: 'user' });
    return { store, bus, run };
  };
  const A = `sha256:${'a'.repeat(64)}`;
  const B = `sha256:${'b'.repeat(64)}`;
  const entry = { name: 'sky.png', kind: 'image' as const, mime: 'image/png', bytes: 3_000_000, w: 4000, h: 2000 };

  it('finds where a file is used, and won’t remove a picture art still shows', () => {
    const { store, run } = setup();
    expect(run('media.register', { ref: A, entry }).ok).toBe(true);
    expect(
      run('art.put', {
        art: { id: 'art_0000000009', name: 'Sky', kind: 'background', source: { type: 'image', media: A } },
      }).ok,
    ).toBe(true);
    expect(mediaUses(store, A).map((u) => u.what)).toEqual(['Art Sky']);
    expect(run('media.remove', { ref: A }).error).toMatch(/Still used by Art Sky/);
  });
  it('credits a file and lists the credits; an empty credit removes it', () => {
    const { store, run } = setup();
    run('media.register', { ref: A, entry });
    expect(
      run('media.update', { ref: A, name: 'Blue sky', credit: { author: ' Ana ', license: 'CC BY 4.0' } }).ok,
    ).toBe(true);
    const idx = store.get<MediaIndex>(paths.media);
    expect(idx?.items[A]).toMatchObject({ name: 'Blue sky', credit: { author: 'Ana', license: 'CC BY 4.0' } });
    expect(mediaCredits(idx)).toEqual([{ name: 'Blue sky', kind: 'image', author: 'Ana', license: 'CC BY 4.0' }]);
    expect(mediaTotals(idx)).toEqual({ bytes: 3_000_000, by: { image: { n: 1, bytes: 3_000_000 } } });
    run('media.update', { ref: A, credit: { author: '', license: '' } });
    expect(store.get<MediaIndex>(paths.media)?.items[A]?.credit).toBeUndefined();
    expect(run('media.update', { ref: A, name: '  ' }).ok).toBe(false);
  });
  it('replaces a file everywhere it is used, keeping its credit; undo brings it back', () => {
    const { store, bus, run } = setup();
    run('media.register', { ref: A, entry: { ...entry, credit: { author: 'Ana', license: 'CC0' } } });
    run('art.put', {
      art: { id: 'art_0000000009', name: 'Sky', kind: 'background', source: { type: 'image', media: A } },
    });
    const small = { ...entry, name: 'sky.webp', mime: 'image/webp', bytes: 200_000, w: 2048, h: 1024 };
    expect(run('media.replace', { from: A, to: B, entry: small }).ok).toBe(true);
    expect(JSON.stringify(store.get('art/art_0000000009.json'))).toContain(B);
    const items = store.get<MediaIndex>(paths.media)!.items;
    expect(items[A]).toBeUndefined();
    expect(items[B]).toMatchObject({ bytes: 200_000, credit: { author: 'Ana' } });
    bus.undo();
    expect(JSON.stringify(store.get('art/art_0000000009.json'))).toContain(A);
    expect(store.get<MediaIndex>(paths.media)!.items[A]).toBeDefined();
  });
});
