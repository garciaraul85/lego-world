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
  // …it waits while you look at the result; My turn puts everything back and it is your turn
  await card.getByRole('button', { name: 'My turn ▶' }).click();
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 60_000 });
  expect(await get(page, (e) => e.scene.value!.count)).toBe(before);
  // the user repeats it (Do it for me stands in for the clicks) and the step completes
  await card.getByRole('button', { name: 'Do it for me' }).click();
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 60_000 });
  // nothing moves on by itself: the step waits for Next
  const pos = await card.locator('header .mono').innerText();
  await page.waitForTimeout(2500);
  await expect(card.locator('header .mono')).toHaveText(pos);
  await card.getByRole('button', { name: 'Next ▶' }).click();
  await expect(card.locator('header .mono')).not.toHaveText(pos);
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
      await expect(card.getByText(/✓ Done!/), `step ${pos} ${title}`).toBeVisible({ timeout: 60_000 });
      if (pos.startsWith(`${total}/`)) break;
      await card.getByRole('button', { name: 'Next ▶' }).click();
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

test('Tutorial: the Interactions step says click by click where to click, and Show me clicks there', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  for (let i = 0; i < 30 && !(await card.getByRole('heading', { name: 'Interactions' }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  // the card lists every click: where it is and what it does
  const how = card.getByRole('list', { name: 'Click by click' });
  await expect(how.getByRole('listitem')).toHaveCount(5);
  await expect(how).toContainText('+ Action');
  await expect(how).toContainText('Give item');
  const props = page.getByRole('region', { name: 'Asset properties' });
  const gives = () =>
    props
      .locator('select[aria-label="Action"]')
      .evaluateAll((s) => s.filter((x) => (x as HTMLSelectElement).value === 'give').length);
  const before = await gives();

  // Show me: the pointer and the spotlight go to + Action, then to the new row's Action list
  await card.getByRole('button', { name: /Show me/ }).click();
  await expect(card.locator('.tut-note')).toContainText('+ Action', { timeout: 30_000 });
  await expect(how.locator('li.on')).toContainText('+ Action');
  await expect(card.locator('.tut-note')).toContainText('Give item', { timeout: 30_000 });
  await expect(how.locator('li.on')).toContainText('Give item');
  await expect(card.getByRole('button', { name: 'My turn ▶' })).toBeVisible({ timeout: 30_000 });
  expect(await gives()).toBe(before + 1);
  await card.getByRole('button', { name: 'My turn ▶' }).click();
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 30_000 });
  expect(await gives()).toBe(before);

  // the same clicks by hand complete the step
  const inter = page.locator('[data-tour="asset-interactions"] .interaction').first();
  await inter.getByRole('button', { name: '+ Action' }).click();
  await inter.locator('.action-row').last().getByLabel('Action', { exact: true }).selectOption('give');
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Tutorial: a step with click-by-click lines is checked one line at a time (Animate the clip)', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  // through the Characters chapter to the animate step (the earlier character steps done for us)
  for (let i = 0; i < 40 && !(await card.getByRole('heading', { name: 'Animate the clip' }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    if (/New character|Change the look|player character|Animation clips/i.test(title)) {
      await card.getByRole('button', { name: 'Do it for me' }).click();
      await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 60_000 });
    }
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  const how = card.getByRole('list', { name: 'Click by click' });
  const ticked = () => how.locator('li.done').count();
  // line 1 (the clip is open) passes at once; the step is not done
  await expect.poll(ticked).toBe(1);
  await expect(card.getByText(/✓ Done!/)).toHaveCount(0);
  await expect(how.locator('li.on')).toContainText('+ Track');
  // 2: + Track… › Right arm · z
  await page
    .getByRole('toolbar', { name: 'Timeline tools' })
    .getByLabel('Add a track')
    .selectOption({ label: 'Right arm · z' });
  await expect.poll(ticked).toBe(2);
  await expect(card.getByText(/✓ Done!/)).toHaveCount(0);
  // 3: click the lanes halfway (1.00 s)
  const lanes = page.locator('.tl-lanes');
  const box = (await lanes.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 6);
  await expect.poll(ticked).toBe(3);
  // 4: ◆ Key
  await page.getByRole('button', { name: '◆ Key' }).click();
  await expect.poll(ticked).toBe(4);
  // 5: the new key's value 2.6
  await page
    .getByRole('button', { name: /^Key Right arm · z at (?!0\.00)/ })
    .last()
    .click();
  const value = page.locator('.tl-foot').getByLabel('value');
  await value.fill('2.6');
  await value.press('Enter');
  await expect.poll(ticked).toBe(5);
  await expect(card.getByText(/✓ Done!/)).toHaveCount(0);
  // 6: Play
  const studio = page.locator('.char-studio');
  const play = studio.getByRole('button', { name: 'Play', exact: true });
  if (await play.isVisible()) await play.click();
  else {
    await studio.getByRole('button', { name: 'Pause', exact: true }).click();
    await studio.getByRole('button', { name: 'Play', exact: true }).click();
  }
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('Tutorial: Show me and Do it for me run a scripted step line by line, verifying each line', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  for (let i = 0; i < 40 && !(await card.getByRole('heading', { name: 'Animate the clip' }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    if (/New character|Change the look|player character|Animation clips/i.test(title)) {
      await card.getByRole('button', { name: 'Do it for me' }).click();
      await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 60_000 });
    }
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  const how = card.getByRole('list', { name: 'Click by click' });
  const lines = await how.getByRole('listitem').count();
  expect(lines).toBe(6);

  // Show me: the pointer walks the lines in order; each is ticked once its check passes
  await card.getByRole('button', { name: /Show me/ }).click();
  await expect(how.locator('li.on')).toContainText('+ Track', { timeout: 30_000 });
  await expect(card.locator('.tut-note')).toContainText(/Track/);
  await expect(how.locator('li.on')).toContainText('◆ Key', { timeout: 30_000 });
  await expect(card.getByRole('button', { name: 'My turn ▶' })).toBeVisible({ timeout: 60_000 });
  expect(await how.locator('li.done').count()).toBe(lines);
  await card.getByRole('button', { name: 'My turn ▶' }).click();
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 30_000 });
  // the demo is taken back: only the first line (the clip is open) still holds
  await expect.poll(() => how.locator('li.done').count()).toBe(1);

  // Do it for me: same lines, Next stays off until every line is verified
  await card.getByRole('button', { name: 'Do it for me' }).click();
  await expect(card.getByRole('button', { name: /Next ▶|Skip ▶▶/ })).toBeDisabled();
  // Done comes only after every line's check passed (a failed one stops the run on that line)
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 60_000 });
  const labels = await get(page, (e) => e.bus.history().map((h) => h.label));
  for (const l of ['Add track', 'Add key', 'Key value']) expect(labels).toContain(l);
  const track = await page.evaluate(() => {
    const e = (window as unknown as { __editor: { studioClip: { value: string | null } } }).__editor;
    return e.studioClip.value;
  });
  expect(track).toBeTruthy();
  expect(errors).toEqual([]);
});
