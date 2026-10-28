import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11b part 1: the game's buttons. The Action button shows and does what fits (Open at a chest), an item is put
 * in an item button from the Items screen and its key uses it (logic: On item used), Ocarina has no jump key, and
 * Project › Controls changes a key.
 */
type S = {
  runtime: { ticks: number };
  buttons: { now: { kind: string; label: string } | null; slots: (string | null)[] };
  prompt: unknown;
  placeAt(p: number[], h: number): void;
  give?: unknown;
  inventory: Map<string, number>;
  events: { kind: string; msg: string }[];
  heroState: { x: number; y: number; z: number; vy: number };
  screens: { top(): { id: string } | undefined };
};
type Ed = {
  scene: { value: { count: number } | null };
  store: { get(p: string): unknown; list(p: string): string[]; manifest: { entry: { map: string } } };
  exec(c: unknown): { ok: boolean; error?: string };
  session: { value: S | null };
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
const ses = <T>(page: Page, f: (s: S) => T) =>
  page.evaluate(`(${f.toString()})(window.__editor.session.value)`) as Promise<T>;

async function play(page: Page) {
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 10,
    undefined,
    { timeout: 180_000 },
  );
  await page.getByLabel('Game view').click();
}

test('the Action button opens a chest; an item button uses its item; Ocarina has no jump key', async ({ page }) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  // a chest beside the start
  const placed = await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: { id: string; name: string }[] };
    const e = w.__editor;
    const map = e.store.manifest.entry.map;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    const def = w.__builtinAssets.find((a) => a.name === 'Treasure chest')!;
    const r = e.exec([
      { type: 'asset.create', payload: { asset: def } },
      {
        type: 'asset.place',
        payload: { map, asset: def.id, pos: [Math.round(sp[0]!) + 3, Math.round(sp[1]! / 0.4), Math.round(sp[2]!)] },
      },
    ]);
    return r.ok ? { sp } : { err: r.error };
  });
  expect(placed.err).toBeUndefined();
  await play(page);
  // walk up to the chest: the Action button says what it does, and E does it
  const sp = placed.sp!;
  // in front of the chest's lid (its interaction point)
  await page.evaluate((sp) => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value as unknown as {
      world: { instances: { def: { name: string }; sockets: { kind: string; world: number[] }[] }[] };
      placeAt(p: number[], h: number): void;
    };
    const inst = s.world.instances.find((i) => i.def.name === 'Treasure chest')!;
    const so = inst.sockets.find((x) => x.kind === 'interact')!;
    s.placeAt([so.world[0]!, sp[1]!, so.world[2]! + 0.9], Math.PI);
  }, placed.sp!);
  await expect.poll(() => ses(page, (s) => (s.buttons.now?.kind === 'use' ? s.buttons.now.label : ''))).not.toBe('');
  const label = await ses(page, (s) => s.buttons.now!.label);
  expect(label).not.toBe('');
  await expect(page.locator('.bw-buttons [data-button="action"] .bw-btn-label')).toHaveText(label);
  await page.screenshot({ path: 'test-results/controls-action.png' });
  await page.keyboard.press('e');
  await expect.poll(() => ses(page, (s) => s.events.some((x) => /Treasure chest/.test(x.msg)))).toBe(true);

  // an item put in an item button from the Items screen, used with its key
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    s.inventory.set('Bow', 3);
  });
  await page.keyboard.press('i');
  const items = page.locator('.bw-items');
  await expect(items).toBeVisible();
  await page.screenshot({ path: 'test-results/controls-items.png' });
  await items.getByRole('button', { name: /Put Bow in item button 1/ }).click();
  expect(await ses(page, (s) => s.buttons.slots[0])).toBe('Bow');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByLabel('Game view').click();
  await page.keyboard.press('j');
  await expect.poll(() => ses(page, (s) => s.events.some((x) => /Item 1: Bow/.test(x.msg)))).toBe(true);
  await page.keyboard.press('F5');

  // Ocarina: the layout has no Jump button, so Space does nothing (nothing near to do)
  await page.locator('[data-tour="ws-scene"]').click();
  await page.evaluate(() =>
    (window as unknown as { __editor: Ed }).__editor.exec({
      type: 'project.update',
      payload: { controls: { layout: 'ocarina' } },
    }),
  );
  await play(page);
  await page.evaluate(
    ({ sp }) => {
      const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
      s.placeAt([Math.round(sp[0]!) - 6, sp[1]!, Math.round(sp[2]!) - 6], 0);
    },
    { sp },
  );
  await page.waitForTimeout(500);
  await page.keyboard.press(' ');
  await page.waitForTimeout(120);
  expect(await ses(page, (s) => s.heroState.vy)).toBeLessThanOrEqual(0.01);
  await expect(page.locator('.bw-buttons [data-button="item3"]')).toHaveCount(1);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Project › Controls changes a key; the player’s Controls screen changes theirs', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="ws-scene"]').click();
  await page.locator('[data-tour="tab-project"]').click();
  const sec = page.locator('[data-tour="project-controls"]');
  await sec.scrollIntoViewIfNeeded();
  await sec.getByLabel('Button layout').selectOption('classic');
  await sec.locator('[data-tour="controls-key-item1"]').click();
  await expect(sec.locator('[data-tour="controls-key-item1"]')).toHaveText('Press a key…');
  await page.keyboard.press('g');
  await expect(sec.locator('[data-tour="controls-key-item1"]')).toHaveText('G');
  const saved = await page.evaluate(
    () =>
      (window as unknown as { __editor: Ed }).__editor.store.get('.editor/settings.json') ??
      (window as unknown as { __editor: Ed }).__editor.store.get('settings.json'),
  );
  expect(JSON.stringify(saved)).toContain('"item1":["g"]');
  await page.screenshot({ path: 'test-results/controls-project.png' });
  await play(page);
  // the player's own: Settings › Controls, click Attack, press V
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value as unknown as {
      screenOp(op: string, id: string, r: boolean): void;
    };
    s.screenOp('show', 'scr_controls00', false);
  });
  const list = page.locator('.bw-controls');
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: /^Attack:/ }).click();
  await expect(list.getByText('Press a key…')).toBeVisible();
  await page.keyboard.press('v');
  await expect(list.getByRole('button', { name: /^Attack: V/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/controls-player.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('swimming: afloat in a pool, E dives (held), the view turns blue and Air shows; Swim and Tread', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  // a pool beside the start (16 × 16, 6 deep)
  const sp = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    const r = e.exec({
      type: 'item.add',
      payload: {
        map,
        item: {
          id: 'ins_swimpool01',
          kind: 'water',
          name: 'Pool',
          pos: [Math.round(sp[0]!) + 4, sp[1]! - 1, Math.round(sp[2]!) - 8],
          size: [16, 6, 16],
          body: 'pool',
        },
      },
    });
    if (!r.ok) throw new Error(r.error);
    return sp;
  });
  await play(page);
  await page.evaluate((sp) => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    s.placeAt([Math.round(sp[0]!) + 12, sp[1]! + 2, Math.round(sp[2]!)], 0);
  }, sp);
  type W = S & { swim: { on: boolean; under: boolean }; heroStates: { state: string } };
  await expect.poll(() => ses(page, (s) => (s as W).swim.on), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => ses(page, (s) => s.buttons.now?.label), { timeout: 30_000 }).toBe('Dive');
  await expect(page.locator('.bw-buttons [data-button="action"] .bw-btn-label')).toHaveText('Dive');
  // swim forward: the crawl
  await page.keyboard.down('w');
  await expect.poll(() => ses(page, (s) => (s as W).heroStates.state)).toBe('swim');
  await page.screenshot({ path: 'test-results/swim-surface.png' });
  await page.keyboard.up('w');
  // hold E: down under the surface
  await page.keyboard.down('e');
  await expect.poll(() => ses(page, (s) => (s as W).swim.under), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(800);
  await expect(page.locator('[data-widget="air"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/swim-under.png' });
  await page.keyboard.up('e');
  await expect.poll(() => ses(page, (s) => (s as W).swim.under), { timeout: 90_000 }).toBe(false);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Swimming course: Do it for me makes a pool, sinks a chest, sets the breath, dives and opens it', async ({
  page,
}) => {
  test.setTimeout(500_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Swimming course/ }).click();
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
      if (/Dive/.test(title)) await page.screenshot({ path: 'test-results/swim-course-dive.png' });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  const sw = await page.evaluate(
    () =>
      (
        (window as unknown as { __editor: Ed }).__editor.store.get('settings.json') as {
          swimming?: { breath: number };
        }
      )?.swimming,
  );
  expect(sw?.breath).toBe(30);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
