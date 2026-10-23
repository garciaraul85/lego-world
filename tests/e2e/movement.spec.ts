import { expect, test } from '@playwright/test';

/** Milestone 2b, 10b part 3: Project › Movement — the hero walked by the physics engine, in the real editor. */
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown };
  session: {
    value: {
      runtime: { ticks: number };
      physicsMovement: boolean;
      heroState: { x: number; y: number; z: number; grounded: boolean };
    } | null;
  };
};

test('Project › Movement: Physics walks and jumps the hero in Play; Classic is still there', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('[data-tour="tab-project"]').click();
  const field = page.locator('[data-tour="project-movement"] select');
  await expect(field).toHaveValue('classic');
  await field.selectOption('physics');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          ((window as unknown as { __editor: Ed }).__editor.store.get('settings.json') as { movement?: string })
            ?.movement,
      ),
    )
    .toBe('physics');
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 10,
    undefined,
    { timeout: 120_000 },
  );
  expect(
    await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.physicsMovement),
  ).toBe(true);
  const at = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __editor: Ed }).__editor.session.value!.heroState;
      return { x: s.x, y: s.y, z: s.z, grounded: s.grounded };
    });
  const a = await at();
  await page.keyboard.down('w');
  await expect
    .poll(async () => Math.hypot((await at()).x - a.x, (await at()).z - a.z), { timeout: 60_000 })
    .toBeGreaterThan(0.5);
  await page.keyboard.up('w');
  // a jump leaves the ground and comes back to it
  await page.keyboard.press('Space');
  await expect.poll(async () => (await at()).y, { timeout: 120_000 }).toBeGreaterThan(a.y + 0.5);
  // (play time runs slowly on software drawing: a jump takes a while here)
  await expect.poll(async () => (await at()).grounded, { timeout: 180_000 }).toBe(true);
  await page.screenshot({ path: 'test-results/movement-physics.png' });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
