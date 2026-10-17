import { expect, type Page, test } from '@playwright/test';

/** P9a: Make breakable in the Asset studio; in Play a crate takes two hits (F) before it breaks. */
type Ed = {
  scene: { value: { count: number } | null };
  store: {
    manifest: { entry: { map: string } };
    get(p: string): unknown;
    list(p: string): string[];
  };
  exec(c: unknown): { ok: boolean; error?: string };
  session: {
    value: {
      runtime: { ticks: number };
      heroState: { x: number; y: number; z: number; heading: number };
      placeAt(p: [number, number, number], yaw: number): void;
      world: { pieces: unknown[]; instances: { def: { name: string }; inst: { id: string } }[] };
      health: { peek(k: string): { hp: number } | undefined };
      message: string;
    } | null;
  };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

async function open(page: Page) {
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 60_000,
    },
  );
}

test('Make breakable gives an asset health; the crate in Play takes two hits with F, then breaks', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);

  // Asset studio: the Bench gets health from “Make breakable”
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: 'Assets', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Asset library' })
    .getByRole('option', { name: /^Bench/ })
    .first()
    .click();
  const props = page.getByRole('region', { name: 'Asset properties' });
  await props.getByLabel('Make breakable', { exact: true }).selectOption({ label: 'Takes 5 hits (a door, a fence)' });
  await expect(props.getByLabel('Hit points', { exact: true })).toHaveValue('5');
  const bench = await get(page, (e) =>
    e.store
      .list('assets/')
      .map((p) => e.store.get(p) as { name: string; health?: { hp: number } })
      .find((a) => a.name === 'Bench'),
  );
  expect(bench?.health?.hp).toBe(5);
  await props.getByLabel('slash hits', { exact: true }).selectOption('0');
  await page.screenshot({ path: 'test-results/health-studio.png' });

  // Play: a wooden crate in front of the hero; F twice
  await page
    .getByRole('navigation', { name: 'Workspaces' })
    .getByRole('button', { name: 'Scene', exact: true })
    .click();
  const placed = await get(page, (e) => {
    const map = e.store.manifest.entry.map;
    const doc = e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] };
    return { sp: doc.spawns[0]!.pos, map };
  });
  const ok = await page.evaluate(({ map, sp }) => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: { id: string; name: string }[] };
    const def = w.__builtinAssets.find((a) => a.name === 'Wooden crate');
    if (!def) return 'no Wooden crate in the built-in library';
    const r = w.__editor.exec([
      { type: 'asset.create', payload: { asset: def } },
      {
        type: 'asset.place',
        payload: {
          map,
          asset: def.id,
          pos: [Math.round(sp[0]!) - 1, Math.round(sp[1]! / 0.4), Math.round(sp[2]!) + 2],
        },
      },
    ]);
    return r.ok ? 'ok' : r.error;
  }, placed);
  expect(ok).toBe('ok');
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Game view')).toBeVisible();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    {
      timeout: 60_000,
    },
  );
  const key = await page.evaluate(({ sp }) => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    s.placeAt([Math.round(sp[0]!), sp[1]!, Math.round(sp[2]!) + 0.4], 0);
    const c = s.world.instances.find((i) => i.def.name === 'Wooden crate')!;
    return `i:${c.inst.id}`;
  }, placed);
  const pieces0 = await get(page, (e) => e.session.value!.world.pieces.length);
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('f');
  await expect
    .poll(
      () =>
        page.evaluate((k) => (window as unknown as { __editor: Ed }).__editor.session.value!.health.peek(k)?.hp, key),
      {
        timeout: 20_000,
      },
    )
    .toBe(1);
  expect(await get(page, (e) => e.session.value!.message)).toMatch(/Wooden crate: 1 of 2 left/);
  expect(await get(page, (e) => e.session.value!.world.pieces.length)).toBe(pieces0);
  // the next swing waits for the last to finish (play time: slow on software drawing)
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __editor: { session: { value: { smashCooldown: number } } } }).__editor.session
              .value.smashCooldown,
        ),
      { timeout: 60_000 },
    )
    .toBe(0);
  await page.keyboard.press('f');
  await expect
    .poll(() => get(page, (e) => e.session.value!.world.pieces.length), { timeout: 20_000 })
    .toBeLessThan(pieces0);
  await page.screenshot({ path: 'test-results/health-play.png' });
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
