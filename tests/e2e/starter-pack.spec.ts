import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11, 4a: the adventure starter pack panel: a neighbour placed comes into the game with its conversation, an
 * enemy dragged onto the map, a pot placed from Buildings and props, a terrain style used, the hero chosen.
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: {
    get(p: string): unknown;
    has(p: string): boolean;
    list(p: string): string[];
    manifest: { entry: { map: string }; hero: string };
  };
  mapId: { value: string };
  undo(): void;
};
const ed = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor);
const npcs = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return (
      (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string; character?: string }[] })
        ?.items ?? []
    ).filter((i) => i.kind === 'npc');
  });

test('the starter pack: neighbours with their talk, an enemy dragged in, a pot, a terrain style, the hero', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  void ed;
  const dock = page.locator('[data-tour="dock"]');
  await dock.getByRole('button', { name: 'Starter pack' }).click();
  const pack = page.locator('[data-tour="dock-pack"]');
  await expect(pack).toBeVisible();
  await expect(pack.getByRole('listitem', { name: 'Gloomweaver' })).toBeVisible();
  await page.screenshot({ path: 'test-results/pack-panel.png' });

  // a neighbour: placed, and in the game with its conversation
  await pack.getByRole('button', { name: 'Place Elder Maren' }).click();
  await expect.poll(async () => (await npcs(page)).length).toBe(1);
  const talk = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const id = e.store.list('characters/').find((p) => (e.store.get(p) as { name: string }).name === 'Elder Maren');
    const chr = id ? (e.store.get(id) as { talk?: { conversation: string }[] }) : null;
    const conv = chr?.talk?.[0] ? e.store.get(`dialogue/${chr.talk[0].conversation}.json`) : null;
    return { has: !!chr, conv: !!conv };
  });
  expect(talk).toEqual({ has: true, conv: true });

  // an enemy dragged onto the map
  const card = pack.getByRole('listitem', { name: 'Howler' });
  const view = page.locator('canvas').first();
  const box = (await view.boundingBox())!;
  await card.dragTo(view, { targetPosition: { x: box.width / 2, y: box.height / 2 } });
  await expect.poll(async () => (await npcs(page)).length).toBe(2);

  // a pot from Buildings and props: click it, then the ground
  await pack.getByRole('option', { name: /Clay pot/ }).click();
  const assets = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return (
        (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string }[] })?.items ?? []
      ).filter((i) => i.kind === 'asset').length;
    });
  const before = await assets();
  // (the open ground in front: a few spots, in case one is taken)
  for (const [fx, fy] of [
    [0.55, 0.78],
    [0.62, 0.72],
    [0.5, 0.85],
    [0.7, 0.8],
  ]) {
    await page.mouse.move(box.x + box.width * fx!, box.y + box.height * fy!);
    await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width * fx!, box.y + box.height * fy!);
    await page.waitForTimeout(300);
    if ((await assets()) > before) break;
  }
  await expect.poll(assets).toBeGreaterThan(before);
  await page.keyboard.press('Escape');

  // the hero
  await pack.getByRole('button', { name: 'Play as Rook' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (e.store.get(`characters/${e.store.manifest.hero}.json`) as { name: string } | undefined)?.name;
      }),
    )
    .toBe('Rook');

  // a terrain style
  await pack.getByRole('button', { name: 'Make this map Shrine Highlands' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (e.store.get(`maps/${e.mapId.value}/map.json`) as { generator?: { environments: string[] } }).generator
          ?.environments;
      }),
    )
    .toEqual(['mountains', 'castle_outside']);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/pack-terrain.png' });
  expect(errors).toEqual([]);
});

test('Starter pack course: Do it for me plays as Rook, places the elder, the knight and a pot, and hits the knight from behind', async ({
  page,
}) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Starter pack course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (/Hit him/.test(title)) await page.screenshot({ path: 'test-results/pack-course-fight.png' });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Look and sound (4b): the Adventure screen look in the game, a pack effect placed, a sound and music to hear', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack' }).click();
  const pack = page.locator('[data-tour="dock-pack"]');
  const look = pack.getByRole('radiogroup', { name: 'Screen look' });
  await look.scrollIntoViewIfNeeded();
  await look.getByRole('radio', { name: 'Adventure' }).click();
  await expect(look.getByRole('radio', { name: 'Adventure' })).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __editor: { store: { manifest: { uiLook?: string } } } }).__editor.store.manifest
          .uiLook,
    ),
  ).toBe('adventure');

  // an effect from the pack, placed in front of the start
  await pack.getByRole('button', { name: 'Place Fairy sparkle' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (
          (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string; effect?: string }[] })
            ?.items ?? []
        ).filter((i) => i.kind === 'effect' && i.effect === 'fx_fairy00001').length;
      }),
    )
    .toBe(1);

  // the pack's sounds and music are in every game: listen
  await pack.getByRole('button', { name: 'Listen to Item get' }).click();
  await pack.getByRole('button', { name: 'Listen to Dungeon music' }).click();
  await expect(pack.getByRole('button', { name: 'Stop Dungeon music' })).toBeVisible();
  await pack.getByRole('button', { name: 'Stop Dungeon music' }).click();
  await page.screenshot({ path: 'test-results/pack-look-sound.png' });

  // in Play, the screens have the Adventure look
  await page.keyboard.press('F5');
  const hud = page.getByRole('region', { name: 'HUD' });
  await expect(hud).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.bw-screen.bw-look-adventure').first()).toBeAttached();
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('Escape');
  const pause = page.getByRole('region', { name: 'Pause' });
  await expect(pause).toBeVisible({ timeout: 60_000 });
  await expect(pause).toHaveClass(/bw-look-adventure/);
  const font = await pause
    .getByRole('button', { name: 'Resume' })
    .evaluate((b) => getComputedStyle(b).fontFamily.toLowerCase());
  expect(font).toMatch(/palatino|georgia|serif/);
  await page.screenshot({ path: 'test-results/pack-look-pause.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
