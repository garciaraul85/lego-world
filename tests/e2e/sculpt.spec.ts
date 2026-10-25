import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 3, 10d part 3: painting and brick-sculpting a creature on the preview. Picking Paint on a family body
 * makes it a body plan of its own; a click on the creature paints the brick under the pointer, Add puts a brick
 * against the face clicked, Remove takes one away — each one undo step.
 */
type Plan = { bricks: { color: string; kind: string }[] };
type Ed = {
  scene: { value: { count: number } | null };
  studioCharacter: { value: string | null };
  store: { get(p: string): unknown; manifest: { entry: { map: string } } };
  exec(c: unknown): { ok: boolean };
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
const plan = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const c = e.store.get('characters/chr_sculptdog1.json') as { body?: { plan?: string; family?: string } };
    return c.body?.plan ? (e.store.get(`bodyplans/${c.body.plan}.json`) as Plan) : null;
  });

test('Paint and sculpt a creature: a click paints a brick, adds one against a face, removes one; each one undo step', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, errors);
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({
      type: 'character.create',
      payload: {
        character: {
          id: 'chr_sculptdog1',
          name: 'Patch',
          role: 'npc',
          profile: { name: 'Patch' },
          body: { family: 'fourLegs', params: { size: 1.4 } },
        },
      },
    });
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed & { sheetTab: { value: string } } }).__editor;
    e.studioCharacter.value = 'chr_sculptdog1';
    e.sheetTab.value = 'body';
  });
  const sculpt = page.locator('[data-tour="body-sculpt"]');
  await expect(sculpt).toBeVisible();
  expect(await plan(page)).toBeNull();
  // Paint makes the dog a body plan of its own
  await page.locator('[data-tour="sculpt-paint"]').click();
  await expect.poll(async () => (await plan(page))?.bricks.length ?? 0).toBeGreaterThan(3);
  const start = (await plan(page))!;
  await page.locator('[data-tour="sculpt-color"]').fill('#ff0000');
  const canvas = page.getByLabel('Character preview').first();
  const box = (await canvas.boundingBox())!;
  // the dog fills the middle of the preview: find a spot on it (the hover outline shows on bricks only)
  const spots = [
    [0.5, 0.5],
    [0.45, 0.45],
    [0.55, 0.45],
    [0.5, 0.4],
    [0.4, 0.5],
    [0.6, 0.5],
    [0.5, 0.55],
  ];
  let at: [number, number] | null = null;
  for (const [fx, fy] of spots) {
    const x = box.x + box.width * fx!;
    const y = box.y + box.height * fy!;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
    if ((await plan(page))!.bricks.some((b) => b.color === '#ff0000')) {
      at = [x, y];
      break;
    }
  }
  expect(at, 'a click on the dog paints a brick').not.toBeNull();
  await page.screenshot({ path: 'test-results/sculpt-paint.png' });
  // one undo step
  await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
  await expect.poll(async () => (await plan(page))!.bricks.filter((b) => b.color === '#ff0000').length).toBe(0);
  // Add: a brick against the face clicked
  await page.locator('[data-tour="sculpt-add"]').click();
  await page.locator('[data-tour="sculpt-size"]').selectOption('2x2');
  await page.mouse.move(at![0], at![1]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/sculpt-add-hover.png' });
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await plan(page))!.bricks.length).toBe(start.bricks.length + 1);
  // Remove: takes one away
  await page.locator('[data-tour="sculpt-remove"]').click();
  await page.mouse.move(at![0], at![1]);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(async () => (await plan(page))!.bricks.length).toBe(start.bricks.length);
  await page.locator('[data-tour="sculpt-off"]').click();
  await expect(sculpt.getByRole('status')).toContainText('Pick Paint, Add or Remove');
  expect(errors).toEqual([]);
});
