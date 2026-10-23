import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * P22 part 2: the character sheet — outfits take look changes while worn, stats, moves, behaviour and the
 * party, and what they do in Play (hearts, speed, outfit swaps, levels, hero switching, standing still);
 * the course with Do it for me.
 */
type Chr = {
  id: string;
  name: string;
  profile: Record<string, unknown>;
  outfit?: string;
  outfits?: { name: string; look: Record<string, unknown> }[];
  stats?: Record<string, number | string>;
  behaviour?: { routine: string };
};
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: {
    manifest: { hero: string | null; party?: string[]; entry: { map: string; spawn: string | null } };
    get(p: string): unknown;
  };
  studioCharacter: { value: string | null };
  session: { value: S | null };
};
type S = {
  hero: Record<string, unknown>;
  heroChr?: { id: string };
  heroStats: { speed: number; defence: number };
  logic: { vars: Map<string, unknown> };
  giveXp(n: number): void;
  setOutfit(name: string): void;
  world: { npcs: { id: number; profile: { name?: string } }[] };
  standsStill(n: { id: number }): boolean;
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
const chr = (page: Page, id: string) =>
  get(page, new Function('e', `return e.store.get('characters/${id}.json')`) as (e: Ed) => Chr);

test('the sheet: an outfit takes look changes while worn; stats, moves, behaviour, party; all of it in Play', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await open(page, errors);
  // two characters: Sam (the hero) and Kit (a party member); Ola a shopkeeper who stands still on the map
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const doc = e.store.get(`maps/${map}/map.json`) as { spawns: { pos: number[] }[] };
    const sp = doc.spawns[0]!.pos;
    for (const [id, name] of [
      ['chr_sheetsam01', 'Sam'],
      ['chr_sheetkit01', 'Kit'],
      ['chr_sheetola01', 'Ola'],
    ])
      e.exec({
        type: 'character.create',
        payload: { character: { id, name, role: 'npc', profile: { name, hat: 'None' } } },
      });
    e.exec({ type: 'project.update', payload: { hero: 'chr_sheetsam01' } });
    e.exec({
      type: 'npc.place',
      payload: { map, character: 'chr_sheetola01', pos: [sp[0]! + 4, sp[1]!, sp[2]! + 4], heading: 0 },
    });
    e.studioCharacter.value = 'chr_sheetsam01';
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  const sheet = page.getByRole('tablist', { name: 'Character sheet' });
  // Outfits: a new one, worn; a look change goes into it, not into Sam's own look
  await sheet.getByRole('tab', { name: 'Outfits' }).click();
  await page.locator('[data-tour="outfit-new"]').click();
  await page.getByRole('button', { name: 'Wear' }).click();
  await sheet.getByRole('tab', { name: 'Look' }).click();
  await expect(page.getByText(/Wearing\s+Armour/)).toBeVisible();
  await page.locator('[data-tour="pick-hat"]').click();
  await page
    .locator('[data-tour="pick-hat-list"]')
    .getByRole('option', { name: /Knight helmet/ })
    .click();
  let sam = await chr(page, 'chr_sheetsam01');
  expect(sam.profile.hat).toBe('None');
  expect(sam.outfits?.[0]?.look.hat).toBe('Knight helmet');
  expect(sam.outfit).toBe('Armour');
  // Stats: 5 hearts, speed 1.3, defence 2
  await sheet.getByRole('tab', { name: 'Stats' }).click();
  // one number at a time: each waits for its save (the panel redraws after it)
  for (const [label, key, v] of [
    ['Hearts', 'health', 5],
    ['Speed', 'speed', 1.3],
    ['Defence', 'defence', 2],
  ] as const) {
    await page.getByLabel(label, { exact: true }).fill(String(v));
    await page.getByLabel(label, { exact: true }).press('Tab');
    await expect.poll(async () => (await chr(page, 'chr_sheetsam01')).stats?.[key]).toBe(v);
  }
  // Moves: heavy
  await sheet.getByRole('tab', { name: 'Moves' }).click();
  await page.getByRole('radio', { name: 'Heavy' }).click();
  // Behaviour: Kit joins the party; Ola stands still
  await page.evaluate(
    () => ((window as unknown as { __editor: Ed }).__editor.studioCharacter.value = 'chr_sheetkit01'),
  );
  await sheet.getByRole('tab', { name: 'Behaviour' }).click();
  await page.getByLabel(/Kit is a playable hero/).check();
  await page.evaluate(
    () => ((window as unknown as { __editor: Ed }).__editor.studioCharacter.value = 'chr_sheetola01'),
  );
  await page.getByRole('button', { name: 'Shopkeeper' }).click();
  sam = await chr(page, 'chr_sheetsam01');
  expect(sam.stats).toMatchObject({ health: 5, speed: 1.3, defence: 2 });
  expect((await chr(page, 'chr_sheetola01')).behaviour?.routine).toBe('stand');
  expect(await get(page, (e) => e.store.manifest.party)).toEqual(['chr_sheetkit01']);
  await page.screenshot({ path: 'test-results/sheet-editor.png' });

  // Play: the sheet in the game
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await expect.poll(() => get(page, (e) => !!e.session.value), { timeout: 60_000 }).toBe(true);
  const play = await get(page, (e) => {
    const s = e.session.value!;
    const ola = s.world.npcs.find((n) => n.profile.name === 'Ola');
    return {
      maxHp: s.logic.vars.get('maxHp'),
      hat: s.hero.hat,
      speed: s.heroStats.speed,
      defence: s.heroStats.defence,
      level: s.logic.vars.get('level'),
      olaStands: ola ? s.standsStill(ola) : null,
    };
  });
  // the outfit is worn: its helmet, and its bonuses on top (none set here)
  expect(play).toMatchObject({ maxHp: 5, hat: 'Knight helmet', speed: 1.3, defence: 2, level: 1, olaStands: true });
  // outfits swap in Play; experience levels up
  const after = await get(page, (e) => {
    const s = e.session.value!;
    s.setOutfit('');
    const own = s.hero.hat;
    s.giveXp(150);
    return { own, level: s.logic.vars.get('level'), xp: s.logic.vars.get('xp') };
  });
  expect(after).toEqual({ own: 'None', level: 2, xp: 150 });
  await expect(page.locator('.bw-layer')).toContainText('Level up! Level 2');
  // H switches to Kit
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('h');
  expect(await get(page, (e) => e.session.value!.heroChr?.id)).toBe('chr_sheetkit01');
  await page.keyboard.press('h');
  expect(await get(page, (e) => e.session.value!.heroChr?.id)).toBe('chr_sheetsam01');
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

test('Character sheet course: Do it for me fills Sir Brick’s sheet and levels him up in Play', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Character sheet course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const total = Number((await card.locator('header .mono').innerText()).split('/')[1]);
  expect(total).toBe(8);
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
  expect(titles).toContain('Level up in Play');
  expect(errors).toEqual([]);
});
