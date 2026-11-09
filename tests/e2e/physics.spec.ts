import { expect, test } from '@playwright/test';

/** Milestone 2b, 10b: the physics core in the real editor — smashed bricks tumble and come to rest on the bricks. */
type Ed = {
  scene: { value: { count: number } | null };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown };
  exec(c: unknown): { ok: boolean; error?: string };
  session: {
    value: {
      runtime: { ticks: number };
      placeAt(p: [number, number, number], yaw: number): void;
      breakHit(p: unknown, by: unknown, force: boolean): number;
      pieceById(w: unknown, id: number): unknown;
      world: {
        physics: { looseCount: number } | null;
        debris: { y: number; vx: number; vy: number; vz: number; sleeping?: boolean }[];
        instances: { def: { name: string }; inst: { id: string; idBase: number } }[];
      };
    } | null;
  };
};

test('smashed bricks tumble onto the ground and come to rest (the physics core)', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 60_000,
    },
  );
  await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: { id: string; name: string }[] };
    const crate = w.__builtinAssets.find((a) => a.name === 'Wooden crate')!;
    const map = w.__editor.store.manifest.entry.map;
    // beside the start, where the ground is (as the health test places its crate)
    const sp = (w.__editor.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    const pos = [Math.round(sp[0]!) - 1, Math.round(sp[1]! / 0.4), Math.round(sp[2]!) + 2];
    const r = w.__editor.exec([
      { type: 'asset.create', payload: { asset: crate } },
      { type: 'asset.place', payload: { map, asset: crate.id, pos, id: 'ins_physcrate1' } },
    ]);
    if (!r.ok) throw new Error(r.error);
  });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 120_000 },
  );
  const made = await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    if (!s.world.physics) return -1;
    const c = s.world.instances.find((i) => i.inst.id === 'ins_physcrate1')!;
    return s.breakHit(s.pieceById(s.world, c.inst.idBase), undefined, true);
  });
  expect(made).toBeGreaterThan(0);
  // play time is slow on software drawing: wait until the bricks have settled
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = (window as unknown as { __editor: Ed }).__editor.session.value!.world;
          return w.debris.filter((d) => d.sleeping || Math.hypot(d.vx, d.vy, d.vz) < 0.2).length / w.debris.length;
        }),
      { timeout: 180_000 },
    )
    .toBeGreaterThan(0.7);
  const state = await page.evaluate(() => {
    const w = (window as unknown as { __editor: Ed }).__editor.session.value!.world;
    return { bodies: w.physics?.looseCount ?? 0, n: w.debris.length, lowest: Math.min(...w.debris.map((d) => d.y)) };
  });
  expect(state.bodies).toBe(state.n);
  expect(state.lowest).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/physics-debris.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
