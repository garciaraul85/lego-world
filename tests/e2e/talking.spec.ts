import { expect, type Page, test } from '@playwright/test';

/**
 * P23 part 3: talking — the studio figure says a line with its mouth (Face and Voice tabs), a cinematic line
 * gets a mood and its actor talks with that face in the game.
 */
type Ed = {
  scene: { value: { count: number } | null };
  talkMouth: { value: number };
  talkHeard: { value: number };
  cinematicId: { value: string | null };
  store: { get(p: string): unknown };
  session: {
    value: {
      cine: {
        frame: { actors: Map<string, { mouth: number; mood: string | null }> } | null;
      };
    } | null;
  };
};
type Cin = { tracks: { kind: string; items: { do?: string; text?: string; mood?: string }[] }[] };

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
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();

test('the studio figure talks: Hear it talk moves its mouth, on the Face tab in a mood', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Characters');
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
  await page.getByRole('tablist', { name: 'Character sheet' }).getByRole('tab', { name: 'Face' }).click();
  await page.locator('[data-tour="face-mood-happy"]').click();
  // watch the mouth while the sample line appears: it opens and closes, and is closed at the end
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed; __mouths: number[] }).__editor;
    const w = window as unknown as { __mouths: number[] };
    w.__mouths = [];
    const t = setInterval(() => w.__mouths.push(e.talkMouth.value), 20);
    setTimeout(() => clearInterval(t), 8000);
  });
  await page.locator('[data-tour="voice-hear"]').click();
  await expect(page.getByRole('status', { name: 'Voice preview' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => new Set((window as unknown as { __mouths: number[] }).__mouths).size), {
      timeout: 20_000,
    })
    .toBeGreaterThan(1);
  await expect.poll(() => get(page, (e) => e.talkMouth.value), { timeout: 20_000 }).toBe(0);
  expect(await get(page, (e) => e.talkHeard.value)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a cinematic line with a mood: the actor talks with that face in the game', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Cinematics');
  await page.getByRole('button', { name: 'New empty scene' }).click();
  await page.getByRole('button', { name: 'Add to hero' }).click();
  await page.getByLabel('Does', { exact: true }).selectOption('say');
  await expect(page.getByRole('button', { name: /hero: “Hello!”/ })).toBeVisible();
  await page.locator('[data-tour="pick-cine-mood"]').click();
  await page.locator('[data-tour="pick-cine-mood-list"]').getByRole('option', { name: /Happy/ }).click();
  const say = () =>
    page.evaluate(() => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      const c = e.store.get(`cinematics/${e.cinematicId.value}.json`) as Cin;
      return c.tracks.flatMap((t) => t.items).find((i) => i.do === 'say') ?? null;
    });
  await expect.poll(async () => (await say())?.mood, { timeout: 30_000 }).toBe('happy');
  await expect(page.getByRole('button', { name: /hero: “Hello!” \(happy\)/ })).toBeVisible();
  // play it in the game: while the line plays the hero shows the happy face and its mouth moves
  await page.getByRole('button', { name: '▶ Play in game' }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __editor: Ed; __seen: string[] };
    w.__seen = [];
    const t = setInterval(() => {
      const f = w.__editor.session.value?.cine.frame;
      if (f) for (const a of f.actors.values()) w.__seen.push(`${a.mood}:${a.mouth}`);
    }, 20);
    setTimeout(() => clearInterval(t), 15000);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __seen: string[] }).__seen.filter((s) => s.startsWith('happy:') && !s.endsWith(':0')),
        ),
      { timeout: 30_000 },
    )
    .not.toEqual([]);
  expect(errors).toEqual([]);
});
