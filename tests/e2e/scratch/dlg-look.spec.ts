import { expect, test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: { list(p: string): string[]; get(p: string): unknown };
  mapId: { value: string };
  charTab: { value: string };
  dialogueId: { value: string | null };
  dialogueView: { value: string };
  studioCharacter: { value: string | null };
};
const SCRIPT = `== start
[if talks > 0] Knight (happy): Back again?
Knight: Halt! Who goes there?
* A friend -> friend
* Nobody [if gems >= 5] [grey] -> end
* Run away -> end

== friend
> add gems 5
> like +10
Knight (happy): Then pass, friend. Here, take these gems.
Narrator: The knight steps aside.`;

test('look at the dialogue editor and play', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    (e as unknown as { exec(c: unknown): unknown }).exec({ type: 'project.update', payload: {} });
  });
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'World', exact: true }).click();
  await page.getByRole('menuitem', { name: /Training yard/ }).click();
  const knight = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const p = e.store
      .list('characters/')
      .find((x) => (e.store.get(x) as { name: string }).name.toLowerCase().includes('knight'))!;
    return e.store.get(p) as { id: string; name: string };
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.evaluate((id) => ((window as unknown as { __editor: Ed }).__editor.studioCharacter.value = id), knight.id);
  await page.getByRole('tab', { name: 'Dialogue' }).click();
  await page
    .getByRole('button', { name: /New conversation/ })
    .first()
    .click();
  await page.getByRole('radio', { name: 'Script' }).click();
  const ta = page.getByLabel('Conversation script');
  await ta.fill(SCRIPT.replaceAll('Knight', knight.name));
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('radio', { name: 'List' }).click();
  await page.screenshot({ path: 'test-results/dlg-list.png' });
  await page.getByRole('radio', { name: 'Graph' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/dlg-graph.png' });
  await page.getByRole('button', { name: '▶ Preview' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/dlg-preview.png' });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.locator('[data-tour="tab-project"]').click();
  await page.locator('[data-tour="game-dialogue"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/dlg-gallery.png' });
  // play: walk to the knight and talk
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    (e as unknown as { exec(c: unknown): unknown }).exec({
      type: 'project.update',
      payload: { dialogue: { textSpeed: 0 } },
    });
  });
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Play this map/ }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const started = await page.evaluate(() => {
    const e = (
      window as unknown as {
        __editor: {
          session: {
            value: {
              world: { npcs: { state: { x: number; z: number } }[] };
              placeAt(p: number[], yaw: number): void;
              talk(): void;
              talks: { active: boolean };
            };
          };
        };
      }
    ).__editor;
    const s = e.session.value;
    const n = s.world.npcs[0]!;
    s.placeAt([n.state.x, 1, n.state.z - 2], 0);
    s.talk();
    const ss = s as unknown as {
      talking: unknown;
      events: { msg: string }[];
      snapshot: { get(p: string): unknown; keys(): Iterable<string> };
    };
    return {
      active: s.talks.active,
      talking: !!ss.talking,
      ev: ss.events?.slice(-5).map((x) => x.msg),
      dlg: [...ss.snapshot.keys()].filter((k) => k.startsWith('dialogue/')),
      n: s.world.npcs.length,
    };
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/dlg-play.png' });
  console.log('started', JSON.stringify(started), errors);
});
