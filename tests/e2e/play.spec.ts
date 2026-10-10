import { expect, type Page, test } from '@playwright/test';

type Piece = { id: number; y: number };
type Session = {
  heroState: { x: number; z: number };
  world: { pieces: Piece[]; broken: unknown[]; debris: unknown[] };
  runtime: { ticks: number };
  breakHit(p: Piece): number;
};
type Ed = {
  scene: { value: { count: number } };
  session: { value: Session | null };
  store: { keys(): Iterable<string>; get(p: string): unknown };
  bus: { history: () => { label: string }[] };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 30_000,
    },
  );
}

const dump = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return JSON.stringify([...e.store.keys()].sort().map((k) => [k, e.store.get(k)]));
  });

test('engine Play runs a fixed-step session, smashes, and Stop leaves the project unchanged', async ({ page }) => {
  test.setTimeout(420_000); // software GL on CI draws a few frames per second
  const errors: string[] = [];
  await open(page, errors);
  const before = await dump(page);
  const undo = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.bus.history().length);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Game view')).toBeVisible();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    {
      timeout: 60_000,
    },
  );

  // Walk forward: the hero moves
  const start = await page.evaluate(() => ({
    ...(window as unknown as { __editor: Ed }).__editor.session.value!.heroState,
  }));
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  const moved = await page.evaluate((s) => {
    const h = (window as unknown as { __editor: Ed }).__editor.session.value!.heroState;
    return Math.hypot(h.x - s.x, h.z - s.z);
  }, start);
  expect(moved).toBeGreaterThan(0.1);

  // Smash something (first raised piece the v68 rules allow to break)
  const smashed = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    for (const p of s.world.pieces.filter((x) => x.y > 0).slice(0, 200)) {
      const n = s.breakHit(p);
      if (n) return n;
    }
    return 0;
  });
  expect(smashed).toBeGreaterThan(0);
  await expect(page.getByRole('tab', { name: /Debug/ }).or(page.getByRole('button', { name: /Debug/ }))).toBeVisible();

  // Pause / step
  await page.getByRole('toolbar', { name: 'Play bar' }).getByRole('button', { name: 'Pause' }).click();
  const t0 = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.runtime.ticks);
  await page.getByRole('toolbar', { name: 'Play bar' }).getByRole('button', { name: 'Step' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.runtime.ticks)).toBe(
    t0 + 1,
  );

  await page.keyboard.press('F5'); // stop (Esc is the game's back / pause now)
  await expect(page.getByLabel('Game view')).toHaveCount(0);
  await expect(page.getByLabel('3D map view')).toBeVisible();
  expect(await dump(page)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.bus.history().length)).toBe(undo);
  expect(errors).toEqual([]);
});

test('World graph connects two maps with a gate by dragging between spawn ports', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'World graph' }).click();
  const ws = page.getByRole('region', { name: 'World graph' });
  await expect(ws).toBeVisible();
  const gatesBefore = await ws.locator('g.gate').count();
  await ws.getByRole('button', { name: '+ Add map' }).click();
  await expect(ws.locator('[data-port]')).not.toHaveCount(0);
  const ports = ws.locator('circle[data-port]');
  const n = await ports.count();
  const first = ports.first();
  const last = ports.nth(n - 1);
  const a = (await first.boundingBox())!;
  const b = (await last.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(ws.locator('g.gate')).toHaveCount(gatesBefore + 1);
  await ws.getByRole('button', { name: 'Two-way' }).click();
  await expect(ws.getByRole('button', { name: 'Reverse' })).toBeEnabled();
  await ws.getByRole('button', { name: 'Remove gate' }).click();
  await expect(ws.locator('g.gate')).toHaveCount(gatesBefore);
  expect(errors).toEqual([]);
});
