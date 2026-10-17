import { expect, type Locator, type Page, test } from '@playwright/test';

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

/** Do it for me, then Do the rest when it stops after a line (it waits for Continue so you can look). */
async function doItForMe(card: Locator, timeout = 180_000, what = '') {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

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
  await doItForMe(card, 60_000);
  // nothing moves on by itself: the step waits for Next
  const pos = await card.locator('header .mono').innerText();
  await page.waitForTimeout(2500);
  await expect(card.locator('header .mono')).toHaveText(pos);
  await card.getByRole('button', { name: 'Next ▶' }).click();
  await expect(card.locator('header .mono')).not.toHaveText(pos);
  expect(errors).toEqual([]);
});

test('Tutorial (I try first): Do it for me through every step builds a playable two-map game', async ({ page }) => {
  // the story chapters script dozens of clicks on a generated two-map world
  test.setTimeout(1_800_000);
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
      await doItForMe(card, 180_000, `step ${pos} ${title}`);
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

/** Goes to the step titled `title`, letting Do it for me do the steps of its chapter before it. */
async function toStep(page: Page, card: Locator, title: string, chapter: RegExp) {
  for (let i = 0; i < 60 && !(await card.getByRole('heading', { name: title }).isVisible()); i++) {
    const pos = await card.locator('header .mono').innerText();
    const chap = await card.locator('.tut-chapter').innerText();
    if (chapter.test(chap)) {
      await doItForMe(card, 60_000);
    }
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos);
  }
  void page;
}

test('Tutorial: a step with click-by-click lines is checked one line at a time (Animate: reach and lift)', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  // through the Characters chapter to the animate step (the earlier character steps done for us)
  await toStep(page, card, 'Animate: reach and lift', /^Characters/);
  const how = card.getByRole('list', { name: 'Click by click' });
  const ticked = () => how.locator('li.done').count();
  await expect(how.getByRole('listitem')).toHaveCount(9);
  await expect.poll(ticked).toBe(0);
  await expect(how.locator('li.on')).toContainText('+ Track');
  const tools = page.getByRole('toolbar', { name: 'Timeline tools' });
  const lanes = page.locator('.tl-lanes');
  const at = async (t: number) => {
    const box = (await lanes.boundingBox())!;
    await page.mouse.click(box.x + (box.width * t) / 1.6, box.y + box.height - 6);
  };
  const typeValue = async (v: string) => {
    const value = page.locator('[data-tour="key-value"]');
    await value.click();
    await value.press('Control+a');
    await page.keyboard.type(v, { delay: 40 });
    await page.keyboard.press('Enter');
  };
  // 1: + Track… › Right arm · x
  // (a picture per track: the character with that joint moved)
  await tools.locator('[data-tour="pick-track"]').click();
  await page.locator('[data-tour="pick-track-list"] [data-value="rightArm.x"]').click();
  await expect.poll(ticked).toBe(1);
  await expect(card.getByText(/✓ Done!/)).toHaveCount(0);
  // 2–4: the playhead at 0.5 s, ◆ Key (selects it), value −1.3
  await at(0.5);
  await expect.poll(ticked).toBe(2);
  await tools.getByRole('button', { name: '◆ Key' }).click();
  await expect.poll(ticked).toBe(3);
  await typeValue('-1.3');
  await expect.poll(ticked).toBe(4);
  // 5–7: 1.1 s, ◆ Key, −2.4
  await at(1.1);
  await expect.poll(ticked).toBe(5);
  await tools.getByRole('button', { name: '◆ Key' }).click();
  await expect.poll(ticked).toBe(6);
  await typeValue('-2.4');
  await expect.poll(ticked).toBe(7);
  await expect(card.getByText(/✓ Done!/)).toHaveCount(0);
  // 8: ⇆ Mirror
  await tools.getByRole('button', { name: '⇆ Mirror' }).click();
  await expect.poll(ticked).toBe(8);
  // 9: Play
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
  await toStep(page, card, 'Animate: reach and lift', /^Characters/);
  const how = card.getByRole('list', { name: 'Click by click' });
  const lines = await how.getByRole('listitem').count();
  expect(lines).toBe(9);

  // Show me: the pointer walks the lines in order; each is ticked once its check passes
  await card.getByRole('button', { name: /Show me/ }).click();
  await expect(how.locator('li.on')).toContainText('+ Track', { timeout: 30_000 });
  await expect(card.locator('.tut-note')).toContainText(/Track/);
  await expect(how.locator('li.on')).toContainText('Mirror', { timeout: 60_000 });
  await expect(card.getByRole('button', { name: 'My turn ▶' })).toBeVisible({ timeout: 60_000 });
  expect(await how.locator('li.done').count()).toBe(lines);
  await card.getByRole('button', { name: 'My turn ▶' }).click();
  await expect(card.getByText(/Your turn/).first()).toBeVisible({ timeout: 30_000 });
  // the demo is taken back: no line holds any more
  await expect.poll(() => how.locator('li.done').count()).toBe(0);

  // Do it for me: same lines, Next stays off until every line is verified
  await card.getByRole('button', { name: 'Do it for me' }).click();
  await expect(card.getByRole('button', { name: /^(Next ▶|Skip ▶▶)$/ })).toBeDisabled();
  // it stops after each line so you can see what it did: Continue does the next one
  const cont = card.getByRole('button', { name: 'Continue ▶' });
  await expect(cont).toBeVisible({ timeout: 30_000 });
  await expect(how.locator('li.done')).toHaveCount(1);
  await expect(card.locator('.tut-note')).toContainText('Done: line 1');
  await page.waitForTimeout(1500);
  await expect(how.locator('li.done')).toHaveCount(1);
  await cont.click();
  await expect(how.locator('li.done')).toHaveCount(2, { timeout: 30_000 });
  await expect(cont).toBeVisible();
  // Do the rest finishes without stopping; Done comes only after every line's check passed
  await card.getByRole('button', { name: 'Do the rest ▶▶' }).click();
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 90_000 });
  const labels = await get(page, (e) => e.bus.history().map((h) => h.label));
  for (const l of ['Add track', 'Add key', 'Key value', 'Mirror track']) expect(labels).toContain(l);
  expect(errors).toEqual([]);
});

