import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 2b, 10c part 5: 3D models in the real editor — the built-in ones and an imported glTF file placed
 * from the dock, changed in the Inspector, drawn lit beside the bricks, and solid in Play.
 */
type Item = { id: string; kind: string; model?: string; size?: number; turn?: number; solid?: boolean };
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  selectedItem: { value: string | null };
  store: { get(p: string): unknown };
  session: {
    value: { runtime: { ticks: number }; world: { physics: { solidKeys(): string[] } | null } } | null;
  };
};
type View = { renderer: { kind: string; modelDraws: { key: string }[]; hasModel(k: string): boolean } };

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}

const items = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: Item[] }).items;
  });
const drawn = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as { __view: () => View | null }).__view()?.renderer;
    return r ? r.modelDraws.map((d) => d.key) : [];
  });

test('the dock places built-in and imported 3D models; the Inspector turns, sizes and changes them', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  const dock = page.locator('[data-tour="dock"]');
  await dock.getByRole('button', { name: /^3D models \d+$/ }).click();
  // eight built-in models, each with a picture of it
  await expect(page.locator('[data-tour="dock-models"] .fx-card')).toHaveCount(8);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector('[data-model-thumb="builtin:barrel"]') as HTMLCanvasElement | null;
        if (!c) return 0;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(200);
  // place the barrel: it is selected, the Inspector shows it, the view draws it
  await page.locator('[data-tour="dock-model-barrel"]').click();
  await expect.poll(async () => (await items(page)).filter((i) => i.kind === 'model').length).toBe(1);
  await expect(page.locator('[data-tour="item-model"]')).toBeVisible();
  await expect(page.locator('[data-tour="model-info"]')).toContainText(/triangles/);
  await expect.poll(() => drawn(page)).toEqual(['builtin:barrel']);
  // turn it, make it bigger, make it a boulder
  await page.getByLabel('Turn (degrees)').fill('90');
  await page.getByLabel('Turn (degrees)').press('Enter');
  await page.getByLabel('Size', { exact: true }).fill('2');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await page.locator('[data-tour="model-which"]').selectOption('builtin:boulder');
  await expect
    .poll(async () => (await items(page)).find((i) => i.kind === 'model'))
    .toMatchObject({ turn: 90, size: 2, model: 'builtin:boulder' });
  await expect.poll(() => drawn(page)).toEqual(['builtin:boulder']);
  // import a glTF file: it joins the list (first), and places like the others
  await page.getByLabel('Model files to import').setInputFiles('tests/fixtures/models/lamp-post.glb');
  await expect(page.getByText(/Imported lamp-post\.glb \(\d[\d,]* triangles\)/)).toBeVisible();
  await expect(page.locator('[data-tour="dock-models"] .fx-card')).toHaveCount(9);
  await page.getByRole('button', { name: 'Place lamp-post' }).click();
  await expect.poll(async () => (await items(page)).filter((i) => i.kind === 'model').length).toBe(2);
  await expect.poll(async () => (await drawn(page)).length).toBe(2);
  // a file that isn't a model is turned away with a reason
  await page.getByLabel('Model files to import').setInputFiles({
    name: 'broken.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('not a model at all'),
  });
  await expect(page.getByText(/broken\.glb: This is not a glTF model/)).toBeVisible();
  // the Hierarchy lists them
  await expect(page.getByText(/◆ lamp-post 1/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a placed model is solid in Play (physics movement): the hero stands on a big boulder', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  // a big boulder on the first spawn point, and one that isn't solid
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: Ed & {
          exec(c: unknown): { ok: boolean; error?: string };
          mapDoc: { value: { spawns: { pos: number[] }[] } };
        };
      }
    ).__editor;
    const sp = e.mapDoc.value.spawns[0]!.pos;
    // models are solid to the physics engine's hero (Project › Movement: Physics, new projects' default)
    e.exec({ type: 'project.update', payload: { movement: 'physics' } });
    for (const [id, solid, dx] of [
      ['ins_rockplay01', true, 0],
      ['ins_rockplay02', false, 12],
    ] as const) {
      const r = e.exec({
        type: 'item.add',
        payload: {
          map: e.mapId.value,
          item: { id, kind: 'model', model: 'builtin:boulder', pos: [sp[0]! + dx, sp[1]!, sp[2]!], size: 2, solid },
        },
      });
      if (!r.ok) throw new Error(r.error);
    }
  });
  await page.keyboard.press('F5');
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 30,
    undefined,
    { timeout: 60_000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value?.world.physics?.solidKeys()),
    )
    .toEqual(['model:ins_rockplay01']);
  // the hero drops onto it from above and stands on top of it
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          session: { value: { placeAt(p: number[], yaw: number): void } };
          mapDoc: { value: { spawns: { pos: number[] }[] } };
        };
      }
    ).__editor;
    const sp = e.mapDoc.value.spawns[0]!.pos;
    e.session.value.placeAt([sp[0]!, sp[1]! + 9, sp[2]!], 0);
  });
  const above = () =>
    page.evaluate(() => {
      const e = (
        window as unknown as {
          __editor: {
            session: { value: { heroState: { y: number } } };
            mapDoc: { value: { spawns: { pos: number[] }[] } };
          };
        }
      ).__editor;
      return e.session.value.heroState.y - e.mapDoc.value.spawns[0]!.pos[1]!;
    });
  // the boulder (twice its size) is about 4.5 studs tall: the hero comes down onto it and rests there, not on
  // the ground (this browser runs the game slowly: the fall takes a while)
  await expect.poll(above, { timeout: 120_000 }).toBeLessThan(5.5);
  await page.waitForTimeout(4000);
  expect(await above()).toBeGreaterThan(2.5);
  expect(errors).toEqual([]);
});

test('3D models course: Do it for me places, sizes, imports and stands on a model', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /3D models course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
  let stood = false;
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if ((await doIt.isVisible()) && (await doIt.isEnabled())) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 240_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 240_000 });
      if (title === 'Stand on it') stood = true;
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await page.screenshot({ path: 'test-results/models-course.png' });
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(stood).toBe(true);
  const placed = (await items(page)).filter((i) => i.kind === 'model');
  expect(placed.map((m) => (m.model!.startsWith('sha256:') ? 'own' : m.model))).toEqual([
    'builtin:lantern-post',
    'own',
  ]);
  expect(placed[0]!.size).toBe(2);
  expect(errors).toEqual([]);
});
