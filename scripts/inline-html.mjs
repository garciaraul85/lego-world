#!/usr/bin/env node
// Builds a single self-contained HTML file.
//   --legacy  : dist/index.html from src/legacy (byte-identical to the original assemble.py output)
// Usage: node scripts/inline-html.mjs --legacy [--out dist/index.html]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { BUILDER, BUILDER_INSERTS, GAME_UI_CSS, HEAD_SCRIPTS, LEGACY_DIR, SHELL } from './legacy-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Assemble the legacy app. Returns { html, js }. Pure apart from reading src/legacy. */
export function buildLegacy(root = ROOT) {
  const read = (f) => readFileSync(join(root, LEGACY_DIR, f), 'utf8');
  let html = read(SHELL);
  html = html.replace('</style>', `/* GAME_UI_START */\n${read(GAME_UI_CSS)}\n/* GAME_UI_END */\n</style>`);
  let builder = read(BUILDER);
  for (const [marker, files] of BUILDER_INSERTS) {
    // String.replace with a function so `$` sequences in sources are not treated as patterns.
    builder = builder.replaceAll(marker, () => files.map(read).join('\n'));
  }
  const js = `${HEAD_SCRIPTS.map(read).join('\n')}\n${builder}`;
  const a = html.indexOf('<script>') + '<script>'.length;
  const b = html.indexOf('</script>', a);
  return { html: `${html.slice(0, a)}\n${js}\n${html.slice(b)}`, js };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.includes('--legacy')) {
    console.error('usage: inline-html.mjs --legacy [--out path]');
    process.exit(2);
  }
  const outIdx = args.indexOf('--out');
  const out = resolve(ROOT, outIdx >= 0 ? args[outIdx + 1] : 'dist/index.html');
  const { html, js } = buildLegacy();
  new Script(js, { filename: 'legacy-app.js' }); // throws on a syntax error (replaces dist/app-check.js)
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${html.length} chars)`);
}
