#!/usr/bin/env node
// P3.5: writes src/builtin/characters/*.json (v68 CharacterCatalog presets) and src/builtin/clips/*.json
// (v68 StudioMotion routines as keyframe clips), by running v68's own modules — not by hand.
//   node scripts/extract-characters.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawText = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -4)),
      namespace: 'raw',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};
const out = resolve(ROOT, 'dist/build/extract-characters.mjs');
await build({
  stdin: {
    contents: `
      export { legacyRuntime } from './src/engine/legacy/runtime-modules';
      export { clipFromRoutine } from './src/engine/character/routine';
      export { slugify } from './src/core/assets/expand';`,
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
const L = m.legacyRuntime();
mkdirSync(resolve(ROOT, 'src/builtin/characters'), { recursive: true });
mkdirSync(resolve(ROOT, 'src/builtin/clips'), { recursive: true });
let n = 0;
for (const name of Object.keys(L.CharacterCatalog.presets)) {
  const slug = m.slugify(name);
  const profile = L.CharacterCatalog.preset(name);
  writeFileSync(
    resolve(ROOT, `src/builtin/characters/${slug}.json`),
    `${JSON.stringify({ name, role: 'hero', profile }, null, 1)}\n`,
  );
  n++;
}
let c = 0;
for (const routine of L.StudioMotion.clips) {
  const slug = m.slugify(routine.id.replace(/^routine:/, ''));
  const clip = m.clipFromRoutine(routine);
  writeFileSync(resolve(ROOT, `src/builtin/clips/${slug}.json`), `${JSON.stringify(clip, null, 1)}\n`);
  c++;
}
console.log(`wrote ${n} characters and ${c} clips`);
