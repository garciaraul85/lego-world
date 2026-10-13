import { expect, test } from '@playwright/test';
import { openEditor } from './help/states';

/** P32: F1 on any control opens its own Help page with a picture; guides, search, Show me and courses work. */
const SHOTS = process.env.SHOTS_DIR;

test('F1 on a control opens its page with a picture; Show me points at it; guides and search find things', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page);

  // F1 while pointing at the Place tool
  await page
    .locator('[aria-label="Tools"]')
    .getByRole('button', { name: /^Place/ })
    .hover();
  await page.keyboard.press('F1');
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help.getByRole('heading', { name: 'Place tool', level: 1 })).toBeVisible();
  const img = help.locator('.help-shot img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(help.locator('.help-callout')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/help-entry.png` });

  // Show me closes Help and makes the real control pulse
  await help.getByRole('link', { name: /Show me where it is/ }).click();
  await expect(help).toBeHidden();
  await expect(page.locator('.help-flash')).toBeVisible();

  // ⌘/ and Ctrl / do the same as F1 (a Mac's F1 is the brightness key)
  for (const keys of ['Meta+Slash', 'Control+Slash']) {
    await page
      .locator('[aria-label="Tools"]')
      .getByRole('button', { name: /^Erase/ })
      .hover();
    await page.keyboard.press(keys);
    await expect(help.getByRole('heading', { name: 'Erase tool', level: 1 })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
  }
  // every hover tip has a ? that opens the control's page, no keys needed
  await page
    .locator('[aria-label="Tools"]')
    .getByRole('button', { name: /^Rotate/ })
    .hover();
  await page.locator('.hovertip .tip-help').click();
  await expect(help.getByRole('heading', { name: 'Rotate tool', level: 1 })).toBeVisible();
  await page.keyboard.press('Escape');

  // a screen guide: the whole screen, its areas numbered, the top five tasks
  await page.keyboard.press('F1');
  await page.getByRole('navigation', { name: 'Help pages' }).getByRole('button', { name: 'Logic guide' }).click();
  await expect(help.getByRole('heading', { name: 'Logic: screen guide' })).toBeVisible();
  await expect(help.locator('.help-callout')).toHaveCount(4);
  await expect(help.getByRole('heading', { name: 'The 5 things people do here most' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/help-guide.png` });

  // search finds a control's own page
  await help.getByRole('searchbox', { name: 'Search help' }).fill('place next to');
  await expect(help.getByRole('region', { name: 'Search results' }).getByRole('button').first()).toContainText(
    'Place next to',
  );
  await help.getByRole('region', { name: 'Search results' }).getByRole('button').first().click();
  await expect(help.getByRole('heading', { name: 'Place next to', level: 1 })).toBeVisible();

  // the index of every control
  await page.getByRole('navigation', { name: 'Help pages' }).getByRole('button', { name: 'Every control' }).click();
  await expect(help.getByRole('heading', { name: 'Every control', level: 1 })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  expect(errors).toEqual([]);
});

test('a screen guide starts that screen’s course', async ({ page }) => {
  test.setTimeout(240_000);
  await openEditor(page);
  await page.keyboard.press('F1');
  const help = page.getByRole('dialog', { name: 'Help' });
  await page.getByRole('navigation', { name: 'Help pages' }).getByRole('button', { name: 'Screens guide' }).click();
  await help.getByRole('link', { name: /Take the Screens course/ }).click();
  // the course runs in a practice project, starting with a tour of the screen's areas
  await expect(page.getByText('Screens course').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Screen list').first()).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/help-course.png` });
});
