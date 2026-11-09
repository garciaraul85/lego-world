import { expect, type Page, test } from '@playwright/test';

/**
 * Step 12b: fire and light — the Starter pack's Fire and light pieces, the Asset studio's Fire and light section,
 * and the Fire and light course run with Do it for me (vines burned with the Torch, a torch stand lit, a cracked
 * wall blown up with a bomb, a mirror turned to bring a beam onto a light sensor).
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown; list(p: string): string[] };
};
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

test('Fire and light pieces in the pack and the Fire and light section of the Asset studio', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack fire and light' });
  await expect(
    page.getByRole('listbox', { name: 'Pack puzzle pieces' }).getByRole('option', { name: /^Ladder/ }),
  ).toBeVisible();
  for (const n of [
    'Vines',
    'Torch stand',
    'Bomb bag',
    'Bomb flower',
    'Hand torch',
    'Sun crest',
    'Mirror',
    'Light sensor',
  ])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) })).toBeVisible();
  // the Asset studio: open the Barrel, make it burn for 4 s
  await page
    .getByRole('listbox', { name: 'Pack buildings and props' })
    .getByRole('option', { name: /^Barrel/ })
    .dblclick();
  const sec = page.locator('[data-help="asset.fireLight"]');
  await sec.scrollIntoViewIfNeeded();
  await sec.locator('[data-tour="asset-burn"] input').check();
  const barrel = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Barrel');
      return p ? (e.store.get(p) as { burn?: unknown }).burn : null;
    });
  await expect.poll(barrel).toEqual({ seconds: 2 });
  await sec.getByRole('slider', { name: 'Burns for (seconds)' }).fill('4');
  await expect.poll(barrel).toEqual({ seconds: 4 });
  // a mirror: two states are added
  await sec.locator('[data-tour="asset-mirror"] input').check();
  await expect(sec.getByText(/Leans one way in “left”/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Fire and light course: Do it for me burns, lights, throws a bomb from the flower at the wall and turns the mirror', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Fire and light course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
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
      await page.screenshot({ path: `test-results/firelight-${String(i).padStart(2, '0')}.png` });
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
