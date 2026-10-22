import { expect, type Page, test } from '@playwright/test';

/**
 * P27 part 3d: what becomes of a build once broken. The Asset studio's "After it breaks" makes the Wooden crate
 * come back after a few seconds; in Play the broken crate comes back whole once the hero steps away.
 */
type Asset = { id: string; name: string; smash: { after?: string; respawnAfter?: number } };
type Ed = {
  store: { manifest: { entry: { map: string } }; get(p: string): unknown };
  exec(c: unknown): { ok: boolean; error?: string };
  studioAsset: { value: string | null };
  session: {
    value: {
      runtime: { ticks: number };
      placeAt(p: [number, number, number], yaw: number): void;
      breakHit(p: unknown, by: unknown, force: boolean): number;
      world: {
        pieces: { id: number }[];
        broken: { mode?: string }[];
        instances: { def: { name: string }; inst: { idBase: number } }[];
      };
    } | null;
  };
};

test('After it breaks: the Wooden crate comes back', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: 'Scene', exact: true })
    .click();
  const id = await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: Asset[] };
    const def = w.__builtinAssets.find((a) => a.name === 'Wooden crate')!;
    const map = w.__editor.store.manifest.entry.map;
    const doc = w.__editor.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] };
    const sp = doc.spawns[0]!.pos;
    const r = w.__editor.exec([
      { type: 'asset.create', payload: { asset: def } },
      {
        type: 'asset.place',
        payload: {
          map,
          asset: def.id,
          pos: [Math.round(sp[0]!) + 6, Math.round(sp[1]! / 0.4), Math.round(sp[2]!) + 6],
        },
      },
    ]);
    if (!r.ok) throw new Error(r.error);
    w.__editor.studioAsset.value = def.id;
    return def.id;
  });
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: 'Assets', exact: true })
    .click();
  const after = page.locator('[data-tour="asset-after"] select');
  await after.scrollIntoViewIfNeeded();
  await expect(after).toHaveValue('rebuild');
  await after.selectOption('respawn');
  const smash = () =>
    page.evaluate((i) => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      return (e.store.get(`assets/${i}.json`) as Asset).smash;
    }, id);
  await expect.poll(async () => (await smash()).after).toBe('respawn');
  expect((await smash()).respawnAfter).toBe(30);
  const slider = page.locator('[data-tour="asset-respawn-after"]');
  await expect(slider).toBeVisible();
  await slider.fill('5');
  await expect.poll(async () => (await smash()).respawnAfter).toBe(5);
  await page.screenshot({ path: 'test-results/cleanup-studio.png' });

  // Play: break it, step away, and it comes back
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 60_000 },
  );
  const before = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    const c = s.world.instances.find((i) => i.def.name === 'Wooden crate')!;
    const piece = s.world.pieces.find((p) => p.id === c.inst.idBase)!;
    const n = s.world.pieces.length;
    s.breakHit(piece, undefined, true);
    return { n, after: s.world.pieces.length, mode: s.world.broken[0]?.mode };
  });
  expect(before.after).toBeLessThan(before.n);
  expect(before.mode).toBe('respawn');
  // play time runs slowly on software drawing: step the game 6 seconds ahead (as the frame loop would)
  const left = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value! as unknown as {
      runtime: { stepOnce(): void };
      world: { broken: unknown[] };
    };
    for (let i = 0; i < 6 * 60; i++) s.runtime.stepOnce();
    return s.world.broken.length;
  });
  expect(left).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.session.value!.world.pieces.length),
  ).toBe(before.n);
  expect(errors).toEqual([]);
});
