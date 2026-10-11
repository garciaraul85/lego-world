#!/usr/bin/env node
// Builds a small game in the editor (as a person would, through the UI and its commands), launches it,
// plays it to the end with real key presses, and reports performance.
//   npm run build && node scripts/playtest.mjs [--out dir] [--stress]
// Needs Playwright's Chromium (or PW_CHROMIUM_PATH). Prints a JSON report and saves screenshots.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const OUT = resolve(arg('--out', resolve(ROOT, 'test-results/playtest')));
const STRESS = process.argv.includes('--stress');
mkdirSync(OUT, { recursive: true });
// the engine's own nav grid (the one cinematic actors walk with), to plan the hero's route like a player would
const navBundle = await build({
  entryPoints: [resolve(ROOT, 'src/engine/cinematic/nav.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const { NavGrid } = await import(
  `data:text/javascript;base64,${Buffer.from(navBundle.outputFiles[0].text).toString('base64')}`
);
const PORT = 4192;
const BASE = `http://localhost:${PORT}`;
const report = { build: {}, play: {}, stress: null, env: {}, log: [] };
const log = (m) => {
  report.log.push(m);
  console.log(m);
};

const server = spawn(process.execPath, [resolve(ROOT, 'scripts/serve.mjs'), '--port', String(PORT)], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const ready = () => page.waitForFunction(() => !!window.__editor?.scene.value, undefined, { timeout: 120_000 });
const ed = (fn, a) => page.evaluate(fn, a);
const shot = (name) => page.screenshot({ path: resolve(OUT, `${name}.png`) });
const timed = async (label, fn) => {
  const t = Date.now();
  const r = await fn();
  report.build[label] = Date.now() - t;
  log(`  ${label}: ${Date.now() - t} ms`);
  return r;
};

/** frame sampler: rAF frame times, simulation step time, render time, heap */
async function startSampler() {
  await ed(() => {
    const s = window.__editor.session.value;
    const S = {
      frames: [],
      sim: [],
      render: [],
      draws: [],
      heap: [],
      t0: performance.now(),
      on: true,
    };
    window.__perf = S;
    const rt = s.runtime;
    if (!rt.__timed) {
      rt.__timed = true;
      const adv = rt.advance.bind(rt);
      rt.advance = (dt) => {
        const t = performance.now();
        const n = adv(dt);
        if (window.__perf?.on && n > 0) window.__perf.sim.push((performance.now() - t) / n);
        return n;
      };
    }
    let last = performance.now();
    const loop = (now) => {
      if (!S.on) return;
      S.frames.push(now - last);
      last = now;
      const st = window.__editor.playStats.value;
      S.render.push(st.ms);
      S.draws.push(window.__editor.stats.value.drawCalls);
      if (performance.memory) S.heap.push(performance.memory.usedJSHeapSize);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
async function stopSampler() {
  return ed(() => {
    const S = window.__perf;
    S.on = false;
    const q = (a, p) => {
      const b = [...a].sort((x, y) => x - y);
      return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : 0;
    };
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const frames = S.frames.slice(5);
    return {
      seconds: Math.round((performance.now() - S.t0) / 100) / 10,
      frames: frames.length,
      fps: Math.round(1000 / avg(frames)),
      frameMs: {
        avg: +avg(frames).toFixed(1),
        p50: +q(frames, 0.5).toFixed(1),
        p95: +q(frames, 0.95).toFixed(1),
        max: +Math.max(...frames).toFixed(1),
      },
      over33ms: frames.filter((f) => f > 33.4).length,
      simMsPerTick: {
        avg: +avg(S.sim).toFixed(2),
        p95: +q(S.sim, 0.95).toFixed(2),
        max: +Math.max(...S.sim).toFixed(2),
      },
      renderMs: { avg: +avg(S.render).toFixed(2), p95: +q(S.render, 0.95).toFixed(2) },
      drawCalls: Math.round(avg(S.draws)),
      heapMB: S.heap.length
        ? {
            start: +(S.heap[0] / 1048576).toFixed(1),
            end: +(S.heap.at(-1) / 1048576).toFixed(1),
            max: +(Math.max(...S.heap) / 1048576).toFixed(1),
          }
        : null,
    };
  });
}

/** WASD → world direction, measured in the running game (the camera decides it) */
async function calibrate() {
  const dirs = {};
  for (const k of ['w', 'd']) {
    const a = await ed(() => window.__editor.session.value.heroState);
    await page.keyboard.down(k);
    await ticks(20);
    await page.keyboard.up(k);
    await ticks(15);
    const b = await ed(() => window.__editor.session.value.heroState);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const n = Math.hypot(dx, dz) || 1;
    dirs[k] = [dx / n, dz / n];
  }
  return dirs;
}

const control = { n: 0, ticks: 0, last: null };
/** walks the hero to a point with real key presses; when blocked it jumps, then side-steps, then gives up so the caller can re-plan.
 *  Stops early once `chest` shows its prompt (as a player stops when "Open" appears).
 *  Budgets are in game ticks, so a slow machine only makes it take longer. */
async function walkTo(dirs, tx, tz, reach = 1.2, tickBudget = 2400, chest = null) {
  const held = new Set();
  const set = async (want) => {
    for (const k of [...held])
      if (!want.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
    for (const k of want)
      if (!held.has(k)) {
        await page.keyboard.down(k);
        held.add(k);
      }
  };
  const look = () =>
    ed((id) => {
      const s = window.__editor.session.value;
      return { t: s.runtime.ticks, h: s.heroState, atChest: !!id && s.prompt?.instance.inst.id === id };
    }, chest);
  const { t: t0 } = await look();
  control.last = null;
  let lastPos = null;
  let lastMoveTick = t0;
  let stuck = 0;
  try {
    for (;;) {
      const { t: now, h, atChest } = await look();
      control.n++;
      control.ticks += now - (control.last ?? now);
      control.last = now;
      const dx = tx - h.x;
      const dz = tz - h.z;
      const d = Math.hypot(dx, dz);
      if (atChest || d < reach) return { ok: true, d, ticks: now - t0, atChest };
      if (now - t0 > tickBudget)
        return { ok: false, d, ticks: now - t0, at: [h.x, h.z], ahead: [h.x + (dx / d) * 0.9, h.z + (dz / d) * 0.9] };
      const f = (dx * dirs.w[0] + dz * dirs.w[1]) / d;
      const r = (dx * dirs.d[0] + dz * dirs.d[1]) / d;
      const want = new Set();
      if (f > 0.38) want.add('w');
      if (f < -0.38) want.add('s');
      if (r > 0.38) want.add('d');
      if (r < -0.38) want.add('a');
      await set(want);
      if (!lastPos || Math.hypot(h.x - lastPos.x, h.z - lastPos.z) > 0.15) {
        lastMoveTick = now;
        lastPos = h;
      }
      if (now - lastMoveTick > 30) {
        stuck++;
        if (stuck > 4)
          return {
            ok: false,
            stuck: true,
            d,
            ticks: now - t0,
            at: [h.x, h.z],
            ahead: [h.x + (dx / d) * 0.9, h.z + (dz / d) * 0.9],
          };
        // jump, then side-step (left or right of the way we want to go, alternating) for a moment
        await page.keyboard.press(' ');
        const side = Math.abs(f) >= Math.abs(r) ? (stuck % 2 ? 'a' : 'd') : stuck % 2 ? 'w' : 's';
        await set(new Set([side]));
        await ticks(18);
        lastMoveTick = (await look()).t;
        lastPos = null;
      }
      await wait(10);
    }
  } finally {
    await set(new Set());
  }
}

/** skips the GPU draw calls while on: the game still simulates every tick at full rate, it just isn't drawn.
 *  This machine renders in software, so walking across the map drawn would take many minutes. */
async function fastForward(on) {
  await ed((v) => {
    if (!window.__ffPatched) {
      window.__ffPatched = true;
      for (const P of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype])
        for (const m of [
          'drawArrays',
          'drawElements',
          'drawArraysInstanced',
          'drawElementsInstanced',
          'drawRangeElements',
          'clear',
        ]) {
          const f = P[m];
          if (f)
            P[m] = function (...a) {
              if (!window.__ff) return f.apply(this, a);
            };
        }
    }
    window.__ff = v;
  }, on);
  if (!on) await ticks(4);
}

/** a walkable route from the hero to a spot next to a target, on the engine's nav grid */
async function route(target, base, own, skip = new Set()) {
  const { boxes, hero, npcs } = await ed(([lo, hi]) => {
    const s = window.__editor.session.value;
    return {
      boxes: s.world.pieces.map((p) => ({ ...s.L.GamePhysics.bounds(p), own: p.id >= lo && p.id < hi })),
      hero: s.heroState,
      npcs: s.world.npcs.map((n) => [n.state.x, n.state.y, n.state.z]),
    };
  }, own);
  // the hero is wide (about 0.8 studs of radius), so anything taller than a step is grown by that much;
  // the chest itself is not, since the hero has to get right up to it
  const R = 0.7;
  const grown = boxes.map((b) =>
    b.own || b.y1 < 0.9 ? b : { ...b, x0: b.x0 - R, x1: b.x1 + R, z0: b.z0 - R, z1: b.z1 + R },
  );
  // villagers stand in the way too: treat each as a tall post (not the one the hero is touching, or there is no way out)
  for (const [x, y, z] of npcs)
    if (Math.hypot(x - hero.x, z - hero.z) > 1.2)
      grown.push({ x0: x - 1.2, x1: x + 1.2, y0: y, y1: y + 3, z0: z - 1.2, z1: z + 1.2 });
  // spots where the hero got stuck before (something the grid does not see, like a villager standing there)
  for (const [x, z] of blocked) grown.push({ x0: x - 1.1, x1: x + 1.1, y0: 0, y1: 3, z0: z - 1.1, z1: z + 1.1 });
  const grid = new NavGrid(grown);
  // start from the nearest cell the hero fits in (it may be touching a wall, inside the grown margin)
  const raw = new NavGrid(boxes).heightAt(hero.x, hero.z);
  let from = [hero.x, hero.y, hero.z];
  if (Math.abs(grid.heightAt(hero.x, hero.z) - raw) > 0.3) {
    let near = null;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const x = Math.floor(hero.x) + dx + 0.5;
        const z = Math.floor(hero.z) + dz + 0.5;
        const d = Math.hypot(x - hero.x, z - hero.z);
        if (grid.heightAt(x, z) <= raw + 0.45 && (!near || d < near.d)) near = { x, z, d };
      }
    if (near) from = [near.x, raw, near.z];
  }
  let best = null;
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const x = Math.floor(target[0]) + dx + 0.5;
      const z = Math.floor(target[2]) + dz + 0.5;
      if (Math.hypot(x - target[0], z - target[2]) > 2.2) continue; // the prompt shows within about 2.4
      if (skip.has(`${x},${z}`) || Math.abs(grid.heightAt(x, z) - (base ?? raw)) > 0.45) continue; // the floor beside it, not the chest's lid
      const path = grid.path(from, [x, 0, z]);
      const found = walkable(grid, path);
      const len = path.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - path[i - 1][0], p[2] - path[i - 1][2]) : 0), 0);
      if (found && (!best || len < best.len)) best = { path, len, cell: `${x},${z}` };
    }
  const near = (b) =>
    b.x1 > hero.x - 2.5 && b.x0 < hero.x + 2.5 && b.z1 > hero.z - 2.5 && b.z0 < hero.z + 2.5 && b.y1 > 0.41;
  routeLog.push({
    blocked: blocked.length,
    hero: [hero.x, hero.z],
    nearRaw: boxes.filter(near),
    nearGrown: grown.filter(near).length,
    from,
    target,
    base,
    npcs,
    cell: best?.cell ?? null,
    path: best?.path ?? null,
    skip: [...skip],
  });
  const at = [hero.x, hero.y, hero.z];
  return best ? Object.assign([at, ...best.path], { cell: best.cell }) : [at, target];
}
const routeLog = [];
const blocked = [];

/** true when every step along the path is small enough to walk (the grid gives a straight line when it finds no path) */
function walkable(grid, path) {
  let h = grid.heightAt(path[0][0], path[0][2]);
  for (let i = 1; i < path.length; i++) {
    const [ax, , az] = path[i - 1];
    const [bx, , bz] = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
    for (let k = 1; k <= n; k++) {
      const nh = grid.heightAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
      if (Math.abs(nh - h) > 1.25) return false;
      h = nh;
    }
  }
  return true;
}

/** waits until the game has run n more fixed ticks (60 per second of game time) */
async function ticks(n) {
  const t0 = await ed(() => window.__editor.session.value.runtime.ticks);
  await page.waitForFunction((t) => window.__editor.session.value.runtime.ticks >= t, t0 + n, {
    timeout: 0,
    polling: 200,
  });
}

try {
  // ---------------- launch ----------------
  let t = Date.now();
  await page.goto(`${BASE}/editor.html?nohub`);
  await ready();
  report.build.firstLoad = Date.now() - t;
  report.env = await ed(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      cores: navigator.hardwareConcurrency,
      ua: navigator.userAgent.replace(/.*(Chrome\/[\d.]+).*/, '$1'),
    };
  });
  log(`Editor ready in ${report.build.firstLoad} ms · WebGL: ${report.env.renderer}`);

  // ---------------- build ----------------
  log('Building “Meadow Coins”');
  await timed('newProject', async () => {
    await page.locator('[data-tour="menu-file"]').click();
    await page.getByRole('menuitem', { name: /^New project/ }).click();
    await page.getByRole('button', { name: 'Create new project' }).click();
    await page.waitForLoadState('load');
    await wait(500);
    await ready();
  });
  await ed(() =>
    window.__editor.exec({ type: 'project.update', payload: { name: 'Meadow Coins' } }, { label: 'Name the game' }),
  );

  // terrain: Map tab › environments › Generate
  await page.locator('[data-tour="tab-map"]').click();
  const gen = page.locator('[data-tour="generate"]');
  for (const env of [
    'Forest',
    'City',
    'Mountains',
    'Prairie',
    'Volcanoes',
    'Desert',
    'Beach',
    'Highway',
    'Castle outside',
    'Castle inside',
    'Rainforest',
  ]) {
    const box = gen.getByLabel(env, { exact: true });
    if ((await box.count()) && (await box.isChecked()) !== (env === 'Prairie')) await box.click();
  }
  await gen.getByLabel('Seed', { exact: true }).fill('2024');
  await gen.getByLabel('Seed', { exact: true }).press('Tab');
  const before = await ed(() => window.__editor.scene.value.count);
  await timed('generateTerrain', async () => {
    await gen.getByRole('button', { name: 'Generate' }).click();
    await page.waitForFunction((n) => window.__editor.scene.value.count !== n, before, { timeout: 60_000 });
  });
  await page.keyboard.press('Home');
  await shot('01-terrain');

  // three treasure chests: pick the chest in the dock, top view, Place asset tool, click the ground
  await ed(() => {
    window.__editor.dock.value = 'assets';
    window.__editor.assetCat.value = 'Assets';
  });
  await wait(300);
  await page.locator('[data-tour="dock"]').getByText('Treasure chest', { exact: true }).first().click();
  const chestAsset = await ed(() => window.__editor.assetBrush.value.asset);
  await page.keyboard.press('a');
  await page.keyboard.press('Numpad7');
  await wait(800);
  const canvas = await page.locator('.viewport-canvas').first().boundingBox();
  const _probe = async (fx, fy) => {
    const x = canvas.x + canvas.width * fx;
    const y = canvas.y + canvas.height * fy;
    await page.mouse.move(x, y);
    await wait(120);
    const c = await ed(() => window.__editor.cursor.value);
    return { sx: x, sy: y, wx: c?.x, wz: c?.z };
  };
  const cur = async (x, y) => {
    await page.mouse.move(x, y);
    await wait(60);
    return ed(() => window.__editor.cursor.value);
  };
  const inCanvas = (x, y) => [
    Math.max(canvas.x + 4, Math.min(canvas.x + canvas.width - 4, x)),
    Math.max(canvas.y + 4, Math.min(canvas.y + canvas.height - 4, y)),
  ];
  /** finds the screen point over a map stud by feedback: read the stud under the mouse, step toward the target */
  const toScreen = async (wx, wz) => {
    let [x, y] = [canvas.x + canvas.width / 2, canvas.y + canvas.height / 2];
    for (let it = 0; it < 14; it++) {
      const c = await cur(x, y);
      if (!c) {
        [x, y] = inCanvas(x + 30, y + 30);
        continue;
      }
      if (Math.abs(c.x - wx) <= 1 && Math.abs(c.z - wz) <= 1) return [x, y];
      const cx = await cur(...inCanvas(x + 10, y));
      const cy = await cur(...inCanvas(x, y + 10));
      if (!cx || !cy) {
        [x, y] = inCanvas(x - 20, y - 20);
        continue;
      }
      const a = (cx.x - c.x) / 10;
      const b = (cy.x - c.x) / 10;
      const d = (cx.z - c.z) / 10;
      const e = (cy.z - c.z) / 10;
      const det = a * e - b * d;
      if (Math.abs(det) < 1e-4) {
        [x, y] = inCanvas(x + 15, y - 15);
        continue;
      }
      let sx = ((wx - c.x) * e - b * (wz - c.z)) / det;
      let sy = (a * (wz - c.z) - d * (wx - c.x)) / det;
      const n = Math.hypot(sx, sy);
      if (n > 80) {
        sx = (sx / n) * 80;
        sy = (sy / n) * 80;
      }
      [x, y] = inCanvas(x + sx, y + sy);
    }
    return null;
  };
  const sp = await ed(() => {
    const e = window.__editor;
    return e.store.get(`maps/${e.mapId.value}/map.json`).spawns[0];
  });
  const instCount = () =>
    ed((a) => {
      const e = window.__editor;
      return (e.store.get(`maps/${e.mapId.value}/instances.json`)?.items ?? []).filter((i) => i.asset === a).length;
    }, chestAsset);
  const placed = [];
  await timed('placeChests', async () => {
    const tries = [];
    for (const r of [6, 9, 12]) for (let k = 0; k < 8; k++) tries.push([r, (k / 12) * Math.PI * 2 + r]);
    for (const [r, ang] of tries) {
      if (placed.length === 3) break;
      const wx = sp.pos[0] + Math.cos(ang) * r;
      const wz = sp.pos[2] + Math.sin(ang) * r;
      if (placed.some((p) => Math.hypot(p.x - wx, p.z - wz) < 6)) continue;
      const n0 = await instCount();
      const pt = await toScreen(wx, wz);
      if (!pt) {
        report.log.push(`  could not aim at (${wx.toFixed(1)}, ${wz.toFixed(1)})`);
        continue;
      }
      const [x, y] = pt;
      await page.mouse.move(x, y);
      await wait(100);
      await page.mouse.click(x, y);
      await wait(250);
      if ((await instCount()) === n0) {
        report.log.push(
          `  no placement at (${wx.toFixed(1)}, ${wz.toFixed(1)}): cursor ${JSON.stringify(await ed(() => window.__editor.cursor.value))} tool ${await ed(() => window.__editor.tool.value)}`,
        );
        continue;
      }
      // keep it only on walkable ground near the arrival height
      const inst = await ed((a) => {
        const e = window.__editor;
        return (e.store.get(`maps/${e.mapId.value}/instances.json`).items ?? []).filter((i) => i.asset === a).at(-1);
      }, chestAsset);
      if (Math.abs(inst.pos[1] * 0.4 - sp.pos[1]) > 1.3) {
        report.log.push(
          `  too high/low at (${wx.toFixed(1)}, ${wz.toFixed(1)}): y ${inst.pos[1] * 0.4} vs spawn ${sp.pos[1]}`,
        );
        await page.keyboard.press('Control+z');
        continue;
      }
      placed.push({ id: inst.id, x: inst.pos[0], z: inst.pos[2] });
    }
  });
  if (placed.length < 3) throw new Error(`only ${placed.length} chests could be placed`);
  log(`  chests at ${placed.map((p) => `(${p.x}, ${p.z})`).join(' ')}`);
  await page.locator('[data-tour="ws-scene"]').click();
  await page.keyboard.press('v');
  await shot('02-chests-top-view');

  // a sign at the arrival: World UI tool (U), then its text in the Inspector
  await timed('placeSign', async () => {
    await page.keyboard.press('u');
    const pt = (await toScreen(sp.pos[0] + 2, sp.pos[2] + 2)) ?? (await toScreen(sp.pos[0], sp.pos[2]));
    if (!pt) throw new Error('could not aim at the arrival');
    await page.mouse.click(pt[0], pt[1]);
    await wait(300);
    const field = page.getByLabel('World UI text');
    await field.fill('Chests opened: {coins} / 3');
    await field.press('Enter');
    await field.blur();
  });

  // music for the map
  await ed(() => {
    const e = window.__editor;
    e.exec({ type: 'map.setAudio', payload: { map: e.mapId.value, music: 'mus_explore000' } }, { label: 'Map music' });
  });

  // the reward scene: Cinematics › + Reward
  const cine = await timed('rewardScene', async () => {
    await page.locator('[data-tour="ws-cinematics"]').click();
    await page
      .getByRole('button', { name: /New reward scene|\+ Reward/ })
      .first()
      .click();
    await wait(400);
    return ed(() => window.__editor.store.list('cinematics/')[0]?.slice(11, -5));
  });
  if (!cine) throw new Error('no reward scene');

  // logic: a coins variable, then the rules pasted into the Code view
  await timed('logic', async () => {
    await page.locator('[data-tour="ws-logic"]').click();
    await page.getByLabel('New variable name').fill('coins');
    await page.getByLabel('New variable name').press('Enter');
    await page.waitForFunction(() => !!window.__editor.store.get('logic/variables.json')?.vars?.coins, undefined, {
      timeout: 5000,
    });
    await wait(200);
    await page.getByRole('button', { name: '+ New' }).first().click();
    await page.getByRole('radio', { name: 'Code', exact: true }).click();
    await page.locator('.lg-code .cm-content').waitFor();
    await page.locator('.lg-code .cm-content').click();
    await page.keyboard.press('Control+a');
    const HUD = 'scr_hud0000000';
    await page.keyboard.insertText(`on("start", (e) => {
  vars.coins = 0;
  screen.setText("${HUD}", "message", "Find the 3 treasure chests!");
});

// the chest asset sends "chest-opened" when its lid opens (closing it again sends nothing)
on("custom", { event: "chest-opened" }, (e) => {
  vars.coins += 1;
  if ((vars.coins >= 3)) {
    emit("won");
  } else {
    screen.setText("${HUD}", "message", "Chest found! Keep looking.");
  }
});

on("custom", { event: "won" }, (e) => {
  once(() => {
    screen.setText("${HUD}", "message", "All chests found!");
    cinematic.play("${cine}", true);
  });
});

on("cinematicDone", { cinematic: "${cine}" }, (e) => {
  screen.setText("${HUD}", "message", "You win!");
});
`);
    await page.waitForFunction(
      () => {
        const e = window.__editor;
        const g = e.store.get(`logic/${e.logicGraph.value}.json`);
        return g?.nodes.some((n) => n.type === 'event.onCinematicDone');
      },
      undefined,
      { timeout: 10_000 },
    );
  });
  await page.getByRole('radio', { name: 'Split', exact: true }).click();
  await shot('03-logic', 400);

  // check routes, then save happens by itself
  await page.locator('[data-tour="ws-scene"]').click();
  report.build.problems = await ed(() => {
    const e = window.__editor;
    return { undoSteps: e.bus.history().length, files: [...e.store.keys()].length, pieces: e.scene.value.count };
  });
  report.build.editorRedrawMs = await ed(() => {
    const t = window.__editor.frameTimes.value;
    return t.length ? +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2) : null;
  });
  report.build.drawCalls = await ed(() => window.__editor.stats.value.drawCalls);
  await page.getByText('All changes saved').waitFor({ timeout: 20_000 });
  // the finished project's files, so the game can be replayed or inspected without the editor
  const files = await ed(() => [...window.__editor.store.keys()].map((k) => [k, window.__editor.store.get(k)]));
  writeFileSync(resolve(OUT, 'project.json'), JSON.stringify({ files, chests: placed.map((c) => c.id) }));
  if (process.argv.includes('--build-only')) throw new Error('build-only');

  // ---------------- play ----------------
  log('Playing');
  t = Date.now();
  await page.locator('[data-tour="play"] button').first().click();
  await page.waitForFunction(() => (window.__editor.session.value?.runtime.ticks ?? 0) > 30, undefined, {
    timeout: 60_000,
  });
  report.play.startMs = Date.now() - t;
  await startSampler();
  await page.getByRole('radio', { name: '2×', exact: true }).click();
  await ticks(30);
  await shot('04-play-start');
  const dirs = await calibrate();
  log(`  WASD: w → (${dirs.w.map((v) => v.toFixed(2))}), d → (${dirs.d.map((v) => v.toFixed(2))})`);
  await ticks(120);
  report.play.perf = await stopSampler(); // drawn frames only
  log(`  drawn: ${JSON.stringify(report.play.perf)}`);
  await startSampler();
  // quarter speed while walking, so each key decision covers only a tick or two (a person reacts every few frames)
  await page.getByRole('radio', { name: '0.25×', exact: true }).click();
  const coins = () => ed(() => window.__editor.session.value.logic.vars.get('coins'));
  report.play.chests = [];
  for (const c of placed) {
    const { target, base, own } = await ed((id) => {
      const s = window.__editor.session.value;
      const inst = s.world.instances.find((i) => i.inst.id === id);
      const so = inst.sockets.find((x) => x.kind === 'interact') ?? inst.sockets[0];
      const lo = inst.inst.idBase;
      const hi = lo + inst.def.bricks.length;
      const ys = s.world.pieces.filter((p) => p.id >= lo && p.id < hi).map((p) => s.L.GamePhysics.bounds(p).y0);
      const m = Math.min(...ys);
      return { target: so.world, base: Number.isFinite(m) ? m : null, own: [lo, hi] };
    }, c.id);
    const t1 = Date.now();
    await fastForward(true);
    const w = { ok: false, ticks: 0, waypoints: 0, replans: 0 };
    const tried = new Set();
    for (let attempt = 0; attempt < 5 && !w.ok; attempt++) {
      const path = await route(target, base, own, tried);
      if (path.cell) tried.add(path.cell);
      w.waypoints += path.length;
      if (attempt) w.replans++;
      for (const [k, p] of path.slice(1).entries()) {
        const last = k === path.length - 2;
        let r = await walkTo(dirs, p[0], p[2], last ? 0.6 : 0.8, last ? 1200 : 400, c.id);
        w.ticks += r.ticks ?? 0;
        // at the end of the route, step straight towards the chest until its prompt shows
        if (r.ok && last && !r.atChest) {
          r = await walkTo(dirs, target[0], target[2], 0.6, 300, c.id);
          w.ticks += r.ticks ?? 0;
        }
        w.ok = !!r.atChest;
        if (!r.ok) {
          w.at = r.at;
          if (r.ahead) blocked.push(r.ahead);
        }
        if (w.ok || !r.ok || last) break;
      }
    }
    // E only when the prompt is this chest's (another chest nearby would show its own prompt)
    const prompt = await ed((id) => window.__editor.session.value.prompt?.instance.inst.id === id, c.id);
    await fastForward(false);
    const end = await ed(() => window.__editor.session.value.heroState);
    w.endD = +Math.hypot(end.x - target[0], end.z - target[2]).toFixed(2);
    if (prompt) await page.keyboard.press('e');
    await ticks(20);
    const n = await coins();
    report.play.routes = routeLog;
    report.play.chests.push({
      chest: c.id,
      target: target.map((v) => +v.toFixed(2)),
      endDistance: w.endD,
      reached: w.ok,
      replans: w.replans,
      stoppedAt: w.ok ? undefined : w.at,
      prompt,
      coins: n,
      gameSeconds: +(w.ticks / 60).toFixed(1),
      realSeconds: (Date.now() - t1) / 1000,
    });
    log(
      `  chest ${report.play.chests.length}: reached=${w.ok} prompt=${prompt} coins=${n} (${(w.ticks / 60).toFixed(1)} s of game time)`,
    );
    await shot(`05-chest-${report.play.chests.length}`);
  }
  report.play.ticksPerKeyDecision = +(control.ticks / Math.max(1, control.n)).toFixed(1);
  log(`  game ticks per key decision: ${report.play.ticksPerKeyDecision}`);
  // the reward scene (watch a little, then skip it with Esc as a player can), then the win message
  report.play.cinematicStarted = await ed(() => !!window.__editor.session.value.cine.active);
  if (report.play.cinematicStarted) {
    await ticks(150);
    await shot('06-reward-scene');
    await page.keyboard.press('Escape');
  }
  await page.waitForFunction(() => !window.__editor.session.value.cine.active, undefined, { timeout: 0, polling: 300 });
  await ticks(20);
  report.play.hudMessage = await ed(
    () => window.__editor.session.value.screenText.get('scr_hud0000000:message') ?? null,
  );
  report.play.won = report.play.hudMessage === 'You win!';
  log(`  HUD says: ${report.play.hudMessage}`);
  await shot('07-you-win');
  report.play.perfWhole = await stopSampler(); // includes the fast-forwarded walks: its sim times count, its frame times do not
  log(`  whole run (simulation): ${JSON.stringify(report.play.perfWhole.simMsPerTick)}`);
  await page.keyboard.press('F5');
  await wait(800);

  // ---------------- stress: the biggest generated map ----------------
  if (STRESS) {
    log('Stress: a 32-stud city + forest + mountains map');
    await ed(() => {
      const e = window.__editor;
      e.exec(
        {
          type: 'map.generate',
          payload: {
            map: e.mapId.value,
            config: { environments: ['city', 'forest', 'mountains'], size: 32, seed: 31337 },
          },
        },
        { label: 'Stress map' },
      );
    });
    await wait(1500);
    const pieces = await ed(() => window.__editor.scene.value.count);
    await page.locator('[data-tour="play"] button').first().click();
    await page.waitForFunction(() => (window.__editor.session.value?.runtime.ticks ?? 0) > 30, undefined, {
      timeout: 60_000,
    });
    await startSampler();
    await page.keyboard.down('w');
    await wait(6000);
    await page.keyboard.up('w');
    await page.keyboard.down('d');
    await wait(3000);
    await page.keyboard.up('d');
    await shot('08-stress');
    report.stress = { pieces, ...(await stopSampler()) };
    log(`  ${JSON.stringify(report.stress)}`);
    await page.keyboard.press('F5');
    await page.keyboard.press('Control+z');
  }
} catch (e) {
  log(`FAILED: ${e.message}`);
  await shot('failure').catch(() => {});
  report.error = e.message;
} finally {
  report.pageErrors = errors;
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.kill();
}
