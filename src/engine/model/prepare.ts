import { BUILTIN_MODEL_FILES } from '../../builtin/models/data';
import type { ModelInstance } from '../../core/schema';
import { readModel } from '../../core/media/gltf';
import type { ModelDraw, ModelPicture, ModelUpload } from '../render/model-draw';

/**
 * Milestone 2b, 10c part 5: model files made ready to draw — read, and each part's picture decoded — kept by
 * file (a built-in model's `builtin:<id>`, or an imported file's media ref), so a model used many times, and by
 * both renderers, is read once.
 */
const ready = new Map<string, Promise<ModelUpload>>();
/** the ones read so far (Play's colliders and the Scene's picking use them as they are) */
const done = new Map<string, ModelUpload>();
/** why a model could not be read */
export const modelErrors = new Map<string, string>();

/** where a project's imported media come from (the editor's media store) */
export type MediaSource = (ref: string) => Promise<Blob | null>;

export function prepareModel(ref: string, media: MediaSource | null): Promise<ModelUpload> {
  let p = ready.get(ref);
  if (!p) {
    p = (async () => {
      const bytes = await modelBytes(ref, media);
      if (!bytes) throw new Error('The model file is missing from the project.');
      const data = readModel(bytes);
      const pictures = await Promise.all(
        data.parts.map(async (part): Promise<ModelPicture> => {
          if (!part.texture || typeof createImageBitmap !== 'function') return null;
          try {
            const blob = new Blob([part.texture.bytes as Uint8Array<ArrayBuffer>], { type: part.texture.mime });
            return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' });
          } catch {
            // a picture the browser can't read: the part keeps its colour
            return null;
          }
        }),
      );
      const up = { data, pictures };
      done.set(ref, up);
      modelErrors.delete(ref);
      return up;
    })();
    ready.set(ref, p);
    p.catch((e) => {
      ready.delete(ref);
      modelErrors.set(ref, e instanceof Error ? e.message : String(e));
    });
  }
  return p;
}

/** a model already read (or undefined while it is being read) */
export const readyModel = (ref: string): ModelUpload | undefined => done.get(ref);

async function modelBytes(ref: string, media: MediaSource | null): Promise<Uint8Array | null> {
  if (ref.startsWith('builtin:')) {
    const f = BUILTIN_MODEL_FILES[ref.slice(8)];
    return f ? fromBase64(f.glb) : null;
  }
  const blob = await media?.(ref);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** forget a model (its file changed or was removed) */
export function forgetModel(ref: string) {
  ready.delete(ref);
  done.delete(ref);
}

/** base64 text to bytes (built-in models are kept as text in the bundle) */
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** where a placed model stands: moved to its spot, turned about its upright axis, sized (column-major) */
export function modelMatrix(it: Pick<ModelInstance, 'pos' | 'turn' | 'size'>): Float32Array {
  const a = ((it.turn ?? 0) * Math.PI) / 180;
  const s = it.size ?? 1;
  const c = Math.cos(a) * s;
  const n = Math.sin(a) * s;
  return new Float32Array([c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, it.pos[0], it.pos[1], it.pos[2], 1]);
}

/** a renderer that draws models (WebGL or WebGPU) */
export type ModelRenderer = {
  setModel(key: string, m: ModelUpload): void;
  hasModel(key: string): boolean;
  modelDraws: ModelDraw[];
};

/**
 * The placed models given to a renderer for this frame: each copy's place, and each model it hasn't got yet
 * read and uploaded (then `onReady` draws again)
 */
export function feedModels(
  r: ModelRenderer,
  items: readonly ModelInstance[],
  media: MediaSource | null,
  onReady: () => void,
  ghost?: ReadonlySet<string>,
) {
  const draws: ModelDraw[] = [];
  for (const it of items) {
    if (!r.hasModel(it.model)) {
      const up = done.get(it.model);
      if (up) r.setModel(it.model, up);
      else if (!modelErrors.has(it.model)) {
        void prepareModel(it.model, media).then(onReady, onReady);
        continue;
      } else continue;
    }
    draws.push({ key: it.model, matrix: modelMatrix(it), ...(ghost?.has(it.id) ? { alpha: 0.45 } : {}) });
  }
  r.modelDraws = draws;
}
