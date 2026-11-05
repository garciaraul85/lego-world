import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 3b (B1): behaviours — the Behaviours course with Do it for me (a Blinker behaviour with a field and own
 * variables, written as a class, attached to every Lamp post, one copy faster), then the lamps blink in Play; and
 * the Inspector's + Script and field boxes used by hand.
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
type W = {
  __editor: {
    session: {
      value: { world: { instances: { def: { name: string }; state: string; inst: { id: string } }[] } } | null;
    };
  };
};

test('Engine API course: a sentry lamp sees the hero and, used, tells a crate to slide', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Engine API course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
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
      await page.screenshot({ path: `test-results/api-${String(i).padStart(2, '0')}.png` });
    }
    if (/Drag Slider/.test(title)) await expect(page.locator('[data-tour="dock-behaviours"]')).toBeVisible();
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

test('a behaviour dragged from the dock onto a placed object is attached to that copy', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  // a behaviour and a placed object to drop it on
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: { exec(c: unknown): { ok: boolean }; mapId: { value: string }; dock: { value: string } };
      }
    ).__editor;
    e.exec({
      type: 'logic.create',
      payload: {
        graph: {
          id: 'lg_dragtestaa',
          name: 'Wobble',
          scope: 'global',
          behaviour: { fields: [] },
          nodes: [],
          edges: [],
        },
      },
    });
    e.dock.value = 'behaviours';
  });
  const card = page.getByRole('listitem', { name: 'Wobble' });
  await expect(card).toBeVisible();
  // a placed asset (a house the generator put on the map), selected and framed in the middle of the view
  const target = await page.evaluate(() => {
    type I = { inst: { id: string }; bricks: { id: number }[] };
    type E = {
      store: { list(p: string): string[]; get(p: string): unknown };
      scene: { value: { instanceOf: Map<number, I> } };
      select(ids: number[]): void;
    };
    const e = (window as unknown as { __editor: E }).__editor;
    const p = e.store.list('maps/').find((x) => x.endsWith('/instances.json'))!;
    const ids = new Set(
      (e.store.get(p) as { items: { id: string; kind: string }[] }).items
        .filter((i) => i.kind === 'asset')
        .map((i) => i.id),
    );
    const inst = [...new Set(e.scene.value.instanceOf.values())].find((i) => ids.has(i.inst.id));
    if (!inst) return null;
    e.select(inst.bricks.map((b) => b.id));
    return inst.inst.id;
  });
  expect(target).not.toBeNull();
  await page.keyboard.press('f');
  await page.waitForTimeout(800);
  const view = page.locator('canvas').first();
  const box = (await view.boundingBox())!;
  // (the name tip of what is under the pointer sits in the middle: drop a little below it)
  await card.dragTo(view, { sourcePosition: { x: 30, y: 14 }, targetPosition: { x: box.width / 2, y: box.height / 2 } });
  await page.screenshot({ path: 'test-results/drag-after.png' });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: { store: { list(p: string): string[]; get(p: string): unknown } } })
          .__editor;
        const p = e.store.list('maps/').find((x) => x.endsWith('/instances.json'))!;
        const items = (e.store.get(p) as { items: { scripts?: { use: string }[] }[] }).items;
        return items.some((i) => i.scripts?.some((s) => s.use === 'lg_dragtestaa'));
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('Behaviours course: Do it for me makes a Blinker, attaches it to two lamp posts, and they blink at their own pace', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Behaviours course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
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
      await page.screenshot({ path: `test-results/behaviours-${String(i).padStart(2, '0')}.png` });
    }
    // the Code view shows the class
    if (/What it does every step/.test(title))
      await expect(page.locator('.lg-code')).toContainText('class Blinker extends Behaviour');
    if (/One copy, its own value/.test(title))
      await expect(page.getByRole('spinbutton', { name: 'Blinker Blinks every (seconds)' })).toHaveValue('0.25');
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      // in Play the two lamps flip on and off, the fast one more often
      const flips = await page.evaluate(async () => {
        const s = (window as unknown as W).__editor.session.value!;
        const lamps = () => s.world.instances.filter((i) => i.def.name === 'Lamp post');
        const ids = lamps().map((l) => l.inst.id);
        const n: Record<string, number> = {};
        let last = Object.fromEntries(lamps().map((l) => [l.inst.id, l.state]));
        for (let k = 0; k < 40; k++) {
          await new Promise((r) => setTimeout(r, 100));
          for (const l of lamps()) {
            if (l.state !== last[l.inst.id]) n[l.inst.id] = (n[l.inst.id] ?? 0) + 1;
            last = { ...last, [l.inst.id]: l.state };
          }
        }
        return ids.map((id) => n[id] ?? 0);
      });
      expect(Math.min(...flips)).toBeGreaterThan(0);
      expect(Math.max(...flips)).toBeGreaterThan(Math.min(...flips));
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
