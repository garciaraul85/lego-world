import { expect, type Page, test } from '@playwright/test';

/**
 * Step 12c: ice, moving platforms and climbing — the Starter pack's pieces, the Asset studio's Ice, moving and
 * climbing section, Project › Climbing, and the course run with Do it for me (an ice block pushed across an icy
 * floor, an ice wall melted with a torch, a moving platform ridden, a rock face climbed with stamina).
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

test('Ice, platforms and climbing: the pack pieces, the Asset studio section and Project › Climbing', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack ice, platforms and climbing' });
  for (const n of [
    'Icy floor',
    'Ice block',
    'Ice wall',
    'Moving platform',
    'Lift',
    'Switch lift',
    'Rock face',
    'Smooth wall',
  ])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) })).toBeVisible();
  // the Asset studio: the Barrel made a moving platform that goes 6 studs across, then only when on
  await page
    .getByRole('listbox', { name: 'Pack buildings and props' })
    .getByRole('option', { name: /^Barrel/ })
    .dblclick();
  const sec = page.locator('[data-help="asset.iceMove"]');
  await sec.scrollIntoViewIfNeeded();
  await sec.locator('[data-tour="asset-moves"] input').check();
  const barrel = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Barrel');
      return p ? (e.store.get(p) as { moves?: unknown; states: string[] }) : null;
    });
  await expect.poll(async () => (await barrel())?.moves).toEqual({ by: [0, 0, 8], seconds: 3, pause: 1 });
  await sec.getByRole('spinbutton', { name: 'Moves Across' }).fill('6');
  await sec.getByRole('spinbutton', { name: 'Moves Across' }).blur();
  await expect.poll(async () => ((await barrel())?.moves as { by: number[] })?.by).toEqual([6, 0, 8]);
  await sec.getByRole('checkbox', { name: 'Only when on' }).check();
  await expect.poll(async () => (await barrel())?.states).toEqual(['off', 'on']);
  // ice that melts with light
  await sec.locator('[data-tour="asset-ice"] input').check();
  await sec.getByRole('combobox', { name: 'Melts with' }).selectOption('fire-or-light');
  await expect.poll(async () => ((await barrel()) as { ice?: { melts?: string } })?.ice?.melts).toBe('fire-or-light');
  expect(errors).toEqual([]);
});

test('Ice, platforms and climbing course: Do it for me slides, melts, rides and climbs', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Ice, platforms and climbing course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(11);
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
      await page.screenshot({ path: `test-results/ice-${String(i).padStart(2, '0')}.png` });
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
