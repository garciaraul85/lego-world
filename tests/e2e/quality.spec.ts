import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 4: quality levels. Project › Graphics quality sets the game's level; Play draws it (lights, shadows,
 * particles); Quality beside ▶ Play previews another level live; players change it in the game's Settings.
 */
type Stats = { lights?: number; maxLights?: number; shadowed?: boolean };
type Ed = {
  scene: { value: { count: number } | null };
  right: { value: string };
  store: { get(p: string): unknown };
  stats: { value: Stats };
  previewQuality: { value: string | null };
  session: {
    value: {
      quality: string;
      qualityAuto: boolean;
      effects: { cap: number };
      runtime: { ticks: number };
      progress: { settings: { quality?: string } };
    } | null;
  };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

test('quality levels: the game’s setting, a live preview beside Play, and the player’s Graphics setting', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: 'Scene', exact: true })
    .click();
  // Project › Graphics quality: Low, and the line under it says what Low draws
  await page.locator('[data-tour="tab-project"]').click();
  const field = page.locator('[data-tour="project-quality"]');
  await field.scrollIntoViewIfNeeded();
  await expect(field.getByRole('combobox', { name: 'Graphics quality' })).toHaveValue('auto');
  await expect(field.locator('option[value="auto"]')).toHaveText(/Auto \(here: (Low|Medium|High)\)/);
  await field.getByRole('combobox', { name: 'Graphics quality' }).selectOption('low');
  await expect(page.locator('[data-tour="project-quality-note"]')).toHaveText(
    /2 lights, no shadows, 50% view distance, 600 particles/,
  );
  expect(await get(page, (e) => (e.store.get('settings.json') as { quality: string } | undefined)?.quality)).toBe(
    'low',
  );
  await page.screenshot({ path: 'test-results/quality-project.png' });

  // Play at the game's level: Low (2 lights at most, no shadows, 600 particles)
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => get(page, (e) => e.session.value?.runtime.ticks ?? 0), { timeout: 120_000 })
    .toBeGreaterThan(5);
  expect(await get(page, (e) => e.session.value!.quality)).toBe('low');
  expect(await get(page, (e) => e.session.value!.effects.cap)).toBe(600);
  await expect.poll(() => get(page, (e) => e.stats.value.maxLights), { timeout: 60_000 }).toBe(2);
  expect(await get(page, (e) => e.stats.value.shadowed)).toBe(false);
  await page.evaluate(() => {
    (window as unknown as { __editor: { dock: { value: string } } }).__editor.dock.value = 'debug';
  });
  await expect(page.locator('[data-tour="watch-quality"]')).toContainText('Low');

  // preview High while playing: it changes at once
  const pick = page.locator('[data-tour="play-quality"]');
  await pick.selectOption('high');
  await expect.poll(() => get(page, (e) => e.session.value!.quality)).toBe('high');
  await expect.poll(() => get(page, (e) => e.stats.value.maxLights), { timeout: 60_000 }).toBe(8);
  expect(await get(page, (e) => e.session.value!.effects.cap)).toBe(2000);
  await expect(page.locator('[data-tour="watch-quality"]')).toContainText('High (preview)');
  await page.screenshot({ path: 'test-results/quality-preview-high.png' });
  // back to the game's own setting
  await pick.selectOption('');
  await expect.poll(() => get(page, (e) => e.session.value!.quality)).toBe('low');

  // the player changes it in the game's Settings (Pause › Settings › Graphics)
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  const pause = page.getByRole('region', { name: 'Pause' });
  await pause.getByRole('button', { name: 'Settings' }).click();
  const set = page.getByRole('region', { name: 'Settings' });
  await set.getByRole('button', { name: 'Graphics: auto' }).click();
  await expect(set.getByRole('button', { name: 'Graphics: low' })).toBeVisible();
  await set.getByRole('button', { name: 'Graphics: low' }).click();
  await expect(set.getByRole('button', { name: 'Graphics: medium' })).toBeVisible();
  expect(await get(page, (e) => e.session.value!.quality)).toBe('medium');
  expect(await get(page, (e) => e.session.value!.progress.settings.quality)).toBe('medium');
  await page.screenshot({ path: 'test-results/quality-settings.png' });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});
