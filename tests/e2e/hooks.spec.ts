import { expect, type Page, test } from '@playwright/test';

/**
 * Step 13b: hooks and the magnet glove — the Starter pack's Hook and magnet pieces, the Asset studio's hook and metal
 * boxes, and the course run with Do it for me (hooked up a wall, a light crate pulled in, a swing on the rope and a
 * let-go, an iron crate carried onto a floor switch).
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

test('Hook and magnet: the pack pieces and the Asset studio boxes', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="dock"]').getByRole('button', { name: 'Starter pack', exact: true }).click();
  const pieces = page.getByRole('listbox', { name: 'Pack hook and magnet' });
  for (const n of [
    'Hook line',
    'Grapple rope',
    'Magnet glove',
    'Hook target',
    'Swing beam',
    'Light crate',
    'Iron crate',
  ])
    await expect(pieces.getByRole('option', { name: new RegExp(`^${n}`) }).first()).toBeVisible();
  // the Asset studio: the Light crate made metal
  await pieces.getByRole('option', { name: /^Light crate/ }).dblclick();
  const box = page.locator('[data-tour="asset-metal"] input');
  await box.scrollIntoViewIfNeeded();
  await box.check();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const e = (window as unknown as { __editor: { store: { list(p: string): string[]; get(p: string): unknown } } })
          .__editor;
        const p = e.store.list('assets/').find((x) => (e.store.get(x) as { name: string }).name === 'Light crate');
        return p ? !!(e.store.get(p) as { metal?: boolean }).metal : false;
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test('Hook and magnet course: Do it for me hooks up a wall, pulls a crate, swings and carries iron', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hook and magnet course/ }).click();
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
      await page.screenshot({ path: `test-results/hooks-${String(i).padStart(2, '0')}.png` });
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

test('Grapple rope: the hero hangs by one fist on the rope, the body in line with it as it swings', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  // the practice map, as the course sets it up
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Hook and magnet course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole('button', { name: 'Leave the tutorial' }).click();
  await page.evaluate(() => {
    const e = (window as any).__editor;
    const map = e.store.manifest.entry.map;
    const def = (window as any).__builtinAssets.find((a: any) => a.name === 'Swing beam');
    e.exec({ type: 'asset.create', payload: { asset: def } });
    e.exec({ type: 'asset.place', payload: { map, asset: def.id, pos: [8, 0, -12], rot: 0 } });
  });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  const S = (f: string) => page.evaluate(`(() => { const s = window.__editor.session.value; ${f} })()`);
  await page.waitForFunction(() => ((window as any).__editor.session.value?.runtime.ticks ?? 0) > 10, undefined, {
    timeout: 180_000,
  });
  await S(`s.give('Grapple rope', 1); s.useTool('Grapple rope'); s.placeAt([12, 0, -8], Math.PI);`);
  await page.waitForTimeout(500);
  await S('s.attackButton(true);');
  await page.waitForTimeout(400);
  await S('s.attackButton(false);');
  await expect.poll(() => S('return !!s.hooks.swing'), { timeout: 5000 }).toBe(true);
  // climb off the ground and pump a swing going
  await S(`s.input.keys.add('shift'); s.input.keys.add('forward');`);
  await page.waitForTimeout(900);
  await S(`s.input.keys.delete('shift');`);
  await page.waitForTimeout(600);
  await S(`s.input.keys.delete('forward'); s.input.keys.add('back');`);
  await page.waitForTimeout(600);
  await S(`s.input.keys.delete('back');`);
  for (let i = 0; i < 6; i++) {
    const r = (await S(`const [left, fist] = s.gripPoints(); const hp = s.handPoint(); const a = s.hooks.line.anchor;
      const h = s.heroState; const u = [a[0]-fist[0], a[1]-fist[1], a[2]-fist[2]]; const L = Math.hypot(...u);
      const up = [fist[0]-h.x, fist[1]-(h.y+2.24), fist[2]-h.z]; const M = Math.hypot(...up);
      return { onRope: Math.hypot(fist[0]-hp[0], fist[1]-hp[1], fist[2]-hp[2]),
        inLine: (u[0]*up[0]+u[1]*up[1]+u[2]*up[2]) / (L*M), freeLow: left[1] < fist[1] - 2, side: (u[0]*Math.cos(h.heading) - u[2]*Math.sin(h.heading)) / L, fwd: (u[0]*Math.sin(h.heading) + u[2]*Math.cos(h.heading)) / L, upSide: (up[0]*Math.cos(h.heading) - up[2]*Math.sin(h.heading)) / M, upFwd: (up[0]*Math.sin(h.heading) + up[2]*Math.cos(h.heading)) / M }`)) as {
      onRope: number;
      inLine: number;
      freeLow: boolean;
    };
    // the rope ends in the fist; the arm (hips to fist) points along the rope; the other hand hangs free
    expect(r.onRope).toBeLessThan(0.05);
    expect(r.inLine).toBeGreaterThan(0.95);
    expect(r.freeLow).toBe(true);
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);
});
