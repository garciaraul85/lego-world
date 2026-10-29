import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Milestone 3, 10d: the old studio's body shaping (chest, hips, neckline) in Look, and its drawing in a Draw tab —
 * live on the figure, one undo step per drag or stroke — and the Shape and draw course with Do it for me.
 */
type Chr = { id: string; name: string; profile: Record<string, unknown> & { paint?: Record<string, string> } };
type Ed = {
  scene: { value: { count: number } | null };
  studioCharacter: { value: string | null };
  store: { get(p: string): unknown; list(p: string): string[] };
  exec(c: unknown): { ok: boolean; error?: string };
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
const current = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`characters/${e.studioCharacter.value}.json`) as Chr;
  });
/** a new character from a preset, open in the studio */
async function newPirate(page: Page) {
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-new"]').click();
  await page
    .getByRole('listbox', { name: 'New character from a preset' })
    .getByRole('option')
    .filter({ hasText: /Pirate/ })
    .first()
    .click();
  await expect.poll(async () => (await current(page))?.name).toBe('Pirate');
}
/** a pixel of the Draw tab's square, as [r, g, b] (x, y from 0 to 1) */
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const c = document.querySelector('[data-tour="draw-canvas"]') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(Math.floor(x! * 255), Math.floor(y! * 255), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    [x, y],
  );
async function stroke(page: Page, canvas: Locator, from: [number, number], to: [number, number]) {
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 10 });
  await page.mouse.up();
}

