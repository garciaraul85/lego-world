#!/usr/bin/env node
// Bundles TypeScript app entries with esbuild, then inlines them into single HTML files.
//   node scripts/build.mjs            -> dist/build/*.js and dist/engine.html
//   node scripts/build.mjs --dev      -> unminified with inline source maps
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
mkdirSync(resolve(ROOT, 'dist/build'), { recursive: true });

/** App entries (src/apps/<name>/main.ts). Append new apps here (editor and player arrive in P1 / P8). */
const ENTRIES = { 'legacy-host': 'src/apps/legacy-host/main.ts' };

/**
 * `import { z } from 'zod'` keeps every locale reachable through z.locales (~250 KB).
 * We only ship English messages, so resolve zod's locales index to a module exporting `en` alone.
 */
const zodEnglishOnly = {
  name: 'zod-english-only',
  setup(b) {
    b.onResolve({ filter: /locales\/index\.js$/ }, (args) =>
      args.importer.includes(`${'node_modules'}/zod/`) ? { path: 'zod-locales-en', namespace: 'zod-en' } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: 'zod-en' }, () => ({
      contents: `export { default as en } from ${JSON.stringify(resolve(ROOT, 'node_modules/zod/v4/locales/en.js'))};`,
      loader: 'js',
      resolveDir: ROOT,
    }));
  },
};

/** `import text from './x.js?raw'` -> the file's text, as Vite does for tests. */
const rawText = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -4)),
      namespace: 'raw',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
      contents: await (await import('node:fs/promises')).readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

for (const [name, entry] of Object.entries(ENTRIES)) {
  const r = await build({
    entryPoints: [resolve(ROOT, entry)],
    outfile: resolve(ROOT, `dist/build/${name}.js`),
    bundle: true,
    format: 'iife',
    target: ['es2020', 'chrome100', 'safari15'],
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    define: { __DEV__: String(dev) },
    metafile: true,
    logLevel: 'warning',
    plugins: [zodEnglishOnly, rawText],
  });
  const bytes = Object.values(r.metafile.outputs)[0].bytes;
  console.log(`built ${name}: ${(bytes / 1024).toFixed(1)} KB`);
}
execFileSync(process.execPath, [resolve(ROOT, 'scripts/inline-html.mjs'), '--engine'], { stdio: 'inherit' });
