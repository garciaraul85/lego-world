#!/usr/bin/env node
// P3.2: writes src/builtin/assets/*.json — one built-in asset per v68 generator structure (house,
// skyscraper, each tree style, palm, cactus, car, tower, undergrowth...), taken by running v68's own
// generator and cutting each structure out with instancify (not by hand).
//   node scripts/extract-assets.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawText = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({ contents: readFileSync(args.path, 'utf8'), loader: 'text' }));
  },
};
const out = resolve(ROOT, 'dist/build/extract-assets.mjs');
await build({
  stdin: {
    contents: `
      export { generateMap } from './src/core/worldgen/generate';
      export { instancify, shapeId } from './src/core/assets/instancify';
      export { slugify } from './src/core/assets/expand';
      export { BIOMES } from './src/core/schema';`,
    resolveDir: ROOT,
    loader: 'ts',
  },
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  plugins: [rawText],
  logLevel: 'error',
});
const m = await import(pathToFileURL(out).href);
const picked = new Map();
for (const seed of [1, 42, 418811, 7, 99])
  for (const env of m.BIOMES) {
    const g = m.generateMap({ environments: [env], size: 16, seed });
    const split = m.instancify(g.bricks);
    for (const a of split.assets) {
      const prev = picked.get(a.name);
      // keep the most typical (median-size) example of each structure: first seen, unless it is tiny
      if (!prev || (prev.bricks.length < 4 && a.bricks.length > prev.bricks.length)) picked.set(a.name, { ...a, env });
    }
  }
mkdirSync(resolve(ROOT, 'src/builtin/assets'), { recursive: true });
const names = [];
for (const [name, a] of [...picked].sort(([x], [y]) => x.localeCompare(y))) {
  const slug = m.slugify(name);
  const { env, ...def } = a;
  const asset = {
    ...def,
    id: m.shapeId(`builtin:${slug}`),
    origin: 'builtin',
    generator: null, // v68's generator already places these; "Use in generator" is for new assets
  };
  writeFileSync(resolve(ROOT, `src/builtin/assets/${slug}.json`), `${JSON.stringify(asset, null, 1)}\n`);
  names.push(`${slug} (${a.bricks.length} bricks)`);
}
console.log(`wrote ${names.length} built-in assets: ${names.join(', ')}`);