test('Body shape in Look: the chest for a Female body, hips and neckline; a drag shows live and is one undo step', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await newPirate(page);
  const props = page.getByRole('region', { name: 'Character properties' });
  // a Male body has no chest controls (as in v68); Female shows them, with v68's own choices
  await expect(props.getByRole('button', { name: /^Breast mode: / })).toHaveCount(0);
  await props.getByRole('button', { name: /^Gender: / }).click();
  await page.locator('[data-tour="pick-gender-list"] [data-value="Female"]').click();
  await expect(props.getByRole('button', { name: /^Breast mode: Sculpted/ })).toBeVisible();
  await props.getByRole('button', { name: /^Breast shape: / }).click();
  await page.locator('[data-tour="pick-breastShape-list"] [data-value="Teardrop"]').click();
  expect((await current(page)).profile.breastShape).toBe('Teardrop');
  // dragging the size: nothing is saved until it is let go, then one undo step
  const size = page.locator('[data-tour="breastSize"]');
  const before = (await current(page)).profile.breastSize;
  await size.evaluate((el: HTMLInputElement) => {
    el.value = '120';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(props.getByText('Breast size 120')).toBeVisible();
  expect((await current(page)).profile.breastSize).toBe(before);
  await size.evaluate((el: HTMLInputElement) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await expect.poll(async () => (await current(page)).profile.breastSize).toBe(120);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/shape-chest.png' });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await current(page)).profile.breastSize).toBe(before);
  // hips and neckline
  await page.locator('[data-tour="buttSize"]').fill('80');
  await expect.poll(async () => (await current(page)).profile.buttSize).toBe(80);
  await props.getByRole('button', { name: /^Neckline: / }).click();
  await page.locator('[data-tour="pick-neckline-list"] [data-value="Sweetheart"]').click();
  await page.locator('[data-tour="necklineDepth"]').fill('70');
  await expect.poll(async () => (await current(page)).profile.necklineDepth).toBe(70);
  expect((await current(page)).profile.neckline).toBe('Sweetheart');
  // a Male body has no chest controls (as in v68), but keeps hips and nipples
  await props.getByRole('button', { name: /^Gender: / }).click();
  await page.locator('[data-tour="pick-gender-list"] [data-value="Male"]').click();
  await expect(props.getByRole('button', { name: /^Breast mode: / })).toHaveCount(0);
  await expect(page.locator('[data-tour="buttSize"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Draw tab: pen, undo, fill, pick, a picture, and a hat put on to draw on — live on the figure, kept in the character', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await newPirate(page);
  await page.locator('[data-tour="sheet-draw"]').click();
  const canvas = page.locator('[data-tour="draw-canvas"]');
  await expect(canvas).toBeVisible();
  // the head's front shows the face under the drawing
  await page.locator('[data-tour="draw-part"]').selectOption('head');
  await page.locator('[data-tour="draw-side-front"]').click();
  await expect(canvas).toHaveAttribute('aria-label', 'Drawing: Head / face, front');
  // a blue line across the forehead: one stroke, one undo step
  await page.locator('[data-tour="draw-color"]').fill('#0055bf');
  await page.locator('[data-tour="draw-size"]').fill('10');
  await stroke(page, canvas, [0.2, 0.35], [0.8, 0.35]);
  await expect.poll(async () => !!(await current(page)).profile.paint?.head).toBe(true);
  const [r, , b] = await pixel(page, 0.5, 0.35);
  expect(b).toBeGreaterThan(150);
  expect(r).toBeLessThan(60);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/draw-head-line.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => !!(await current(page)).profile.paint?.head).toBe(false);
  // Fill colours the joined area: the torso's back, all green
  await page.locator('[data-tour="draw-part"]').selectOption('torso');
  await page.locator('[data-tour="draw-side-back"]').click();
  await page.locator('[data-tour="draw-tool-fill"]').click();
  await page.locator('[data-tour="draw-color"]').fill('#00852b');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => !!(await current(page)).profile.paint?.torso).toBe(true);
  const [, g] = await pixel(page, 0.5, 0.5);
  expect(g).toBeGreaterThan(110);
  // Pick takes that green back off the side
  await page.locator('[data-tour="draw-color"]').fill('#ffffff');
  await page.locator('[data-tour="draw-tool-pick"]').click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-tour="draw-color"]')).toHaveValue('#00852b');
  // a picture on the torso's front
  await page.locator('[data-tour="draw-side-front"]').click();
  await page.getByLabel('Put a picture on this side').setInputFiles('tests/fixtures/pictures/fox.png');
  await expect(page.locator('[data-tour="draw-part"] option[value="torso"]')).toHaveText(/✎/);
  // drawing on a hat it doesn't wear puts one on first
  const hatBefore = (await current(page)).profile.hat;
  if (hatBefore !== 'None')
    await page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const c = e.store.get(`characters/${e.studioCharacter.value}.json`) as Chr;
      e.exec({ type: 'character.update', payload: { character: { ...c, profile: { ...c.profile, hat: 'None' } } } });
    });
  await page.locator('[data-tour="draw-part"]').selectOption('hat');
  await page.locator('[data-tour="draw-tool-pen"]').click();
  await stroke(page, canvas, [0.3, 0.5], [0.7, 0.5]);
  await expect.poll(async () => (await current(page)).profile.hat).toBe('Baseball cap');
  await expect.poll(async () => !!(await current(page)).profile.paint?.hat).toBe(true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/draw-hat.png' });
  // leaving the tab, the figure keeps its drawings
  await page.locator('[data-tour="sheet-look"]').click();
  expect(Object.keys((await current(page)).profile.paint ?? {}).sort()).toEqual(['hat', 'torso']);
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

test('Shape and draw course: Do it for me makes Nova, shapes her and draws a star and a shirt', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Shape and draw course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
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
  const nova = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store
      .list('characters/')
      .map((p) => e.store.get(p) as Chr)
      .find((c) => c.name === 'Nova')!;
  });
  expect(nova.profile).toMatchObject({
    gender: 'Female',
    breastMode: 'Sculpted',
    breastShape: 'Natural',
    breastSize: 70,
    buttShape: 'Athletic',
    buttSize: 45,
    neckline: 'V-neck',
    necklineDepth: 60,
  });
  expect(Object.keys(nova.profile.paint ?? {}).sort()).toEqual(['head', 'torso']);
  await page.screenshot({ path: 'test-results/shape-course.png' });
  expect(errors).toEqual([]);
});
