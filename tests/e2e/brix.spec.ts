import { expect, type Page, test } from '@playwright/test';

/**
 * P19 Brix: answers from Help with links, Show me walks to the control (opening the workspace and asset on
 * the way) without changing the project, and Explain tells what any clicked control is instead of pressing it.
 */
type Ed = {
  scene: { value: { count: number } | null };
  session: { value: unknown };
  workspace: { value: string };
  studioAsset: { value: string | null };
  store: { keys(): Iterable<string>; get(p: string): unknown };
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const project = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.store;
    return JSON.stringify([...s.keys()].sort().map((k) => [k, s.get(k)]));
  });

test('Ask Brix: an answer from Help, a link, and Show me walks to the Checkpoint setting', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  const before = await project(page);
  await page.getByRole('button', { name: 'Ask Brix' }).click();
  const brix = page.getByRole('complementary', { name: 'Brix' });
  await expect(brix).toBeVisible();
  await expect(brix.getByText('Answers from Help')).toBeVisible();
  await brix.getByRole('textbox', { name: 'Ask Brix' }).fill('how do I add a checkpoint?');
  await brix.getByRole('textbox', { name: 'Ask Brix' }).press('Enter');
  const answer = brix.locator('.brix-answer').last();
  await expect(answer).toContainText('Checkpoint');
  await expect(answer.getByRole('button', { name: /^📖/ }).first()).toBeVisible();
  await answer.getByRole('button', { name: 'Show me: Checkpoint' }).click();
  const callout = page.getByRole('dialog', { name: 'Brix shows you' });
  await expect(callout).toBeVisible();
  // Brix opens the Assets workspace and an asset, then rings the Checkpoint setting
  await expect(callout.getByText(/Checkpoint —/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/brix-show.png' });
  const where = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return { ws: e.workspace.value, asset: e.studioAsset.value };
  });
  expect(where.ws).toBe('Assets');
  expect(where.asset).toBeTruthy();
  // only the panel scrolled to the setting, never the page
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  await expect(page.locator('.brix-ring')).toBeVisible();
  await callout.getByRole('button', { name: 'Done' }).click();
  await expect(callout).toHaveCount(0);
  // the link opens the Help page the answer came from
  await answer.getByRole('button', { name: /^📖/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  await page.keyboard.press('Escape');
  // nothing in the project changed
  expect(await project(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('Explain: clicking Play tells what it is and does not start the game; Help › Ask Brix opens it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Ask Brix/ }).click();
  const brix = page.getByRole('complementary', { name: 'Brix' });
  await expect(brix).toBeVisible();
  await brix.getByRole('button', { name: 'Explain' }).click();
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(brix.locator('.brix-answer').last()).toContainText(/^Play:/);
  expect(await page.evaluate(() => !!(window as unknown as { __editor: Ed }).__editor.session.value)).toBe(false);
  await page.screenshot({ path: 'test-results/brix-explain.png' });
  // a suggested question, answered with a Show me that only points (Play is pressed by you)
  await brix.getByRole('button', { name: 'Close Brix' }).click();
  await expect(brix).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ask Brix' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Meet Brix course: Do it for me asks, shows, finishes the walk-through and explains Play', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Meet Brix course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
  const titles: string[] = [];
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    titles.push(title);
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      await expect(card.getByText(/✓ Done!/), `${pos} ${title}`).toBeVisible({ timeout: 60_000 });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(titles).toEqual([
    'Brix, the helper',
    'Ask a question',
    'Show me',
    'Back to Brix',
    'Explain',
    'What is this?',
    'Brix is always there',
  ]);
  await expect(page.locator('[data-explained]')).toContainText('Play');
  expect(await page.evaluate(() => !!(window as unknown as { __editor: Ed }).__editor.session.value)).toBe(false);
  expect(errors).toEqual([]);
});

test('Brix knows where you are: “this” is the selected object; a change request goes to the AI builder', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  const before = await project(page);
  const name = await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          scene: {
            value: { instances: { def: { name: string }; inst: { name?: string }; bricks: { id: number }[] }[] };
          };
          select(ids: number[]): void;
        };
      }
    ).__editor;
    const i = e.scene.value.instances[0]!;
    e.select(i.bricks.map((b) => b.id));
    return i.inst.name ?? i.def.name;
  });
  await page.getByRole('button', { name: 'Ask Brix' }).click();
  const brix = page.getByRole('complementary', { name: 'Brix' });
  await expect(brix.locator('.brix-where')).toHaveText(`📍 Scene › Inspector · ${name}`);
  // the screen you are on
  await brix.getByRole('button', { name: 'What can I do here?' }).click();
  await expect(brix.locator('.brix-answer').last()).toContainText('You’re in Scene › Inspector');
  await expect(
    brix
      .locator('.brix-answer')
      .last()
      .getByRole('button', { name: /^Show me:/ })
      .first(),
  ).toBeVisible();
  // “this” is the selected object
  const box = brix.getByRole('textbox', { name: 'Ask Brix' });
  await box.fill('how do I make this open with a key?');
  await box.press('Enter');
  const answer = brix.locator('.brix-answer').last();
  await expect(answer).toContainText(`For the placed asset “${name}”`);
  await page.screenshot({ path: 'test-results/brix-context.png' });
  // Brix doesn't build: it hands the request, with what “this” was, to the AI builder for you to send
  await answer.getByRole('button', { name: '✦ Ask the AI builder to do this' }).click();
  const ai = page.getByRole('complementary', { name: 'AI builder' });
  await expect(ai).toBeVisible();
  await expect(ai.getByLabel('Ask the AI builder')).toHaveValue(
    `how do I make this open with a key? (I'm in Scene › Inspector; the placed asset “${name}” is selected or open.)`,
  );
  expect(await project(page)).toBe(before);
  expect(errors).toEqual([]);
});
