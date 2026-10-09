#!/usr/bin/env node
// Minimal static server for dist/ (used by Playwright and for local play). No dependencies.
//   node scripts/serve.mjs [--port 8000] [--dir dist]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};
const port = Number(arg('--port', 8000));
const dir = resolve(ROOT, arg('--dir', 'dist'));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dir)) return void res.writeHead(403).end();
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    statSync(file);
  } catch {
    return void res.writeHead(404).end('not found');
  }
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
