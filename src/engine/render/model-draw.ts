import type { ModelData } from '../model/gltf';

/**
 * Milestone 2b, 10c part 5: what the renderers need to draw imported models. A model is uploaded once under a key
 * (its file's name in the project), with a picture for each part that has one; each frame lists where copies stand.
 */
export type ModelDraw = {
  key: string;
  /** where this copy stands: moved, turned and sized (column-major) */
  matrix: Float32Array;
  /** see-through (a ghost while placing); 1 when solid */
  alpha?: number;
};

/** a part's picture, decoded (one per part; null when the part has none) */
export type ModelPicture = ImageBitmap | ImageData | HTMLCanvasElement | null;

export type ModelUpload = { data: ModelData; pictures: ModelPicture[] };

/** the box a copy fills: the model's box moved by its matrix (its eight corners, then their box) */
export function drawBox(
  m: Float32Array,
  min: readonly number[],
  max: readonly number[],
): { min: [number, number, number]; max: [number, number, number] } {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? max[0]! : min[0]!;
    const y = i & 2 ? max[1]! : min[1]!;
    const z = i & 4 ? max[2]! : min[2]!;
    const w = [
      m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
      m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
      m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    ];
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, w[k]!);
      hi[k] = Math.max(hi[k]!, w[k]!);
    }
  }
  return { min: lo, max: hi };
}
