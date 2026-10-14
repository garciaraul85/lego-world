import { expect, type Page, test } from '@playwright/test';

/**
 * P32: the Scene places whole assets; bricks are built into assets in the Assets screen, from the Bricks tab
 * (click or drag) and from other assets (drag a library row onto the plate, or +).
 */
type Ed = {
  scene: { value: { count: number; instances: { def: { id: string; name: string }; bricks: { id: number }[] }[] } };
  store: { get(p: string): unknown };
  studioAsset: { value: string | null };
  select(ids: number[]): void;
  tool: { value: string };
};
const ed = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;
/** the open asset's bricks (0 while it is still a built-in nobody changed) */
const pieces = (page: Page) =>
  ed(page, (e) => {
    const a = e.store.get(`assets/${e.studioAsset.value}.json`) as { bricks: unknown[] } | undefined;
    return a ? a.bricks.length : 0;
  });

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

/** Clicks (or drops) on a few spots of the plate until the asset has more bricks. */
async function tryPlate(page: Page, act: (x: number, y: number) => Promise<void>, before: number) {
  const plate = page.getByRole('region', { name: 'Asset build plate' }).getByLabel('3D map view');
  const box = (await plate.boundingBox())!;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.75],
    [0.7, 0.75],
    [0.5, 0.25],
    [0.2, 0.5],
    [0.8, 0.5],
  ] as const) {
    await act(box.width * fx, box.height * fy);
    if ((await pieces(page)) > before) return;
  }
}

test('a placed asset selected in the Scene opens in the Assets screen; bricks go onto it by click and by drag', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  // the Scene has no brick tools or brick library
  await expect(page.getByRole('group', { name: 'Tools' }).getByRole('button', { name: /^Color paint/ })).toHaveCount(0);
  await expect(page.locator('.cats').getByRole('button', { name: /^Bricks/ })).toHaveCount(0);

  // select a placed asset (a house, a tree) in the Scene, then go to the Assets screen: it opens there
  const name = await ed(page, (e) => {
    const inst = e.scene.value.instances.find((i) => i.def.name !== 'Cactus') ?? e.scene.value.instances[0]!;
    e.select(inst.bricks.map((b) => b.id));
    return inst.def.name;
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  const plate = page.getByRole('region', { name: 'Asset build plate' });
  await expect(plate.locator('.studio-title')).toHaveText(name);
  // so does one picked in the library
  await page
    .getByRole('listbox', { name: 'Assets' })
    .getByRole('option', { name: /^Bench/ })
    .first()
    .click();
  await expect(plate.locator('.studio-title')).toHaveText('Bench');
  const canvas = plate.getByLabel('3D map view');

  // Bricks tab: click a piece, then the plate
  const lib = page.getByRole('region', { name: 'Asset library' });
  await lib.getByRole('tab', { name: 'Bricks' }).click();
  await lib.getByRole('radio', { name: /Plate/ }).click();
  await lib
    .getByRole('listbox', { name: 'Piece sizes' })
    .getByRole('option', { name: /Plate 2×4/ })
    .click();
  expect(
    await ed(page, () => document.querySelector('[aria-label="Place bricks (B)"]')?.getAttribute('aria-pressed')),
  ).toBe('true');
  const p0 = await pieces(page);
  await tryPlate(
    page,
    async (x, y) => {
      await canvas.hover({ position: { x, y } });
      await canvas.click({ position: { x, y } });
    },
    p0,
  );
  const p1 = await pieces(page);
  expect(p1).toBeGreaterThan(p0);

  // ...or drag a piece straight onto the plate
  const card = lib.getByRole('listbox', { name: 'Piece sizes' }).getByRole('option').first();
  await tryPlate(page, (x, y) => card.dragTo(canvas, { targetPosition: { x, y } }), p1);
  expect(await pieces(page)).toBe(p1 + 1);
  expect(errors).toEqual([]);
});

test('an asset is built into another: drag its row onto the plate, or press +; Undo takes it out', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  const list = page.getByRole('listbox', { name: 'Assets' });
  await list
    .getByRole('option', { name: /^Bench/ })
    .first()
    .click();
  const plate = page.getByRole('region', { name: 'Asset build plate' });
  await expect(plate.locator('.studio-title')).toHaveText('Bench');
  const canvas = plate.getByLabel('3D map view');
  const bench = 3; // the built-in bench's pieces

  // drag the flower bush onto the plate: its bricks become part of the bench
  const bush = list.getByRole('option', { name: /^Flower bush/ }).first();
  await tryPlate(page, (x, y) => bush.dragTo(canvas, { targetPosition: { x, y } }), 0);
  const withBush = await pieces(page);
  expect(withBush).toBeGreaterThan(bench);
  // it is picked up as one, ready for Move
  await expect(plate.locator('.studio-foot')).toContainText('selected');
  await expect(plate.getByRole('button', { name: 'Move (W)' })).toHaveAttribute('aria-pressed', 'true');

  // + builds another one next to what is there
  await page.getByRole('button', { name: 'Build Mushroom into Bench' }).first().click();
  await expect.poll(() => pieces(page)).toBeGreaterThan(withBush);
  // the plate's Undo takes it out again
  await plate.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => pieces(page)).toBe(withBush);
  expect(errors).toEqual([]);
});

