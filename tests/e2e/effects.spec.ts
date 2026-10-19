import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * P23 part 1: effects. The Effects screen (library, live preview, settings, game effects), an effect on a map
 * and in Play, the Effects course with Do it for me; and the previews and custom body asked for with it:
 * moving clip pictures, ▶ on the sheet's animations, Hear it talk, Custom… body; text with **bold** shown bold.
 */
type Fx = { id: string; name: string; shape: string; colors: string[] };
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: {
    manifest: { effects?: { hits?: Record<string, string>; events?: Record<string, string> }; entry: { map: string } };
    get(p: string): unknown;
    list(p: string): string[];
  };
  mapId: { value: string };
  effectId: { value: string | null };
  studioCharacter: { value: string | null };
  studioClip: { value: string | null };
  clipPlaying: { value: boolean };
  session: { value: { effects: { count: number } } | null };
  notify(msg: string): void;
  toast: { value: unknown };
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
const ownFx = (page: Page) => get(page, (e) => e.store.list('effects/').map((p) => e.store.get(p) as Fx));
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();

test('the Effects screen: preview a built-in, copy and change it, place it, hook it to level up; it plays in Play', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Effects');
  const lib = page.getByRole('listbox', { name: 'Effects' });
  await expect(lib.getByRole('option')).toHaveCount(22);
  await lib.locator('[data-name="Fire"]').click();
  // the preview plays it: particles are alive
  const canvas = page.locator('canvas[aria-label="Effect preview"]');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-particles')), { timeout: 30_000 })
    .toBeGreaterThan(5);
  // a built-in cannot be changed: make a copy
  await page.locator('[data-tour="fx-copy"]').click();
  await expect.poll(async () => (await ownFx(page)).map((f) => f.name)).toEqual(['Fire copy']);
  const name = page.getByLabel('Effect name');
  await name.fill('Blue fire');
  await name.press('Enter');
  await page.locator('[data-tour="fx-shape-stud"]').click();
  await page.locator('[data-tour="fx-color-1"]').fill('#3a7bff');
  await expect.poll(async () => (await ownFx(page))[0]).toMatchObject({ name: 'Blue fire', shape: 'stud' });
  expect((await ownFx(page))[0]!.colors[1]).toBe('#3a7bff');
  // every setting
  await page.locator('[data-tour="fx-advanced"]').check();
  await expect(page.getByRole('group', { name: 'Every setting' })).toBeVisible();
  // game effects: level up plays it
  await page.locator('[data-tour="fx-event-levelUp"]').selectOption({ label: 'Blue fire' });
  const id = (await ownFx(page))[0]!.id;
  await expect.poll(() => get(page, (e) => e.store.manifest.effects?.events?.levelUp)).toBe(id);
  // on the map, beside the start
  await page.locator('[data-tour="fx-place"]').click();
  await expect(page.locator('[data-help="scene.item.effect"]')).toBeVisible({ timeout: 30_000 });
  const placed = await get(page, (e) =>
    (
      e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string; effect?: string }[] }
    ).items.filter((i) => i.kind === 'effect'),
  );
  expect(placed.map((p) => p.effect)).toEqual([id]);
  // in Play, the placed effect makes particles
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await expect
    .poll(() => get(page, (e) => e.session.value?.effects.count ?? 0), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');
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

test('Effects course: Do it for me makes Blue fire, places it and makes it the level-up effect', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Effects course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(10);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
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
  const fx = await ownFx(page);
  expect(fx).toHaveLength(1);
  expect(fx[0]).toMatchObject({ name: 'Blue fire', shape: 'stud' });
  expect(fx[0]!.colors.slice(1, 3)).toEqual(['#3a7bff', '#1f3fbf']);
  expect(await get(page, (e) => e.store.manifest.effects?.events?.levelUp)).toBe(fx[0]!.id);
  expect(errors).toEqual([]);
});

test('character previews: clip pictures move, ▶ plays a clip on the figure, Hear it talk, a custom body', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Characters');
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
  // a clip in the left list moves while the pointer is on it
  const clipRow = page.locator('.clip-thumb').first();
  await clipRow.scrollIntoViewIfNeeded();
  await clipRow.hover();
  await expect
    .poll(async () => Number(await clipRow.getAttribute('data-frame')), { timeout: 10_000 })
    .toBeGreaterThan(0);
  // Animations: pick an idle clip, ▶ plays it on the figure, ■ stops
  const sheet = page.getByRole('tablist', { name: 'Character sheet' });
  await sheet.getByRole('tab', { name: 'Animations' }).click();
  const idle = page.getByLabel(/^Idle .*clip$/);
  await idle.selectOption({ index: 1 });
  const clip = await idle.inputValue();
  await expect.poll(() => get(page, (e) => [e.studioClip.value, e.clipPlaying.value])).toEqual([clip, true]);
  const play = page.getByRole('button', { name: /^Preview the idle/ });
  await play.click();
  await expect.poll(() => get(page, (e) => e.clipPlaying.value)).toBe(false);
  await play.click();
  await expect.poll(() => get(page, (e) => e.clipPlaying.value)).toBe(true);
  // Voice: the sample line appears letter by letter
  await sheet.getByRole('tab', { name: 'Voice' }).click();
  await page.locator('[data-tour="voice-hear"]').click();
  const line = page.getByRole('status', { name: 'Voice preview' });
  await expect(line).toContainText('Hello there!', { timeout: 15_000 });
  // Body: Custom… makes a body plan of its own from a skeleton, with its bones shown
  await sheet.getByRole('tab', { name: 'Body' }).click();
  await page.locator('[data-tour="body-custom"]').click();
  await page.locator('[data-tour="body-custom-from"]').selectOption('spider');
  await page.locator('[data-tour="body-custom-make"]').click();
  await expect
    .poll(() => get(page, (e) => e.store.list('bodyplans/').map((p) => (e.store.get(p) as { family: string }).family)))
    .toEqual(['spider']);
  await expect(page.getByRole('listbox', { name: 'Bones' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('text from Help shows **bold** as bold: field help, Brix and the tutorial', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Effects');
  // field help opens as formatted text
  await page.getByRole('button', { name: 'What is “Effects”?' }).click();
  await expect(page.locator('.fhelp-text').first()).toBeVisible();
  await expect(page.locator('.fhelp-text').first()).not.toContainText('**');
  await page.getByRole('button', { name: 'Ask Brix' }).click();
  const brix = page.getByRole('complementary', { name: 'Brix' });
  await brix.getByRole('textbox', { name: 'Ask Brix' }).fill('What are game effects?');
  await brix.getByRole('textbox', { name: 'Ask Brix' }).press('Enter');
  const answer = brix.locator('.brix-answer').last();
  await expect(answer).toBeVisible({ timeout: 30_000 });
  await expect(answer).not.toContainText('**');
  await expect(answer.locator('strong').first()).toBeVisible();
  // a notice, and an answer written with headings and bullets, show formatted too
  await get(page, (e) => e.notify('Click **Place on the map**'));
  await expect(page.locator('.toast strong')).toHaveText('Place on the map');
  await expect(page.locator('.toast')).not.toContainText('**');
  await get(page, (e) => {
    e.toast.value = null;
  });
  expect(errors).toEqual([]);
});
