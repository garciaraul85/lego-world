import { expect, type Page, test } from '@playwright/test';

/** P18: the genre picker changes what the editor shows; Show everything shows it all; nothing is lost. */
type Ed = {
  scene: { value: { count: number } | null };
  store: { manifest: { genre: string }; list(p: string): string[] };
  bus: { history(): { label: string }[] };
  exec(c: unknown): { ok: boolean; error?: string };
  workspace: { value: string };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

async function open(page: Page) {
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 60_000,
    },
  );
}

test('the genre picker: Explore and collect shows its tools, Show everything shows them all, one undo step', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const tabs = page.getByRole('navigation', { name: 'Workspaces' });
  const genre = page.getByLabel('Genre', { exact: true });
  // a new project is Open: every tab, the v68 buttons
  await expect(genre).toHaveValue('open');
  await expect(tabs.getByRole('button', { name: 'World graph' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play in v68' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show everything' })).toHaveCount(0);

  // Explore and collect: World graph moves under More, the v68 buttons and the Profiler tab go
  await genre.selectOption('explore');
  expect(await get(page, (e) => e.store.manifest.genre)).toBe('explore');
  expect(await get(page, (e) => e.bus.history().at(-1)?.label)).toBe('Genre: Explore and collect');
  await expect(tabs.getByRole('button', { name: 'World graph' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play in v68' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Bottom dock' }).getByRole('button', { name: 'Profiler' })).toHaveCount(
    0,
  );
  await page.screenshot({ path: 'test-results/genre-explore.png' });
  // More opens the other screens; the open one shows as a tab while you are on it
  await tabs.getByRole('button', { name: 'More ▾' }).click();
  await page.getByRole('menuitem', { name: 'World graph' }).click();
  await expect(tabs.getByRole('button', { name: 'World graph' })).toBeVisible();
  expect(await get(page, (e) => e.workspace.value)).toBe('World graph');

  // the logic node list: the genre's nodes first, the rest under More nodes, search finds every node
  await tabs.getByRole('button', { name: 'Logic' }).click();
  const pal = page.getByRole('region', { name: 'Logic graphs, variables and nodes' });
  await expect(pal.getByText('For Explore and collect')).toBeVisible();
  await expect(pal.locator('[data-tour="logic-more-nodes"]')).toContainText('More nodes');
  await expect(pal.locator('.lg-pal[data-node="misc.log"]')).toBeHidden();
  await pal.getByLabel('Find a node').fill('log');
  await expect(pal.locator('.lg-pal[data-node="misc.log"]')).toBeVisible();
  await pal.getByLabel('Find a node').fill('');
  await page.screenshot({ path: 'test-results/genre-logic.png' });

  // a game using a hidden node says so, and Show everything brings every control back (the game unchanged)
  await pal.locator('[data-tour="logic-new"]').click();
  await pal.getByLabel('Find a node').fill('log');
  await pal.locator('.lg-pal[data-node="misc.log"]').first().click();
  await pal.getByLabel('Find a node').fill('');
  const badge = page.locator('[data-tour="genre-hidden"]');
  await expect(badge).toContainText('1 item uses hidden features');
  await badge.click();
  await expect(page.getByRole('dialog', { name: 'Hidden features in use' })).toContainText('misc.log');
  await page
    .getByRole('dialog', { name: 'Hidden features in use' })
    .getByRole('button', { name: 'Show everything' })
    .click();
  await expect(page.getByRole('button', { name: 'Play in v68' })).toBeVisible();
  await expect(page.locator('[data-tour="genre-back"]')).toContainText('back to Explore and collect');
  expect(await get(page, (e) => e.store.manifest.genre)).toBe('explore');
  await page.locator('[data-tour="genre-back"]').click();
  await expect(page.getByRole('button', { name: 'Play in v68' })).toHaveCount(0);

  // pins and hides are personal: right-click a tool, hide it; Put back brings it back
  await tabs.getByRole('button', { name: 'Scene' }).click();
  const tools = page.getByRole('group', { name: 'Tools' });
  await tools.getByRole('button', { name: 'Erase (X)' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Hide from Explore and collect/ }).click();
  await expect(tools.getByRole('button', { name: 'Erase (X)' })).toHaveCount(0);
  await tools.getByRole('button', { name: 'Select (V)' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Undo all my pins and hides/ }).click();
  await expect(tools.getByRole('button', { name: 'Erase (X)' })).toBeVisible();

  // Undo puts the genre back to Open
  await page.keyboard.press('Escape');
  for (let i = 0; i < 3 && (await get(page, (e) => e.store.manifest.genre)) !== 'open'; i++)
    await page.keyboard.press('Control+z');
  expect(await get(page, (e) => e.store.manifest.genre)).toBe('open');
  expect(errors).toEqual([]);
});

test('the start hub asks “What are you making?” and Explore and collect starts a treasure hunt in that view', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/editor.html?hub');
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  const card = hub.getByRole('region', { name: 'What are you making?' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'test-results/genre-hub.png' });
  await card.locator('[data-genre="explore"]').click();
  await page.waitForFunction(
    () => (window as unknown as { __editor?: Ed }).__editor?.store.manifest.genre === 'explore',
    undefined,
    { timeout: 120_000 },
  );
  await expect(page.getByLabel('Genre', { exact: true })).toHaveValue('explore', { timeout: 60_000 });
});
