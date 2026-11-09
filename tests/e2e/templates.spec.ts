import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11, 4c: script and cutscene templates (from Logic, Cinematics and the pack panel), the logic they need
 * running in Play, My library (add, use, export), and the Scripts and scenes course.
 */
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown; list(p: string): string[] };
  mapId: { value: string };
  exec(c: unknown): { ok: boolean };
  session: { value: unknown };
};
const open = async (page: Page, errors: string[]) => {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
};
const names = (page: Page, dir: string) =>
  page.evaluate((d) => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.list(d).map((p) => (e.store.get(p) as { name: string }).name);
  }, dir);

test('templates: a shop from Logic, a scene from Cinematics, waves from the pack panel that run in Play', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await open(page, errors);
  const ws = (n: string) => page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: n });
  // Logic › + From a template…
  await ws('Logic').click();
  await page.locator('[data-tour="logic-template"]').click();
  const dlg = page.getByRole('dialog', { name: 'Script templates' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('option', { name: 'Shop counter' }).click();
  await dlg.getByLabel('Price', { exact: true }).fill('7');
  await dlg.getByRole('button', { name: 'Make it' }).click();
  await expect(dlg).toBeHidden();
  expect(await names(page, 'logic/')).toEqual(['Shop counter']);
  await expect(page.locator('.lg-graph-name', { hasText: 'Shop counter' })).toBeVisible();
  // a template that needs a zone says so
  await page.locator('[data-tour="logic-template"]').click();
  await dlg.getByRole('option', { name: 'Checkpoint' }).click();
  await dlg.getByRole('button', { name: 'Make it' }).click();
  await expect(dlg.getByRole('alert')).toContainText('make a zone first');
  await dlg.getByRole('button', { name: 'Cancel' }).click();

  // Cinematics › + From a template…
  await ws('Cinematics').click();
  await page.locator('[data-tour="cine-template"]').click();
  const cdlg = page.getByRole('dialog', { name: 'Cutscene templates' });
  await cdlg.getByRole('option', { name: 'Item found' }).click();
  await cdlg.getByLabel('Item', { exact: true }).fill('Lantern');
  await cdlg.getByRole('button', { name: 'Make it' }).click();
  await expect(cdlg).toBeHidden();
  expect(await names(page, 'cinematics/')).toContain('Found the Lantern');

  // the pack panel: a zone at the start, then Waves of enemies (one Rattlebones a wave, two waves)
  await ws('Scene').click();
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({
      type: 'map.addZone',
      payload: { map: e.mapId.value, zone: { min: [-4, 0, -4], max: [4, 4, 4], tags: ['Start area'] } },
    });
  });
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pack = page.locator('[data-tour="dock-pack"]');
  await pack.getByRole('button', { name: 'Use Waves of enemies' }).click();
  const w = page.getByRole('dialog', { name: 'Script templates' });
  await w.getByLabel('Arena zone', { exact: true }).fill('Start area');
  await w.getByLabel('Waves', { exact: true }).fill('2');
  await w.getByLabel('Enemies per wave', { exact: true }).fill('1');
  await w.getByRole('button', { name: 'Make it' }).click();
  await expect(w).toBeHidden();
  await ws('Scene').click();
  await page.keyboard.press('F5');
  await page.waitForFunction(() => !!(window as unknown as { __editor: Ed }).__editor.session.value, undefined, {
    timeout: 120_000,
  });
  type S = {
    world: { npcs: { profile: { name: string } }[] };
    damage(w: string, n: number, t: string): void;
    message: string;
  };
  const rattles = () =>
    page.evaluate(
      () =>
        ((window as unknown as { __editor: Ed }).__editor.session.value as S).world.npcs.filter(
          (n) => n.profile.name === 'Rattlebones',
        ).length,
    );
  // the hero starts in the arena: wave 1 comes in
  await expect.poll(rattles, { timeout: 60_000 }).toBe(1);
  await page.evaluate(() =>
    ((window as unknown as { __editor: Ed }).__editor.session.value as S).damage('Rattlebones', 99, 'slash'),
  );
  // wave 2
  await expect.poll(rattles, { timeout: 60_000 }).toBe(1);
  await page.evaluate(() =>
    ((window as unknown as { __editor: Ed }).__editor.session.value as S).damage('Rattlebones', 99, 'slash'),
  );
  await expect
    .poll(() => page.evaluate(() => ((window as unknown as { __editor: Ed }).__editor.session.value as S).message), {
      timeout: 60_000,
    })
    .toBe('The arena is clear!');
  await page.screenshot({ path: 'test-results/templates-waves.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('My library: add from this game, use it again, export a pack; it stays after a reload', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    (window as unknown as { __editor: { templates: { value: unknown } } }).__editor.templates.value = {
      kind: 'script',
      id: 'shop',
    };
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Make it' }).click();
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'My library', exact: true }).click();
  const lib = page.locator('[data-tour="dock-library"]');
  await expect(lib.getByText('Nothing here yet')).toBeVisible();
  await lib.getByRole('button', { name: '+ Add from this game…' }).click();
  const d = page.getByRole('dialog', { name: 'Add to My library' });
  await d.getByRole('checkbox', { name: 'Script: Shop counter' }).check();
  await d.getByRole('button', { name: /Save 1 to My library/ }).click();
  await expect(lib.getByRole('listitem', { name: 'Shop counter' })).toBeVisible();
  // gone from the game, back from the library
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    for (const p of e.store.list('logic/'))
      e.exec({ type: 'logic.delete', payload: { graph: (e.store.get(p) as { id: string }).id } });
  });
  expect(await names(page, 'logic/')).toEqual([]);
  await lib.getByRole('button', { name: 'Use Shop counter in this game' }).click();
  expect(await names(page, 'logic/')).toEqual(['Shop counter']);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    lib.getByRole('button', { name: 'Export pack' }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe('my-library.bwlib');
  await page.reload();
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'My library', exact: true }).click();
  await expect(
    page.locator('[data-tour="dock-library"]').getByRole('listitem', { name: 'Shop counter' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Scripts and scenes course: Do it for me makes the room-clear script, plays it, makes a boss entrance, keeps the script', async ({
  page,
}) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Scripts and scenes course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(14);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (/Clear the room/.test(title)) await page.screenshot({ path: 'test-results/templates-course-play.png' });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
