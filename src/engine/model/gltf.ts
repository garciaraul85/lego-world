/**
 * Milestone 2b, 10c part 5: reads a glTF model (.glb, or .gltf with its data inside it) into the parts the renderers
 * draw. Models that don't animate: every mesh is placed where its nodes put it and kept as plain triangles, each
 * part with its colour and, if it has one, its picture (texture). A skinned model is read in its rest pose; its
 * skeleton, animations, morphs and the rest wait for Milestone 4.
 */

export type ModelPart = {
  /** triangles, three corners each: x, y, z */
  positions: Float32Array;
  normals: Float32Array;
  /** texture coordinates (u, v) when the part has a picture */
  uvs: Float32Array | null;
  /** base colour, 0–1, and how see-through (1 solid) */
  color: [number, number, number, number];
  /** the picture on it: the file's bytes and type (PNG, JPEG, WebP) */
  texture: { mime: string; bytes: Uint8Array } | null;
};

export type ModelData = {
  parts: ModelPart[];
  /** the box it fills (after its nodes' moves) */
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
};

/** the most triangles a model may have (a big map holds many copies) */
export const MAX_MODEL_TRIANGLES = 200_000;

export class ModelError extends Error {}

type Json = {
  asset?: { version?: string };
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    children?: number[];
    mesh?: number;
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
      extensions?: Record<string, unknown>;
    }[];
  }[];
  materials?: {
    pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number } };
    alphaMode?: string;
  }[];
  textures?: { source?: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    normalized?: boolean;
    count: number;
    type: string;
    sparse?: unknown;
  }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { byteLength: number; uri?: string }[];
  extensionsRequired?: string[];
};

const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const COMPONENT: Record<number, { bytes: number; read: (v: DataView, at: number) => number; max: number }> = {
  5120: { bytes: 1, read: (v, a) => v.getInt8(a), max: 127 },
  5121: { bytes: 1, read: (v, a) => v.getUint8(a), max: 255 },
  5122: { bytes: 2, read: (v, a) => v.getInt16(a, true), max: 32767 },
  5123: { bytes: 2, read: (v, a) => v.getUint16(a, true), max: 65535 },
  5125: { bytes: 4, read: (v, a) => v.getUint32(a, true), max: 1 },
  5126: { bytes: 4, read: (v, a) => v.getFloat32(a, true), max: 1 },
};

const text = new TextDecoder();

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function dataUri(uri: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  return {
    mime: m[1] || 'application/octet-stream',
    bytes: m[2] ? fromBase64(m[3]!) : new TextEncoder().encode(decodeURIComponent(m[3]!)),
  };
}

