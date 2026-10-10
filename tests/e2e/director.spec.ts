import { expect, type Page, test } from '@playwright/test';

type Cin = { id: string; marks: { id: string }[]; tracks: { kind: string; items: { t: number }[] }[] };
type Ed = {
  scene: { value: { count: number } | null };
  cinematicId: { value: string | null };
  store: { get(p: string): unknown };
  session: { value: { cine: { active: boolean; player: { cin: { id: string } } | null } } | null };
  bus: { history(): { label: string }[] };
};
const ed = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.cinematicId.value);
const scene = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`cinematics/${e.cinematicId.value}.json`) as Cin;
  });

test('Director: author a scene without typing numbers, then play it in the game and skip', async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 30_000,
    },
  );
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Cinematics' }).click();
  await page.getByRole('button', { name: 'New empty scene' }).click();
  expect(await ed(page)).toMatch(/^cin_/);
  await expect(page.getByLabel('Stage view')).toBeVisible();
  await expect(page.getByLabel('Camera preview')).toBeVisible();

  // Record: the hero walks to where we click on the stage
  await page.getByRole('button', { name: /Record/ }).click();
  const stage = page.getByLabel('Stage view');
  const box = (await stage.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.7);
  let cin = await scene(page);
  expect(cin.marks.length).toBe(2);
  expect(cin.tracks.find((t) => t.kind === 'actor')!.items.length).toBe(1);
  await page.getByRole('button', { name: /Record/ }).click();

  // move the playhead on the ruler, then a camera from the stage view
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const rb = (await ruler.boundingBox())!;
  await page.mouse.click(rb.x + rb.width * 0.5, rb.y + rb.height / 2);
  await page.getByRole('button', { name: '🎥 Camera from view' }).click();
  cin = await scene(page);
  const cams = cin.tracks.find((t) => t.kind === 'camera')!.items;
  expect(cams.length).toBe(2);
  expect(cams[1]!.t).toBeCloseTo(3, 0);

  // a line of dialogue: + on the hero row, then pick "Say a line"
  await page.getByRole('button', { name: 'Add to hero' }).click();
  await page.getByLabel('Does').selectOption('say');
  await expect(page.getByRole('button', { name: /hero: “Hello!”/ })).toBeVisible();

  // drag the say item along the timeline: it moves and snaps to 0.1 s
  const item = page.getByRole('button', { name: /hero: “Hello!”/ });
  const ib = (await item.boundingBox())!;
  await page.mouse.move(ib.x + 6, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(ib.x + 6 - rb.width * 0.2, ib.y + ib.height / 2, { steps: 6 });
  await page.mouse.up();
  cin = await scene(page);
  const say = cin.tracks.find((t) => t.kind === 'actor')!.items.find((i) => 'text' in i)!;
  expect(say.t).toBeLessThan(2.5);
  expect(Math.round(say.t * 10) / 10).toBeCloseTo(say.t, 6);

  // play it in the game: the scene runs, Esc skips it
  await page.getByRole('button', { name: '▶ Play in game' }).click();
  await page.waitForFunction(
    () => !!(window as unknown as { __editor: Ed }).__editor.session.value?.cine.active,
    undefined,
    { timeout: 120_000 },
  );
  await expect(page.getByRole('button', { name: /Skip/ })).toBeVisible();
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !(window as unknown as { __editor: Ed }).__editor.session.value?.cine.active,
    undefined,
    { timeout: 60_000 },
  );
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});
