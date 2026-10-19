import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * P22 part 4: faces for moods (the Face tab, the speaker's face and portrait in Play), presets for every
 * body family, and a character from a picture or words — by the editor alone, and by Claude (recorded).
 */
type Chr = {
  id: string;
  name: string;
  faces?: Record<string, Record<string, string>>;
  body?: { family?: string; colors?: Record<string, string> };
  profile: Record<string, unknown>;
};
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: {
    manifest: { hero: string | null; entry: { map: string } };
    get(p: string): unknown;
    list(p: string): string[];
  };
  studioCharacter: { value: string | null };
  session: { value: S | null };
};
type S = {
  world: { npcs: { id: number; profile: { name?: string }; state: { x: number; y: number; z: number } }[] };
  placeAt(p: number[], h: number): void;
  talk(): void;
  talks: { active: boolean; view: { mood: string; who: string } | null };
  moodFaceOf(n: unknown): Record<string, string> | null;
  portraitOf(who: string, mood: string): string | null;
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
const studio = async (page: Page) => {
  const id = await get(page, (e) => e.studioCharacter.value);
  return (await chars(page)).find((c) => c.id === id)!;
};

async function preset(page: Page, n: number) {
  await page.locator('[data-tour="char-new"]').click();
  await page.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').nth(n).click();
}

test('the Face tab: a face for each mood; in Play the speaker shows it, and its portrait', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  // the first character is the player; the second, Tom, a neighbour
  await preset(page, 0);
  await preset(page, 2);
  const tomId = (await studio(page)).id;
  await page.getByLabel('Character name').fill('Tom');
  await page.getByLabel('Character name').press('Enter');
  const sheet = page.getByRole('tablist', { name: 'Character sheet' });
  await sheet.getByRole('tab', { name: 'Face' }).click();
  const moods = page.getByRole('radiogroup', { name: 'Moods' });
  await expect(moods.getByRole('radio')).toHaveCount(6);
  await moods.getByRole('radio', { name: /Angry/ }).click();
  await page.locator('[data-tour="pick-face-angry-eyes"]').click();
  await page.locator('[data-tour="pick-face-angry-eyes-list"] [data-value="Wide"]').click();
  await expect.poll(async () => (await studio(page)).faces?.angry).toEqual({ eyes: 'Wide' });
  await moods.getByRole('radio', { name: /Happy/ }).click();
  await page.locator('[data-tour="pick-face-happy-expression"]').click();
  await page.locator('[data-tour="pick-face-happy-expression-list"] [data-value="Laughing"]').click();
  await expect.poll(async () => (await studio(page)).faces?.happy).toEqual({ expression: 'Laughing' });
  // Default puts a mood back
  await page.getByRole('button', { name: 'Default' }).click();
  await expect.poll(async () => (await studio(page)).faces?.happy).toBeUndefined();
  await page.screenshot({ path: 'test-results/faces-tab.png' });

  // a line with the angry mood, Tom on the map
  await page.evaluate((id) => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const sp = (e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] }).spawns[0]!.pos;
    const tom = e.store.get(`characters/${id}.json`) as Chr;
    e.exec([
      {
        type: 'dialogue.put',
        payload: {
          conversation: {
            id: 'dlg_facetalk01',
            name: 'Gate',
            sections: [
              {
                label: 'start',
                steps: [
                  { k: 'line', who: id, text: 'Who left the gate open?', mood: 'angry' },
                  { k: 'line', who: id, text: 'Oh, it was you closing it!', mood: 'happy' },
                ],
              },
            ],
          },
        },
      },
      { type: 'character.update', payload: { character: { ...tom, talk: [{ conversation: 'dlg_facetalk01' }] } } },
      { type: 'npc.place', payload: { map, character: id, pos: [sp[0]! + 3, sp[1]!, sp[2]! + 3], heading: 0 } },
    ]);
  }, tomId);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await expect.poll(() => get(page, (e) => !!e.session.value), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    const n = s.world.npcs.find((x) => x.profile.name === 'Tom')!;
    s.placeAt([n.state.x, n.state.y + 0.2, n.state.z - 2], 0);
    s.talk();
  });
  await expect
    .poll(() => get(page, (e) => e.session.value!.talks.view?.mood ?? null), { timeout: 30_000 })
    .toBe('angry');
  const face = await get(page, (e) => {
    const s = e.session.value!;
    return s.moodFaceOf(s.world.npcs.find((x) => x.profile.name === 'Tom'));
  });
  expect(face).toEqual({ expression: 'Angry', eyes: 'Wide' });
  // the portrait is Tom's own head (drawn on the next frames)
  await expect
    .poll(
      () =>
        get(page, (e) => (e.session.value!.portraitOf(e.session.value!.talks.view!.who, 'angry') ?? '').slice(0, 22)),
      {
        timeout: 60_000,
      },
    )
    .toBe('data:image/png;base64,');
  await page.screenshot({ path: 'test-results/faces-play.png' });
  expect(errors).toEqual([]);
});

