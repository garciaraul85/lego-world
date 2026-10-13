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
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/Failed to load resource|fullscreen|Permissions check/i.test(m.text()) &&
      errors.push(m.text()),
  );
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
  await tip.getByRole('button', { name: /^Open help about this/ }).click();
  // P32: the ? opens that tool's own Help page
  await expect(page.getByRole('heading', { name: 'Select tool', level: 1 })).toBeVisible();
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

test('brick cards drag straight into the scene too, landing on what is there', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await ed(page, (e) => {
    e.dock.value = 'assets';
    e.assetCat.value = 'Bricks';
  });
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  const card = page.getByRole('listbox', { name: 'Piece sizes' }).getByRole('option').first();
  const start = await ed(page, (e) => e.scene.value.count);
  for (const [fx, fy] of [
    [0.5, 0.8],
    [0.35, 0.85],
    [0.65, 0.75],
  ] as const) {
    await card.dragTo(canvas, { targetPosition: { x: box.width * fx, y: box.height * fy } });
    if ((await ed(page, (e) => e.scene.value.count)) > start) break;
  }
  expect(await ed(page, (e) => e.scene.value.count)).toBe(start + 1);
  // the Place tool stays on with that brick for the next ones
  expect(await ed(page, (e) => (e as unknown as { tool: { value: string } }).tool.value)).toBe('place');
  expect(errors).toEqual([]);
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

test('a whole asset turns freely on three rings, plays turned, and Straighten undoes the turn', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  // select an asset copy (a house, a tree…) through the editor state, then look at it
  await ed(page, (e) => {
    const x = e as unknown as {
      scene: { value: { all(): { id: number }[]; ownerOf(id: number): { bricks: { id: number }[] } | null } };
      select(ids: number[]): void;
    };
    const s = x.scene.value;
    const b = s.all().find((q) => s.ownerOf(q.id))!;
    x.select(s.ownerOf(b.id)!.bricks.map((q) => q.id));
  });
  await page.keyboard.press('f');
  await page.keyboard.press('e');
  const spots = async () =>
    JSON.parse((await canvas.getAttribute('data-gizmo')) || 'null') as Record<string, [number, number] | null> | null;
  await expect.poll(async () => Object.keys((await spots()) ?? {}).sort()).toEqual(['center', 'ring', 'rx', 'rz']);
  const s = (await spots())!;
  const [hx, hy] = s.rz!;
  const [cx, cy] = s.center!;
  const r = Math.hypot(hx - cx, hy - cy);
  const a0 = Math.atan2(hy - cy, hx - cx);
  await page.mouse.move(box.x + hx, box.y + hy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    const a = a0 - (i * Math.PI) / 16;
    await page.mouse.move(box.x + cx + Math.cos(a) * r, box.y + cy + Math.sin(a) * r);
  }
  await expect(page.locator('.gizmo-tag')).toContainText('about Z');
  await page.mouse.up();
  const tilt = () =>
    ed(page, (e) => {
      const x = e as unknown as { selectedInstance: { value: { inst: { tilt?: number[] } } | null } };
      return x.selectedInstance.value?.inst.tilt ?? null;
    });
  await expect.poll(tilt).not.toBeNull();
  expect(Math.abs((await tilt())![2]!)).toBeGreaterThan(0);

  // it plays turned without errors
  await page.keyboard.press('F5');
  await page.waitForFunction(
    () => !!(window as unknown as { __editor: { session: { value: unknown } } }).__editor.session.value,
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page.waitForTimeout(1500);
  await page.keyboard.press('F5');

  // Straighten from the Inspector
  await page.getByRole('region', { name: 'Inspector' }).getByRole('button', { name: 'Straighten' }).click();
  await expect.poll(tilt).toBeNull();
  expect(errors).toEqual([]);
});

test('view buttons, keys and full-screen scene', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  const view = page.getByRole('toolbar', { name: 'View' });
  for (const name of [
    'Zoom in',
    'Zoom out',
    'Turn view left',
    'Turn view right',
    'Focus on selection',
    'Fit everything',
  ])
    await view.getByRole('button', { name }).click();
  await page.keyboard.press('+');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Control+Shift+F');
  await expect(page.locator('.app.scene-full')).toBeVisible();
  await expect(page.locator('.menubar')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Inspector' })).toBeHidden();
  await view.getByRole('button', { name: 'Show assets' }).click();
  await expect(page.getByRole('region', { name: 'Bottom dock' })).toBeVisible();
  await view.getByRole('button', { name: 'Leave full screen' }).click();
  await expect(page.locator('.menubar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Resize grows a whole asset; one Place tool for bricks and assets; the Sign tool', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  const tools = page.getByRole('group', { name: 'Tools' });
  await expect(tools.getByRole('button', { name: 'Place (B)' })).toHaveCount(1);
  await expect(tools.getByRole('button', { name: /Place asset|Brick paint/ })).toHaveCount(0);
  await expect(tools.getByRole('button', { name: 'Sign (U)' })).toBeVisible();
  await page.keyboard.press('a');
  await expect(tools.getByRole('button', { name: 'Place (B)' })).toHaveAttribute('aria-pressed', 'true');

  const canvas = page.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  await ed(page, (e) => {
    const x = e as unknown as {
      scene: { value: { all(): { id: number }[]; ownerOf(id: number): { bricks: { id: number }[] } | null } };
      select(ids: number[]): void;
    };
    const s = x.scene.value;
    const b = s.all().find((q) => s.ownerOf(q.id))!;
    x.select(s.ownerOf(b.id)!.bricks.map((q) => q.id));
  });
  await page.keyboard.press('f');
  await page.keyboard.press('q');
  const spots = async () =>
    JSON.parse((await canvas.getAttribute('data-gizmo')) || 'null') as Record<string, [number, number] | null> | null;
  await expect.poll(async () => Object.keys((await spots()) ?? {}).includes('all')).toBe(true);
  const s = (await spots())!;
  const [hx, hy] = s.all!;
  const [cx, cy] = s.center!;
  await page.mouse.move(box.x + hx, box.y + hy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++)
    await page.mouse.move(box.x + hx + (hx - cx) * i * 0.15, box.y + hy + (hy - cy) * i * 0.15);
  await expect(page.locator('.gizmo-tag')).toContainText('Size');
  await page.mouse.up();
  const scale = () =>
    ed(page, (e) => {
      const x = e as unknown as { selectedInstance: { value: { inst: { scale?: number[] } } | null } };
      return x.selectedInstance.value?.inst.scale ?? null;
    });
  await expect.poll(scale).not.toBeNull();
  expect((await scale())![0]).toBeGreaterThan(1);
  await page.getByRole('region', { name: 'Inspector' }).getByRole('button', { name: 'Reset size' }).click();
  await expect.poll(scale).toBeNull();
  expect(errors).toEqual([]);
});

test('Asset studio: one toolbar, piece pictures, title tips, and bricks turned freely as a part', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  const plate = page.getByRole('region', { name: 'Asset build plate' });
  await expect(plate).toBeVisible();
  // the Scene tools are not a second toolbar here
  await expect(page.getByRole('group', { name: 'Tools' })).toHaveCount(0);
  // the piece control shows pictures of the pieces
  await plate.getByRole('button', { name: /^Piece:/ }).click();
  const pick = page.getByRole('dialog', { name: 'Pick a piece' });
  await expect(pick.locator('svg.brick-icon').first()).toBeVisible();
  await pick.getByRole('radio', { name: /Plate/ }).click();
  await pick.getByRole('option', { name: /Plate 2×4/ }).click();
  await pick.getByRole('button', { name: 'Done' }).click();
  await expect(plate.getByRole('button', { name: /^Piece: Plate 2×4/ })).toBeVisible();
  // buttons with a title get the same hover tip
  await plate.getByRole('button', { name: 'Rotate (E)' }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();

  // select the top brick and turn it on the blue ring: it becomes a turned part
  const canvas = plate.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  await plate.getByRole('button', { name: 'Select (V)' }).click();
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.12 }, modifiers: ['Alt'] });
  await plate.getByRole('button', { name: 'Rotate (E)' }).click();
  const spots = async () =>
    JSON.parse((await canvas.getAttribute('data-gizmo')) || 'null') as Record<string, [number, number] | null> | null;
  await expect.poll(async () => Object.keys((await spots()) ?? {}).includes('rz')).toBe(true);
  const s = (await spots())!;
  const [hx, hy] = s.rz!;
  const [cx, cy] = s.center!;
  const r = Math.hypot(hx - cx, hy - cy);
  const a0 = Math.atan2(hy - cy, hx - cx);
  await page.mouse.move(box.x + hx, box.y + hy);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    const a = a0 - (i * Math.PI) / 16;
    await page.mouse.move(box.x + cx + Math.cos(a) * r, box.y + cy + Math.sin(a) * r);
  }
  await page.mouse.up();
  const parts = page.locator('[data-tour="asset-parts"]');
  await expect(parts).toContainText('Part 1');
  // every placed copy in the world shows the part turned
  expect(
    await ed(page, (e) => (e as unknown as { scene: { value: { free: Map<string, unknown> } } }).scene.value.free.size),
  ).toBeGreaterThan(0);
  await parts.getByRole('button', { name: 'Straighten' }).click();
  await expect(parts).not.toContainText('Part 1');
  expect(errors).toEqual([]);
});
