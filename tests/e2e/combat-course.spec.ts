import { expect, type Locator, type Page, test } from '@playwright/test';

/** P9c: the combat course, from Help: Do it for me through every step builds the yard, an enemy and a wire. */
type Ed = {
  scene: { value: { count: number } | null };
  mapDoc: { value: { name: string } | null };
  store: { list(p: string): string[]; get(p: string): unknown; manifest: { name: string } };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());

async function doItForMe(card: Locator, timeout: number, what: string) {
  await card.getByRole('button', { name: 'Do it for me' }).click();
  const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
  const done = card.getByText(/✓ Done!/);
  await expect(rest.or(done), what).toBeVisible({ timeout });
  if (await rest.isVisible()) await rest.click();
  await expect(done, what).toBeVisible({ timeout });
}

test('Combat course: Do it for me adds the Training yard, makes the knight tougher, wires a dummy, plays', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Combat course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(5);
  for (let i = 0; i < total + 2; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) {
      await expect(doIt).toBeEnabled({ timeout: 30_000 });
      await doItForMe(card, 180_000, `${pos} ${title}`);
      if (title === 'An enemy') {
        const knight = await get(page, (e) =>
          e.store
            .list('characters/')
            .map((p) => e.store.get(p) as { name: string; enemy?: { power: number; windup: number } })
            .find((c) => c.name === 'Sparring knight'),
        );
        expect(knight?.enemy).toMatchObject({ power: 2, windup: 0.9 });
      }
      if (title === 'Fight') {
        // Play this map: the yard itself, not the game's start
        expect(
          await page.evaluate(
            () =>
              (window as unknown as { __editor: { session: { value: { world: { doc: { name: string } } } | null } } })
                .__editor.session.value?.world.doc.name,
          ),
        ).toBe('Training yard');
        await page.keyboard.press('F5');
      }
    }
    const finish = card.getByRole('button', { name: 'Finish ✓' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  }
  expect(await get(page, (e) => e.mapDoc.value?.name)).toBe('Training yard');
  const wired = await get(page, (e) =>
    e.store
      .list('logic/lg_')
      .map((p) => e.store.get(p) as { owner?: string; nodes: { type: string; args?: Record<string, unknown> }[] })
      .some(
        (g) =>
          g.owner && g.nodes.some((n) => n.type === 'event.onSmash') && g.nodes.some((n) => n.args?.state === 'open'),
      ),
  );
  expect(wired).toBe(true);
  expect(errors).toEqual([]);
});
