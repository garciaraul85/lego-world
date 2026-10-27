import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * Step 11 (P24 part 3): your own media — a GIF, a WebM video and a big PNG imported in the Media library (measured,
 * the GIF found animated), the GIF credited, the PNG shrunk everywhere it is used, a Video widget and a Credits widget
 * on a screen, and Remove unused keeping what is used.
 */
type Item = {
  name: string;
  kind: string;
  w?: number;
  h?: number;
  duration?: number;
  animated?: boolean;
  bytes: number;
};
type Ed = {
  scene: { value: { count: number } };
  store: { get(p: string): unknown };
};
const FIX = resolve(process.cwd(), 'tests/fixtures/media');

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}
const media = (page: Page) =>
  page.evaluate(
    () =>
      (
        (window as unknown as { __editor: Ed }).__editor.store.get('media/index.json') as {
          items: Record<string, Item>;
        }
      )?.items ?? {},
  );
const byName = async (page: Page, re: RegExp) => Object.values(await media(page)).find((m) => re.test(m.name));

test('Media library: import a GIF, a video and a big picture, credit, shrink; Video and Credits widgets on a screen', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-file"]').click();
  await page.getByRole('menuitem', { name: /Media library/ }).click();
  const lib = page.getByRole('dialog', { name: 'Media library' });
  await expect(lib).toBeVisible();
  await lib
    .getByLabel('Files to import')
    .setInputFiles([resolve(FIX, 'spin.gif'), resolve(FIX, 'clip.webm'), resolve(FIX, 'wide.png')]);
  await expect.poll(async () => Object.keys(await media(page)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  expect(await byName(page, /spin\.gif/)).toMatchObject({ kind: 'image', animated: true, w: 48, h: 48 });
  const clip = (await byName(page, /clip\.webm/))!;
  expect(clip).toMatchObject({ kind: 'video', w: 320, h: 180 });
  expect(clip.duration).toBeGreaterThan(1.5);
  expect(await byName(page, /wide\.png/)).toMatchObject({ kind: 'image', w: 2600, h: 1200 });
  await expect(lib.locator('.media-tag.big')).toHaveCount(1);
  // who made the GIF
  await lib.getByRole('option', { name: /spin\.gif/ }).click();
  await lib.locator('[data-tour="media-author"]').fill('Ana');
  await lib.locator('[data-tour="media-license"]').fill('CC BY 4.0');
  await lib.locator('[data-tour="media-name"]').click();
  await expect
    .poll(async () => (await byName(page, /spin/)) as unknown)
    .toMatchObject({ credit: { author: 'Ana', license: 'CC BY 4.0' } });
  // shrink the wide picture: at most 2048 across
  await lib.getByRole('option', { name: /wide\.png/ }).click();
  await page.screenshot({ path: 'test-results/media-library.png' });
  await lib.locator('[data-tour="media-shrink"]').click();
  await expect.poll(async () => (await byName(page, /^wide\./))?.w, { timeout: 30_000 }).toBe(2048);
  expect((await byName(page, /^wide\./))!.name).not.toBe('wide.png');
  await page.keyboard.press('Escape');
  await expect(lib).toHaveCount(0);

  // a screen with the video and the credits
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Screens' }).click();
  await page.getByRole('button', { name: '+ New' }).click();
  const palette = page.getByRole('group', { name: 'Add widget' });
  await palette.getByRole('button', { name: 'Add Video' }).click();
  await page.getByLabel('Video file').setInputFiles(resolve(FIX, 'clip.webm'));
  await expect(page.locator('.sc-device video.bw-video-el').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-tour="video-loop"]').check();
  await palette.getByRole('button', { name: 'Add Credits' }).click();
  await expect(page.locator('.sc-device .bw-credit').first()).toContainText('spin by Ana');
  await expect(page.locator('.sc-device .bw-credit').first()).toContainText('CC BY 4.0');
  await page.screenshot({ path: 'test-results/media-screen.png' });

  // remove what nothing uses: the video stays
  await page.locator('[data-tour="menu-file"]').click();
  await page.getByRole('menuitem', { name: /Media library/ }).click();
  await lib.locator('[data-tour="media-remove-unused"]').click();
  await expect.poll(async () => Object.values(await media(page)).map((m) => m.name)).toEqual(['clip.webm']);
  await lib.getByRole('option', { name: /clip\.webm/ }).click();
  await expect(lib.locator('[data-tour="media-remove"]')).toBeDisabled();
  await expect(lib.locator('.media-uses')).toContainText('Screen');
  expect(errors).toEqual([]);
});

test('a Video widget plays in Play and runs its end actions when the clip ends', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  // import the clip and put it on a screen of its own, ending by setting a value and closing itself
  await page.locator('[data-tour="menu-file"]').click();
  await page.getByRole('menuitem', { name: /Media library/ }).click();
  const lib = page.getByRole('dialog', { name: 'Media library' });
  await lib.getByLabel('Files to import').setInputFiles(resolve(FIX, 'clip.webm'));
  await expect.poll(async () => Object.keys(await media(page)).length, { timeout: 30_000 }).toBe(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: Ed & { exec(c: unknown): { ok: boolean; error?: string } };
      }
    ).__editor;
    const ref = Object.keys((e.store.get('media/index.json') as { items: Record<string, unknown> }).items)[0]!;
    const r = e.exec({
      type: 'screen.put',
      payload: {
        screen: {
          id: 'scr_introclip1',
          kind: 'custom',
          name: 'Intro',
          music: null,
          pausesGame: false,
          root: {
            type: 'panel',
            children: [
              {
                type: 'video',
                id: 'intro',
                anchor: [0.5, 0.5],
                style: { w: 640, h: 360, src: ref },
                onEnd: [
                  { do: 'setVar', var: 'introDone', value: true },
                  { do: 'hideScreen', screen: 'scr_introclip1' },
                ],
              },
            ],
          },
        },
      },
    });
    if (!r.ok) throw new Error(r.error);
  });
  await page.keyboard.press('F5');
  type S = {
    session: {
      value: {
        runtime: { ticks: number };
        lookup(n: string): unknown;
        uiActions: { run(a: unknown[], clock: unknown): void };
        uiClock: unknown;
      } | null;
    };
  };
  await page.waitForFunction(
    () => ((window as unknown as { __editor: S }).__editor.session.value?.runtime.ticks ?? 0) > 20,
    undefined,
    { timeout: 180_000 },
  );
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: S }).__editor.session.value!;
    s.uiActions.run([{ do: 'showScreen', screen: 'scr_introclip1' }], s.uiClock);
  });
  await expect(page.locator('video.bw-video-el')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'test-results/media-play-video.png' });
  // the 2-second clip ends: its actions run, the screen closes
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __editor: S }).__editor.session.value?.lookup('introDone')),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator('video.bw-video-el')).toHaveCount(0);
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

async function doItForMe(card: import('@playwright/test').Locator, timeout: number, what: string) {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

test('Your own media course: Do it for me imports a poster and a video, credits and shrinks, makes an intro', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors: string[] = [];
  await page.setViewportSize({ width: 1400, height: 900 });
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Your own media course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(7);
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 60_000, `${pos} ${title}`);
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  const items = Object.values(await media(page));
  expect(items.find((m) => m.kind === 'video')).toBeTruthy();
  const poster = items.find((m) => /^poster\./.test(m.name))!;
  expect(poster.w).toBe(2048);
  expect((poster as Item & { credit?: { author: string } }).credit?.author).toBe('Me');
  await expect(page.locator('.sc-device video.bw-video-el').first()).toBeVisible();
  await expect(page.locator('.sc-device .bw-credit').first()).toContainText('poster by Me');
  await page.screenshot({ path: 'test-results/media-course.png' });
  expect(errors).toEqual([]);
});
