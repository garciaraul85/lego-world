import type { ModelPicture, ModelUpload } from '../render/model-draw';
import { readModel } from './gltf';

/**
 * Milestone 2b, 10c part 5: a model file made ready to draw: read, and each part's picture decoded. Kept by file
 * so a model used many times (and by both renderers) is read once.
 */
const ready = new Map<string, Promise<ModelUpload>>();

export function prepareModel(key: string, bytes: () => Uint8Array | null): Promise<ModelUpload> {
  let p = ready.get(key);
  if (!p) {
    p = (async () => {
      const b = bytes();
      if (!b) throw new Error(`The model file ${key} is missing from the project.`);
      const data = readModel(b);
      const pictures = await Promise.all(
        data.parts.map(async (part): Promise<ModelPicture> => {
          if (!part.texture) return null;
          try {
            const blob = new Blob([part.texture.bytes as Uint8Array<ArrayBuffer>], { type: part.texture.mime });
            return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' });
          } catch {
            // a picture the browser can't read: the part keeps its colour
            return null;
          }
        }),
      );
      return { data, pictures };
    })();
    ready.set(key, p);
    p.catch(() => ready.delete(key));
  }
  return p;
}

/** forget a model (its file changed or was removed) */
export function forgetModel(key: string) {
  ready.delete(key);
}

/** base64 text to bytes (built-in models are kept as text in the bundle) */
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
