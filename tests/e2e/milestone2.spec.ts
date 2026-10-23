import { expect, type Page, test } from '@playwright/test';

/**
 * The Milestone 2 gate, played the way a player would: in the Training yard the cast talks (T to the Yard master,
 * an answer picked with the keyboard), hits spark (F on a dummy), and the cellar stairs lead down to a dark room lit
 * by torches. And a project of 10,000 asset types stays quick to browse and search.
 */
type Npc = { profile: { name: string }; state: { x: number; y: number; z: number } };
type S = {
  world: {
    mapId: string;
    doc: { name: string };
    npcs: Npc[];
    instances: { def: { name: string }; inst: { pos: number[] } }[];
  };
  heroState: { x: number; z: number };
  placeAt(p: [number, number, number], yaw: number): void;
  talks: { view: { speakerName: string; text: string; choices?: { text: string }[] } | null };
  effects: { count: number };
  darkness: number;
  loading: unknown;
  runtime: { ticks: number };
};
type Ed = {
  scene: { value: { count: number } | null };
  mapDoc: { value: { name: string } | null };
  session: { value: S | null };
  stats: { value: { lights?: number } };
  exec(c: unknown): { ok: boolean; error?: string };
  store: { get(p: string): unknown; list(p: string): string[] };
  dock: { value: string };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());
const ses = <T>(page: Page, fn: (s: S) => T) =>
  page.evaluate((src) => {
    const f = new Function('s', `return (${src})(s)`) as (s: S) => T;
    return f((window as unknown as { __editor: Ed }).__editor.session.value!);
  }, fn.toString());
const menu = async (page: Page, name: string, item: RegExp) => {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
}

test('Milestone 2 gate: in the Training yard the cast talks, hits spark, and a dark room is lit', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await menu(page, 'World', /Add the Training yard/);
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name)).toBe('Training yard');
  await menu(page, 'Play', /^Play this map/);
  await expect
    .poll(() => get(page, (e) => e.session.value?.runtime.ticks ?? 0), { timeout: 120_000 })
    .toBeGreaterThan(5);
  const canvas = page.locator('canvas').first();
  await canvas.click({ position: { x: 20, y: 20 } });

  // the cast talks: walk up to the Yard master and press T
  await ses(page, (s) => {
    const m = s.world.npcs.find((n) => n.profile.name === 'Yard master')!;
    s.placeAt([m.state.x, m.state.y, m.state.z - 2], 0);
  });
  await page.keyboard.press('t');
  await expect.poll(() => ses(page, (s) => s.talks.view?.speakerName ?? '')).toBe('Yard master');
  await expect(page.getByText('Welcome to the Training yard!')).toBeVisible({ timeout: 30_000 });
  // T moves it on (each press first shows the whole line) until the answers show
  for (let i = 0; i < 10 && !(await ses(page, (s) => !!s.talks.view?.choices)); i++) await page.keyboard.press('t');
  await expect(page.getByText('What is down the cellar stairs?')).toBeVisible();
  await page.screenshot({ path: 'test-results/m2-talk.png' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect
    .poll(
      async () => {
        await page.keyboard.press('t');
        return ses(page, (s) => s.talks.view?.text ?? '');
      },
      { timeout: 30_000 },
    )
    .toMatch(/It is dark down there/);
  await page.keyboard.press('Escape');
  await expect.poll(() => ses(page, (s) => !!s.talks.view)).toBe(false);

  // hits spark: face a dummy and press F
  await ses(page, (s) => {
    const d = s.world.instances.find((i) => i.def.name === 'Training dummy')!;
    s.placeAt([d.inst.pos[0]! + 1, 0.4, d.inst.pos[2]! - 1.6], 0);
  });
  await canvas.click({ position: { x: 20, y: 20 } });
  let sparked = 0;
  for (let i = 0; i < 4 && !sparked; i++) {
    await page.keyboard.press('f');
    sparked = await ses(page, (s) => s.effects.count).catch(() => 0);
    if (!sparked) {
      await page.waitForTimeout(400);
      sparked = await ses(page, (s) => s.effects.count);
    }
  }
  expect(sparked).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/m2-spark.png' });

  // a dark room is lit: step onto the cellar stairs; the cellar loads, dark, and its torches are drawn
  await ses(page, (s) => s.placeAt([-18, 0.4, -16], 0));
  await expect.poll(() => ses(page, (s) => s.world.doc.name), { timeout: 120_000 }).toBe('Yard cellar');
  await expect.poll(() => ses(page, (s) => !s.loading), { timeout: 120_000 }).toBe(true);
  expect(await ses(page, (s) => s.darkness)).toBeGreaterThan(0.8);
  await expect.poll(() => get(page, (e) => e.stats.value.lights ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/m2-cellar.png' });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('Milestone 2 scale: 10,000 asset types load, page and search quickly', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  const ms = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const base = e.store.list('assets/').map((p) => e.store.get(p) as { id: string; name: string })[0]!;
    const cmds = Array.from({ length: 10_000 }, (_, i) => ({
      type: 'asset.create',
      payload: { asset: { ...base, id: `ast_t${String(i).padStart(9, '0')}`, name: `Type ${i}`, origin: 'user' } },
    }));
    const t = performance.now();
    const r = e.exec(cmds);
    if (!r.ok) throw new Error(r.error);
    e.dock.value = 'assets';
    return performance.now() - t;
  });
  expect(ms).toBeLessThan(20_000);
  const cards = page.getByRole('listbox', { name: 'Assets' }).getByRole('option');
  await expect(cards).toHaveCount(120, { timeout: 60_000 });
  await expect(page.locator('[data-tour="dock-more"]')).toContainText(/120 of 10,?\d{3}/);
  const t0 = Date.now();
  await page.getByRole('searchbox', { name: 'Search assets' }).fill('Type 9999');
  await expect(cards).toHaveCount(1, { timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(10_000);
  expect(errors).toEqual([]);
});
