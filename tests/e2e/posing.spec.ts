import { expect, type Page, test } from '@playwright/test';

/**
 * P23 part 4: animation by posing — a clip made pose by pose in the Poses view (the motion between filled in) —
 * and the animation state machine on the character sheet: the built-in moves, Try it lighting the state that
 * picks, and in the game the hero walking with its walk clip.
 */
type Clip = { id: string; name?: string; tracks: { bone: string; prop: string; keys: [number, number, string][] }[] };
type Ed = {
  scene: { value: { count: number } | null };
  studioCharacter: { value: string | null };
  studioClip: { value: string | null };
  clipTime: { value: number };
  stateShown: { value: string };
  store: { get(p: string): unknown; list(p: string): string[]; manifest: { hero?: string } };
  session: { value: { animStateOf(w: 'hero'): string; heroAnim: { clip: { name?: string } | null } } | null };
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
const ws = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();
const ownClip = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const id = e.studioClip.value;
    return id ? ((e.store.get(`clips/${id}.json`) as Clip | undefined) ?? null) : null;
  });
const times = (c: Clip | null) =>
  [...new Set((c?.tracks ?? []).flatMap((t) => t.keys.map((k) => Math.round(k[0] * 100) / 100)))].sort((a, b) => a - b);
const value = (c: Clip | null, bone: string, prop: string, t: number) =>
  c?.tracks.find((x) => x.bone === bone && x.prop === prop)?.keys.find((k) => Math.abs(k[0] - t) < 1e-3)?.[1];

test('a clip made pose by pose: two poses, an arm raised in the middle one, mirrored and eased', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Characters');
  await page.locator('[data-tour="clip-new"]').click();
  await page.locator('[data-tour="clip-view-poses"]').click();
  await expect(page.getByRole('listbox', { name: 'Poses' })).toBeVisible();
  // a pose at the start, one at the end
  await page.locator('[data-tour="pose-add"]').click();
  await expect.poll(async () => times(await ownClip(page))).toEqual([0]);
  await page.evaluate(() => {
    (window as unknown as { __editor: Ed }).__editor.clipTime.value = 2;
  });
  await page.locator('[data-tour="pose-add"]').click();
  await expect.poll(async () => times(await ownClip(page))).toEqual([0, 2]);
  // in the middle: moving a joint makes a pose there
  await page.evaluate(() => {
    (window as unknown as { __editor: Ed }).__editor.clipTime.value = 1;
  });
  await expect(page.locator('.pose-panel .sech')).toContainText('Between poses');
  await page.getByRole('slider', { name: 'Right arm out' }).fill('2.6');
  await expect.poll(async () => times(await ownClip(page))).toEqual([0, 1, 2]);
  await expect.poll(async () => value(await ownClip(page), 'rightArm', 'z', 1)).toBeCloseTo(2.6);
  await expect(page.getByRole('option', { name: 'Pose 2 at 1 s' })).toHaveAttribute('aria-selected', 'true');
  // the start and end poses still stand
  expect(value(await ownClip(page), 'rightArm', 'z', 0)).toBeCloseTo(0.06);
  // mirror: the left arm goes up instead
  await page.locator('[data-tour="pose-mirror"]').click();
  await expect.poll(async () => value(await ownClip(page), 'leftArm', 'z', 1)).toBeCloseTo(-2.6);
  // hold, then jump into the next pose
  await page.locator('[data-tour="pose-ease"]').selectOption({ label: 'Hold, then jump' });
  await expect
    .poll(async () => (await ownClip(page))?.tracks.find((t) => t.bone === 'leftArm' && t.prop === 'z')?.keys[1]?.[2])
    .toBe('step');
  // copy pose 2 and paste it at the end
  await page.locator('[data-tour="pose-copy"]').click();
  await page.getByRole('option', { name: 'Pose 3 at 2 s' }).click();
  await page.locator('[data-tour="pose-paste"]').click();
  await expect.poll(async () => value(await ownClip(page), 'leftArm', 'z', 2)).toBeCloseTo(-2.6);
  // the Keys view shows the same clip track by track
  await page.locator('[data-tour="clip-view-keys"]').click();
  await expect(page.locator('.pose-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('states: the built-in moves, Try it lights the state that picks, and the hero walks with its walk clip', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await ws(page, 'Characters');
  // a new character made the player character
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
  await page.locator('[data-tour="char-hero"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.manifest.hero))
    .toBeTruthy();
  const hero = await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.store.manifest.hero);
  await page.getByRole('tablist', { name: 'Character sheet' }).getByRole('tab', { name: 'Animations' }).click();
  await expect(page.getByRole('list', { name: 'States' }).getByRole('listitem')).toHaveCount(6);
  await page.locator('[data-tour="states-builtin"]').click();
  await expect
    .poll(() =>
      page.evaluate((h) => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return (e.store.get(`characters/${h}.json`) as { animations?: Record<string, string> }).animations;
      }, hero),
    )
    .toMatchObject({ walk: 'clp_movewalk00', run: 'clp_moverun000', attack: 'clp_moveswing0' });
  // Try it: faster than the run speed is Run; a hit is Hurt for a moment
  await page.getByRole('slider', { name: 'Try: speed' }).fill('8');
  await expect(page.locator('[data-tour="state-run"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-tour="states-now"]')).toHaveText('Run');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.studioClip.value))
    .toBe('clp_moverun000');
  await page.locator('[data-tour="try-hit"]').click();
  await expect(page.locator('[data-tour="states-now"]')).toHaveText('Hurt');
  await expect(page.locator('[data-tour="states-now"]')).toHaveText('Run', { timeout: 5000 });
  await page.getByRole('slider', { name: 'Try: speed' }).fill('2');
  await expect(page.locator('[data-tour="states-now"]')).toHaveText('Walk');
  // a slower run speed: 2 studs a second is running now
  await page.getByLabel('Runs from (studs a second)').fill('1.5');
  await page.getByLabel('Runs from (studs a second)').press('Enter');
  await expect(page.locator('[data-tour="state-run"]')).toContainText('1.5 studs');
  await expect(page.locator('[data-tour="states-now"]')).toHaveText('Run');
  await page.getByLabel('Runs from (studs a second)').fill('6');
  await page.getByLabel('Runs from (studs a second)').press('Enter');

  // in the game: walking plays the walk clip
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.getByLabel('Game view').click();
  await page.keyboard.down('w');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (window as unknown as { __editor: Ed }).__editor.session.value;
          return s ? `${s.animStateOf('hero')}:${s.heroAnim.clip?.name ?? '-'}` : '';
        }),
      { timeout: 20_000 },
    )
    .toBe('walk:Walk');
  await page.keyboard.up('w');
  await page.keyboard.press('F5');
  expect(errors).toEqual([]);
});

test('Posing and states course: Do it for me makes the clip pose by pose, gives Pip his states and walks him in Play', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Posing and states course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(12);
  for (let i = 0; i < total; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await doIt.click();
      const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
      const done = card.getByText(/✓ Done!/);
      await expect(rest.or(done), `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
      if (await rest.isVisible()) await rest.click();
      await expect(done, `${pos} ${title}`).toBeVisible({ timeout: 120_000 });
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(errors).toEqual([]);
});
