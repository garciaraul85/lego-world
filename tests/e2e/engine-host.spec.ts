import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/** v68 registers its agent tools on document.modelContext; capture them so the test can drive the app. */
const captureTools = () => {
  const tools = new Map<string, { execute: (i?: unknown) => unknown }>();
  (window as unknown as { __tools: typeof tools }).__tools = tools;
  (document as unknown as { modelContext: unknown }).modelContext = {
    registerTool: (t: { name: string; execute: () => unknown }) => tools.set(t.name, t),
  };
};

type W = Window & { __tools: Map<string, { execute: (i?: unknown) => unknown }>; __bw: Record<string, unknown> };
const call = (page: Page, name: string, input?: unknown) =>
  page.evaluate(([n, i]) => JSON.parse(JSON.stringify((window as unknown as W).__tools.get(n as string)!.execute(i))), [
    name,
    input,
  ] as const);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/engine.html');
  await expect(page.locator('#bb-canvas')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as W).__tools?.has('read_brick_build'));
}

const flushSync = (page: Page) =>
  page.evaluate(() => ((window as unknown as W).__bw as { flush: () => Promise<void> }).flush());

async function mirroredProjects(page: Page) {
  return page.evaluate(async () => {
    const bw = (window as unknown as W).__bw as {
      flush: () => Promise<void>;
      backend: { listProjects: () => Promise<unknown[]> };
    };
    await bw.flush();
    return bw.backend.listProjects();
  });
}

test('mirrors v68 edits into a v5 project in IndexedDB and restores them after reload', async ({ page }) => {
  const errors: string[] = [];
  await page.addInitScript(captureTools);
  await open(page, errors);
  // First save of a new world creates the project; the second edit becomes a bus command.
  await call(page, 'generate_lego_world', {
    biomes: ['city'],
    time: 'day',
    rain: false,
    snow: false,
    snowing: false,
    size: 16,
    seed: 5,
  });
  await flushSync(page); // the 1 s sync debounce can starve under software WebGL; flush instead of sleeping
  await call(page, 'generate_lego_world', {
    biomes: ['forest'],
    time: 'evening',
    rain: true,
    snow: false,
    snowing: false,
    size: 16,
    seed: 77,
  });
  const before = await call(page, 'read_brick_build');
  await flushSync(page);
  expect(await mirroredProjects(page)).toHaveLength(1);
  const history = await page.evaluate(() =>
    ((window as unknown as W).__bw.bus as { history: () => { source: string }[] }).history(),
  );
  expect(history.at(-1)?.source).toBe('legacy');

  // v68 itself would restore from localStorage; wipe it so the restore can only come from IndexedDB.
  await page.evaluate(() => localStorage.removeItem('lego-free-build-v1'));
  await page.reload();
  await page.waitForFunction(() => (window as unknown as W).__tools?.has('read_brick_build'));
  const after = await call(page, 'read_brick_build');
  // v68 itself drops transient controller fields from `player` when it loads a save; compare the rest exactly.
  const pick = (p: Record<string, unknown> | null) => p && { x: p.x, y: p.y, z: p.z, heading: p.heading };
  expect({ ...after, player: pick(after.player) }).toEqual({ ...before, player: pick(before.player) });
  expect(errors).toEqual([]);
});

test('imports an existing LEGO World autosave on first run', async ({ page }) => {
  const errors: string[] = [];
  const save = readFileSync('tests/fixtures/legacy/save-v4.json', 'utf8');
  await page.addInitScript(captureTools);
  await page.addInitScript((s) => {
    if (!localStorage.getItem('brickworlds.currentProject')) localStorage.setItem('lego-free-build-v1', s);
  }, save);
  await open(page, errors);
  const projects = (await mirroredProjects(page)) as { name: string }[];
  expect(projects.map((p) => p.name)).toEqual(['My LEGO World']);
  const files = await page.evaluate(async () => {
    const bw = (window as unknown as W).__bw as { store: { keys: () => Iterable<string> } };
    return [...bw.store.keys()];
  });
  expect(files.filter((f) => f.endsWith('/map.json'))).toHaveLength(2);
  expect(files.some((f) => f.includes('/chunks/'))).toBe(true);
  expect(errors).toEqual([]);
});
