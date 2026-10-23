import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * P22 part 3: body plans — a family shaped with sliders and colours, walking on the spot, the skeleton made
 * a body plan of the game's own (bones added, renamed, removed, given bricks), a brick build worn on the
 * skeleton and painted onto a bone, creatures in Play; the creatures course with Do it for me.
 */
type Body = {
  family?: string;
  plan?: string;
  params?: Record<string, number>;
  colors?: Record<string, string>;
  asset?: string;
  attach?: Record<string, string>;
};
type Plan = {
  id: string;
  name: string;
  bones: { name: string; parent?: string; role: string; swing: number }[];
  bricks: { bone: string }[];
};
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown; list(p: string): string[] };
  studioCharacter: { value: string | null };
  sheetTab: { value: string };
  bodyWalk: { value: boolean };
  bodyBones: { value: boolean };
  session: { value: S | null };
};
type S = {
  world: { npcs: { id: number; profile: { name?: string } }[] };
  bodyOf(who: unknown): { family: string; move: string; bones: unknown[] } | null;
};

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const get = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;
const body = (page: Page, id: string) =>
  get(page, new Function('e', `return e.store.get('characters/${id}.json')?.body ?? null`) as (e: Ed) => Body | null);
const plan = (page: Page, id: string) =>
  get(page, new Function('e', `return e.store.get('bodyplans/${id}.json') ?? null`) as (e: Ed) => Plan | null);

