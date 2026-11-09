import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11 (P24 part 1b): moving parts in one click (selected bricks → a drawbridge: two states, a pose, a hinge
 * and E to switch it) and Turn it into (breakable, pushable, a creature that wears the bricks).
 */
type A = {
  states: string[];
  parts?: { name: string; pose?: Record<string, unknown>; hinge?: number[] }[];
  interactions: unknown[];
  smash: { enabled: boolean };
  loose?: boolean;
};
type Ed = {
  scene: { value: { count: number } | null };
  studioAsset: { value: string | null };
  studioCharacter: { value: string | null };
  store: { get(p: string): unknown };
};
async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${e.message} ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const asset = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`assets/${e.studioAsset.value}.json`) as A;
  });

test('Selected bricks → a drawbridge; Turn it into breakable, pushable and a creature', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-assets"]').click();
  await page.getByRole('menuitem', { name: /^New asset$/ }).click();
  await expect(page.locator('[data-tour="turn-into"]')).toBeVisible({ timeout: 30_000 });
  expect((await asset(page)).states).toHaveLength(1);
  // select every brick on the plate, then make them a drawbridge
  await page.evaluate(() => {
    const p = (
      window as unknown as { __plate: { scene: { value: { all(): { id: number }[] } }; select(ids: number[]): void } }
    ).__plate;
    p.select(p.scene.value.all().map((b) => b.id));
  });
  await page.locator('[data-tour="mover-from-selection"]').selectOption('drawbridge');
  await expect.poll(async () => (await asset(page)).states).toEqual(['closed', 'open']);
  const a = await asset(page);
  expect(a.parts?.[0]).toMatchObject({ name: 'Drawbridge', pose: { closed: { turn: [-90, 0, 0] } } });
  expect(a.parts?.[0]?.hinge).toHaveLength(3);
  expect(a.interactions).toHaveLength(2);
  // the part's own picker re-makes it another kind
  await page.locator('[data-tour="mover-0"]').selectOption('gate');
  await expect.poll(async () => Object.keys((await asset(page)).parts?.[0]?.pose ?? {})).toEqual(['open']);
  await page.getByRole('radiogroup', { name: 'Showing state' }).getByRole('radio', { name: 'open' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/movers-gate-open.png' });
  // Turn it into: breakable and pushable switch on and off
  await page.locator('[data-tour="turn-breakable"]').click();
  await expect.poll(async () => (await asset(page)).smash.enabled).toBe(false);
  await page.locator('[data-tour="turn-breakable"]').click();
  await expect.poll(async () => (await asset(page)).smash.enabled).toBe(true);
  await page.locator('[data-tour="turn-loose"]').click();
  await expect.poll(async () => (await asset(page)).loose).toBe(true);
  // a creature that wears these bricks, open in Characters › Body
  await page.locator('[data-tour="turn-creature"]').click();
  await expect(page.locator('[data-tour="char-body"]')).toBeVisible({ timeout: 30_000 });
  const chr = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`characters/${e.studioCharacter.value}.json`) as { body?: { family?: string; asset?: string } };
  });
  expect(chr.body).toMatchObject({ family: 'fourLegs' });
  expect(chr.body?.asset).toMatch(/^ast_/);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/movers-creature.png' });
  expect(errors).toEqual([]);
});
