import { legacyRuntime } from '../../../engine/legacy/runtime-modules';

/**
 * Milestone 3, 10d part 1: v68's own “Bring your look” for a person in a picture — the colours of each part
 * (skin, hair, shirt, trousers, shoes, hat…) read from where they are in the photo, and, if asked, the face
 * and clothes printed on the figure as v68's part paint (a 384 × 256 atlas per part, the front in the first
 * cell, in v68's stylised colours). Only the editor's own tools: the result is an ordinary v68 profile.
 */
export type LookPicture = { image: CanvasImageSource; width: number; height: number; pixels: Uint8ClampedArray };

export function lookColors(pic: LookPicture): Record<string, string> {
  const L = legacyRuntime();
  const a = L.CharacterArt.analyze(pic.pixels, pic.width, pic.height, { x: 0, y: 0, w: pic.width, h: pic.height });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a.palette)) if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
  return out;
}

/** the face and clothes as prints (v68 part paint): part → PNG data URL */
export function lookPrints(pic: LookPicture, parts = ['head', 'torso', 'leftLeg', 'rightLeg']): Record<string, string> {
  const L = legacyRuntime();
  const a = L.CharacterArt.analyze(pic.pixels, pic.width, pic.height, { x: 0, y: 0, w: pic.width, h: pic.height });
  const paint: Record<string, string> = {};
  for (const part of parts) {
    const r = a.rects[part];
    if (!r || r.w < 3 || r.h < 3) continue;
    const c = document.createElement('canvas');
    c.width = 384;
    c.height = 256;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) continue;
    g.drawImage(pic.image, r.x, r.y, r.w, r.h, 0, 0, 128, 128);
    const img = g.getImageData(0, 0, 128, 128);
    img.data.set(L.CharacterArt.stylize(img.data));
    g.putImageData(img, 0, 0);
    paint[part] = c.toDataURL('image/png');
  }
  return paint;
}
