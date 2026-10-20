import { expect, type Page, test } from '@playwright/test';

/**
 * P23 previews: game things show what they are wherever they are listed or picked — effects that play while
 * the pointer is over them, screens drawn small, maps from above, ▶ for sounds and music, a conversation's
 * first lines, the speaker's face, the actor of a role.
 */
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown; list(p: string): string[] };
  mapId: { value: string };
  dialogueId: { value: string | null };
  charTab: { value: string };
  studioCharacter: { value: string | null };
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
const get = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();

test('lists show previews: effects play on hover, the Dock places effects, screens and maps are drawn small, ▶ listens', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);

  // Effects library: every row has a picture, and it plays while the pointer is on it
  await ws(page, 'Effects');
  const lib = page.getByRole('listbox', { name: 'Effects' });
  const fire = lib.getByRole('option', { name: /^Fire/ }).first();
  await expect(fire.locator('.fx-thumb canvas')).toBeVisible();
  await fire.locator('.fx-thumb').hover();
  await expect
    .poll(async () => Number(await fire.locator('.fx-thumb canvas').getAttribute('data-particles')), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  // Game effects: each choice shows the effect that plays
  await expect(page.locator('[data-tour="fx-hooks"] .fx-thumb').first()).toBeVisible();

  // the Dock has effects: Place puts one on the map
  await ws(page, 'Scene');
  await page.locator('.dockpanel').getByRole('button', { name: 'Assets', exact: true }).click();
  await page
    .locator('.cats')
    .getByRole('button', { name: /^Effects/ })
    .click();
  const cards = page.locator('[data-tour="dock-effects"]');
  await expect(cards.locator('.fx-card').first()).toBeVisible();
  const before = await get(
    page,
    (e) =>
      (
        (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string }[] } | undefined)?.items ?? []
      ).filter((i) => i.kind === 'effect').length,
  );
  await cards.getByRole('button', { name: 'Place Sparks' }).click();
  await expect
    .poll(() =>
      get(
        page,
        (e) =>
          (
            (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string }[] } | undefined)?.items ??
            []
          ).filter((i) => i.kind === 'effect').length,
      ),
    )
    .toBe(before + 1);
  // the placed effect's properties show its picture
  await expect(page.locator('[data-help="scene.item.effect"] .fx-thumb')).toBeVisible();
  // characters and screens in the Dock have pictures
  await page
    .locator('.cats')
    .getByRole('button', { name: /^UI screens/ })
    .click();
  await expect(page.locator('.media-card .scr-thumb .bw-screen').first()).toBeAttached();

  // Screens: the list draws each screen small (out of the way of readers)
  await ws(page, 'Screens');
  const thumb = page.locator('.studio-lib .scr-thumb').first();
  await expect(thumb).toBeVisible();
  await expect(thumb).toHaveAttribute('aria-hidden', 'true');

  // Audio: ▶ beside every sound; a music's ▶ turns into ■ and back
  await ws(page, 'Audio');
  await expect(page.getByRole('button', { name: /^Listen to / }).first()).toBeVisible();
  const music = page
    .locator('.lib-row')
    .filter({ hasText: '♪' })
    .first()
    .getByRole('button', { name: /^Listen to / });
  await music.click();
  const stop = page
    .locator('.lib-row')
    .filter({ hasText: '♪' })
    .first()
    .getByRole('button', { name: /^Stop / });
  await expect(stop).toBeVisible();
  await stop.click();

  // World graph: each map box has its picture from above
  await ws(page, 'World graph');
  await expect(page.locator('svg image').first()).toBeAttached({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('conversations preview their first lines and each line shows the speaker’s face', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  // a character with a conversation
  await ws(page, 'Characters');
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
  const chr = await get(page, (e) => e.studioCharacter.value);
  const conv = {
    id: 'dlg_previewtst',
    name: 'Preview talk',
    sections: [
      {
        label: 'start',
        steps: [
          { k: 'line', who: chr, text: 'Welcome to the village!' },
          { k: 'line', who: '', text: 'The wind blows.' },
        ],
      },
    ],
  };
  await page.evaluate(
    (c) =>
      (window as unknown as { __editor: Ed }).__editor.exec({ type: 'dialogue.put', payload: { conversation: c } }),
    conv,
  );
  // the list on the left shows the first lines
  await get(page, (e) => {
    e.dialogueId.value = 'dlg_previewtst';
    e.charTab.value = 'dialogue';
  });
  await expect(page.locator('.lib-text .pv-lines').filter({ hasText: 'Welcome to the village!' })).toBeVisible();
  // each line shows who says it as a face (the narrator has none)
  await expect(page.locator('img.dlg-face').first()).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
