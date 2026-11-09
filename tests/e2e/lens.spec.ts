import { expect, type Page, test } from '@playwright/test';

/**
 * Step 13c: the hover boots and the Lens of Truth — the Starter pack's Boots and Lens pieces, the Asset studio's
 * Hidden and Fake boxes, Project › Magic, and the course run with Do it for me (floated over a gap, the Lens held up,
 * through a fake wall to a hidden chest, over an invisible bridge, a magic jar).
 */
type Ed = { scene: { value: { count: number } | null } };
const open = async (page: Page, errors: string[]) => {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};

test('Boots and Lens: the pack pieces, the Asset studio boxes and Project › Magic', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack boots and lens' });
  for (const n of [
    'Hover boots',
    'Lens of Truth',
    'Magic jar',
    'Big magic jar',
    'Pit gap',
    'Invisible bridge',
    'Fake wall',
    'Fake floor',
    'Stone alcove',
    'Hidden chest',
  ])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) }).first()).toBeVisible();
  // Project › Magic: a bigger meter
  await page.locator('[data-tour="tab-project"]').click();
  const full = page.getByRole('spinbutton', { name: 'Full magic meter' });
  await full.scrollIntoViewIfNeeded();
  await full.fill('96');
  await full.press('Enter');
  const settings = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: { store: { get(p: string): unknown } } }).__editor;
      return (e.store.get('settings.json') as { magic?: { can: boolean; max: number } } | undefined)?.magic ?? null;
    });
  await expect.poll(settings).toEqual({ can: true, max: 96 });
  // the Asset studio: the Stone alcove made fake
  await pieces.getByRole('option', { name: /^Stone alcove/ }).dblclick();
  const box = page.locator('[data-tour="asset-fake"] input');
  await box.scrollIntoViewIfNeeded();
  await box.check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: { store: { list(p: string): string[]; get(p: string): unknown } } })
          .__editor;
        const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Stone alcove');
        return p ? !!(e.store.get(p) as { fake?: boolean }).fake : false;
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('Hover boots and Lens course: Do it for me floats a gap, sees through a fake wall and crosses a hidden bridge', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hover boots and Lens course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(10);
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
      await page.screenshot({ path: `test-results/lens-${String(i).padStart(2, '0')}.png` });
      // looking through the Lens: the view is tinted
      if (/Look through the Lens/.test(title)) await expect(page.locator('.bw-lens')).toBeVisible();
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
