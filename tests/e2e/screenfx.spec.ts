import { expect, type Page, test } from '@playwright/test';

/**
 * P23 part 2: screen effects — Effects › Screen (a copy of Big hit made into thunder, hooked to the hero being
 * hurt), a map's mood over the Scene view and in Play, a flash and a hit-stop in Play, and the course.
 */
type Fx = { id: string; name: string; flash?: { color: string }; shake?: { rumble: boolean } };
type Ed = {
  scene: { value: { count: number } | null };
  store: {
    manifest: { screenEffects?: { events?: Record<string, string> }; entry: { map: string } };
    get(p: string): unknown;
    list(p: string): string[];
  };
  mapDoc: { value: { mood?: { grade: string; drift: string } } | null };
  session: {
    value: {
      hurt(n: number): void;
      playScreenEffect(id: string): boolean;
      screenFx: { layers(): { color: string }[] };
      runtime: { slow: number };
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
const get = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();
const own = (page: Page) => get(page, (e) => e.store.list('screenfx/').map((p) => e.store.get(p) as Fx));

test('Effects › Screen: a copy of Big hit becomes Thunder and plays when the hero is hurt; the map gets a stormy mood', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Effects');
  await page.getByRole('tab', { name: 'Screen', exact: true }).click();
  const lib = page.getByRole('listbox', { name: 'Screen effects' });
  await expect(lib.getByRole('option')).toHaveCount(16);
  // a picture plays its effect while the pointer is on it
  const row = lib.locator('[data-name="Big hit"]');
  await row.locator('.sce-thumb').hover();
  await expect(row.locator('.sce-thumb')).toHaveAttribute('data-moving', 'true');
  await row.click();
  // the preview plays over and over
  await expect(page.locator('[data-tour="sfx-preview"] .sce-thumb')).toHaveAttribute('data-moving', 'true');
  await page.locator('[data-tour="sfx-copy"]').click();
  await expect.poll(() => own(page).then((l) => l.map((x) => x.name))).toEqual(['Big hit copy']);
  await page.getByLabel('Screen effect name').fill('Thunder');
  await page.getByLabel('Screen effect name').press('Enter');
  await page.getByLabel('Flash colour').fill('#bfd8ff');
  await page.getByLabel('Slow rumble').check();
  await expect
    .poll(() => own(page).then((l) => [l[0]?.name, l[0]?.flash?.color, l[0]?.shake?.rumble]))
    .toEqual(['Thunder', '#bfd8ff', true]);
  await page.locator('[data-tour="sfx-event-hurt"]').selectOption({ label: 'Thunder' });
  const thunder = (await own(page))[0]!.id;
  await expect.poll(() => get(page, (e) => e.store.manifest.screenEffects?.events?.hurt)).toBe(thunder);

  // Scene › Map › Screen mood: night and rain, shown over the Scene view
  await ws(page, 'Scene');
  await page.evaluate(() => {
    (window as unknown as { __editor: { right: { value: string } } }).__editor.right.value = 'map';
  });
  await page.locator('[data-tour="mood-grade"]').selectOption('night');
  await page.locator('[data-tour="mood-drift"]').selectOption('rain');
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.mood)).toMatchObject({ grade: 'night', drift: 'rain' });
  await expect(page.locator('.viewport-wrap .bw-screenfx[data-grade="night"]')).toBeVisible();
  await expect(page.locator('.viewport-wrap canvas.bw-drift[data-drift="rain"]')).toBeAttached();

  // in Play: the mood is over the game, and hurting the hero flashes Thunder
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await expect(page.locator('.bw-screenfx[data-grade="night"]').last()).toBeVisible({ timeout: 20_000 });
  // the colour is laid on the game's picture only (the HUD is never coloured)
  await expect(page.getByLabel('Game view')).toHaveCSS('filter', /brightness\(0\.62\)/);
  // the flash is short: record what lies over the screen every frame, then hurt the hero
  await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __colors: string[] };
    w.__colors = [];
    const tick = () => {
      for (const l of w.__editor.session.value?.screenFx.layers() ?? []) w.__colors.push(l.color);
      if (w.__colors.length < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await get(page, (e) => e.session.value!.hurt(1));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __colors: string[] }).__colors), { timeout: 20_000 })
    .toContain('#bfd8ff');
  // a hit-stop holds the game for a moment, then lets go
  await get(page, (e) => e.session.value!.playScreenEffect('sce_hitstop000'));
  await expect.poll(() => get(page, (e) => e.session.value!.runtime.slow), { timeout: 10_000 }).toBe(1);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Screen effects course: Do it for me makes Thunder, hooks it to the hero being hurt, sets a stormy night', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Screen effects course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
