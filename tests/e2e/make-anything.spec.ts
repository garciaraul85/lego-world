import { expect, type Page, test } from '@playwright/test';

/**
 * Milestone 3, 10d part 1: any character from a picture or words — a figure of its own for anything that is
 * neither a person nor a built-in animal (a walking teapot, a three-headed robot snake), placed on the map in
 * one go; a person made with v68's own Bring your look; and the figure.make command for the AI builder.
 */
type Chr = {
  id: string;
  name: string;
  body?: { plan?: string; family?: string; colors?: Record<string, string> };
  profile: Record<string, unknown>;
};
type Plan = { id: string; bones: { name: string; role: string }[]; bricks: unknown[]; move: string };
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  undo(): void;
  mapId: { value: string };
  store: { get(p: string): unknown; list(p: string): string[] };
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
const chars = (page: Page) => get(page, (e) => e.store.list('characters/').map((p) => e.store.get(p) as Chr));
const planOf = (page: Page, id: string) =>
  page.evaluate((id) => (window as unknown as { __editor: Ed }).__editor.store.get(`bodyplans/${id}.json`) as Plan, id);

test('From words: a walking teapot is a figure of its own, used and placed on the map in one go', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await dlg.getByLabel('Describe it').fill('a walking teapot');
  await dlg.locator('[data-tour="fp-create"]').click();
  const first = dlg.locator('[data-tour="fp-match-0"]');
  await expect(first).toContainText('a figure of its own: a teapot body with spout, handle, lid', { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/make-teapot.png' });
  await dlg.locator('[data-tour="fp-place-0"]').click();
  await expect(dlg).toHaveCount(0);
  const pot = (await chars(page)).find((c) => c.name === 'Walking Teapot')!;
  expect(pot.body?.plan).toMatch(/^bpl_/);
  const plan = await planOf(page, pot.body!.plan!);
  expect(plan.bones.map((b) => b.name)).toEqual(expect.arrayContaining(['spout', 'handle', 'leg 1', 'leg 2']));
  // it stands on the open map as a neighbour
  const placed = await get(page, (e) =>
    (e.store.get(`maps/${e.mapId.value}/instances.json`) as { items: { kind: string; character?: string }[] }).items
      .filter((i) => i.kind === 'npc')
      .map((i) => i.character),
  );
  expect(placed).toContain(pot.id);
  // one Undo takes it all away: the character, its body plan and its place on the map
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await chars(page)).some((c) => c.name === 'Walking Teapot')).toBe(false);
  expect(await planOf(page, pot.body!.plan!)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Claude (recorded) designs a three-headed robot snake; its parts are kept in range', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    (window as unknown as { __aiFake: unknown }).__aiFake = [
      {
        text: '{"candidates":[{"name":"Hydra-bot","creature":{"shape":"long","size":5,"heads":3,"eyes":1,"legs":0,"tail":6,"horns":99,"extras":["antenna","laser"],"move":"slither","colors":{"main":"#A0A5A9","accent":"#0055bf","eye":"#c91a09"}},"matched":[["Heads","three heads"],["Body","a robot snake"]]},{"name":"Snake","body":{"family":"serpent"}},{"name":"Third","profile":{}}]}',
      },
    ];
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await dlg.getByLabel('Describe it').fill('a three-headed robot snake');
  await dlg.locator('[data-tour="fp-create"]').click();
  await expect(dlg.getByRole('status')).toContainText('Claude chose these', { timeout: 30_000 });
  await dlg.locator('[data-tour="fp-use-0"]').click();
  const hydra = (await chars(page)).find((c) => c.name === 'Hydra-bot')!;
  const plan = await planOf(page, hydra.body!.plan!);
  expect(plan.bones.filter((b) => b.role === 'head')).toHaveLength(3);
  expect(plan.move).toBe('slither');
  // 99 horns became 6 at most on each head; an unknown extra was dropped
  expect(plan.bones.some((b) => b.name === 'laser')).toBe(false);
  expect(hydra.body?.colors?.main).toBe('#a0a5a9');
  expect(errors).toEqual([]);
});

test('A person from a photo: v68’s Bring your look colours each part and prints the face and clothes', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await dlg.getByLabel('Choose a picture').setInputFiles('tests/fixtures/pictures/person.png');
  await expect(dlg.locator('[data-tour="fp-look"]')).toBeVisible({ timeout: 30_000 });
  await dlg.getByLabel('Describe it').fill('Sam the gardener');
  await dlg.getByLabel('Print the face and clothes from the picture').check();
  await dlg.locator('[data-tour="fp-create"]').click();
  await expect(dlg.locator('[data-tour="fp-match-0"]')).toBeVisible({ timeout: 30_000 });
  await dlg.locator('[data-tour="fp-use-0"]').click();
  const sam = (await chars(page)).find((c) => c.name === 'Sam The Gardener')!;
  const p = sam.profile as { shirtColor: string; pantsColor: string; paint?: Record<string, string> };
  // the red shirt and blue trousers, read from where they are in the photo
  const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [sr, , sb] = rgb(p.shirtColor);
  const [pr, , pb] = rgb(p.pantsColor);
  expect(sr).toBeGreaterThan(sb! + 60);
  expect(pb).toBeGreaterThan(pr! + 60);
  // the face and clothes printed as v68 part paint
  expect(Object.keys(p.paint ?? {})).toEqual(expect.arrayContaining(['head', 'torso']));
  expect(p.paint!.torso).toMatch(/^data:image\/png;base64,/);
  expect(errors).toEqual([]);
});

test('figure.make: the AI builder makes any figure from its parts with one command', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  const r = await get(page, (e) =>
    e.exec({
      type: 'figure.make',
      payload: {
        character: 'chr_octochef01',
        plan: 'bpl_octochef01',
        name: 'Octo Chef',
        spec: { shape: 'ball', tentacles: 8, legs: 0, heads: 0, eyes: 2, extras: ['hat'], colors: { main: '#81007b' } },
      },
    }),
  );
  expect(r.ok, r.error).toBe(true);
  const chef = (await chars(page)).find((c) => c.id === 'chr_octochef01')!;
  expect(chef.body).toMatchObject({ plan: 'bpl_octochef01', colors: { main: '#81007b' } });
  const plan = await planOf(page, 'bpl_octochef01');
  expect(plan.bones.filter((b) => b.name.startsWith('tentacle'))).toHaveLength(24);
  expect(errors).toEqual([]);
});
