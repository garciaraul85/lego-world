import { expect, test } from '@playwright/test';

const running = (page: import('@playwright/test').Page) =>
  page.waitForFunction(
    () =>
      ((window as unknown as { __editor: { session: { value: { runtime: { ticks: number } } | null } } }).__editor
        .session.value?.runtime.ticks ?? 0) > 0,
    undefined,
    { timeout: 90_000 },
  );

/** P32: every shortcut has a key a Mac keyboard has (its F-keys are media keys), and a Mac shows those. */
test('⌘ Return plays and stops, ⌘ Shift Return plays from the selected spawn; the Mac wording shows ⌘', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub&mac');
  await page.waitForFunction(
    () =>
      ((window as unknown as { __editor?: { scene: { value: { count: number } | null } } }).__editor?.scene.value
        ?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /Play from the selected spawn/ })).toContainText('⌘ Shift ↩ Return');
  await page.keyboard.press('Escape');

  await page.locator('body').click({ position: { x: 5, y: 790 } });
  await page.keyboard.press('Meta+Enter');
  await expect(page.getByLabel('Game view')).toBeVisible({ timeout: 60_000 });
  await running(page);
  await page.keyboard.press('Meta+Enter');
  await expect(page.getByLabel('Game view')).toHaveCount(0, { timeout: 30_000 });

  // Shift Return with a spawn selected plays from it
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          store: { get(p: string): unknown };
          mapId: { value: string };
          selectedSpawn: { value: string | null };
        };
      }
    ).__editor;
    const doc = e.store.get(`maps/${e.mapId.value}/map.json`) as { spawns: { id: string }[] };
    e.selectedSpawn.value = doc.spawns[0]!.id;
  });
  await page.locator('body').click({ position: { x: 5, y: 790 } });
  await page.keyboard.press('Control+Shift+Enter');
  await expect(page.getByLabel('Game view')).toBeVisible({ timeout: 60_000 });
  await running(page);
  await page.keyboard.press('Control+Enter');
  await expect(page.getByLabel('Game view')).toHaveCount(0, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
