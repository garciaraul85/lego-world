import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 3, 10d parts 4–5: Make from a picture makes assets and whole maps from words — an asset built from
 * bricks, used and placed on a free spot; a map with its land, sky, buildings and people, made as one step.
 */
type Item = { kind: string; asset?: string; character?: string; id: string };
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  mapDoc: { value: { name: string; sky: { time: string } } | null };
  maps: { value: { id: string }[] };
  store: { get(p: string): unknown; list(p: string): string[] };
};
async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${e.message} ${(e.stack ?? '').split('\n').slice(1, 4).join(' ')}`));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const get = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;

test('Asset from words: a red brick house with a blue door is built from bricks, used and placed near the start', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Assets' }).click();
  await page.locator('[data-tour="asset-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Asset from a picture' });
  await expect(dlg.getByRole('radio', { name: /Asset or building/ })).toHaveAttribute('aria-checked', 'true');
  await dlg.getByLabel('Describe it').fill('a red brick house with a blue door, two floors and a chimney');
  await dlg.locator('[data-tour="fp-create"]').click();
  const first = dlg.locator('[data-tour="fp-match-0"]');
  await expect(first).toContainText('Red Brick House', { timeout: 30_000 });
  await expect(first).toContainText('2 floors');
  await expect(first).toContainText('chimney');
  await expect(dlg.locator('[data-tour="fp-match-2"]')).toContainText('bigger');
  await page.screenshot({ path: 'test-results/make-asset-cards.png' });
  const before = await get(
    page,
    (e) => (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: Item[] }).items.length,
  );
  await dlg.locator('[data-tour="fp-place-0"]').click();
  await expect(dlg).toHaveCount(0);
  const placed = await get(page, (e) => {
    const items = (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: Item[] }).items;
    const it = items.at(-1)!;
    const def = e.store.get(`assets/${it.asset}.json`) as {
      name: string;
      palette: { colors: string[] };
      bricks: unknown[];
    };
    return { n: items.length, name: def.name, colors: def.palette.colors, bricks: def.bricks.length };
  });
  expect(placed.n).toBe(before + 1);
  expect(placed.name).toBe('Red Brick House');
  expect(placed.colors).toEqual(expect.arrayContaining(['#c91a09', '#0055bf']));
  expect(placed.bricks).toBeGreaterThan(40);
  // one Undo takes the asset and its placing away
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect
    .poll(() =>
      get(page, (e) => (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: Item[] }).items.length),
    )
    .toBe(before);
  expect(errors).toEqual([]);
});

test('Map from words: a snowy mountain village at night with a lighthouse, red houses and people, one step to undo', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  const maps = await get(page, (e) => e.maps.value.length);
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'World', exact: true }).click();
  await page.getByRole('menuitem', { name: /New map from a picture/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Map from a picture' });
  await dlg
    .getByLabel('Describe it')
    .fill(
      'a snowy mountain village at night with a lighthouse, three red houses, a blacksmith with a long beard and two guards',
    );
  await dlg.locator('[data-tour="fp-create"]').click();
  const first = dlg.locator('[data-tour="fp-match-0"]');
  await expect(first).toContainText('Snowy Mountain Village', { timeout: 30_000 });
  await expect(first).toContainText('night, snow');
  await expect(first).toContainText('Lighthouse, 3 × Red House');
  await expect(first).toContainText('a blacksmith with a long beard; 2 × a guard');
  await dlg.locator('[data-tour="fp-use-0"]').click();
  await expect(dlg).toHaveCount(0, { timeout: 120_000 });
  // the new map is open: snowy land at night, the buildings and the people on it
  expect(await get(page, (e) => e.maps.value.length)).toBe(maps + 1);
  expect(await get(page, (e) => e.mapDoc.value?.name)).toBe('Snowy Mountain Village');
  expect(await get(page, (e) => e.mapDoc.value?.sky.time)).toBe('night');
  const made = await get(page, (e) => {
    const items = (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: Item[] }).items;
    const names = items
      .filter((i) => i.kind === 'asset')
      .map((i) => (e.store.get(`assets/${i.asset}.json`) as { name: string }).name);
    const people = items
      .filter((i) => i.kind === 'npc')
      .map((i) => e.store.get(`characters/${i.character}.json`) as { name: string; profile: { facialHair?: string } });
    return { names, people: people.map((p) => p.name), beard: people[0]?.profile.facialHair };
  });
  expect(made.names.filter((n) => n === 'Lighthouse')).toHaveLength(1);
  expect(made.names.filter((n) => n === 'Red House')).toHaveLength(3);
  expect(made.people).toEqual(['Blacksmith', 'Guard 1', 'Guard 2']);
  expect(made.beard).toBe('Long beard');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/make-map.png' });
  // one Undo takes the whole map away
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(() => get(page, (e) => e.maps.value.length)).toBe(maps);
  // the editor is back on a map that is there
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name ?? null)).not.toBeNull();
  expect(errors).toEqual([]);
});

async function doItForMe(card: import('@playwright/test').Locator, timeout: number, what: string) {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

test('Make anything course: Do it for me makes a house from words, then a whole village', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Make anything course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(3);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 120_000, `${pos} ${title}`);
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(await get(page, (e) => e.mapDoc.value?.name)).toBe('Snowy Mountain Village');
  await page.screenshot({ path: 'test-results/make-course.png' });
  expect(errors).toEqual([]);
});
