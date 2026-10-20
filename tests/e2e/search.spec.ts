import { expect, type Page, test } from '@playwright/test';

/** Every list with pictures or previews can be searched: libraries, the Dock, pop-ups of pictures and dropdowns. */
type Ed = {
  scene: { value: { count: number } | null };
  store: { manifest: { screenEffects?: { events?: Record<string, string> } } };
  studioClip: { value: string | null };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();

test('lists are searched: clips, picture pop-ups, effects, the Dock, a dropdown, maps and piece sizes', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);

  // Character studio: one box for its characters, conversations and clips
  await ws(page, 'Characters');
  const lib = page.getByRole('listbox', { name: 'Characters' });
  await page.getByLabel('Search characters, conversations and clips').fill('squat');
  await expect(lib.getByRole('option', { name: /Squats/ })).toBeVisible();
  await expect(lib.getByRole('option', { name: /Push-ups/ })).toHaveCount(0);
  await page.getByLabel('Search characters, conversations and clips').fill('zzzz');
  await expect(lib.getByText('No characters or clips match “zzzz”.')).toBeVisible();
  await page.getByLabel('Search characters, conversations and clips').fill('');

  // a pop-up of pictures (a state's clip): typing filters, Enter picks the first match
  await page.locator('[data-tour="char-new"]').click();
  await page.getByLabel('Search presets').fill('chef');
  const presets = page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option');
  await expect(presets).toHaveCount(1);
  await presets.first().click();
  await page.getByRole('tablist', { name: 'Character sheet' }).getByRole('tab', { name: 'Animations' }).click();
  await page.locator('[data-tour="pick-anim-walk"]').click();
  const search = page.locator('[data-tour="pick-anim-walk-search"]');
  await expect(search).toBeFocused();
  await search.fill('run moves');
  await expect(page.locator('[data-tour="pick-anim-walk-list"] [role="option"]')).toHaveCount(1);
  await search.press('Enter');
  await expect(page.locator('[data-tour="pick-anim-walk"]')).toHaveAccessibleName(/: Run$/);

  // Effects library
  await ws(page, 'Effects');
  await page.locator('[data-tour="fx-search"]').fill('fire');
  const fx = page.getByRole('listbox', { name: 'Effects' }).getByRole('option');
  expect(await fx.count()).toBeGreaterThan(0);
  for (const name of await fx.allInnerTexts()) expect(name.toLowerCase()).toContain('fire');

  // a dropdown with a picture: 🔍 leaves only the matching choices; Enter picks the first
  await page.getByRole('tab', { name: 'Screen', exact: true }).click();
  // the hook for “hurt”: its dropdown's 🔍
  const hurt = page
    .getByLabel(/^Screen: /)
    .first()
    .locator('xpath=..');
  await hurt.getByRole('button', { name: 'Search screen effects' }).click();
  await hurt.getByRole('searchbox', { name: 'Search screen effects' }).fill('gold');
  await hurt.getByRole('searchbox', { name: 'Search screen effects' }).press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __editor: Ed }).__editor.store.manifest.screenEffects?.events &&
          Object.values((window as unknown as { __editor: Ed }).__editor.store.manifest.screenEffects!.events!),
      ),
    )
    .toContain('sce_goldflash0');

  // the Dock: every category has a search
  await ws(page, 'Scene');
  await page
    .locator('.assets .cats')
    .getByRole('button', { name: /^Effects/ })
    .click();
  await page.locator('[data-tour="dock-search"]').fill('smoke');
  const cards = page.locator('[data-tour="dock-effects"] .fx-card');
  expect(await cards.count()).toBeGreaterThan(0);
  for (const n of await cards.evaluateAll((l) => l.map((x) => x.getAttribute('data-name') ?? '')))
    expect(n.toLowerCase()).toContain('smoke');

  // World graph: other maps fade, Enter selects the first match
  await ws(page, 'World graph');
  await page.locator('[data-tour="graph-search"]').fill('Map 1');
  await page.locator('[data-tour="graph-search"]').press('Enter');
  await expect(page.getByRole('group', { name: 'Selected map' })).toBeVisible();

  // Assets: piece sizes by typing a size
  await ws(page, 'Assets');
  await page.getByRole('button', { name: '+ New asset' }).click();
  await page.getByRole('tab', { name: 'Bricks' }).click();
  await page.locator('[data-tour="brick-size-search"]').fill('2x4');
  const sizes = page.getByRole('listbox', { name: 'Piece sizes' }).getByRole('option');
  await expect(sizes).toHaveCount(1);
  expect(errors).toEqual([]);
});
