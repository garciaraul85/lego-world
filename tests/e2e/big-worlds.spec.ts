import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 3: big worlds — a million-brick map made and opened in the editor (timed), the Big worlds section,
 * chunk streaming in the view, a big map played with a window that follows the hero, and the Big worlds course.
 */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  right: { value: string };
  exec: (c: unknown, o?: unknown) => { ok: boolean; error?: string };
  store: { get(p: string): unknown };
  openMap(id: string): void;
  session: {
    value: {
      world: { big: boolean; windowAt: string | null; pieces: unknown[]; controller: { pieces: unknown[] } };
      placeAt(p: number[], h: number): void;
    } | null;
  };
};
const ed = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor !== undefined);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  expect(await ed(page)).toBe(true);
}

test('a million-brick map opens quickly, streams its chunks, and plays around the hero', async ({ page }) => {
  test.setTimeout(720_000);
  const errors: string[] = [];
  await open(page, errors);
  // 950,000 bricks in one step
  const made = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const a = performance.now();
    const r = e.exec({
      type: 'map.create',
      payload: { id: 'map_bigbigbig1', name: 'Big land', land: { size: 2048, seed: 7 } },
    });
    const ms = performance.now() - a;
    e.openMap('map_bigbigbig1');
    e.right.value = 'map';
    return { ok: r.ok, ms, count: e.scene.value?.count ?? 0, opened: performance.now() - a };
  });
  expect(made.ok).toBe(true);
  expect(made.count).toBe(950_000);
  expect(made.ms).toBeLessThan(20_000);
  expect(made.opened).toBeLessThan(40_000);
  // the Big worlds section and the view's counter: a streamed map, a few chunks loaded around the start
  const big = page.locator('[data-tour="map-big"]');
  await big.scrollIntoViewIfNeeded();
  await expect(big).toContainText('950,000 / 1,000,000');
  await expect(big).toContainText('big map (streamed)');
  await expect(big).toContainText('Play in v68 can’t load this map');
  const hud = page.locator('.vp-hud').first();
  await expect(hud).toContainText(/\/4096 chunks · \d+ loaded/, { timeout: 60_000 });
  const loaded = async () => Number(/(\d+) loaded/.exec(await hud.innerText())?.[1] ?? 0);
  await expect.poll(loaded, { timeout: 120_000 }).toBeGreaterThan(30);
  expect(await loaded()).toBeLessThan(400);
  // how far you see: one undo step on the map
  await page.locator('[data-tour="view-distance"]').fill('384');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (e.store.get(`maps/${e.mapId.value}/map.json`) as { viewDistance?: number }).viewDistance;
      }),
    )
    .toBe(384);
  // a brick placed on the clearing is quick (the rules check only around it)
  const placed = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const a = performance.now();
    const r = e.exec({
      type: 'bricks.place',
      payload: { map: e.mapId.value, bricks: [{ type: 'brick2x2', x: 6, y: 1, z: 6, rot: 0, color: '#d20c20' }] },
    });
    return { ok: r.ok, ms: performance.now() - a };
  });
  expect(placed.ok).toBe(true);
  expect(placed.ms).toBeLessThan(5_000);
  // Play in v68 is refused for a map this big; ▶ Play plays it
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({ type: 'project.update', payload: { entryMap: 'map_bigbigbig1' } });
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.getByRole('button', { name: 'Play in v68' }).click();
  // the refusal is told (a toast, and the Console keeps it: a later message can replace the toast)
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __editor: { logs: { value: { msg: string }[] } } }).__editor.logs.value
            .map((l) => l.msg)
            .join('\n'),
        ),
      { timeout: 60_000 },
    )
    .toMatch(/more than 12,000 pieces, which v68 cannot load/);
  await expect(page.locator('iframe[title="LEGO World v68"]')).toHaveCount(0);
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 120_000 });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value?.world.big), {
      timeout: 120_000,
    })
    .toBe(true);
  const w = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    return { all: s.world.pieces.length, near: s.world.controller.pieces.length, at: s.world.windowAt };
  });
  expect(w.all).toBe(950_001);
  expect(w.near).toBeLessThan(60_000);
  expect(w.at).toBe('0_0');
  // the window follows the hero
  await page.evaluate(() =>
    (window as unknown as { __editor: Ed }).__editor.session.value!.placeAt([300.5, 60, 0.5], 0),
  );
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.world.windowAt), {
      timeout: 60_000,
    })
    .toBe('9_0');
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('many objects: Scatter places a forest as one undo step; a big asset library shows a page at a time', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({
      type: 'map.create',
      payload: { id: 'map_forestland', name: 'Forest land', land: { size: 256, seed: 5 } },
    });
    e.openMap('map_forestland');
    e.right.value = 'map';
  });
  const count = () =>
    page.evaluate(
      () =>
        (
          (window as unknown as { __editor: Ed }).__editor.store.get('maps/map_forestland/instances.json') as {
            items: { kind: string }[];
          }
        ).items.filter((i) => i.kind === 'asset').length,
    );
  const sec = page.locator('[data-tour="map-big"]');
  await sec.scrollIntoViewIfNeeded();
  await expect(page.locator('[data-tour="scatter-go"]')).toBeDisabled();
  await page.locator('[data-tour="pick-scatter-asset"]').click();
  await page.locator('[data-tour="pick-scatter-asset-list"] [data-name="Birch tree"]').click();
  await page.locator('[data-tour="scatter-count"]').fill('100');
  await page.locator('[data-tour="scatter-go"]').click();
  await expect.poll(count, { timeout: 60_000 }).toBeGreaterThan(10);
  const n = await count();
  expect(n).toBeLessThanOrEqual(100);
  await expect(page.locator('[data-tour="map-assets"]')).toContainText(`${n} / 10,000`);
  // one undo takes the forest away (the Birch tree stays in the project)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect.poll(count).toBe(0);
  // a library of 200 more assets: the Dock shows 120 and more on request
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed & { store: { list(p: string): string[] } } }).__editor;
    const tree = e.store.list('assets/').map((p) => e.store.get(p) as { id: string; name: string })[0]!;
    const cmds = Array.from({ length: 200 }, (_, i) => ({
      type: 'asset.create',
      payload: { asset: { ...tree, id: `ast_many${String(i).padStart(6, '0')}`, name: `Copy ${i}`, origin: 'user' } },
    }));
    e.exec(cmds);
  });
  const cards = page.getByRole('listbox', { name: 'Assets' }).getByRole('option');
  await expect(cards).toHaveCount(120);
  const more = page.locator('[data-tour="dock-more"]');
  await expect(more).toContainText(/Show \d+ more\s*120 of \d+/);
  const total = Number(/of (\d+)/.exec(await more.innerText())![1]);
  expect(total).toBeGreaterThan(200);
  await more.click();
  await expect(cards).toHaveCount(Math.min(240, total));
  // searching narrows it
  await page.getByRole('searchbox', { name: 'Search assets' }).fill('Copy 199');
  await expect(cards).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('many maps: 300 maps in a project, found by typing; a trip in Play goes through the loading screen', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  const made = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const a = performance.now();
    const cmds = Array.from({ length: 299 }, (_, i) => ({
      type: 'map.create',
      payload: { id: `map_m${String(i + 1).padStart(9, '0')}`, name: `Island ${i + 1}` },
    }));
    const r = e.exec(cmds);
    const r2 = e.exec({
      type: 'map.create',
      payload: { id: 'map_bigbigbig1', name: 'Big land', land: { size: 512, seed: 3 } },
    });
    return { ok: r.ok && r2.ok, ms: performance.now() - a };
  });
  expect(made.ok).toBe(true);
  // the Map list finds one by typing
  const mapSel = page.locator('[data-tour="map-select"]');
  await mapSel.getByRole('button', { name: /Search maps/ }).click();
  await mapSel.getByRole('searchbox').fill('Island 250');
  await mapSel.getByRole('searchbox').press('Enter');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.mapId.value))
    .toBe('map_m000000250');
  // the World graph draws them all
  const t0 = Date.now();
  await page.getByRole('button', { name: 'World graph', exact: true }).first().click();
  await expect(page.getByRole('button', { name: /Map Island 299/ })).toBeVisible({ timeout: 120_000 });
  expect(Date.now() - t0).toBeLessThan(60_000);
  // Play, then a trip to the big land: the loading screen shows its name and progress, then the hero arrives
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.openMap(
      e.store.get('project.json') ? (e.store.get('world/gates.json') as { mapOrder: string[] }).mapOrder[0]! : '',
    );
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.getByRole('button', { name: 'Scene', exact: true }).first().click();
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 120_000 });
  await page.evaluate(() =>
    (
      window as unknown as { __editor: { session: { value: { goTo(m: string, s: string): void } } } }
    ).__editor.session.value.goTo('map_bigbigbig1', ''),
  );
  const loading = page.locator('[data-tour="loading-screen"]');
  await expect(loading).toBeVisible({ timeout: 30_000 });
  // name and progress are drawn together (the load can finish soon after)
  const shown = await loading.innerHTML().catch(() => '');
  if (shown) {
    expect(shown).toContain('Big land');
    expect(shown).toContain('role="progressbar"');
  }
  await expect(loading).toBeHidden({ timeout: 120_000 });
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __editor: { session: { value: { world: { mapId: string } } } } }).__editor.session.value
          .world.mapId,
    ),
  ).toBe('map_bigbigbig1');
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Big worlds course: Do it for me makes big land, sets how far you see and plays it', async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Big worlds course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(10);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 180_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 180_000 });
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

