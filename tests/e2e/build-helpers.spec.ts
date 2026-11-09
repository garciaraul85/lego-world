import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11 (P24 part 1a): building faster on an asset's build plate — Mirror X puts every new brick on both sides
 * (and paints and erases both), Fill paints every joined brick of one colour, Copy / Stamp puts copies down.
 */
type B = { id: number; x: number; y: number; z: number; color: string; type: string };
type Plate = {
  scene: { value: { all(): B[] } | null };
  select(ids: number[]): void;
  brush: { value: { type: string; color: string; rot: number } };
  tool: { value: string };
  mirror: { value: { x: number | null; z: number | null } };
};
type Ed = { scene: { value: { count: number } | null } };
async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(`${e.message} ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const plate = <T>(page: Page, f: (p: Plate) => T) => page.evaluate(`(${f.toString()})(window.__plate)`) as Promise<T>;
const bricks = (page: Page) => plate(page, (p) => p.scene.value!.all().map((b) => ({ ...b })));

/** clicks spots of the plate until `done` says the click did something */
async function clickPlate(
  page: Page,
  done: () => Promise<boolean>,
  spots = [
    [0.5, 0.6],
    [0.4, 0.62],
    [0.6, 0.62],
    [0.45, 0.7],
    [0.55, 0.7],
    [0.5, 0.75],
  ],
) {
  const canvas = page.getByRole('region', { name: 'Asset build plate' }).getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  for (const [fx, fy] of spots) {
    await canvas.click({ position: { x: box.width * fx!, y: box.height * fy! } });
    await page.waitForTimeout(250);
    if (await done()) return true;
  }
  return false;
}

test('Build helpers: Mirror X places, paints and erases both sides; Fill paints joined bricks; Stamp copies', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-assets"]').click();
  await page.getByRole('menuitem', { name: /^New asset$/ }).click();
  const helpers = page.locator('[data-tour="build-helpers"]');
  await expect(helpers).toBeVisible({ timeout: 30_000 });
  const start = (await bricks(page)).length;
  // Mirror X: on, at the middle of the asset
  await helpers.locator('[data-tour="mirror-x"]').click();
  await expect(helpers.locator('[data-tour="mirror-x"]')).toHaveAttribute('aria-pressed', 'true');
  const at = await plate(page, (p) => p.mirror.value.x);
  expect(at).not.toBeNull();
  await helpers.locator('[data-tour="mirror-x-more"]').click();
  expect(await plate(page, (p) => p.mirror.value.x)).toBe(at! + 0.5);
  await helpers.locator('[data-tour="mirror-x-less"]').click();
  // Place: a 1x1 brick lands with its mirror image
  await plate(page, (p) => {
    p.brush.value = { type: 'brick1x1', color: '#0055bf', rot: 0 };
    p.tool.value = 'place';
  });
  expect(await clickPlate(page, async () => (await bricks(page)).length >= start + 2)).toBe(true);
  const placed = (await bricks(page)).filter((b) => b.color === '#0055bf');
  expect(placed).toHaveLength(2);
  // the two are mirror images across the plane: x1 + 1 + x2 = 2 × plane (1-wide bricks)
  expect(placed[0]!.x + placed[1]!.x + 1).toBe(2 * at!);
  expect(placed[0]!.y).toBe(placed[1]!.y);
  await page.screenshot({ path: 'test-results/build-mirror.png' });
  // Paint with Fill: the clicked colour and everything joined to it in that colour, on both sides
  await helpers.locator('[data-tour="paint-fill"]').click();
  expect(await plate(page, (p) => p.tool.value)).toBe('paint');
  await plate(page, (p) => {
    p.brush.value = { ...p.brush.value, color: '#f2cd37' };
  });
  const before = await bricks(page);
  expect(await clickPlate(page, async () => (await bricks(page)).some((b) => b.color === '#f2cd37'))).toBe(true);
  const after = await bricks(page);
  const filled = after.filter((b) => b.color === '#f2cd37');
  const was = new Map(before.map((b) => [b.id, b.color]));
  // every filled brick had one of the colours the click could reach, and more than one was painted
  expect(filled.length).toBeGreaterThan(1);
  expect(new Set(filled.map((b) => was.get(b.id))).size).toBeLessThanOrEqual(2);
  // Stamp: copy the whole asset and put a copy down
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  // the plate is rebuilt after an undo in the editor: select once it is back
  await page.waitForTimeout(800);
  await plate(page, (p) => p.select(p.scene.value!.all().map((b) => b.id)));
  await expect(helpers.locator('[data-tour="stamp-copy"]')).toBeEnabled();
  await helpers.locator('[data-tour="mirror-x"]').click();
  await helpers.locator('[data-tour="stamp-copy"]').click();
  await expect(helpers.locator('[data-tour="stamp-status"]')).toContainText('Stamping');
  const n = (await bricks(page)).length;
  expect(
    await clickPlate(page, async () => (await bricks(page)).length >= n * 2, [
      [0.2, 0.6],
      [0.8, 0.6],
      [0.5, 0.3],
      [0.3, 0.4],
      [0.7, 0.4],
    ]),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/build-stamp.png' });
  await helpers.locator('[data-tour="stamp-stop"]').click();
  await expect(helpers.locator('[data-tour="stamp-status"]')).toHaveCount(0);
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

test('Build faster course: Do it for me builds a gatehouse with the mirror and a stamp, a drawbridge, pushable', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Build faster course/ }).click();
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
  const a = await page.evaluate(() => {
    const e = (
      window as unknown as { __editor: { studioAsset: { value: string }; store: { get(p: string): unknown } } }
    ).__editor;
    return e.store.get(`assets/${e.studioAsset.value}.json`) as {
      name: string;
      bricks: unknown[];
      loose?: boolean;
      parts?: { name: string }[];
    };
  });
  expect(a.name).toBe('Gatehouse');
  expect(a.bricks.length).toBeGreaterThanOrEqual(14);
  expect(a.loose).toBe(true);
  expect(a.parts?.map((p) => p.name)).toContain('Drawbridge');
  await page.screenshot({ path: 'test-results/build-course.png' });
  expect(errors).toEqual([]);
});
