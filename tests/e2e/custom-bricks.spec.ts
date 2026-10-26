import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11 (P24 part 2): custom bricks — made in the brick editor (a slope), in the Bricks tab's Custom group, put on
 * an asset's build plate like any brick, changed (a curve: every brick of it follows), and drawn in Play.
 */
type Ed = {
  scene: { value: { count: number } | null };
  studioAsset: { value: string | null };
  store: { get(p: string): unknown; list(p: string): string[] };
  session: { value: { runtime: { ticks: number } } | null };
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
const get = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;
const customs = (page: Page) =>
  get(page, (e) => e.store.list('bricks/').map((p) => e.store.get(p) as { id: string; name: string; shape: string }));
const assetTypes = (page: Page) =>
  get(
    page,
    (e) => (e.store.get(`assets/${e.studioAsset.value}.json`) as { palette: { types: string[] } }).palette.types,
  );

test('Custom bricks: a slope made in the brick editor, built with on a plate, changed to a curve, drawn in Play', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-assets"]').click();
  await page.getByRole('menuitem', { name: /^New asset$/ }).click();
  const lib = page.getByRole('region', { name: 'Asset library' });
  await lib.getByRole('tab', { name: 'Bricks' }).click();
  await lib.locator('[data-tour="brick-kind-custom"]').click();
  await lib.locator('[data-tour="brick-new"]').click();
  const dlg = page.getByRole('dialog', { name: 'Brick editor' });
  await expect(dlg).toBeVisible();
  await dlg.locator('[data-tour="brick-name"]').fill('Roof slope');
  await dlg.locator('[data-tour="brick-shape-slope"]').click();
  await dlg.locator('[data-tour="brick-d"]').selectOption('3');
  await expect(dlg.getByLabel('3D map view')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/custom-brick-editor.png' });
  await dlg.locator('[data-tour="brick-save"]').click();
  await expect(dlg).toHaveCount(0);
  const [cb] = await customs(page);
  expect(cb).toMatchObject({ name: 'Roof slope', shape: 'slope' });
  // the brush holds it: click the plate until a brick of it is in the asset
  const canvas = page.getByRole('region', { name: 'Asset build plate' }).getByLabel('3D map view');
  const box = (await canvas.boundingBox())!;
  for (const [fx, fy] of [
    [0.5, 0.6],
    [0.4, 0.65],
    [0.6, 0.65],
    [0.5, 0.75],
    [0.3, 0.6],
  ]) {
    await canvas.click({ position: { x: box.width * fx!, y: box.height * fy! } });
    await page.waitForTimeout(300);
    if ((await assetTypes(page)).some((t) => t.includes(cb!.id))) break;
  }
  expect((await assetTypes(page)).some((t) => t === `brick:${cb!.id}:3x2`)).toBe(true);
  await page.screenshot({ path: 'test-results/custom-brick-plate.png' });
  // change it to a curve: the brick on the plate follows; its size stays (it is used)
  await lib.locator(`[data-tour="brick-edit-${cb!.id}"]`).click();
  await expect(dlg.locator('[data-tour="brick-d"]')).toBeDisabled();
  await dlg.locator('[data-tour="brick-shape-curve"]').click();
  await dlg.locator('[data-tour="brick-save"]').click();
  await expect.poll(async () => (await customs(page))[0]?.shape).toBe('curve');
  // a used brick can't be deleted
  await lib.locator(`[data-tour="brick-edit-${cb!.id}"]`).click();
  await expect(dlg.locator('[data-tour="brick-delete"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  // into the world beside the spawn point, turned a quarter, and Play: its bricks keep their shape there
  const asset = await get(page, (e) => e.studioAsset.value);
  await page.evaluate((asset) => {
    const e = (
      window as unknown as {
        __editor: { exec(c: unknown): { ok: boolean; error?: string }; mapId: { value: string } } & {
          mapDoc: { value: { spawns: { pos: number[] }[] } };
        };
      }
    ).__editor;
    const sp = e.mapDoc.value.spawns[0]!.pos;
    // the first free spot above the ground beside the spawn point
    let r: { ok: boolean; error?: string } = { ok: false };
    for (let up = 0; up < 40 && !r.ok; up++)
      r = e.exec({
        type: 'asset.place',
        payload: {
          map: e.mapId.value,
          asset,
          pos: [Math.round(sp[0]!) + 3, Math.round(sp[1]!) + up, Math.round(sp[2]!) + 3],
          rot: 1,
        },
      });
    if (!r.ok) throw new Error(r.error);
  }, asset);
  await page.locator('[data-tour="ws-scene"]').click();
  await page.waitForTimeout(800);
  await page.keyboard.press('F5');
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 20,
    undefined,
    { timeout: 180_000 },
  );
  const shaped = await page.evaluate(
    (id) =>
      (
        window as unknown as { __editor: { session: { value: { world: { pieces: { shape?: string }[] } } } } }
      ).__editor.session.value.world.pieces.filter((p) => p.shape === id).length,
    cb!.id,
  );
  expect(shaped).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/custom-brick-play.png' });
  await page.keyboard.press('F5');
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

test('Custom bricks course: Do it for me makes a roof slope, puts four down, changes it into a curve', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Custom bricks course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(5);
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
  const [cb] = await customs(page);
  expect(cb).toMatchObject({ name: 'Roof slope', shape: 'curve' });
  expect((await assetTypes(page)).some((t) => t.includes(`:${cb!.id}:`))).toBe(true);
  await page.screenshot({ path: 'test-results/custom-brick-course.png' });
  expect(errors).toEqual([]);
});
