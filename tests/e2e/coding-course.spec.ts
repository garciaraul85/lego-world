import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: unknown };
  store: { manifest: { name: string }; list(p: string): string[]; get(p: string): unknown };
};
const ready = (page: Page) =>
  page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });

test('Coding course: Show me types the code into the Code view, then puts it back', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?hub');
  await ready(page);
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByRole('radio', { name: /I try first/ }).click();
  await hub.getByRole('button', { name: /Start the coding course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByText('Code basics')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.manifest.name)).toBe(
    'Coding course sandbox',
  );
  // go to "Your first line"
  for (let i = 0; i < 8 && !(await card.getByRole('heading', { name: 'Your first line' }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) await doIt.click();
    else await card.getByRole('button', { name: /Next ▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 30_000 });
  }
  await expect(card.getByLabel('Code to type')).toContainText('log("Hello, bricks!");');
  await card.getByRole('button', { name: /Show me/ }).click();
  // the demo types into the real code editor…
  await expect(page.locator('.lg-code .cm-content')).toContainText('Hello, bricks!', { timeout: 20_000 });
  // …then puts it back for you to type
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.lg-code .cm-content')).not.toContainText('Hello, bricks!');
  // you type it yourself and the step completes
  await page.locator('.lg-code .cm-content').click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('log("Hello, bricks!");');
  await expect(card.getByText('✓ Done!')).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('Coding course: Do it for me through every lesson ends with a game written in code', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?hub');
  await ready(page);
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByRole('radio', { name: /I try first/ }).click();
  await hub.getByRole('button', { name: /Start the coding course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  if (process.env.TUT_DEBUG) {
    await page.evaluate(() => ((globalThis as { __tutDebug?: boolean }).__tutDebug = true));
    page.on('console', (m) => m.text().startsWith('DOIT') && console.log(m.text()));
  }
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  for (let i = 0; i < total + 3; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    if (process.env.TUT_DEBUG) console.log(pos, title);
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
    } else {
      const finish = card.getByRole('button', { name: 'Finish ✓' });
      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await card.getByRole('button', { name: 'Next ▶' }).click();
    }
    try {
      await expect(card.locator('header .mono'), `${pos} ${title}`).not.toHaveText(pos, { timeout: 60_000 });
    } catch (e) {
      if (process.env.TUT_DEBUG) {
        await page.screenshot({ path: 'test-results/coding-stuck.png' });
        console.log(await card.innerText());
      }
      throw e;
    }
  }
  const code = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const p = e.store.list('logic/lg_').find((x) => (e.store.get(x) as { name: string }).name === 'Coding course')!;
    return JSON.stringify(e.store.get(p));
  });
  expect(code).toContain('event.onCustom');
  expect(code).toContain('cinematic.play');
  expect(errors).toEqual([]);
});
