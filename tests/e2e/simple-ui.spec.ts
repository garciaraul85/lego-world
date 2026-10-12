import { expect, type Page, test } from '@playwright/test';

/** P31: right-click menus, keyboard menu, hover tips and drag-to-place in the real editor. */
type Ed = {
  scene: { value: { count: number } };
  mapDoc: { value: { zones: { id: string; min: number[]; max: number[] }[] } };
  selectedZone: { value: string | null };
  dock: { value: string };
  assetCat: { value: string };
};
const ed = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
}

test('right-click opens a menu for what is under the pointer; it adds, undoes and closes', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  const menu = page.getByRole('menu');

  // try a few spots until the ground menu shows (the map is mostly terrain, some spots are houses or trees)
  let found = false;
  for (const [fx, fy] of [
    [0.5, 0.75],
    [0.3, 0.8],
    [0.7, 0.8],
    [0.5, 0.9],
    [0.2, 0.7],
    [0.8, 0.7],
  ] as const) {
    await canvas.click({ button: 'right', position: { x: box.width * fx, y: box.height * fy } });
    await expect(menu).toBeVisible();
    // Help and Delete rules hold in every menu
    const last = await menu.getByRole('menuitem').last().textContent();
    expect(last).toMatch(/Delete|Help/);
    if (await menu.getByRole('menuitem', { name: 'Add a trigger zone here' }).isVisible()) {
      found = true;
      break;
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  expect(found).toBe(true);
  const before = await ed(page, (e) => e.mapDoc.value.zones.length);
  // keyboard: the first item you can use has focus (no asset is picked yet), arrows move, Enter picks
  const zoneItem = menu.getByRole('menuitem', { name: 'Add a trigger zone here' });
  await expect(zoneItem).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Add a spawn point here' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(zoneItem).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  expect(await ed(page, (e) => e.mapDoc.value.zones.length)).toBe(before + 1);

  // Shift+F10 opens the menu for the selection (the new zone)
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'When someone walks in…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.keyboard.press('Control+z');
  expect(await ed(page, (e) => e.mapDoc.value.zones.length)).toBe(before);

  // clicking elsewhere closes a menu without doing anything
  await canvas.click({ button: 'right', position: { x: box.width / 2, y: box.height * 0.6 } });
  await expect(menu).toBeVisible();
  await page.mouse.click(5, box.y + box.height - 5);
  await expect(menu).toBeHidden();
  expect(errors).toEqual([]);
});

test('hover tips explain tools and open Help; assets drag straight into the scene', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);

  await page.getByRole('button', { name: /^Select \(V\)/ }).hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Select');
  await tip.getByRole('button', { name: 'Open help about this' }).click();
  await expect(page.getByRole('heading', { name: 'Scene', exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  await ed(page, (e) => {
    e.dock.value = 'assets';
    e.assetCat.value = 'Assets';
  });
  const card = page.getByRole('listbox', { name: 'Assets' }).getByRole('option').first();
  await expect(card).toBeVisible();
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  const start = await ed(page, (e) => e.scene.value.count);
  for (const [fx, fy] of [
    [0.5, 0.7],
    [0.35, 0.75],
    [0.65, 0.75],
    [0.5, 0.85],
  ] as const) {
    await card.dragTo(canvas, { targetPosition: { x: box.width * fx, y: box.height * fy } });
    if ((await ed(page, (e) => e.scene.value.count)) > start) break;
  }
  expect(await ed(page, (e) => e.scene.value.count)).toBeGreaterThan(start);
  expect(errors.filter((e) => !/overlap|float/i.test(e))).toEqual([]);
});

test('Move and Resize show handles on the selection; dragging them moves and resizes, one undo each', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  const menu = page.getByRole('menu');
  // make a trigger zone to work on (zones are never blocked by bricks)
  for (const [fx, fy] of [
    [0.5, 0.75],
    [0.3, 0.8],
    [0.7, 0.8],
    [0.5, 0.9],
  ] as const) {
    await canvas.click({ button: 'right', position: { x: box.width * fx, y: box.height * fy } });
    const add = menu.getByRole('menuitem', { name: 'Add a trigger zone here' });
    if (await add.isVisible()) {
      await add.click();
      break;
    }
    await page.keyboard.press('Escape');
  }
  const zone = () =>
    ed(page, (e) => {
      const z = e.mapDoc.value.zones.find((x) => x.id === e.selectedZone.value) as unknown as {
        min: number[];
        max: number[];
      };
      return { min: z.min, max: z.max };
    });
  const z0 = await zone();
  const spots = async () =>
    JSON.parse((await canvas.getAttribute('data-gizmo')) || 'null') as Record<string, [number, number] | null> | null;
  /** drag from a handle, further along the line from the gizmo center through it */
  const pull = async (id: string, px: number) => {
    await expect.poll(async () => (await spots())?.[id] ?? null).not.toBeNull();
    const s = (await spots())!;
    const [hx, hy] = s[id]!;
    const [cx, cy] = s.center!;
    const len = Math.hypot(hx - cx, hy - cy) || 1;
    const from = { x: box.x + hx, y: box.y + hy };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++)
      await page.mouse.move(from.x + ((hx - cx) / len) * px * (i / 6), from.y + ((hy - cy) / len) * px * (i / 6));
    await expect(page.locator('.gizmo-tag')).toBeVisible();
    await page.mouse.up();
  };

  await page.keyboard.press('w');
  await pull('x', 80);
  const z1 = await zone();
  expect(z1.min[0]).toBeGreaterThan(z0.min[0]!);
  expect(z1.max[0]! - z1.min[0]!).toBe(z0.max[0]! - z0.min[0]!);

  await page.keyboard.press('q');
  await pull('+z', 80);
  const z2 = await zone();
  expect(z2.max[2]).toBeGreaterThan(z1.max[2]!);
  expect(z2.min[2]).toBe(z1.min[2]);

  // zones do not turn: Rotate shows no handles
  await page.keyboard.press('e');
  await expect.poll(async () => await spots()).toBeNull();

  await page.keyboard.press('Control+z');
  expect((await zone()).max[2]).toBe(z1.max[2]);
  await page.keyboard.press('Control+z');
  expect((await zone()).min[0]).toBe(z0.min[0]);
  expect(errors).toEqual([]);
});