/** reads a model file; throws a ModelError that says in plain words what is wrong */
export function readModel(file: Uint8Array): ModelData {
  let json: Json;
  let glbBin: Uint8Array | null = null;
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.byteLength >= 12 && view.getUint32(0, true) === 0x46546c67) {
    // a .glb: a header, then a JSON chunk and a binary chunk
    if (view.getUint32(4, true) !== 2) throw new ModelError('This .glb is an old glTF version (1.0); export it as glTF 2.0.');
    let at = 12;
    let jsonText = '';
    while (at + 8 <= file.byteLength) {
      const len = view.getUint32(at, true);
      const type = view.getUint32(at + 4, true);
      const body = file.subarray(at + 8, at + 8 + len);
      if (type === 0x4e4f534a) jsonText = text.decode(body);
      else if (type === 0x004e4942) glbBin = body;
      at += 8 + len;
    }
    try {
      json = JSON.parse(jsonText);
    } catch {
      throw new ModelError('This .glb file is damaged: its description could not be read.');
    }
  } else {
    try {
      json = JSON.parse(text.decode(file));
    } catch {
      throw new ModelError('This is not a glTF model: pick a .glb or .gltf file.');
    }
  }
  if (!json.asset?.version?.startsWith('2'))
    throw new ModelError('This model is not glTF 2.0: export it again as glTF 2.0 (.glb).');
  const unsupported = (json.extensionsRequired ?? []).filter((e) => e !== 'KHR_materials_unlit');
  if (unsupported.includes('KHR_draco_mesh_compression') || unsupported.includes('EXT_meshopt_compression'))
    throw new ModelError('This model is compressed (Draco or meshopt); export it without compression.');
  if (unsupported.length) throw new ModelError(`This model needs ${unsupported.join(', ')}, which isn't supported yet.`);

  // the binary data
  const buffers = (json.buffers ?? []).map((b, i) => {
    if (b.uri === undefined) {
      if (i === 0 && glbBin) return glbBin;
      throw new ModelError('This model is missing its data.');
    }
    const d = dataUri(b.uri);
    if (!d)
      throw new ModelError(
        `This .gltf keeps its data in another file (${b.uri}); export it as one .glb file, or with the data inside it.`,
      );
    return d.bytes;
  });
  const viewBytes = (i: number) => {
    const bv = json.bufferViews?.[i];
    if (!bv) throw new ModelError('This model is damaged: a piece of its data is missing.');
    const buf = buffers[bv.buffer];
    if (!buf) throw new ModelError('This model is damaged: a piece of its data is missing.');
    const start = bv.byteOffset ?? 0;
    if (start + bv.byteLength > buf.byteLength) throw new ModelError('This model is damaged: its data is cut short.');
    return { bytes: buf.subarray(start, start + bv.byteLength), stride: bv.byteStride };
  };
  const accessor = (i: number): number[][] => {
    const a = json.accessors?.[i];
    if (!a) throw new ModelError('This model is damaged: a list of points is missing.');
    const n = SIZES[a.type] ?? 1;
    const c = COMPONENT[a.componentType];
    if (!c) throw new ModelError('This model is damaged: it has data of an unknown kind.');
    const out: number[][] = [];
    if (a.bufferView === undefined) {
      for (let k = 0; k < a.count; k++) out.push(new Array(n).fill(0));
      return out;
    }
    const { bytes, stride } = viewBytes(a.bufferView);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const step = stride || n * c.bytes;
    const base = a.byteOffset ?? 0;
    if (a.count > 0 && base + (a.count - 1) * step + n * c.bytes > bytes.byteLength)
      throw new ModelError('This model is damaged: its data is cut short.');
    for (let k = 0; k < a.count; k++) {
      const v: number[] = [];
      for (let j = 0; j < n; j++) {
        const x = c.read(dv, base + k * step + j * c.bytes);
        v.push(a.normalized ? Math.max(x / c.max, -1) : x);
      }
      out.push(v);
    }
    return out;
  };

  const imageOf = (texIndex: number | undefined): ModelPart['texture'] => {
    if (texIndex === undefined) return null;
    const img = json.images?.[json.textures?.[texIndex]?.source ?? -1];
    if (!img) return null;
    if (img.bufferView !== undefined)
      return { mime: img.mimeType ?? 'image/png', bytes: viewBytes(img.bufferView).bytes.slice() };
    if (img.uri) {
      const d = dataUri(img.uri);
      if (!d)
        throw new ModelError(
          `This .gltf keeps a picture in another file (${img.uri}); export it as one .glb file.`,
        );
      return d;
    }
    return null;
  };

  // walk the scene, each node's matrix times its parent's
  const parts: ModelPart[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const nodes = json.nodes ?? [];
  const roots =
    json.scenes?.[json.scene ?? 0]?.nodes ??
    nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)));
  const seen = new Set<number>();
  const visit = (ni: number, parent: number[]) => {
    const node = nodes[ni];
    if (!node || seen.has(ni)) return;
    seen.add(ni);
    const m = mul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) addMesh(node.mesh, m);
    for (const c of node.children ?? []) visit(c, m);
  };
  const addMesh = (mi: number, m: number[]) => {
    const mesh = json.meshes?.[mi];
    if (!mesh) return;
    const nm = normalMatrix(m);
    const flip = det3(m) < 0;
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) continue; // lines and points aren't drawn
      if (prim.extensions?.KHR_draco_mesh_compression)
        throw new ModelError('This model is compressed (Draco); export it without compression.');
      if (prim.attributes.POSITION === undefined) continue;
      const pos = accessor(prim.attributes.POSITION);
      const nor = prim.attributes.NORMAL !== undefined ? accessor(prim.attributes.NORMAL) : null;
      const mat = prim.material !== undefined ? json.materials?.[prim.material] : undefined;
      const tex = imageOf(mat?.pbrMetallicRoughness?.baseColorTexture?.index);
      const uv = tex && prim.attributes.TEXCOORD_0 !== undefined ? accessor(prim.attributes.TEXCOORD_0) : null;
      const index = prim.indices !== undefined ? accessor(prim.indices).map((v) => v[0]!) : pos.map((_, i) => i);
      const tris = Math.floor(index.length / 3);
      triangles += tris;
      if (triangles > MAX_MODEL_TRIANGLES)
        throw new ModelError(
          `This model has more than ${MAX_MODEL_TRIANGLES.toLocaleString('en-US')} triangles; make it simpler in your modelling tool.`,
        );
      const P = new Float32Array(tris * 9);
      const N = new Float32Array(tris * 9);
      const U = uv ? new Float32Array(tris * 6) : null;
      for (let t = 0; t < tris; t++) {
        const corners = flip ? [0, 2, 1] : [0, 1, 2];
        const world = corners.map((c) => {
          const v = pos[index[t * 3 + c]!];
          if (!v) throw new ModelError('This model is damaged: a triangle points at a missing corner.');
          return apply(m, v);
        });
        const face = cross(sub(world[1]!, world[0]!), sub(world[2]!, world[0]!));
        corners.forEach((c, k) => {
          const i = index[t * 3 + c]!;
          const w = world[k]!;
          P.set(w, t * 9 + k * 3);
          for (let j = 0; j < 3; j++) {
            if (w[j]! < min[j]!) min[j] = w[j]!;
            if (w[j]! > max[j]!) max[j] = w[j]!;
          }
          N.set(norm(nor?.[i] ? applyDir(nm, nor[i]!) : face), t * 9 + k * 3);
          if (U && uv) U.set(uv[i] ?? [0, 0], t * 6 + k * 2);
        });
      }
      const f = mat?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      parts.push({
        positions: P,
        normals: N,
        uvs: U,
        color: [f[0] ?? 1, f[1] ?? 1, f[2] ?? 1, mat?.alphaMode === 'BLEND' ? (f[3] ?? 1) : 1],
        texture: U ? tex : null,
      });
    }
  };
  for (const r of roots) visit(r, IDENT);
  if (!parts.length) throw new ModelError('This model has nothing to draw (no triangles).');
  return { parts, min, max, triangles };
}