test('on the chest’s plate a trackpad-style click selects a brick and places one; Send event picks from the project’s events; sounds have ▶', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  await page
    .getByRole('listbox', { name: 'Assets' })
    .getByRole('option', { name: /^Treasure chest/ })
    .first()
    .click();
  const plate = page.getByRole('region', { name: 'Asset build plate' });
  await expect(plate.locator('.studio-title')).toHaveText('Treasure chest');
  const canvas = plate.getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  // a press that wobbles a few pixels, as on a trackpad, is still a click
  const tap = async (x: number, y: number) => {
    await page.mouse.move(box.x + x - 20, box.y + y - 10);
    await page.mouse.move(box.x + x, box.y + y, { steps: 5 });
    await page.mouse.down();
    await page.mouse.move(box.x + x + 5, box.y + y + 3);
    await page.mouse.up();
  };
  // the chest stands in the middle with room around it: a click in the middle selects one of its bricks
  await plate.getByRole('button', { name: 'Select (V)' }).click();
  await tap(box.width / 2, box.height / 2);
  await expect(plate.locator('.studio-foot')).toContainText('selected');
  // Place bricks: a click beside it adds a brick
  await plate.getByRole('button', { name: 'Place bricks (B)' }).click();
  const p0 = await pieces(page);
  for (const [fx, fy] of [
    [0.2, 0.8],
    [0.8, 0.8],
    [0.25, 0.3],
    [0.75, 0.3],
  ] as const) {
    await tap(box.width * fx, box.height * fy);
    if ((await pieces(page)) > p0) break;
  }
  expect(await pieces(page)).toBeGreaterThan(p0);

  // Send event: a list of the events the project uses, plus New event…
  const inter = page.locator('[data-tour="asset-interactions"] .interaction').first();
  const ev = inter.getByRole('combobox', { name: 'Event name' });
  await expect(ev).toHaveValue('chest-opened');
  await ev.selectOption('__new__');
  const name = inter.getByRole('textbox', { name: 'New event name' });
  await name.fill('treasure-found');
  await name.press('Enter');
  await expect(inter.getByRole('combobox', { name: 'Event name' })).toHaveValue('treasure-found');
  // the new name is now in the event lists, next to New event…
  await expect(inter.getByRole('combobox', { name: 'Event name' }).locator('option')).toContainText([
    'treasure-found',
    'New event',
  ]);
  // sounds have a ▶ to hear them
  await inter
    .getByRole('button', { name: /^Listen to / })
    .first()
    .click();
  expect(errors).toEqual([]);
});

test('a change that a placed copy cannot take is taken back, says why, and can be kept as a new asset', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  // the chest stands on the map with a brick right against its +X side
  const at = await page.evaluate(() => {
    const w = window as unknown as {
      __editor: { exec(c: unknown, o?: unknown): { ok: boolean }; mapId: { value: string } };
      __assets: { placeCommands: (ed: unknown, id: string, pos: number[], rot: number) => unknown; chestId: string };
    };
    for (const [x, z] of [
      [3, 3],
      [-6, 3],
      [3, -6],
      [-6, -6],
      [8, 0],
      [0, 8],
    ] as [number, number][])
      for (let y = 0; y < 60; y++)
        if (
          w.__editor.exec(w.__assets.placeCommands(w.__editor, w.__assets.chestId, [x, y, z], 0), { quiet: true }).ok
        ) {
          for (let dy = 0; dy < 12; dy++)
            if (
              w.__editor.exec(
                {
                  type: 'bricks.place',
                  payload: {
                    map: w.__editor.mapId.value,
                    bricks: [{ type: 'brick2x2', x: x + 4, y: y + dy, z, rot: 0, color: '#ffffff' }],
                  },
                },
                { quiet: true },
              ).ok
            )
              return [x, y, z];
        }
    return null;
  });
  expect(at).not.toBeNull();
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  await page
    .getByRole('listbox', { name: 'Assets' })
    .getByRole('option', { name: /^Treasure chest/ })
    .first()
    .click();
  const plate = page.getByRole('region', { name: 'Asset build plate' });
  await expect(plate.locator('.studio-title')).toHaveText('Treasure chest');
  const hud = () => plate.locator('.vp-hud').innerText();
  const before = await hud();
  const chest = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return JSON.stringify(e.store.get(`assets/${e.studioAsset.value}.json`) ?? null);
    });
  const saved = await chest();
  // building the mushroom in next to the chest would push the placed copy into that brick
  await page.getByRole('button', { name: 'Build Mushroom into Treasure chest' }).first().click();
  const alert = plate.getByRole('alert');
  await expect(alert).toContainText('Not saved');
  await expect(alert).toContainText('is placed on');
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/not-saved.png` });
  // the plate went back to the saved chest, and the chest is unchanged
  await expect.poll(hud).toBe(before);
  expect(await chest()).toBe(saved);
  // keep it as a new asset instead
  await alert.getByRole('button', { name: 'Keep it as a new asset' }).click();
  await expect(plate.locator('.studio-title')).toHaveText('Treasure chest (new)');
  await expect.poll(() => pieces(page)).toBeGreaterThan(5);
  expect(errors.filter((e) => !/overlap|float/i.test(e))).toEqual([]);
});
