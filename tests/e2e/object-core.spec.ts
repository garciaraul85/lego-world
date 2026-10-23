import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 2b, the object core: a map of 100,000 placed objects in the real editor. It draws, the Hierarchy and
 * the Map tab show them, a move answers quickly, the project saves and opens again, and Play runs with the game
 * steps inside the frame budget.
 */
type Ed = {
  scene: { value: { count: number } | null };
  mapId: { value: string };
  right: { value: string };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  openMap(id: string): void;
  store: { get(p: string): unknown; list(p: string): string[] };
  problems: { value: unknown[] };
  autosave: { flush(): Promise<void>; status: { state: string } };
  session: {
    value: { runtime: { ticks: number; stepOnce(): void }; world: { big: boolean; instances: unknown[] } } | null;
  };
};
const ed = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

test('100,000 placed objects: the editor draws and edits them, saves them, and the game plays them', async ({
  page,
}) => {
  test.setTimeout(1_500_000);
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
  // a 1024 land and 100,000 crates (twenty scatters of 5,000), as the AI builder or a maker would
  const made = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const crate = (window as unknown as { __builtinAssets: { id: string; name: string }[] }).__builtinAssets.find(
      (a) => a.name === 'Wooden crate',
    )!;
    const map = 'map_manyobj001';
    const t = performance.now();
    let r = e.exec({ type: 'map.create', payload: { id: map, name: 'Many crates', land: { size: 1024, seed: 1 } } });
    if (!r.ok) throw new Error(r.error);
    r = e.exec({ type: 'asset.create', payload: { asset: crate } });
    for (let s = 0; s < 20; s++)
      e.exec({
        type: 'asset.scatter',
        payload: { map, asset: crate.id, area: [-512, -512, 511, 511], count: 5000, seed: s + 1 },
      });
    e.openMap(map);
    e.right.value = 'map';
    const items = (e.store.get(`maps/${map}/instances.json`) as { items: unknown[] }).items.length;
    return { items, ms: performance.now() - t };
  });
  expect(made.items).toBe(100_000);
  await expect(page.locator('[data-tour="map-assets"]')).toContainText('100,000 / 100,000', { timeout: 300_000 });
  await page.screenshot({ path: 'test-results/object-core-editor.png' });
  // a move answers quickly
  const moveMs = await ed(page, (e) => {
    const items = (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { id: string }[] }).items;
    const t = performance.now();
    e.exec({ type: 'instance.move', payload: { map: e.mapId.value, instance: items[777]!.id, dx: 2 } });
    return performance.now() - t;
  });
  expect(moveMs).toBeLessThan(3000);
  expect(await ed(page, (e) => e.problems.value.length)).toBe(0);
  // it saves and opens again
  await ed(page, (e) => e.autosave.flush());
  expect(await ed(page, (e) => e.autosave.status.state)).toBe('saved');
  await page.reload();
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 300_000,
    },
  );
  expect(
    await ed(page, (e) => (e.store.get('maps/map_manyobj001/instances.json') as { items: unknown[] }).items.length),
  ).toBe(100_000);
  // the game plays it: a step of the game (not the drawing) stays inside the frame budget
  await ed(page, (e) => {
    e.openMap('map_manyobj001');
    const r = e.exec({ type: 'project.update', payload: { entryMap: 'map_manyobj001' } });
    if (!r.ok) throw new Error(r.error);
  });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 300_000 },
  );
  const stepMs = await ed(page, (e) => {
    const s = e.session.value!;
    s.runtime.stepOnce();
    const t = performance.now();
    for (let i = 0; i < 60; i++) s.runtime.stepOnce();
    return (performance.now() - t) / 60;
  });
  expect(stepMs).toBeLessThan(10);
  expect(await ed(page, (e) => e.session.value!.world.instances.length)).toBe(100_000);
  await page.screenshot({ path: 'test-results/object-core-play.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
