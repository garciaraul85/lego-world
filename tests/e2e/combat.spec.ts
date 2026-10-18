import { expect, type Page, test } from '@playwright/test';

/**
 * P9b: the Character studio gives the hero a shield (Off hand); in Play, Q guards and parries, Z locks on to a
 * crate, C rolls, and holding F charges an attack.
 */
type S = {
  runtime: { ticks: number };
  heroState: { x: number; z: number; heading: number };
  placeAt(p: [number, number, number], yaw: number): void;
  camYaw: number;
  hero: { offHand?: string };
  combat: { guard: boolean; target: { kind: string } | null; move: { kind: string } | null; charge: number | null };
  damage(ref: string, amount: number, type: string, from?: string): void;
  message: string;
  logic: { vars: Map<string, unknown> };
};
type Ed = {
  scene: { value: { count: number } | null };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown; list(p: string): string[] };
  exec(c: unknown): { ok: boolean; error?: string };
  session: { value: S | null };
};
const ses = <T>(page: Page, fn: (s: S) => T) =>
  page.evaluate((src) => {
    const f = new Function('s', `return (${src})(s)`) as (s: S) => T;
    return f((window as unknown as { __editor: Ed }).__editor.session.value!);
  }, fn.toString());

test('a shield from the Character studio; in Play Q guards and parries, Z locks on, C rolls, F charges', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );

  // Character studio: a Knight with a shield in the off hand, made the hero
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.getByRole('button', { name: '+ New character' }).click();
  await page
    .getByRole('listbox', { name: 'New character from a preset' })
    .getByRole('option', { name: 'Knight' })
    .click();
  const props = page.getByRole('region', { name: 'Character properties' });
  const off = props.getByRole('button', { name: /^Off hand: / });
  await expect(off).toHaveAccessibleName('Off hand: None');
  await off.click();
  await props.getByRole('listbox', { name: 'Off hand' }).getByRole('option', { name: 'Shield' }).click();
  await expect(off).toHaveAccessibleName('Off hand: Shield');
  await page.screenshot({ path: 'test-results/combat-studio.png' });
  const placed = await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __builtinAssets: { id: string; name: string }[] };
    const e = w.__editor;
    const knight = e.store
      .list('characters/')
      .map((p) => e.store.get(p) as { id: string; name: string; gear?: { offHand: string } })
      .find((c) => c.gear?.offHand === 'Shield');
    if (!knight) return { err: 'no character with a shield saved' };
    const map = e.store.manifest.entry.map;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    const def = w.__builtinAssets.find((a) => a.name === 'Wooden crate')!;
    const r = e.exec([
      { type: 'project.update', payload: { hero: knight.id } },
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
    return r.ok ? { sp } : { err: r.error };
  });
  expect(placed.err).toBeUndefined();

  // Play
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Game view')).toBeVisible();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.runtime.ticks ?? 0) > 5,
    undefined,
    { timeout: 60_000 },
  );
  expect(await ses(page, (s) => s.hero.offHand)).toBe('Shield');
  await page.evaluate(({ sp }) => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    s.placeAt([Math.round(sp![0]!), sp![1]!, Math.round(sp![2]!) + 0.4], 0);
    s.camYaw = Math.PI;
  }, placed);
  const canvas = page.getByLabel('Game view');
  await canvas.focus();

  // Q held: the guard goes up; a hit from the crate's side right away is parried
  await page.keyboard.down('q');
  await expect.poll(() => ses(page, (s) => s.combat.guard), { timeout: 20_000 }).toBe(true);
  await ses(page, (s) => s.damage('hero', 1, 'slash', 'Wooden crate'));
  expect(['Parry!', 'Blocked']).toContain(await ses(page, (s) => s.message));
  expect(await ses(page, (s) => s.logic.vars.get('hp'))).toBe(3);
  await page.screenshot({ path: 'test-results/combat-guard.png' });
  await page.keyboard.up('q');
  await expect.poll(() => ses(page, (s) => s.combat.guard), { timeout: 20_000 }).toBe(false);

  // Z: lock on to the crate
  await page.keyboard.press('z');
  await expect.poll(() => ses(page, (s) => s.combat.target?.kind ?? null), { timeout: 20_000 }).toBe('inst');
  await page.screenshot({ path: 'test-results/combat-lock.png' });
  await page.keyboard.press('z');
  await expect.poll(() => ses(page, (s) => s.combat.target), { timeout: 20_000 }).toBeNull();

  // C: a dodge roll
  await page.keyboard.press('c');
  await expect.poll(() => ses(page, (s) => s.combat.move?.kind ?? null), { timeout: 20_000 }).toBe('roll');
  await expect.poll(() => ses(page, (s) => s.combat.move), { timeout: 60_000 }).toBeNull();

  // F held: charging; let go: the attack
  await page.keyboard.down('f');
  await expect.poll(() => ses(page, (s) => (s.combat.charge ?? 0) > 0), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('f');
  await expect.poll(() => ses(page, (s) => s.combat.charge), { timeout: 20_000 }).toBeNull();

  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
