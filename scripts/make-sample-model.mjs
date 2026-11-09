// Milestone 2b, 10c part 5: makes the built-in smooth 3D models (glTF binary, .glb) and the test samples.
// Each model is a few smooth parts (round, turned or bent shapes bricks can't make) under moved and turned nodes,
// with normals, texture coordinates and materials, the way modelling tools export them.
// Run: node scripts/make-sample-model.mjs
//   → src/builtin/models/*.glb and src/builtin/models/data.ts (the same files, for the bundle)
//   → tests/fixtures/models/lamp-post.glb and lamp-post.gltf (the same model as text, its data inside it)
// Sizes are in studs: the hero is about 4 tall.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------- shapes: { p, n?, uv, idx } ----------

/** a shape turned about the y axis from a profile of [radius, height] points, bottom to top */
function lathe(profile, seg = 24) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  const rows = profile.length;
  for (let j = 0; j < rows; j++) {
    const [r, y] = profile[j];
    // the profile's slope, from its neighbours, gives the normal's tilt
    const [r0, y0] = profile[Math.max(0, j - 1)];
    const [r1, y1] = profile[Math.min(rows - 1, j + 1)];
    let ny = -(r1 - r0);
    let nr = y1 - y0;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      p.push(Math.cos(a) * r, y, Math.sin(a) * r);
      n.push(Math.cos(a) * nr, ny, Math.sin(a) * nr);
      uv.push(i / seg, 1 - j / (rows - 1));
    }
  }
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { p, n, uv, idx };
}

function sphere(r, seg = 24, rings = 16, squash = 1) {
  const profile = [];
  for (let k = 0; k <= rings; k++) {
    const th = Math.PI - (k / rings) * Math.PI;
    profile.push([Math.max(Math.sin(th) * r, 1e-4), Math.cos(th) * r * squash]);
  }
  return lathe(profile, seg);
}

/** a ring lying in the x–y plane (stands up), radius R, tube r */
function torus(R, r, seg = 40, tube = 14) {
  const p = [];
  const n = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= tube; j++) {
      const b = (j / tube) * Math.PI * 2;
      const nx = Math.cos(b) * Math.cos(a);
      const ny = Math.cos(b) * Math.sin(a);
      const nz = Math.sin(b);
      p.push(Math.cos(a) * R + nx * r, Math.sin(a) * R + ny * r, nz * r);
      n.push(nx, ny, nz);
      uv.push(i / seg, j / tube);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < tube; j++) {
      const a = i * (tube + 1) + j;
      const b = a + tube + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { p, n, uv, idx };
}

/** a lumpy stone: a sphere pushed in and out, drawn with flat faces (no normals: the reader works them out) */
function boulder(r, seed = 3) {
  const s = sphere(r, 12, 8, 0.75);
  let x = seed;
  const rnd = () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
  const bump = new Map();
  for (let i = 0; i < s.p.length; i += 3) {
    const key = `${s.p[i].toFixed(3)},${s.p[i + 1].toFixed(3)},${s.p[i + 2].toFixed(3)}`;
    if (!bump.has(key)) bump.set(key, 0.8 + rnd() * 0.4);
    const k = bump.get(key);
    s.p[i] *= k;
    s.p[i + 1] = s.p[i + 1] * k + r * 0.75;
    s.p[i + 2] *= k;
  }
  return { p: s.p, uv: s.uv, idx: s.idx };
}

/** a pointed six-sided crystal */
function crystal(r, h) {
  return lathe(
    [
      [1e-4, 0],
      [r, h * 0.2],
      [r, h * 0.75],
      [1e-4, h],
    ],
    6,
  );
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

// ---------- pictures (PNG) ----------
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 4 + 1) + 1 + x * 4);
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
const checker = png(32, 32, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? [200, 60, 50, 255] : [240, 230, 210, 255]));
/** wood: planks around the barrel, dark iron hoops near the top and bottom */
const staves = png(64, 32, (x, y) => {
  const hoop = (y >= 4 && y < 7) || (y >= 25 && y < 28);
  if (hoop) return [60, 62, 68, 255];
  const plank = x % 8 === 0 ? 0.6 : 1;
  const grain = 0.9 + 0.1 * Math.sin(y * 0.9 + (x >> 3) * 2.1);
  return [Math.round(150 * plank * grain), Math.round(95 * plank * grain), Math.round(55 * plank * grain), 255];
});
/** a toadstool's cap: red with white spots */
const spots = png(64, 32, (x, y) => {
  const cx = [8, 24, 40, 56, 16, 32, 48, 0, 64];
  const cy = [8, 12, 7, 11, 22, 20, 23, 21, 21];
  for (let i = 0; i < cx.length; i++) if (Math.hypot(x - cx[i], (y - cy[i]) * 1.4) < 3.6) return [250, 246, 236, 255];
  return y > 27 ? [235, 225, 205, 255] : [205, 40, 35, 255];
});
/** a vase: blue and white bands */
const bands = png(16, 64, (_x, y) => (Math.floor(y / 8) % 2 ? [40, 90, 170, 255] : [235, 238, 245, 255]));

