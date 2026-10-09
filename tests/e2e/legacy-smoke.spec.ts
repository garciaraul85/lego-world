import { expect, test } from '@playwright/test';

test('LEGO World v68 page boots in a real browser without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/index.html');
  await expect(page.locator('#bb-canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});
