import { expect, test } from '@playwright/test';

test('Help guide: F1 opens it, search finds “music zone”, links open workspaces; the hub opens the recipe', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => !!(window as unknown as { __editor?: { scene: { value: unknown } } }).__editor?.scene.value,
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page.locator('body').click({ position: { x: 5, y: 790 } });
  await page.keyboard.press('F1');
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await help.getByLabel('Search help').fill('music zone');
  const results = help.getByRole('region', { name: 'Search results' });
  await expect(results.getByRole('button').first()).toContainText('Music zones');
  await results.getByRole('button').first().click();
  await expect(help.getByRole('heading', { name: 'Music zones' })).toBeInViewport();

  // generated references
  await help.getByRole('navigation', { name: 'Help pages' }).getByRole('button', { name: 'Logic reference' }).click();
  await expect(help.getByRole('heading', { name: 'On enter zone' })).toBeVisible();
  await help
    .getByRole('navigation', { name: 'Help pages' })
    .getByRole('button', { name: 'Keyboard and touch' })
    .click();
  await expect(help.getByRole('cell', { name: 'Ctrl K' })).toBeVisible();

  // a deep link opens the workspace and closes Help
  await help
    .getByRole('navigation', { name: 'Help pages' })
    .getByRole('button', { name: 'Logic', exact: true })
    .click();
  await help.getByRole('link', { name: /Open Logic/ }).click();
  await expect(help).toHaveCount(0);
  await expect(page.locator('[data-tour="ws-logic"]')).toHaveAttribute('aria-current', 'page');

  // Start hub › Help guide opens the 12-step recipe
  await page.goto('/editor.html?hub');
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByRole('button', { name: /Help guide/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Help' }).getByRole('heading', { name: 'Build a game from scratch' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Help' }).getByRole('heading', { level: 2 })).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Help' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