// ---------- writing a .glb ----------
/**
 * parts: [{ name, shape, color: [r,g,b,a], texture?: png, alpha?: true, node: { translation?, rotation?, scale? } }]
 */
function glb(title, parts) {
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
  const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
  const meshes = [];
  const materials = [];
  const textures = [];
  const images = [];
  for (const part of parts) {
    const { p, n, uv, idx } = part.shape;
    const min = [0, 1, 2].map((k) => Math.min(...p.filter((_, i) => i % 3 === k)));
    const max = [0, 1, 2].map((k) => Math.max(...p.filter((_, i) => i % 3 === k)));
    const attributes = {};
    accessors.push({ bufferView: add(f32(p), 34962), componentType: 5126, count: p.length / 3, type: 'VEC3', min, max });
    attributes.POSITION = accessors.length - 1;
    if (n) {
      accessors.push({ bufferView: add(f32(n), 34962), componentType: 5126, count: n.length / 3, type: 'VEC3' });
      attributes.NORMAL = accessors.length - 1;
    }
    accessors.push({ bufferView: add(f32(uv), 34962), componentType: 5126, count: uv.length / 2, type: 'VEC2' });
    attributes.TEXCOORD_0 = accessors.length - 1;
    accessors.push({
      bufferView: add(Buffer.from(new Uint16Array(idx).buffer), 34963),
      componentType: 5123,
      count: idx.length,
      type: 'SCALAR',
    });
    const indices = accessors.length - 1;
    const pbr = { baseColorFactor: part.color, roughnessFactor: 0.6, metallicFactor: 0 };
    if (part.texture) {
      images.push({ bufferView: add(part.texture), mimeType: 'image/png' });
      textures.push({ source: images.length - 1, sampler: 0 });
      pbr.baseColorTexture = { index: textures.length - 1 };
    }
    materials.push({ name: part.name, pbrMetallicRoughness: pbr, ...(part.alpha ? { alphaMode: 'BLEND' } : {}) });
    meshes.push({ name: part.name, primitives: [{ attributes, indices, material: materials.length - 1 }] });
  }
  const json = {
    asset: { version: '2.0', generator: 'Brick Worlds (scripts/make-sample-model.mjs)' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: title, children: parts.map((_, i) => i + 1) }, ...parts.map((part, i) => ({ name: part.name, mesh: i, ...part.node }))],
    meshes,
    materials,
    ...(textures.length ? { textures, samplers: [{ magFilter: 9729, minFilter: 9729 }], images } : {}),
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
  const file = Buffer.concat([header, ch(0x4e4f534a, jsonBuf), ch(0x004e4942, binPadded)]);
  const text = JSON.stringify({
    ...json,
    buffers: [{ byteLength: offset, uri: `data:application/octet-stream;base64,${binPadded.toString('base64')}` }],
  });
  return { file, text };
}

const turnY = (frac) => [0, Math.sin(Math.PI * frac), 0, Math.cos(Math.PI * frac)];
const turnZ = (frac) => [0, 0, Math.sin(Math.PI * frac), Math.cos(Math.PI * frac)];

