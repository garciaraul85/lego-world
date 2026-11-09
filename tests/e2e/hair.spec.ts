import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Milestone 3, 10d part 3: custom hair — the Hair editor in Look (a preset, a slider live and one undo step, dyed
 * tips), My library (saved on one character, worn by another), From a picture making custom hair from words, and
 * the Custom hair course with Do it for me.
 */
type Chr = { id: string; name: string; profile: Record<string, unknown> & { customHair?: Record<string, unknown> } };
type Ed = {
  scene: { value: { count: number } | null };
  studioCharacter: { value: string | null };
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
const current = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`characters/${e.studioCharacter.value}.json`) as Chr;
  });
const library = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.list('hairstyles/').map((p) => e.store.get(p) as { id: string; name: string; color: string });
  });
async function newCharacter(page: Page) {
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  const before = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.studioCharacter.value);
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
  await expect.poll(async () => (await current(page))?.id ?? null).not.toBe(before);
}
const pick = async (page: Page, tour: string, value: string) => {
  await page.locator(`[data-tour="pick-${tour}"]`).click();
  await page.locator(`[data-tour="pick-${tour}-list"] [data-value="${value}"]`).click();
};

test('Hair editor: custom hair from a preset, a slider is one undo step, tips; saved to My library and worn by another', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await newCharacter(page);
  await page.locator('[data-tour="hair-make-custom"]').click();
  await expect.poll(async () => (await current(page)).profile.hair).toBe('Custom');
  // the preset's helmet hides the hair: take it off
  await page.locator('[data-tour="hair-hat-off"]').click();
  await expect.poll(async () => (await current(page)).profile.hat).toBe('None');
  await pick(page, 'hair-preset', 'Space buns');
  await expect.poll(async () => (await current(page)).profile.customHair?.tie).toBe('Two buns');
  await expect(page.locator('[data-tour="hair-editor"]')).toContainText('two buns');
  // a slider: one undo step
  await page.locator('[data-tour="hair-tieLength"]').fill('80');
  await expect.poll(async () => (await current(page)).profile.customHair?.tieLength).toBe(80);
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(async () => (await current(page)).profile.customHair?.tieLength).toBe(45);
  await page.locator('[data-tour="hair-tips-on"]').check();
  await expect.poll(async () => (await current(page)).profile.customHair?.tips).toBe('#1e5aa8');
  await pick(page, 'hair-beard', 'Braided');
  await expect.poll(async () => (await current(page)).profile.customHair?.beard).toBe('Braided');
  await page.locator('[data-tour="hair-name"]').fill('Buns and braid');
  await page.locator('[data-tour="hair-save"]').click();
  await expect.poll(async () => (await library(page)).map((s) => s.name)).toEqual(['Buns and braid']);
  const [style] = await library(page);
  expect((await current(page)).profile.customHair?.from).toBe(style!.id);
  await expect(page.locator('[data-tour="hair-update"]')).toBeVisible();
  // another character picks it from My library (shown before it has custom hair)
  await newCharacter(page);
  expect((await current(page)).profile.hair).not.toBe('Custom');
  await pick(page, 'hair-library', style!.id);
  const other = await current(page);
  expect(other.profile.hair).toBe('Custom');
  expect(other.profile.customHair).toMatchObject({
    tie: 'Two buns',
    beard: 'Braided',
    tips: '#1e5aa8',
    from: style!.id,
  });
  expect(other.profile.hairColor).toBe(style!.color);
  await page.screenshot({ path: 'test-results/hair-editor.png' });
  expect(errors).toEqual([]);
});

test('From a picture makes custom hair from words: a monk with a top knot and a braided beard', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await dlg.getByLabel('Describe it').fill('a monk with a top knot and a braided beard');
  await dlg.locator('[data-tour="fp-create"]').click();
  await expect(dlg.locator('[data-tour="fp-match-0"]')).toContainText('custom:', { timeout: 30_000 });
  await dlg.locator('[data-tour="fp-use-0"]').click();
  await expect.poll(async () => (await current(page))?.profile.customHair?.tie ?? null).toBe('Top knot');
  expect((await current(page)).profile.customHair?.beard).toBe('Braided');
  expect(errors).toEqual([]);
});

async function doItForMe(card: Locator, timeout: number, what: string) {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

test('Custom hair course: Do it for me gives Mira space buns with dyed tips, saves them and puts them on Leo', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Custom hair course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 60_000, `${pos} ${title}`);
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  const leo = await current(page);
  expect(leo.name).toBe('Leo');
  expect(leo.profile.customHair).toMatchObject({ tie: 'Two buns', tieLength: 70, name: 'Space buns' });
  expect((await library(page)).map((s) => s.name)).toEqual(['Space buns']);
  expect(errors).toEqual([]);
});
