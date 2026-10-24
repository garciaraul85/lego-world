// Milestone 2b, 10c part 5: writes a small glTF binary (.glb) sample model for tests and Help: a smooth lamp post
// (a round lamp, a tapered post and a chequered base with a texture), made of three meshes under moved and turned
// nodes, with indexed triangles, normals, texture coordinates and materials, as modelling tools export them.
// Run: node scripts/make-sample-model.mjs  → tests/fixtures/models/lamp-post.glb (and .gltf, the same as text)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = 'tests/fixtures/models';
mkdirSync(out, { recursive: true });

// ---- shapes (positions, normals, uvs, indices) ----
function sphere(r, seg = 24, rings = 16) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const th = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const u = x / seg;
      const ph = u * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph);
      const ny = Math.cos(th);
      const nz = Math.sin(th) * Math.sin(ph);
      p.push(nx * r, ny * r, nz * r);
      n.push(nx, ny, nz);
      uv.push(u, v);
    }
  }
  for (let y = 0; y < rings; y++)
    for (let x = 0; x < seg; x++) {
      const a = y * (seg + 1) + x;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  return { p, n, uv, idx };
}

function cylinder(r0, r1, h, seg = 20) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const slope = (r0 - r1) / h;
  for (let y = 0; y <= 1; y++)
    for (let x = 0; x <= seg; x++) {
      const a = (x / seg) * Math.PI * 2;
      const r = y ? r1 : r0;
      const len = Math.hypot(1, slope);
      p.push(Math.cos(a) * r, y * h, Math.sin(a) * r);
      n.push(Math.cos(a) / len, slope / len, Math.sin(a) / len);
      uv.push(x / seg, y);
    }
  for (let x = 0; x < seg; x++) idx.push(x, x + seg + 1, x + 1, x + 1, x + seg + 1, x + seg + 2);
  return { p, n, uv, idx };
}

function box(w, h, d) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const half = [w / 2, h / 2, d / 2];
  for (const [nn, uu, vv] of faces) {
    const base = p.length / 3;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      for (let k = 0; k < 3; k++) p.push((nn[k] + uu[k] * su + vv[k] * sv) * half[k]);
      n.push(...nn);
      uv.push((su + 1) / 2, (1 - sv) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { p, n, uv, idx };
}

// ---- a chequered texture (PNG) ----
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 4 + 1) + 1 + x * 4);
  }
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const checker = png(32, 32, (x, y) =>
  ((x >> 3) + (y >> 3)) % 2 ? [200, 60, 50, 255] : [240, 230, 210, 255],
);

// ---- the glTF ----
const parts = [
  { name: 'Lamp', shape: sphere(0.6), material: 0, node: { translation: [0, 3.6, 0] } },
  { name: 'Post', shape: cylinder(0.22, 0.12, 3.2), material: 1, node: { translation: [0, 0.4, 0] } },
  {
    name: 'Base',
    shape: box(1.6, 0.4, 1.6),
    material: 2,
    // turned an eighth of a turn about y
    node: { translation: [0, 0.2, 0], rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] },
  },
];
const chunks = [];
let offset = 0;
const bufferViews = [];
const accessors = [];
const add = (bytes, target) => {
  while (offset % 4) {
    chunks.push(Buffer.alloc(1));
    offset++;
  }
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
  chunks.push(bytes);
  offset += bytes.length;
  return bufferViews.length - 1;
};
const meshes = [];
for (const part of parts) {
  const { p, n, uv, idx } = part.shape;
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const min = [0, 1, 2].map((k) => Math.min(...p.filter((_, i) => i % 3 === k)));
  const max = [0, 1, 2].map((k) => Math.max(...p.filter((_, i) => i % 3 === k)));
  accessors.push({ bufferView: add(f32(p), 34962), componentType: 5126, count: p.length / 3, type: 'VEC3', min, max });
  const pa = accessors.length - 1;
  accessors.push({ bufferView: add(f32(n), 34962), componentType: 5126, count: n.length / 3, type: 'VEC3' });
  const na = accessors.length - 1;
  accessors.push({ bufferView: add(f32(uv), 34962), componentType: 5126, count: uv.length / 2, type: 'VEC2' });
  const ua = accessors.length - 1;
  accessors.push({
    bufferView: add(Buffer.from(new Uint16Array(idx).buffer), 34963),
    componentType: 5123,
    count: idx.length,
    type: 'SCALAR',
  });
  const ia = accessors.length - 1;
  meshes.push({
    name: part.name,
    primitives: [{ attributes: { POSITION: pa, NORMAL: na, TEXCOORD_0: ua }, indices: ia, material: part.material }],
  });
}
const imageView = add(checker);
const json = {
  asset: { version: '2.0', generator: 'Brick Worlds sample' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: 'Lamp post', children: [1, 2, 3] },
    ...parts.map((part, i) => ({ name: part.name, mesh: i, ...part.node })),
  ],
  meshes,
  materials: [
    { name: 'Glass', pbrMetallicRoughness: { baseColorFactor: [1, 0.85, 0.4, 1], roughnessFactor: 0.3 } },
    { name: 'Iron', pbrMetallicRoughness: { baseColorFactor: [0.18, 0.2, 0.24, 1], metallicFactor: 0.8 } },
    { name: 'Tiles', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 } } },
  ],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9728, minFilter: 9728 }],
  images: [{ bufferView: imageView, mimeType: 'image/png' }],
  accessors,
  bufferViews,
  buffers: [{ byteLength: offset }],
};
const bin = Buffer.concat(chunks);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
let jsonText = JSON.stringify(json);
while (jsonText.length % 4) jsonText += ' ';
const jsonBuf = Buffer.from(jsonText);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
const ch = (type, data) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, data]);
};
writeFileSync(`${out}/lamp-post.glb`, Buffer.concat([header, ch(0x4e4f534a, jsonBuf), ch(0x004e4942, binPadded)]));
// the same model as a .gltf text file, its data inside it
const textual = { ...json, buffers: [{ byteLength: offset, uri: `data:application/octet-stream;base64,${binPadded.toString('base64')}` }] };
writeFileSync(`${out}/lamp-post.gltf`, JSON.stringify(textual));
console.log(`wrote ${out}/lamp-post.glb and .gltf (${binPadded.length} bytes of data)`);
