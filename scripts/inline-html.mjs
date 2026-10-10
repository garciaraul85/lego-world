#!/usr/bin/env node
// Builds a single self-contained HTML file.
//   --legacy  : dist/index.html from src/legacy (byte-identical to the original assemble.py output)
//   --engine  : dist/engine.html = v68 + the Phase 0 host (needs dist/build/legacy-host.js from scripts/build.mjs)
//   --editor  : dist/editor.html = the Brick Worlds editor (needs dist/build/editor.js and editor.css)
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

const escapeScript = (js) => js.replaceAll('</script', '<\\/script');

/** The editor page: one self-contained file (fonts from Google Fonts, everything else inline). */
export function buildEditor(js, css) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Brick Worlds Engine</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" media="print" onload="this.media='all'">
<style>${css}</style>
</head>
<body>
<div id="app"><p style="padding:24px;font-family:system-ui;color:#9aa4b2">Loading Brick Worlds Engine…</p></div>
<noscript>Brick Worlds Engine needs JavaScript and WebGL.</noscript>
<script>${escapeScript(js)}</script>
</body>
</html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const engine = args.includes('--engine');
  const editor = args.includes('--editor');
  if (!engine && !editor && !args.includes('--legacy')) {
    console.error('usage: inline-html.mjs --legacy|--engine|--editor [--out path]');
    process.exit(2);
  }
  const outIdx = args.indexOf('--out');
  const out = resolve(
    ROOT,
    outIdx >= 0 ? args[outIdx + 1] : editor ? 'dist/editor.html' : engine ? 'dist/engine.html' : 'dist/index.html',
  );
  const { html: legacyHtml, js } = buildLegacy();
  new Script(js, { filename: 'legacy-app.js' }); // throws on a syntax error (replaces dist/app-check.js)
  const read = (f) => readFileSync(join(ROOT, 'dist/build', f), 'utf8');
  const html = editor
    ? buildEditor(read('editor.js'), read('editor.css'))
    : engine
      ? buildEngine(read('legacy-host.js'))
      : legacyHtml;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${html.length} chars)`);
}
