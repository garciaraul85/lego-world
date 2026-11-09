import { expect, type Page, test } from '@playwright/test';

/**
 * Step 12a: puzzles — the Starter pack's Puzzle pieces, the Asset studio's Puzzle section, the Map tab's Dungeon
 * box, and the Puzzles course run with Do it for me (a block pushed onto a weight switch opens a gate, pulled
 * back off, a timed crystal hit, a locked door opened with a key from a chest).
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown; list(p: string): string[] };
  mapId: { value: string };
  exec(c: unknown): { ok: boolean };
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

test('Puzzle pieces in the pack, the Puzzle section of the Asset studio and the Dungeon box', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack puzzle pieces' });
  for (const n of ['Push block', 'Weight switch', 'Crystal switch', 'Lever', 'Boss door', 'Small key', 'Compass'])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) })).toBeVisible();
  // not among the buildings any more
  await expect(
    page.getByRole('listbox', { name: 'Pack buildings and props' }).getByRole('option', { name: /^Push block/ }),
  ).toHaveCount(0);

  // the Asset studio: open the Lever, make it a hit switch that only arrows flip, on a timer
  await pieces.getByRole('option', { name: /^Lever/ }).dblclick();
  const sec = page.locator('[data-help="asset.puzzle"]');
  await sec.scrollIntoViewIfNeeded();
  await expect(sec.getByText(/Switch: pressed, flips each time/)).toBeVisible();
  await sec.getByRole('group', { name: 'Switch is used when' }).getByRole('button', { name: 'Hit' }).click();
  await sec.getByRole('checkbox', { name: 'Hit by Pierce' }).check();
  await sec.getByRole('group', { name: 'Switch stays' }).getByRole('button', { name: 'Timed' }).click();
  const lever = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Lever');
      return p ? (e.store.get(p) as { switch?: unknown }).switch : null;
    });
  await expect.poll(lever).toEqual({ by: 'hit', stays: 'timed', hitBy: ['pierce'], seconds: 10 });
  // a lock on it: one tick
  await sec.locator('[data-tour="asset-lock"] input').check();
  await expect(sec.getByRole('combobox', { name: 'Opens with' })).toHaveValue('small');

  // the Map tab: a dungeon
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.evaluate(() => {
    (window as unknown as { __editor: { right: { value: string } } }).__editor.right.value = 'map';
  });
  const box = page.getByRole('checkbox', { name: 'This map is a dungeon' });
  await box.scrollIntoViewIfNeeded();
  await box.check();
  const dungeon = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return !!(e.store.get(`maps/${e.mapId.value}/map.json`) as { dungeon?: boolean }).dungeon;
    });
  await expect.poll(dungeon).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(dungeon).toBe(false);
  expect(errors).toEqual([]);
});

test('Puzzles course: Do it for me pushes, pulls, hits and unlocks', async ({ page }) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Puzzles course/ }).click();
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
      if (/Push it on|Open the chest/.test(title))
        await page.screenshot({ path: `test-results/puzzles-${title.split(' ')[0]!.toLowerCase()}.png` });
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
