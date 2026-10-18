import { expect, type Locator, type Page, test } from '@playwright/test';

/** P26: saving — quit and resume through the game's own screens; the saving course from Help. */
type Inst = { inst: { id: string; name?: string }; def: { name: string }; state: string };
type S = {
  world: { mapId: string; doc: { name: string }; instances: Inst[] };
  heroState: { x: number; z: number };
  placeAt(p: [number, number, number], yaw: number): void;
  setInstanceState(id: string, state: string): void;
  instanceCenter(i: Inst): [number, number, number] | null;
  inventory: Map<string, number>;
  message: string;
  slot: number;
};
type Ed = {
  scene: { value: { count: number } | null };
  mapDoc: { value: { name: string } | null };
  session: { value: S | null };
  store: { list(p: string): string[]; get(p: string): unknown; manifest: { id: string; saving?: unknown } };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());
const ses = <T>(page: Page, fn: (s: S) => T) =>
  page.evaluate((src) => {
    const f = new Function('s', `return (${src})(s)`) as (s: S) => T;
    return f((window as unknown as { __editor: Ed }).__editor.session.value!);
  }, fn.toString());

async function open(page: Page) {
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
}
const menu = async (page: Page, name: string, item: RegExp) => {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

test('quit and resume: Pause › Save game to a slot, Stop, then the title’s Continue brings everything back', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  // the sample yard (it has a checkpoint flag and a save point), played on its own
  await menu(page, 'World', /Add the Training yard/);
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name)).toBe('Training yard');
  await menu(page, 'Play', /^Play this map/);
  await expect.poll(() => get(page, (e) => !!e.session.value)).toBe(true);
  // the hero walks into the checkpoint flag: it goes up and the game autosaves
  await ses(page, (s) => {
    const f = s.world.instances.find((i) => i.def.name === 'Checkpoint flag')!;
    const c = s.instanceCenter(f)!;
    s.placeAt([c[0], 0.4, c[2] + 2.2], 0);
  });
  await expect
    .poll(() => ses(page, (s) => s.world.instances.find((i) => i.def.name === 'Checkpoint flag')!.state))
    .toBe('up');
  // something to remember: the chest open
  await ses(page, (s) => {
    const chest = s.world.instances.find((i) => i.def.name === 'Treasure chest')!;
    s.setInstanceState(chest.inst.id, 'open');
  });
  // Esc: the pause menu has Save game and Load game
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  const pause = page.getByRole('region', { name: 'Pause' });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'Load game' })).toBeVisible();
  await pause.getByRole('button', { name: 'Save game' }).click();
  const saves = page.getByRole('region', { name: 'Saves' });
  await expect(saves.getByText('Save game')).toBeVisible();
  await saves.getByRole('button', { name: 'Slot 2 · empty' }).click();
  await expect(saves).toBeHidden();
  await expect.poll(() => ses(page, (s) => s.slot)).toBe(2);
  await page.screenshot({ path: 'test-results/saving-saved.png' });

  // Stop (as closing the game), then play from the first screen: the title offers Continue
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  await expect.poll(() => get(page, (e) => !!e.session.value)).toBe(false);
  await menu(page, 'Play', /^Play from the first screen/);
  const title = page.getByRole('region', { name: 'Title' });
  await expect(title.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: 'test-results/saving-title.png' });
  await title.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => ses(page, (s) => s.world.doc.name)).toBe('Training yard');
  expect(await ses(page, (s) => s.world.instances.find((i) => i.def.name === 'Treasure chest')!.state)).toBe('open');
  expect(await ses(page, (s) => s.world.instances.find((i) => i.def.name === 'Checkpoint flag')!.state)).toBe('up');
  // the save list in Project › Saving shows it; Delete these saves gives a fresh start
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  await page.locator('[data-tour="tab-project"]').click();
  const section = page.locator('[data-tour="game-saving"]');
  await expect(section.getByText(/^Slot 2 · Training yard/)).toBeVisible();
  await section.getByRole('button', { name: 'Delete these saves' }).click();
  await expect(section.getByText('None yet.')).toBeVisible();
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

test('Saving course: Do it for me sets Saving, places a flag and a save point, saves, continues, cleans up', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Saving course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
  const titles: string[] = [];
  for (let i = 0; i < total + 2; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    titles.push(title);
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 180_000, `${pos} ${title}`);
      if (title === 'Continue')
        await expect(
          page.getByRole('region', { name: 'Title' }).getByRole('button', { name: 'Continue' }),
        ).toBeVisible();
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(titles).toContain('A fresh start');
  expect(await get(page, (e) => e.store.manifest.saving)).toEqual({ mode: 'anywhere', slots: 2, autosave: true });
  const names = await get(page, (e) => e.store.list('assets/').map((p) => (e.store.get(p) as { name: string }).name));
  expect(names).toEqual(expect.arrayContaining(['Checkpoint flag', 'Save point']));
  expect(errors).toEqual([]);
});
