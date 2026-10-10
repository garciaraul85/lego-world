import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } | null };
  session: { value: unknown | null };
  store: { manifest: { name: string; hero: string | null }; list(p: string): string[]; get(p: string): unknown };
  bus: { history(): { label: string; source: string }[] };
};
const ready = (page: Page) =>
  page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

async function startTutorial(page: Page, mode: 'show' | 'try') {
  await page.goto('/editor.html?hub');
  await ready(page);
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByRole('radio', { name: mode === 'show' ? /Show me first/ : /I try first/ }).click();
  await hub.getByRole('button', { name: /Start the guided tutorial/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  return card;
}

test('Tutorial (Show me): the demo performs the step, then puts it back for the user to repeat', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  expect(await get(page, (e) => e.store.manifest.name)).toBe('Tutorial sandbox');
  // skip the reading steps to "Generate a map"
  for (let i = 0; i < 6 && !(await card.getByRole('heading', { name: /Generate/ }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  await expect(card.getByRole('heading', { name: /Generate/ })).toBeVisible();
  const before = await get(page, (e) => e.scene.value!.count);
  await card.getByRole('button', { name: /Show me/ }).click();
  await expect(card.getByText(/Watch/).first()).toBeVisible();
  await page.waitForFunction((n) => (window as unknown as { __editor: Ed }).__editor.scene.value!.count !== n, before, {
    timeout: 60_000,
  });
  // …then everything is put back and it is the user's turn
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 60_000 });
  expect(await get(page, (e) => e.scene.value!.count)).toBe(before);
  // the user repeats it (Do it for me stands in for the clicks) and the step completes
  await card.getByRole('button', { name: 'Do it for me' }).click();
  await expect(card.getByText('✓ Done!')).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('Tutorial (I try first): Do it for me through every step builds a playable two-map game', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBeGreaterThanOrEqual(45);
  const seen: string[] = [];
  for (let i = 0; i < total + 5; i++) {
    const title = await card.getByRole('heading').first().innerText();
    const pos = await card.locator('header .mono').innerText();
    seen.push(`${pos} ${title}`);
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      if (pos.startsWith(`${total}/`)) {
        await expect(card.getByText('✓ Done!')).toBeVisible({ timeout: 60_000 });
        break;
      }
      await expect(card.locator('header .mono'), `step ${pos} ${title}`).not.toHaveText(pos, { timeout: 60_000 });
      continue;
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  expect(seen.length).toBeGreaterThanOrEqual(total);
  // the sandbox now holds a small game: two maps joined by a gate, a hero, logic, a HUD, a scene, music
  expect(await get(page, (e) => e.store.list('maps/').filter((p) => p.endsWith('/map.json')).length)).toBe(2);
  expect(await get(page, (e) => (e.store.get('world/gates.json') as { gates: unknown[] }).gates.length)).toBe(1);
  expect(await get(page, (e) => e.store.manifest.hero)).toBeTruthy();
  expect(await get(page, (e) => e.store.list('logic/').length)).toBeGreaterThan(0);
  expect(await get(page, (e) => e.store.list('cinematics/').length)).toBeGreaterThan(0);
  const userSteps = await get(page, (e) => e.bus.history().filter((h) => h.source === 'tutorial').length);
  expect(userSteps).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
