import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } | null };
  session: { value: { runtime: { ticks: number }; screens: { ids: string[] } } | null };
  store: { manifest: { name: string; hero: string | null }; list(p: string): string[] };
  bus: { history(): { label: string }[] };
};
const ed = <T>(page: Page, fn: (e: Ed) => T) => page.evaluate(fn as never, undefined) as Promise<T>;
const ready = (page: Page) =>
  page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 60_000,
    },
  );

test('Start hub: Generate & play goes straight into Play; Stop lands in the editor with the game saved', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html');
  await ready(page);
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await expect(hub).toBeVisible();
  await hub.getByRole('radio', { name: /Forest/ }).click();
  await hub.getByLabel('Maps').fill('1');
  await hub.getByLabel('Seed', { exact: true }).fill('77');
  await hub.getByRole('button', { name: /Generate & play/ }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.session.value?.runtime.ticks ?? -1) >= 0,
    undefined,
    {
      timeout: 120_000,
    },
  );
  await expect(
    page.getByRole('region', { name: 'Splash' }).or(page.getByRole('region', { name: 'Title' })),
  ).toBeVisible({ timeout: 60_000 });
  expect(await ed(page, (e) => (window as unknown as { __editor: Ed }).__editor.store.manifest.hero)).toBeTruthy();
  await page.keyboard.press('F5');
  await expect(page.getByLabel('Game view')).toHaveCount(0);
  const name = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.manifest.name);
  expect(name).not.toBe('New game');
  await expect(page.getByText('Saved to device')).toBeVisible({ timeout: 30_000 });
  // reopening the page keeps the generated game (and no hub: it is not the first run any more)
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.manifest.name)).toBe(name);
  await expect(page.getByRole('dialog', { name: 'Start hub' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Watch it being built: each Next applies one stage, opens its workspace and explains it; Back undoes it', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?hub');
  await ready(page);
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByLabel('Seed', { exact: true }).fill('4242');
  await hub.getByRole('button', { name: /Watch it being built/ }).click();
  const view = page.getByRole('complementary', { name: 'Build steps' });
  await expect(view).toBeVisible({ timeout: 60_000 });
  await expect(view.getByText('Start from an empty project')).toBeVisible();
  await view.getByRole('button', { name: /^Next: Name the game/ }).click();
  await expect(view.getByText(/The game is called/)).toBeVisible();
  await view.getByRole('button', { name: /^Next: Generate the first map/ }).click();
  await expect(view.getByText(/Do it yourself:/)).toBeVisible();
  const bricks = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.scene.value!.count);
  expect(bricks).toBeGreaterThan(500);
  await view.getByRole('button', { name: '◀ Back' }).click();
  await expect(view.getByRole('button', { name: /^Next: Generate the first map/ })).toBeVisible();
  // the rest, quickly
  for (let i = 0; i < 12; i++) {
    const next = view.getByRole('button', { name: /^Next:/ });
    if (!(await next.isVisible())) break;
    await next.click();
  }
  await expect(view.getByRole('button', { name: /Play the finished game/ })).toBeVisible();
  const h = await page.evaluate(() =>
    (window as unknown as { __editor: Ed }).__editor.bus.history().map((x) => x.label),
  );
  expect(h.filter((l) => l.startsWith('Build ')).length).toBeGreaterThanOrEqual(10);
  expect(
    await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.list('cinematics/').length),
  ).toBe(1);
  expect(errors).toEqual([]);
});
