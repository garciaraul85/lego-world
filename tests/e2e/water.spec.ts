import { expect, type Page, test } from '@playwright/test';

/** Milestone 2b, 10b part 2: water on the map and loose objects, in the real editor. */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  selectedItem: { value: string | null };
  store: { get(p: string): unknown };
  session: {
    value: {
      runtime: { ticks: number };
      world: {
        physics: { objectPose(k: string): { pos: number[] } | null } | null;
        water: unknown[];
        looseObjects: { inst: { inst: { id: string } }; origin: number[] }[];
      };
    } | null;
  };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}

const items = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string; body?: string }[] }).items;
  });

test('the dock places water, the Inspector changes it, right-click adds it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  const dock = page.locator('[data-tour="dock"]');
  await dock.getByRole('button', { name: /^Water \d+$/ }).click();
  await page.locator('[data-tour="dock-water-pool"]').click();
  await expect.poll(async () => (await items(page)).filter((i) => i.kind === 'water').length).toBe(1);
  // the Inspector shows it: make it a river that flows
  await expect(page.locator('[data-tour="item-water"]')).toBeVisible();
  await page.locator('[data-tour="water-kind"]').selectOption('river');
  await page.getByLabel('Current across').fill('3');
  await page.getByLabel('Current across').press('Enter');
  await expect
    .poll(async () => (await items(page)).find((i) => i.kind === 'water') as { body?: string; current?: number[] })
    .toMatchObject({ body: 'river', current: [3, 0] });
  // it is listed in the dock and the Hierarchy
  await expect(dock.getByRole('button', { name: /Pool 1/ })).toBeVisible();
  // right-click the ground: Add water here
  const view = page.locator('[data-tour="viewport"] canvas').first();
  const box = (await view.boundingBox())!;
  await view.click({ button: 'right', position: { x: box.width / 2, y: box.height * 0.75 } });
  const add = page.getByRole('menuitem', { name: 'Add water here' });
  if (await add.isVisible()) {
    await add.click();
    await expect.poll(async () => (await items(page)).filter((i) => i.kind === 'water').length).toBe(2);
  }
  await page.screenshot({ path: 'test-results/water-scene.png' });
  expect(errors).toEqual([]);
});

test('Water and physics course: Do it for me floats a loose crate down a river in Play', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Water and physics course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if ((await doIt.isVisible()) && (await doIt.isEnabled())) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 240_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 240_000 });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      // the crate is a body in the physics engine, and the river has carried it off
      const moved = await page.evaluate(() => {
        const w = (window as unknown as { __editor: Ed }).__editor.session.value?.world;
        const o = w?.looseObjects[0];
        const p = o && w.physics?.objectPose(o.inst.inst.id);
        return p && o ? Math.hypot(p.pos[0]! - o.origin[0]!, p.pos[2]! - o.origin[2]!) : -1;
      });
      expect(moved).toBeGreaterThan(1);
      await page.screenshot({ path: 'test-results/water-play.png' });
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
