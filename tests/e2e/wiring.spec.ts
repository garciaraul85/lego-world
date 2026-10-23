import { expect, type Page, test } from '@playwright/test';

/** P9c: wire a crate to a chest in the Scene inspector (hit the crate → the chest opens), and Make enemy. */
type Ed = {
  scene: { value: { count: number; instances: { inst: { id: string }; bricks: { id: number }[] }[] } | null };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown; list(p: string): string[] };
  exec(c: unknown): { ok: boolean; error?: string };
  select(ids: number[]): void;
  session: {
    value: {
      runtime: { ticks: number };
      world: { instances: { inst: { id: string }; state: string; def: { name: string } }[] };
      hitInstance(i: unknown, a: { power: number; type: string }): void;
    } | null;
  };
};
const ed = <T>(page: Page, fn: (e: Ed, arg: unknown) => T, arg?: unknown) =>
  page.evaluate(
    ({ src, arg }) => {
      const f = new Function('e', 'arg', `return (${src})(e, arg)`) as (e: Ed, a: unknown) => T;
      return f((window as unknown as { __editor: Ed }).__editor, arg);
    },
    { src: fn.toString(), arg },
  );

test('wire a crate to a chest: hit the crate in Play and the chest opens; Make enemy', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  const ids = await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: { id: string; name: string }[] };
    const e = w.__editor;
    const map = e.store.manifest.entry.map;
    const crate = w.__builtinAssets.find((a) => a.name === 'Wooden crate')!;
    const chest = w.__builtinAssets.find((a) => a.name === 'Treasure chest')!;
    const r = e.exec([
      { type: 'asset.create', payload: { asset: crate } },
      { type: 'asset.create', payload: { asset: chest } },
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [3, 1, 8], id: 'ins_cratewire1' } },
      { type: 'asset.place', payload: { map, asset: chest.id, pos: [8, 1, 8], id: 'ins_chestwire1' } },
    ]);
    return r.ok ? { map } : { err: r.error };
  });
  expect(ids).not.toHaveProperty('err');
  // select the crate (as a click on it would)
  await ed(page, (e) => {
    const c = e.scene.value!.instances.find((i) => i.inst.id === 'ins_cratewire1')!;
    e.select(c.bricks.map((b) => b.id));
  });
  const sec = page.locator('[data-tour="object-script"]');
  await expect(sec).toBeVisible();
  await sec.getByLabel('Wire when', { exact: true }).selectOption('hit');
  await sec.getByLabel('Wire does', { exact: true }).selectOption('state');
  await sec.getByLabel('Wire target', { exact: true }).selectOption('ins_chestwire1');
  await sec.getByLabel('Wire state', { exact: true }).selectOption('open');
  await sec.getByRole('button', { name: 'Add wire' }).click();
  await expect(sec.getByRole('group', { name: 'When is hit → Treasure chest 1: open' })).toBeVisible();
  const saved = await ed(page, (e) => {
    const g = e.store
      .list('logic/lg_')
      .map((p) => e.store.get(p) as { owner?: string; nodes: { type: string }[] })
      .find((x) => x.owner === 'ins_cratewire1');
    return g?.nodes.map((n) => n.type);
  });
  expect(saved).toEqual(['event.onDamaged', 'world.setState']);
  await page.screenshot({ path: 'test-results/wiring-scene.png' });

  // Play: a hit on the crate opens the chest
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 60_000 },
  );
  await ed(page, (e) => {
    const s = e.session.value!;
    s.hitInstance(
      s.world.instances.find((i) => i.inst.id === 'ins_cratewire1'),
      { power: 1, type: 'blunt' },
    );
  });
  await expect
    .poll(() => ed(page, (e) => e.session.value!.world.instances.find((i) => i.inst.id === 'ins_chestwire1')?.state), {
      timeout: 60_000,
    })
    .toBe('open');
  await page.keyboard.press('F5');

  // Character studio: Make enemy
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.getByRole('button', { name: '+ New character' }).click();
  await page
    .getByRole('listbox', { name: 'New character from a preset' })
    .getByRole('option', { name: 'Knight' })
    .click();
  const props = page.getByRole('region', { name: 'Character properties' });
  // Fights the hero lives in the sheet's Moves tab
  await page.getByRole('tablist', { name: 'Character sheet' }).getByRole('tab', { name: 'Moves' }).click();
  // a new character is the hero when the game has none: make another so this one is a neighbour
  const enemy = props.locator('[data-tour="char-enemy"]');
  if (!(await enemy.count())) {
    await page.getByRole('button', { name: '+ New character' }).click();
    await page
      .getByRole('listbox', { name: 'New character from a preset' })
      .getByRole('option', { name: 'Knight' })
      .click();
  }
  await enemy.getByLabel('Make enemy', { exact: true }).selectOption('brute');
  await expect(enemy.getByLabel('Hits for', { exact: true })).toHaveValue('2');
  const chr = await ed(page, (e) =>
    e.store
      .list('characters/')
      .map((p) => e.store.get(p) as { enemy?: { power: number }; harm?: { canBeHarmed: boolean } })
      .find((c) => c.enemy),
  );
  expect(chr?.enemy?.power).toBe(2);
  expect(chr?.harm?.canBeHarmed).toBe(true);
  expect(errors).toEqual([]);
});
