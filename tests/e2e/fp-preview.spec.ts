import { expect, type Page, test } from '@playwright/test';

/**
 * From a picture: a big preview of a match before it is used — a character turning (and trying a move), an asset
 * in each of its states, a whole map built exactly as Make this map makes it. Escape goes back to the matches.
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: { list(p: string): string[] };
  maps: { value: { id: string }[] };
  mapDoc: { value: { name: string } | null };
};
async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${e.message} ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const count = (page: Page, dir: string) =>
  page.evaluate((d) => (window as unknown as { __editor: Ed }).__editor.store.list(d).length, dir);

test('From a picture: preview a character, an asset and a map big before using them', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await dlg.getByLabel('Describe it').fill('a viking with a braided beard');
  await dlg.locator('[data-tour="fp-create"]').click();
  await expect(dlg.locator('[data-tour="fp-match-0"]')).toBeVisible({ timeout: 30_000 });
  const chars = await count(page, 'characters/');
  // a character: big, turning, trying a move; nothing is made yet
  await dlg.locator('[data-tour="fp-preview-0"]').click();
  const pv = dlg.locator('[data-tour="fp-preview"]');
  await expect(pv).toBeVisible();
  await expect(pv.getByLabel('Character preview')).toBeVisible();
  await pv.locator('[data-tour="fp-preview-try-wave"]').click();
  const canvas = pv.getByLabel('Character preview');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.screenshot({ path: 'test-results/fp-preview-character.png' });
  expect(await count(page, 'characters/')).toBe(chars);
  // Escape goes back to the matches (the dialog stays)
  await page.keyboard.press('Escape');
  await expect(pv).toHaveCount(0);
  await expect(dlg).toBeVisible();
  // Use from the preview makes it
  await dlg.locator('[data-tour="fp-preview-0"]').click();
  await pv.locator('[data-tour="fp-preview-use"]').click();
  await expect.poll(() => count(page, 'characters/')).toBe(chars + 1);

  // an asset in each of its states
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  await page.locator('[data-tour="asset-from-picture"]').click();
  const adlg = page.getByRole('dialog', { name: 'Asset from a picture' });
  await adlg.getByLabel('Describe it').fill('a small stone castle with a gate and towers');
  await adlg.locator('[data-tour="fp-create"]').click();
  await expect(adlg.locator('[data-tour="fp-match-0"]')).toBeVisible({ timeout: 30_000 });
  await adlg.locator('[data-tour="fp-preview-0"]').click();
  const apv = adlg.locator('[data-tour="fp-preview"]');
  await expect(apv.getByLabel('3D map view')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/fp-preview-asset.png' });
  await apv.locator('[data-tour="fp-preview-back"]').click();
  await expect(apv).toHaveCount(0);
  await page.keyboard.press('Escape');

  // a whole map, built for the look, then made from the preview as it was shown
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Record<string, { value: unknown }> }).__editor;
    e.makeKind!.value = 'map';
    e.fromPicture!.value = true;
  });
  const mdlg = page.getByRole('dialog', { name: 'Map from a picture' });
  await mdlg.getByLabel('Describe it').fill('a small desert village with a well and two houses');
  await mdlg.locator('[data-tour="fp-create"]').click();
  await expect(mdlg.locator('[data-tour="fp-match-0"]')).toBeVisible({ timeout: 30_000 });
  const maps = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.maps.value.length);
  await mdlg.locator('[data-tour="fp-preview-0"]').click();
  const mpv = mdlg.locator('[data-tour="fp-preview"]');
  await expect(mpv.getByLabel('3D map view')).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/fp-preview-map.png' });
  // looking made nothing
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.maps.value.length)).toBe(maps);
  await mpv.locator('[data-tour="fp-preview-use"]').click();
  await expect(mdlg).toBeHidden({ timeout: 120_000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.maps.value.length))
    .toBe(maps + 1);
  expect(errors).toEqual([]);
});
