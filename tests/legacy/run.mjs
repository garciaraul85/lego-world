#!/usr/bin/env node
// Runs the LEGO World v68 suites, each in its own Node process.
//   node tests/legacy/run.mjs                 all suites, parallel = CPU count
//   node tests/legacy/run.mjs --shard 2/4     the 2nd of 4 duration-balanced shards
//   node tests/legacy/run.mjs world.cjs maps.cjs
// Options: --jobs N, --timeout SECONDS (default 300 per suite), --list (print the selection and exit)
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

// Step 12b: the suites check v68 as it was. The engine's one change to v68's files (arms of human proportion in
// character-model.js, recorded pair by pair in tests/fixtures/legacy/arm-proportions.json) is undone for them in a
// copy, with v68's own built page; tests/unit/legacy-build.test.ts and tests/unit/arms.test.ts check the change.
const COPY = mkdtempSync(join(tmpdir(), 'v68-suites-'));
cpSync(HERE, join(COPY, 'tests/legacy'), { recursive: true });
cpSync(join(ROOT, 'tests/fixtures/legacy'), join(COPY, 'tests/fixtures/legacy'), { recursive: true });
cpSync(join(ROOT, 'src/legacy'), join(COPY, 'src/legacy'), { recursive: true });
{
  const model = join(COPY, 'src/legacy/character-model.js');
  let src = readFileSync(model, 'utf8');
  const { pairs } = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/legacy/arm-proportions.json'), 'utf8'));
  for (const [now, was] of pairs) {
    if (!src.includes(now)) throw new Error('arm-proportions.json: a recorded edit is missing from character-model.js');
    src = src.replace(now, was);
  }
  writeFileSync(model, src);
  mkdirSync(join(COPY, 'dist'), { recursive: true });
  cpSync(join(ROOT, 'tests/fixtures/legacy/index.v68.html'), join(COPY, 'dist/index.html'));
  try {
    symlinkSync(join(ROOT, 'node_modules'), join(COPY, 'node_modules'));
  } catch {}
}
process.on('exit', () => rmSync(COPY, { recursive: true, force: true }));
const DIR = join(COPY, 'tests/legacy');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const list = args.includes('--list');
if (list) args.splice(args.indexOf('--list'), 1);
const shard = opt('--shard', null);
const jobs = Number(opt('--jobs', availableParallelism()));
const timeout = Number(opt('--timeout', 300)) * 1000;
const durations = JSON.parse(readFileSync(join(DIR, 'durations.json'), 'utf8'));
const all = readdirSync(DIR).filter((f) => f.endsWith('.cjs')).sort();
let suites = args.length ? args : all;

if (shard) {
  const [k, n] = shard.split('/').map(Number);
  if (!(k >= 1 && k <= n)) throw new Error(`bad --shard ${shard}`);
  // Greedy longest-first into the currently lightest shard: deterministic and balanced.
  const bins = Array.from({ length: n }, () => ({ total: 0, items: [] }));
  for (const s of [...suites].sort((a, b) => (durations[b] ?? 30) - (durations[a] ?? 30) || a.localeCompare(b))) {
    const bin = bins.reduce((m, b) => (b.total < m.total ? b : m));
    bin.items.push(s);
    bin.total += durations[s] ?? 30;
  }
  suites = bins[k - 1].items;
  console.log(`shard ${k}/${n}: ${suites.length} suites, ~${Math.round(bins[k - 1].total)}s cpu`);
}

if (list) {
  console.log(suites.join('\n'));
  process.exit(0);
}

function run(file) {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, [join(DIR, file)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += `\nTIMEOUT after ${timeout / 1000}s`; child.kill('SIGKILL'); }, timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ file, ok: code === 0, secs: (Date.now() - start) / 1000, out });
    });
  });
}

const queue = [...suites];
const results = [];
await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, queue.length)) }, async () => {
  while (queue.length) {
    const r = await run(queue.shift());
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.file} (${r.secs.toFixed(1)}s)`);
    if (!r.ok) console.log(r.out.split('\n').slice(-25).join('\n'));
  }
}));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} legacy suites passed`);
process.exit(failed.length ? 1 : 0);
