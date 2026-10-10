import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } | null };
  session: { value: { screens: { ids: string[] }; runtime: { ticks: number } } | null };
  store: { has(p: string): boolean; get(p: string): unknown; keys(): Iterable<string> };
  selectedItem: { value: string | null };
  audio: { stats: { played: number; music: string | null } };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 30_000,
    },
  );
}

test('Screens workspace edits the HUD on a device canvas; Reset brings the built-in back', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Screens' }).click();
  const canvas = page.getByRole('region', { name: 'HUD' });
  await expect(canvas).toBeVisible();
  await expect(canvas.getByText('⚒ Hammer')).toBeVisible(); // sample values fill {bindings}
  await page.getByRole('radio', { name: 'Phone 19.5:9' }).click();
  await expect(page.locator('[data-device="phone"]')).toBeVisible();
  await page
    .getByRole('tree', { name: 'Widgets' })
    .getByRole('treeitem', { name: /mapname/ })
    .click();
  const text = page.getByLabel('Widget text');
  await text.fill('Level: {map.name}');
  await text.press('Enter');
  await expect(canvas.getByText('Level: Prairie')).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __editor: Ed }).__editor.store.has('screens/scr_hud0000000.json'),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Reset to built-in' }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __editor: Ed }).__editor.store.has('screens/scr_hud0000000.json'),
    ),
  ).toBe(false);
  // a new custom screen
  await page.getByRole('button', { name: '+ New' }).click();
  await expect(page.getByRole('region', { name: /^Screen \d+$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Play from the first screen: splash → title → Play → HUD; Esc pauses, Resume continues, F5 stops', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  // make sure the project boots through the splash
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed & { exec(c: unknown): unknown } }).__editor;
    e.exec({ type: 'project.update', payload: { entryScreen: 'scr_splash0000' } });
  });
  await page.keyboard.press('Control+F5');
  await expect(page.getByRole('region', { name: 'Splash' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Made with Brick Worlds')).toBeVisible();
  const play = page.getByRole('region', { name: 'Title' }).getByRole('button', { name: 'Play' });
  await expect(play).toBeVisible({ timeout: 120_000 });
  await play.click();
  const hud = page.getByRole('region', { name: 'HUD' });
  await expect(hud).toBeVisible();
  await expect(hud.getByText('3 of 3 hearts')).toBeAttached();
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('Escape');
  const pause = page.getByRole('region', { name: 'Pause' });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(pause.getByRole('button', { name: 'Restart from checkpoint' })).toBeFocused();
  await pause.getByRole('button', { name: 'Resume' }).click();
  await expect(pause).toHaveCount(0);
  const ticks = await page.evaluate(
    () => (window as unknown as { __editor: Ed }).__editor.session.value!.runtime.ticks,
  );
  await page.waitForFunction(
    (t) => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > t,
    ticks,
    {
      timeout: 60_000,
    },
  );
  await page.keyboard.press('F5');
  await expect(page.getByLabel('Game view')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Audio workspace: events, mixer faders save audio/mixer.json; the sound tool places an emitter', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Audio' }).click();
  const list = page.getByRole('region', { name: 'Sounds and music' });
  await list.getByRole('button', { name: /^smash/ }).click();
  await expect(page.getByLabel('Sound name')).toHaveValue('smash');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.getByLabel('Max voices').fill('3');
  await page.getByLabel('Max voices').press('Enter');
  await page.getByLabel('Max voices').blur();
  await expect(list.getByRole('button', { name: /^smash.*edited/ })).toBeVisible();
  await list.getByRole('button', { name: 'Mixer & ducking' }).click();
  const fader = page.getByRole('region', { name: 'Audio editor' }).getByLabel('Music volume');
  await fader.evaluate((el: HTMLInputElement) => {
    el.value = '-20';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mixer = await page.evaluate(
    () =>
      (window as unknown as { __editor: Ed }).__editor.store.get('audio/mixer.json') as { buses: { music: number } },
  );
  expect(mixer.buses.music).toBe(-20);

  // Scene: the Sound emitter tool places an emitter where you click
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.getByRole('button', { name: 'Sound emitter (S)' }).click();
  const view = page.getByLabel('3D map view');
  const box = (await view.boundingBox())!;
  for (const [fx, fy] of [
    [0.5, 0.6],
    [0.4, 0.7],
    [0.6, 0.75],
  ] as const) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    if (await page.evaluate(() => !!(window as unknown as { __editor: Ed }).__editor.selectedItem.value)) break;
  }
  await expect(page.getByRole('heading', { name: /Emitter 1/ }).or(page.getByText('Emitter 1').first())).toBeVisible();
  expect(errors).toEqual([]);
});