// ---------- the built-in models ----------
const MODELS = {
  'lantern-post': {
    name: 'Lantern post',
    about: 'A round glowing lantern on a tapered iron post, on a tiled base.',
    parts: [
      { name: 'Lamp', shape: sphere(0.6), color: [1, 0.85, 0.4, 1], node: { translation: [0, 3.6, 0] } },
      {
        name: 'Post',
        shape: lathe([
          [0.22, 0],
          [0.12, 3.2],
        ], 20),
        color: [0.18, 0.2, 0.24, 1],
        node: { translation: [0, 0.4, 0] },
      },
      {
        name: 'Base',
        shape: box(1.6, 0.4, 1.6),
        color: [1, 1, 1, 1],
        texture: checker,
        node: { translation: [0, 0.2, 0], rotation: turnY(1 / 8) },
      },
    ],
  },
  barrel: {
    name: 'Barrel',
    about: 'A round wooden barrel with iron hoops.',
    parts: [
      {
        name: 'Barrel',
        shape: lathe(
          [
            [1e-4, 0],
            [0.85, 0],
            [0.98, 0.6],
            [1.05, 1.2],
            [0.98, 1.8],
            [0.85, 2.4],
            [1e-4, 2.4],
          ],
          28,
        ),
        color: [1, 1, 1, 1],
        texture: staves,
        node: {},
      },
    ],
  },
  'round-tree': {
    name: 'Round tree',
    about: 'A smooth trunk with three round leafy crowns.',
    parts: [
      {
        name: 'Trunk',
        shape: lathe([
          [0.55, 0],
          [0.4, 1.5],
          [0.32, 5],
        ], 16),
        color: [0.42, 0.28, 0.17, 1],
        node: {},
      },
      { name: 'Crown', shape: sphere(2.4, 24, 14, 0.85), color: [0.24, 0.55, 0.22, 1], node: { translation: [0, 6, 0] } },
      { name: 'Crown left', shape: sphere(1.6, 20, 12, 0.85), color: [0.3, 0.62, 0.25, 1], node: { translation: [-1.8, 4.9, 0.6] } },
      { name: 'Crown right', shape: sphere(1.5, 20, 12, 0.85), color: [0.2, 0.5, 0.2, 1], node: { translation: [1.7, 5.1, -0.5] } },
    ],
  },
  boulder: {
    name: 'Boulder',
    about: 'A lumpy grey stone with flat faces.',
    parts: [{ name: 'Stone', shape: boulder(1.4), color: [0.55, 0.56, 0.58, 1], node: {} }],
  },
  crystal: {
    name: 'Crystal',
    about: 'A cluster of glassy purple crystals, see-through.',
    parts: [
      { name: 'Big crystal', shape: crystal(0.55, 3.6), color: [0.62, 0.38, 0.95, 0.8], alpha: true, node: {} },
      {
        name: 'Left crystal',
        shape: crystal(0.35, 2.2),
        color: [0.7, 0.45, 1, 0.8],
        alpha: true,
        node: { translation: [-0.6, 0, 0.2], rotation: turnZ(0.1) },
      },
      {
        name: 'Right crystal',
        shape: crystal(0.3, 1.8),
        color: [0.55, 0.32, 0.9, 0.8],
        alpha: true,
        node: { translation: [0.6, 0, -0.2], rotation: turnZ(-0.12) },
      },
    ],
  },
  toadstool: {
    name: 'Toadstool',
    about: 'A big red-capped toadstool with white spots.',
    parts: [
      {
        name: 'Stem',
        shape: lathe([
          [0.45, 0],
          [0.35, 0.8],
          [0.32, 1.6],
        ], 18),
        color: [0.95, 0.92, 0.85, 1],
        node: {},
      },
      {
        name: 'Cap',
        shape: lathe(
          [
            [1.3, 0],
            [1.25, 0.3],
            [1.05, 0.65],
            [0.65, 0.9],
            [1e-4, 1],
          ],
          28,
        ),
        color: [1, 1, 1, 1],
        texture: spots,
        node: { translation: [0, 1.5, 0] },
      },
    ],
  },
  'stone-ring': {
    name: 'Stone ring',
    about: 'A standing stone ring, like a gateway, on a low plinth.',
    parts: [
      { name: 'Ring', shape: torus(2.6, 0.45), color: [0.5, 0.52, 0.56, 1], node: { translation: [0, 3.3, 0] } },
      { name: 'Plinth', shape: box(3, 0.5, 1.4), color: [0.4, 0.41, 0.44, 1], node: { translation: [0, 0.25, 0] } },
    ],
  },
  vase: {
    name: 'Vase',
    about: 'A rounded vase with blue and white bands.',
    parts: [
      {
        name: 'Vase',
        shape: lathe(
          [
            [1e-4, 0],
            [0.4, 0],
            [0.6, 0.4],
            [0.62, 0.8],
            [0.35, 1.25],
            [0.28, 1.5],
            [0.36, 1.7],
          ],
          28,
        ),
        color: [1, 1, 1, 1],
        texture: bands,
        node: {},
      },
    ],
  },
};

mkdirSync('src/builtin/models', { recursive: true });
mkdirSync('tests/fixtures/models', { recursive: true });
const lines = [];
for (const [id, m] of Object.entries(MODELS)) {
  const { file, text } = glb(m.name, m.parts);
  writeFileSync(`src/builtin/models/${id}.glb`, file);
  lines.push(
    `  ${JSON.stringify(id)}: { name: ${JSON.stringify(m.name)}, about: ${JSON.stringify(m.about)}, glb: ${JSON.stringify(file.toString('base64'))} },`,
  );
  if (id === 'lantern-post') {
    writeFileSync('tests/fixtures/models/lamp-post.glb', file);
    writeFileSync('tests/fixtures/models/lamp-post.gltf', text);
  }
  console.log(`${id}: ${file.length} bytes`);
}
writeFileSync(
  'src/builtin/models/data.ts',
  `// Generated by scripts/make-sample-model.mjs: the built-in smooth 3D models as glTF binary (.glb), base64.\n// Do not edit; change the script and run it again.\nexport const BUILTIN_MODEL_FILES: Record<string, { name: string; about: string; glb: string }> = {\n${lines.join('\n')}\n};\n`,
);