test('From a picture: three matches from words and the picture’s colours; Claude’s answer kept to the editor’s settings', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.locator('[data-tour="char-from-picture"]').click();
  const dlg = page.getByRole('dialog', { name: 'Character from a picture' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('never saved in the game');
  await dlg.getByLabel('Choose a picture').setInputFiles('tests/fixtures/pictures/fox.png');
  await expect(dlg.getByLabel('Main colours of the picture').locator('.fp-sw')).toHaveCount(2, { timeout: 30_000 });
  await dlg.getByLabel('Describe it').fill('a little fox');
  await dlg.locator('[data-tour="fp-create"]').click();
  const matches = dlg.getByRole('list', { name: 'Matches' }).getByRole('listitem');
  await expect(matches).toHaveCount(3, { timeout: 30_000 });
  await expect(matches.first()).toContainText('Four legs (Fox)');
  await page.screenshot({ path: 'test-results/from-picture-local.png' });
  await dlg.locator('[data-tour="fp-use-0"]').click();
  await expect(dlg).toHaveCount(0);
  const fox = (await chars(page)).find((c) => c.name === 'Little Fox')!;
  expect(fox.body?.family).toBe('fourLegs');
  // the main colour is the picture's orange
  expect(fox.body?.colors?.main).toMatch(/^#d[0-9a-f]6[0-9a-f]1[0-9a-f]$/);
  // Undo takes it away
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await chars(page)).some((c) => c.name === 'Little Fox')).toBe(false);

  // Claude (recorded): an answer with JSON in words; unknown parts are dropped
  await page.evaluate(() => {
    (window as unknown as { __aiFake: unknown }).__aiFake = [
      {
        text: 'Here are three:\n{"candidates":[{"name":"Scarf Wizard","profile":{"hat":"Wizard hat","scarf":"Long scarf","shirtColor":"#0055BF","laser":"on","hair":"Rainbow"},"matched":[["Hat","the pointed hat"],["Shirt colour","the blue robe"]]},{"name":"Blue Fox","body":{"family":"fourLegs","params":{"tail":1.8},"colors":{"main":"#0055bf"}},"matched":[["Body","a fox"]]},{"name":"Third","profile":{}}]}',
      },
    ];
  });
  await page.locator('[data-tour="char-from-picture"]').click();
  await dlg.getByLabel('Describe it').fill('a blue fox wizard with a long scarf');
  await dlg.locator('[data-tour="fp-create"]').click();
  await expect(dlg.getByRole('status')).toContainText('Claude chose these', { timeout: 30_000 });
  await expect(matches).toHaveCount(3);
  await expect(matches.first()).toContainText('the pointed hat');
  await dlg.locator('[data-tour="fp-use-0"]').click();
  const wiz = (await chars(page)).find((c) => c.name === 'Scarf Wizard')!;
  expect(wiz.profile).toMatchObject({ hat: 'Wizard hat', scarf: 'Long scarf', shirtColor: '#0055bf' });
  expect(wiz.profile.laser).toBeUndefined();
  expect(wiz.profile.hair).not.toBe('Rainbow');
  expect(errors).toEqual([]);
});

test('every body family has presets in the Body tab', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await preset(page, 0);
  await page.getByRole('tablist', { name: 'Character sheet' }).getByRole('tab', { name: 'Body' }).click();
  await page.locator('[data-tour="body-family-bird"]').click();
  const presets = page.getByRole('group', { name: 'Presets' }).getByRole('button');
  await expect(presets).toHaveCount(8);
  await presets.filter({ hasText: 'Flamingo' }).click();
  await expect.poll(async () => (await studio(page)).body?.colors?.main).toBe('#fc97ac');
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

test('Faces and pictures course: Do it for me gives Tom his faces, talks to him in Play, and makes an owl', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Faces and pictures course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(10);
  const titles: string[] = [];
  for (let i = 0; i < total + 1; i++) {
    const pos = await card.locator('header .mono').innerText();
    const title = await card.getByRole('heading').first().innerText();
    titles.push(title);
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
  expect(titles).toContain('Talk to Tom');
  const all = await chars(page);
  expect(all.find((c) => c.name === 'Tom')?.faces).toMatchObject({
    angry: { eyes: 'Wide' },
    happy: { expression: 'Laughing' },
  });
  expect(all.find((c) => c.name === 'Green Owl')?.body?.family).toBe('bird');
  expect(errors).toEqual([]);
});