test('the Body tab: a family, sliders, colours, walking; a skeleton of your own; bricks worn and painted; creatures in Play', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    e.exec({
      type: 'character.create',
      payload: { character: { id: 'chr_bodyrex001', name: 'Rex', role: 'npc', profile: { name: 'Rex' } } },
    });
    e.exec({
      type: 'npc.place',
      payload: { map, character: 'chr_bodyrex001', pos: [sp[0]! + 3, sp[1]!, sp[2]! + 3], heading: 0 },
    });
    // a small brick build: a body on two legs
    e.exec({
      type: 'asset.create',
      payload: {
        asset: {
          id: 'ast_bodybeast1',
          name: 'Beast',
          category: 'prop',
          footprint: [2, 4],
          palette: { types: ['brick1x1', 'brick2x4'], colors: ['#ff0000', '#00aa00'] },
          bricks: [
            [1, 0, 6, 0, 1, 1, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 3, 0, 0, 0],
            [0, 0, 3, 0, 0, 0, 0],
            [0, 1, 3, 3, 0, 0, 0],
          ],
          sockets: [],
          pivot: [1, 0, 2],
          states: ['default'],
          initialState: 'default',
          interactions: [],
          smash: { enabled: false, rebuild: true, sound: 'snd_woodcrash1', studs: 0 },
          generator: { environments: ['city'], weight: 0, placeOn: 'street' },
        },
      },
    });
    e.studioCharacter.value = 'chr_bodyrex001';
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  const sheet = page.getByRole('tablist', { name: 'Character sheet' });
  await sheet.getByRole('tab', { name: 'Body' }).click();
  // a family
  await page.locator('[data-tour="body-family-fourLegs"]').click();
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.family).toBe('fourLegs');
  // the Look tab says where the look went; Try it is for minifigs
  await sheet.getByRole('tab', { name: 'Look' }).click();
  await expect(page.locator('[data-tour="body-note"]')).toContainText('four legs body');
  await expect(page.getByRole('group', { name: 'Try it' })).toHaveCount(0);
  await sheet.getByRole('tab', { name: 'Body' }).click();
  // sliders and colours
  await page.locator('[data-tour="body-param-tail"]').fill('1.6');
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.params?.tail).toBe(1.6);
  await page.locator('[data-tour="body-color-main"]').fill('#f4f4f4');
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.colors?.main).toBe('#f4f4f4');
  // walk on the spot, with the skeleton showing
  await page.locator('[data-tour="body-walk"]').click();
  await expect(page.locator('[data-tour="body-walk"]')).toHaveText(/Stand/);
  await page.locator('[data-tour="body-bones"]').check();
  await page.screenshot({ path: 'test-results/bodies-walk.png' });

  // a skeleton of its own
  await page.locator('[data-tour="skeleton-edit"]').click();
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.plan).toMatch(/^bpl_/);
  const planId = (await body(page, 'chr_bodyrex001'))!.plan!;
  expect((await plan(page, planId))!.bones.filter((b) => b.role === 'tail').length).toBeGreaterThanOrEqual(4);
  const bones = page.getByRole('listbox', { name: 'Bones' });
  await bones.locator('[data-name="head"]').click();
  await page.locator('[data-tour="skeleton-add"]').click();
  await expect.poll(async () => (await plan(page, planId))!.bones.some((b) => b.parent === 'head')).toBe(true);
  await page.getByLabel('Bone name').fill('horn');
  await page.getByLabel('Bone name').press('Enter');
  await expect.poll(async () => (await plan(page, planId))!.bones.some((b) => b.name === 'horn')).toBe(true);
  await page.locator('[data-tour="skeleton-brick"]').click();
  await expect.poll(async () => (await plan(page, planId))!.bricks.some((k) => k.bone === 'horn')).toBe(true);
  await page.getByLabel('Role').selectOption('tail');
  await expect.poll(async () => (await plan(page, planId))!.bones.find((b) => b.name === 'horn')?.role).toBe('tail');
  await page.getByLabel('Swing°').fill('45');
  await page.getByLabel('Swing°').press('Tab');
  await expect.poll(async () => (await plan(page, planId))!.bones.find((b) => b.name === 'horn')?.swing).toBe(45);
  // a bone without a root cannot be made: the root cannot be removed
  await bones.locator('[data-name="body"]').click();
  await expect(page.locator('[data-tour="skeleton-remove"]')).toBeDisabled();
  // removing the horn gives its brick to the head
  await bones.locator('[data-name="horn"]').click();
  await page.locator('[data-tour="skeleton-remove"]').click();
  await expect.poll(async () => (await plan(page, planId))!.bones.some((b) => b.name === 'horn')).toBe(false);
  expect((await plan(page, planId))!.bricks.some((k) => k.bone === 'horn')).toBe(false);
  // the plan shows beside the families; undo puts the horn back
  await expect(page.locator(`[data-tour="body-plan-${planId}"]`)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await plan(page, planId))!.bones.some((b) => b.name === 'horn')).toBe(true);

  // a brick build worn on the skeleton; painting moves a brick to another bone
  await page.getByLabel('Brick build').selectOption('ast_bodybeast1');
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.asset).toBe('ast_bodybeast1');
  await page.getByLabel('Paint bricks onto').selectOption('tail 1');
  await expect(page.getByRole('status').filter({ hasText: 'follows “tail 1”' })).toBeVisible();
  const canvas = page.locator('canvas[aria-label="Character preview"]');
  const box = (await canvas.boundingBox())!;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.45, 0.6],
    [0.55, 0.4],
  ] as const) {
    if (Object.keys((await body(page, 'chr_bodyrex001'))?.attach ?? {}).length) break;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(500);
  }
  await expect.poll(async () => Object.values((await body(page, 'chr_bodyrex001'))?.attach ?? {})).toContain('tail 1');
  await page.screenshot({ path: 'test-results/bodies-bricks.png' });
  await page.locator('[data-tour="body-autoattach"]').click();
  await expect.poll(async () => (await body(page, 'chr_bodyrex001'))?.attach).toBeUndefined();
  await page.getByLabel('Paint bricks onto').selectOption('');

  // the player character is a bird; Rex walks on the map
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    e.exec({
      type: 'character.create',
      payload: {
        character: {
          id: 'chr_bodybird01',
          name: 'Pip',
          role: 'hero',
          profile: { name: 'Pip' },
          body: { family: 'bird' },
        },
      },
    });
    e.exec({ type: 'project.update', payload: { hero: 'chr_bodybird01' } });
  });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await expect.poll(() => get(page, (e) => !!e.session.value), { timeout: 60_000 }).toBe(true);
  const play = await get(page, (e) => {
    const s = e.session.value!;
    const rex = s.world.npcs.find((n) => n.profile.name === 'Rex');
    const hero = s.bodyOf('hero');
    const r = rex ? s.bodyOf(rex) : null;
    return { hero: hero?.move, rex: r?.bones.length ?? 0, rexAsset: !!rex };
  });
  expect(play.hero).toBe('fly');
  expect(play.rexAsset).toBe(true);
  expect(play.rex).toBeGreaterThan(5);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/bodies-play.png' });
  expect(errors).toEqual([]);
});

async function doItForMe(card: Locator, timeout: number, what: string) {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

test('Creatures course: Do it for me makes Rex a dog with a horn and a wagging tail, and plays', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Creatures course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(9);
  const titles: string[] = [];
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    titles.push(title);
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 120_000, `${pos} ${title}`);
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(titles).toContain('Rex on the map');
  const rex = await get(page, (e) =>
    e.store
      .list('characters/')
      .map((p) => e.store.get(p) as { name: string; body?: Body })
      .find((c) => c.name === 'Rex'),
  );
  expect(rex?.body?.plan).toMatch(/^bpl_/);
  const p = await plan(page, rex!.body!.plan!);
  expect(p!.bones.some((b) => b.name === 'horn')).toBe(true);
  expect(p!.bones.find((b) => b.name === 'tail 1')!.swing).toBeGreaterThanOrEqual(40);
  expect(errors).toEqual([]);
});
