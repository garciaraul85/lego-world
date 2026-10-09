#!/usr/bin/env node
// Builds a single self-contained HTML file.
//   --legacy  : dist/index.html from src/legacy (byte-identical to the original assemble.py output)
//   --engine  : dist/engine.html = v68 + the Phase 0 host (needs dist/build/legacy-host.js from scripts/build.mjs)
// Usage: node scripts/inline-html.mjs --legacy|--engine [--out path]
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

/**
 * v68 page whose app starts only when the host calls window.__bwLegacy() (after restoring the project).
 * The legacy code is wrapped in a function; it uses no window globals of its own, so this is safe.
 */
export function buildEngine(hostJs, root = ROOT) {
  const { html, js } = buildLegacy(root);
  const a = html.indexOf('<script>');
  const b = html.indexOf('</script>', a) + '</script>'.length;
  const safeHost = hostJs.replaceAll('</script', '<\\/script');
  const scripts = `<script>window.__bwLegacy=function(){window.__bwLegacy=null;\n${js}\n};</script><script>${safeHost}</script>`;
  return html.slice(0, a) + scripts + html.slice(b);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const engine = args.includes('--engine');
  if (!engine && !args.includes('--legacy')) {
    console.error('usage: inline-html.mjs --legacy|--engine [--out path]');
    process.exit(2);
  }
  const outIdx = args.indexOf('--out');
  const out = resolve(ROOT, outIdx >= 0 ? args[outIdx + 1] : engine ? 'dist/engine.html' : 'dist/index.html');
  const { html: legacyHtml, js } = buildLegacy();
  new Script(js, { filename: 'legacy-app.js' }); // throws on a syntax error (replaces dist/app-check.js)
  const html = engine ? buildEngine(readFileSync(join(ROOT, 'dist/build/legacy-host.js'), 'utf8')) : legacyHtml;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${html.length} chars)`);
}
