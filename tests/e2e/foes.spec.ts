import { expect, type Page, test } from '@playwright/test';

/**
 * Step 14a: the starter enemies' brains — the Enemies course run with Do it for me (a Pebblespout's rock bounced
 * back off the shield, a Watcher Eye's beam blocked, a Lanternwisp struck through the Lens of Truth, a pack of
 * Howlers howling).
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

test('Enemies course: Do it for me bounces a rock, blocks a beam, strikes a ghost through the Lens, meets a pack', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Enemies course/ }).click();
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
      await page.screenshot({ path: `test-results/foes-${String(i).padStart(2, '0')}.png` });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  // the play's log: what each brain did
  const log = await page.evaluate(() => {
    const e = (window as unknown as { __editor: { session: { value: { events: { msg: string }[] } | null } } })
      .__editor;
    return (e.session.value?.events ?? []).map((x) => x.msg);
  });
  expect(log.some((m) => m.includes('howls'))).toBe(true);
  expect(errors).toEqual([]);
});
