import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 3b (B3): built-in behaviours — the Built-in behaviours course with Do it for me (extend Pushable into a
 * crate that sticks after two pushes, and push it in Play); and by hand, a built-in's page in Logic and Extend.
 */
type Ed = { scene: { value: { count: number } | null } };
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

test('Built-in behaviours course: a crate that sticks after two pushes', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Built-in behaviours course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
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
      await page.screenshot({ path: `test-results/builtins-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Hero behaviours course: out of breath after three quick jumps', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hero behaviours course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
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
      await page.screenshot({ path: `test-results/hero-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Swimmer course: a pearl diver with three times the air', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Swimmer course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
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
      await page.screenshot({ path: `test-results/swim-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Make your own brain course: a pop-up that spits three fireballs', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Make your own brain course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
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
      await page.screenshot({ path: `test-results/brain-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Hurt reactions course: a howler a heavy swing knocks flat', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hurt reactions course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
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
      await page.screenshot({ path: `test-results/ouch-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Enemy parts course: Rattlebones flies and spits', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Enemy parts course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
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
      await page.screenshot({ path: `test-results/parts-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('Boss course: the Howler made a boss roars into phase 2', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Boss course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
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
      await page.screenshot({ path: `test-results/boss-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about BossBrain/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('phaseFor');
    if (/Or in the Phases panel/.test(title)) {
      await expect(page.getByRole('group', { name: 'Phase 2' })).toBeVisible();
      await expect(page.getByLabel('Phase 2 Speed (times)')).toHaveValue('1.5');
    }
    if (/Make the Howler a boss/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in PhasedBoss' })).toBeVisible();
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

test('Gloomweaver course: the boss built from the brains reaches phase 2', async ({ page }) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Gloomweaver course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(5);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    // (a step already done, as its phases are when placed: nothing to do)
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 600_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 600_000 });
      await page.screenshot({ path: `test-results/gloom-${String(i).padStart(2, '0')}.png` });
    }
    if (/Its phases/.test(title)) {
      await expect(page.getByRole('group', { name: 'Phase 3' })).toBeVisible();
      await expect(page.getByLabel('Phase 3 Fights as')).toHaveValue('shooter');
    }
    if (/What it does each phase/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in WeakPointBoss' })).toBeVisible();
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

test('Items course: a whistle of your own and a quicker boomerang', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Items course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    // (a step already done, as its phases are when placed: nothing to do)
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/items-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Item/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canUseItem');
    if (/Give them to the hero/.test(title))
      await expect(page.getByRole('group', { name: 'Behaviour Whistle' })).toBeVisible();
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

test('Maps course: a sea chart, a round map in play and a pin', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Maps course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    // (a step already done, as its phases are when placed: nothing to do)
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/maps-${String(i).padStart(2, '0')}.png` });
    }
    if (/Its look/.test(title)) await expect(page.locator('[data-tour="maps-pause"]')).toBeVisible();
    if (/Open it in Play/.test(title)) await expect(page.getByRole('dialog', { name: 'Map' })).toBeVisible();
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

test('Quests course: a quest with steps, the quest log, where to go next, the maps in logic', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Quests course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/quests-${String(i).padStart(2, '0')}.png` });
    }
    if (/The Steps panel/.test(title)) {
      const steps = page.locator('[data-tour="quest-steps"]');
      await expect(steps).toBeVisible();
      await expect(steps.getByRole('group', { name: 'Step 3' })).toBeVisible();
    }
    if (/The quest log/.test(title)) {
      const log = page.getByRole('dialog', { name: 'Quest log' });
      await expect(log).toBeVisible();
      await expect(log.getByText('Find 3 glowcaps')).toBeVisible();
    }
    if (/Where to go next/.test(title)) {
      const map = page.getByRole('dialog', { name: 'Map' });
      await expect(map).toBeVisible();
      await expect(map.getByText('Lost Lamp')).toBeVisible();
      // where to go next: the goal (at the Arrival spawn point) and Treasure Map's camp flag
      const marks = await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: the editor's live Play session
        const s = (window as any).__editor.session.value;
        return s.mapModel().markers.map((m: { kind: string; label?: string }) => `${m.kind}:${m.label ?? ''}`);
      });
      expect(marks).toEqual(expect.arrayContaining(['goal:Go here!', 'pin:Camp']));
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

test('Quests across maps course: the way to a goal on another map, there and back', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Quests across maps course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
  // biome-ignore lint/suspicious/noExplicitAny: the editor's live Play session
  const goal = () =>
    page.evaluate(
      () =>
        (window as any).__editor.session.value?.mapModel().markers.find((m: { kind: string }) => m.kind === 'goal') ??
        null,
    );
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/questmaps-${String(i).padStart(2, '0')}.png` });
    }
    if (/The way there/.test(title)) {
      await page.waitForTimeout(500);
      expect((await goal())?.label).toBe('Find the old well → Old Well Cave');
      await expect(page.locator('[data-widget="quest"]')).toHaveText('◆ Find the old well — in Old Well Cave');
    }
    if (/Through the gate/.test(title)) {
      await page.waitForTimeout(500);
      expect((await goal())?.label).toBe('Find the old well');
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

test('Game rules course: a fairy saves the hero once, game over and back, a map’s own behaviour', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Game rules course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/rules-${String(i).padStart(2, '0')}.png` });
    }
    if (/A map's own behaviour/.test(title)) {
      const sec = page.locator('[data-tour="map-scripts"]');
      await expect(sec).toBeVisible();
      await expect(sec.getByRole('group', { name: 'Map behaviour Map Rules' })).toBeVisible();
    }
    if (/Game over, and back/.test(title)) {
      // biome-ignore lint/suspicious/noExplicitAny: the editor's live Play session
      const hp = await page.evaluate(() => (window as any).__editor.session.value.logic.vars.get('hp'));
      expect(hp).toBe(2);
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

test('HUD styles course: an era’s HUD, the item wheel, the buttons and the HUD in logic', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /HUD styles course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/hud-${String(i).padStart(2, '0')}.png` });
    }
    if (/An era's HUD/.test(title)) {
      const picker = page.locator('[data-tour="hud-styles"]');
      await expect(picker.getByRole('button', { name: /Corner buttons/ })).toHaveAttribute('aria-pressed', 'true');
    }
    if (/Play it/.test(title)) {
      // the era's buttons on the HUD: a B, an A and three yellow item buttons
      const era = page.locator('.bw-layer .bw-era[data-look="corner64"]');
      await expect(era).toBeVisible({ timeout: 30_000 });
      await expect(era.locator(':scope > .bw-era-btn')).toHaveCount(7);
    }
    if (/Hold for the wheel/.test(title))
      await expect(page.locator('.bw-layer .bw-era[data-look="pointer"]')).toBeVisible();
    if (/A new look while playing/.test(title)) {
      await expect(page.locator('.bw-layer .bw-era[data-look="openair"]')).toBeVisible({ timeout: 30_000 });
      // biome-ignore lint/suspicious/noExplicitAny: the editor's live Play session
      const logged = await page.evaluate(() => (window as any).__editor.session.value.events.map((e: any) => e.msg));
      expect(logged.some((m: string) => m.includes('The HUD changed'))).toBe(true);
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

test('Custom HUD course: a HUD style of your own, its faces and places, in Play, in My library', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Custom HUD course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(6);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    await page.waitForTimeout(600);
    if ((await doIt.isVisible()) && !(await card.getByText(/✓ Done!/).isVisible())) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 200_000 });
      await page.screenshot({ path: `test-results/own-${String(i).padStart(2, '0')}.png` });
    }
    if (/A style of your own/.test(title)) {
      const picker = page.locator('[data-tour="hud-styles"]');
      await expect(picker.getByRole('button', { name: 'HUD style Star pad (your own)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('[data-tour="hud-editor"]')).toBeVisible();
      // there is no plain look to pick any more
      await expect(picker.getByRole('button', { name: /Plain/ })).toHaveCount(0);
    }
    if (/A face of your own/.test(title)) await expect(page.getByLabel('Attack letter or shape')).toHaveValue('✕');
    if (/Play with it/.test(title)) {
      const own = page.locator('.bw-layer .bw-era[data-look="custom"]');
      await expect(own).toBeVisible({ timeout: 30_000 });
      await expect(own.locator('[data-button="attack"] .bw-era-face')).toHaveText('✕');
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

test('a HUD style of your own made by hand: + New style, drag a button, change a face, the Look in Screens', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  // biome-ignore lint/suspicious/noExplicitAny: the editor in the page
  await page.evaluate(() => ((window as any).__editor.right.value = 'project'));
  const picker = page.locator('[data-tour="hud-styles"]');
  await picker.scrollIntoViewIfNeeded();
  // a game that has not picked shows Open air as its style
  await expect(picker.getByRole('button', { name: /HUD style Open air/ })).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: /HUD style Big-button cluster/ }).click();
  await picker.getByRole('button', { name: 'New HUD style of your own' }).click();
  const editor = page.locator('[data-tour="hud-editor"]');
  await expect(editor).toBeVisible();
  // its faces came from the cube era
  await expect(page.getByLabel('Action letter or shape')).toHaveValue('A');
  const grip = editor.locator('[data-grip="action"]');
  await grip.scrollIntoViewIfNeeded();
  // biome-ignore lint/suspicious/noExplicitAny: the editor's store
  const at = () =>
    page.evaluate(() => {
      const e = (window as any).__editor;
      const id = e.store.get('settings.json').controls.hud;
      return e.store.get(`hudstyles/${id}.json`).faces.action;
    });
  const before = await at();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  const after = await at();
  expect(after.x).toBeLessThan(before.x - 20);
  expect(after.y).toBeGreaterThan(before.y);
  // a new face: a star, small
  await page.getByLabel('Action letter or shape').fill('★');
  await page.getByLabel('Action letter or shape').press('Enter');
  await page.getByLabel('Action size').selectOption('small');
  await expect.poll(async () => (await at()).glyph).toBe('★');
  await expect.poll(async () => (await at()).size).toBe('small');
  await page.screenshot({ path: 'test-results/own-editor.png' });
  // Undo puts the size back
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await at()).size).toBe('big');
  // in Screens the HUD's buttons widget can wear any look
  await page.locator('[data-tour="ws-screens"]').click();
  // biome-ignore lint/suspicious/noExplicitAny: the editor in the page
  await page.evaluate(() => {
    const e = (window as any).__editor;
    e.screenId.value = 'scr_hud0000000';
  });
  const own = page.locator('.sc-device .bw-era[data-look="custom"]');
  await expect(own).toBeVisible({ timeout: 30_000 });
  await own.click();
  const look = page.getByLabel('Buttons look');
  await expect(look).toBeVisible();
  await look.selectOption('corner64');
  await expect(page.locator('.sc-device .bw-era[data-look="corner64"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/own-screens.png' });
  expect(errors).toEqual([]);
});

test('World built-ins course: a rock that takes three tries to lift', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /World built-ins course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
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
      await page.screenshot({ path: `test-results/world-${String(i).padStart(2, '0')}.png` });
    }
    if (/Read about Pushable/.test(title))
      await expect(page.locator('[data-tour="builtin-page"]')).toContainText('canPush');
    if (/A built-in's field/.test(title))
      await expect(page.getByRole('group', { name: 'Built-in Pushable' })).toBeVisible();
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

test('a built-in page in Logic, and Extend makes a behaviour of your own on it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="ws-logic"]').click();
  await page.getByRole('button', { name: 'Built-in Lock' }).click();
  const pg = page.locator('[data-tour="builtin-page"]');
  await expect(pg).toContainText('canOpen(e)');
  await expect(pg).toContainText('Opens with');
  await page.screenshot({ path: 'test-results/builtin-page.png' });
  await page.locator('[data-tour="builtin-extend"]').click();
  await expect(page.locator('.lg-code')).toContainText('extends Lock', { timeout: 30_000 });
  await expect(page.locator('.lg-code')).toContainText('super.canOpen(e)');
  await page.screenshot({ path: 'test-results/builtin-extended.png' });
  const made = await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          store: { list(p: string): string[]; get(p: string): { name: string; behaviour?: { extends?: string } } };
        };
      }
    ).__editor;
    return e.store
      .list('logic/')
      .map((p) => e.store.get(p))
      .find((g) => g.behaviour?.extends === 'Lock')?.name;
  });
  expect(made).toBe('My Lock');
  expect(errors).toEqual([]);
});