test('Tutorial: the chest story — Do it for me through Characters, Logic and Cinematics opens the chest in play', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  await toStep(page, card, 'Watch it', /^(Characters|Logic|Screens|Cinematics)/);
  // the scene, the graph and the clips the story made
  const story = await get(page, (e) => {
    const all = (p: string) => e.store.list(p).map((x) => e.store.get(x) as Record<string, unknown>);
    return {
      clips: all('clips/').map((c) => c.name),
      graphs: all('logic/lg_').map((g) => g.name),
      scenes: all('cinematics/').map((c) => c.name),
    };
  });
  expect(story.clips).toEqual(expect.arrayContaining(['Open chest', 'Hold it up']));
  expect(story.graphs).toContain('Treasure chest');
  expect(story.scenes).toContain('Treasure chest');
  // Watch it: the game plays the scene; logic opens the chest and the sword rises out of it
  await card.getByRole('button', { name: 'Do it for me' }).click();
  // (it stops after the first line: Do the rest plays the scene)
  await card.getByRole('button', { name: 'Do the rest ▶▶' }).click({ timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const s = (window as unknown as { __editor: { session: { value: unknown } } }).__editor.session.value as {
        world: { instances: { def: { name: string }; state: string }[] };
      } | null;
      return !!s?.world.instances.some((i) => i.def.name === 'Sword' && i.state === 'out');
    },
    undefined,
    { timeout: 60_000 },
  );
  const chest = await page.evaluate(() => {
    const s = (window as unknown as { __editor: { session: { value: unknown } } }).__editor.session.value as {
      world: { instances: { def: { name: string }; state: string }[] };
    };
    return s.world.instances.find((i) => i.def.name === 'Treasure chest')?.state;
  });
  expect(chest).toBe('open');
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('Tutorial: the mark step names the exact numbers; typing them by hand passes it', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = await startTutorial(page, 'try');
  await toStep(page, card, 'A mark at the chest', /^Cinematics/);
  const how = card.getByRole('list', { name: 'Click by click' });
  // the card says where: X, Z and Facing as numbers (no {{tokens}} left), and the stage draws the ring
  const text = await how.innerText();
  expect(text).not.toContain('{{');
  const x = /type (-?[\d.]+) in X/.exec(text)?.[1];
  const z = /then (-?[\d.]+) in Z/.exec(text)?.[1];
  const facing = /“Facing \(°\)” type (-?[\d.]+)/.exec(text)?.[1];
  expect(x && z && facing).toBeTruthy();
  const spot = page.locator('.dr-spot');
  await expect(spot).toContainText(`x ${x}, z ${z}`);
  await expect(spot).not.toContainText('✓');
  // by hand, as the lines say
  await page.locator('[data-tour="mark-mark1"]').click();
  await expect(how.locator('li.done')).toHaveCount(1);
  const props = page.getByRole('region', { name: 'Item properties' });
  for (const [box, v] of [
    ['Position X', x],
    ['Position Z', z],
  ] as const) {
    const el = props.getByLabel(box, { exact: true });
    await el.fill(v!);
    await el.press('Enter');
  }
  await expect(spot).toContainText('✓ a mark is in the ring');
  await expect(how.locator('li.done')).toHaveCount(2);
  const f = props.getByLabel('Facing (°)', { exact: true });
  await f.fill(facing!);
  await f.press('Enter');
  await expect(card.getByText(/✓ Done!/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/mark-step.png' });
  expect(errors).toEqual([]);
});