test('a full big land: Scatter fills it to the brick budget with no errors, says so, and it all survives a reload and Play', async ({
  page,
}) => {
  test.setTimeout(1_500_000);
  const errors: string[] = [];
  await open(page, errors);
  type Full = Ed & {
    toast: {
      value: { msg: string; error: boolean } | null;
      subscribe(f: (v: { msg: string; error: boolean } | null) => void): () => void;
    };
    problems: { value: { message: string }[] };
    autosave: { flush(): Promise<void>; status: { state: string; error?: string } };
    maps: { value: { id: string; name: string }[] };
  };
  // New big land, 2048 × 2048, from the Big worlds section
  await page.evaluate(() => {
    (window as unknown as { __editor: Ed }).__editor.right.value = 'map';
  });
  const sec = page.locator('[data-tour="map-big"]');
  await sec.scrollIntoViewIfNeeded();
  await page.locator('[data-tour="land-size"]').selectOption('2048');
  await page.locator('[data-tour="land-make"]').click();
  await expect(page.locator('[data-tour="map-bricks"]')).toContainText(/9\d\d,\d{3} \/ 1,000,000/, {
    timeout: 300_000,
  });
  const mapId = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.mapId.value);
  const assets = () =>
    page.evaluate(
      (m) =>
        (
          (
            (window as unknown as { __editor: Ed }).__editor.store.get(`maps/${m}/instances.json`) as {
              items: { kind: string }[];
            } | null
          )?.items ?? []
        ).filter((i) => i.kind === 'asset').length,
      mapId,
    );
  // every message the editor shows, kept (a message hides after a few seconds)
  await page.evaluate(() => {
    const w = window as unknown as { __editor: Full; __toasts: { msg: string; error: boolean }[] };
    w.__toasts = [];
    w.__editor.toast.subscribe((v) => {
      if (v) w.__toasts.push(v);
    });
  });
  // Scatter 5,000 Birch trees over the whole map (what the user did): it fills the map, then says so
  await page.locator('[data-tour="pick-scatter-asset"]').click();
  await page.locator('[data-tour="pick-scatter-asset-list"] [data-name="Birch tree"]').click();
  await page.locator('[data-tour="scatter-count"]').fill('5000');
  await page.locator('[data-tour="scatter-radius"]').fill('1024');
  await page.locator('[data-tour="scatter-go"]').click();
  await expect.poll(assets, { timeout: 300_000 }).toBeGreaterThan(1000);
  const toast = () =>
    page.evaluate(() => (window as unknown as { __toasts: { msg: string; error: boolean }[] }).__toasts.at(-1) ?? null);
  await expect
    .poll(async () => (await toast())?.msg ?? '', { timeout: 60_000 })
    .toMatch(/placed\. The map is now full/);
  expect((await toast())?.error).toBe(false);
  await expect(page.locator('[data-tour="map-bricks"]')).toContainText(/ \/ 1,000,000/);
  const bricks = Number(
    (await page.locator('[data-tour="map-bricks"]').innerText()).split('/')[0]!.replace(/[^\d]/g, ''),
  );
  expect(bricks).toBeLessThanOrEqual(1_000_000);
  expect(bricks).toBeGreaterThan(990_000);
  const placed = await assets();
  await page.screenshot({ path: 'test-results/big-full-land.png' });
  // again: a short, plain refusal
  await page.locator('[data-tour="scatter-go"]').click();
  await expect.poll(async () => (await toast())?.msg ?? '').toMatch(/^The map is full/);
  expect((await toast())!.msg.length).toBeLessThan(200);
  expect(await assets()).toBe(placed);
  // nothing in the project is invalid, and it saves
  expect(await page.evaluate(() => (window as unknown as { __editor: Full }).__editor.problems.value.length)).toBe(0);
  await page.evaluate(() => (window as unknown as { __editor: Full }).__editor.autosave.flush());
  expect(await page.evaluate(() => (window as unknown as { __editor: Full }).__editor.autosave.status.state)).toBe(
    'saved',
  );
  // a reload opens it again: every copy is there, nothing reported
  await page.reload();
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 300_000,
    },
  );
  expect(await assets()).toBe(placed);
  expect(await page.evaluate(() => (window as unknown as { __editor: Full }).__editor.problems.value.length)).toBe(0);
  // play it from there
  // the game starts on the big land (Project › Start map)
  await page.evaluate((m) => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.openMap(m);
    const r = e.exec({ type: 'project.update', payload: { entryMap: m } });
    if (!r.ok) throw new Error(r.error);
  }, mapId);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () =>
      ((window as unknown as { __editor: Ed & { session: { value: { runtime: { ticks: number } } | null } } }).__editor
        .session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 300_000 },
  );
  expect(await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.world.big)).toBe(
    true,
  );
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
