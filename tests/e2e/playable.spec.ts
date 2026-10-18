import { expect, type Page, test } from '@playwright/test';

/** P28: “Can this game be finished?” from the World menu; test shortcuts in the Debug tab; Play from here. */
type Ed = {
  scene: { value: { count: number } | null };
  mapDoc: { value: { name: string } | null };
  session: {
    value: {
      god: boolean;
      moment: unknown;
      logic: { vars: Map<string, unknown> };
      heroState: { x: number; z: number };
    } | null;
  };
  exec(c: unknown): { ok: boolean; error?: string };
  store: { get(p: string): unknown };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());
const menu = async (page: Page, name: string, item: RegExp) => {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('Can this game be finished? lists what blocks it, with Select; test shortcuts work in Play', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await menu(page, 'World', /Add the Training yard/);
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name)).toBe('Training yard');
  // an achievement nothing unlocks
  await get(page, (e) => {
    const doc = e.store.get('game/progress.json') as { achievements: unknown[] };
    return e.exec({
      type: 'progress.put',
      payload: {
        progress: {
          ...doc,
          achievements: [...doc.achievements, { id: 'never', name: 'Never', description: 'Nothing unlocks it.' }],
        },
      },
    }).ok;
  });
  await menu(page, 'World', /Can this game be finished/);
  const bar = page.locator('[data-tour="play-check"]');
  await expect(bar.getByRole('button', { name: 'Check again' })).toBeVisible();
  const dock = page.getByRole('region', { name: 'Bottom dock' });
  await expect(dock.getByText(/Achievement “Never” \(never\) is never unlocked/)).toBeVisible();
  await page.screenshot({ path: 'test-results/playable-problems.png' });

  // Play: god mode, a snapshot, change things, back to the snapshot
  await menu(page, 'Play', /^Play this map/);
  await expect.poll(() => get(page, (e) => !!e.session.value)).toBe(true);
  await dock.getByRole('button', { name: /^Debug/ }).click();
  const tests = page.locator('[data-tour="test-shortcuts"]');
  await tests.getByLabel('God mode').check();
  expect(await get(page, (e) => e.session.value!.god)).toBe(true);
  await tests.getByRole('button', { name: 'Snapshot', exact: true }).click();
  await tests.getByLabel('Variable to set').fill('coins');
  await tests.getByLabel('New value').fill('7');
  await tests.getByLabel('New value').press('Enter');
  expect(await get(page, (e) => e.session.value!.logic.vars.get('coins'))).toBe(7);
  await tests.getByRole('button', { name: 'Back to snapshot' }).click();
  expect(await get(page, (e) => e.session.value!.logic.vars.get('coins'))).toBeUndefined();
  await page.screenshot({ path: 'test-results/playable-test-shortcuts.png' });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();

  expect(errors).toEqual([]);
});