// ---- small matrix helpers (column-major, as glTF keeps them) ----
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function nodeMatrix(n: NonNullable<Json['nodes']>[number]): number[] {
  if (n.matrix?.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y! * y! + z! * z!)) * sx!,
    2 * (x! * y! + z! * w!) * sx!,
    2 * (x! * z! - y! * w!) * sx!,
    0,
    2 * (x! * y! - z! * w!) * sy!,
    (1 - 2 * (x! * x! + z! * z!)) * sy!,
    2 * (y! * z! + x! * w!) * sy!,
    0,
    2 * (x! * z! + y! * w!) * sz!,
    2 * (y! * z! - x! * w!) * sz!,
    (1 - 2 * (x! * x! + y! * y!)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  ];
}

function mul(a: number[], b: number[]): number[] {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
const apply = (m: number[], v: number[]): number[] => [
  m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]! + m[12]!,
  m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]! + m[13]!,
  m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]! + m[14]!,
];
const det3 = (m: number[]) =>
  m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) -
  m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) +
  m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
/** the inverse transpose of the upper 3×3 (normals stay at right angles under uneven scaling), as rows */
function normalMatrix(m: number[]): number[][] {
  const M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => m[c * 4 + r]!));
  const at = (r: number, c: number) => M[r % 3]![c % 3]!;
  // cofactors: the inverse transpose times the determinant (the length is normalised afterwards)
  return [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => at(r + 1, c + 1) * at(r + 2, c + 2) - at(r + 1, c + 2) * at(r + 2, c + 1)),
  );
}
const applyDir = (n: number[][], v: number[]): number[] =>
  n.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const norm = (v: number[]) => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
