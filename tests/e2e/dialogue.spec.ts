import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * P22 part 1: dialogue — write a conversation as a script, see it as a list and a graph, preview its
 * branches, pick a style, talk to the character in Play with the keyboard; a sign reads a conversation;
 * the Dialogue course with Do it for me.
 */
type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  store: {
    manifest: { entry: { map: string; spawn: string | null } };
    get(p: string): unknown;
    list(p: string): string[];
  };
  mapId: { value: string };
  studioCharacter: { value: string | null };
  session: { value: S | null };
};
type S = {
  world: { npcs: { state: { x: number; y: number; z: number }; profile: { name?: string } }[] };
  placeAt(p: number[], yaw: number): void;
  talks: { active: boolean; view: { text: string; look: { style: string }; choices: unknown[] | null } | null };
  logic: { vars: Map<string, unknown> };
};

const SCRIPT = `== start
[if talks > 0] Old Tom (happy): Back again, {hero.name}?
Old Tom: Welcome, traveller! Mind the bridge.
* What bridge? -> bridge
* Buy a map [if gems >= 5] [grey] -> map
* Bye! -> end

== bridge
> like +5
Old Tom: The old one to the east.

== map
> add gems -5
Old Tom (happy): Here you go.`;

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

/** Old Tom, a villager on the start map near the arrival */
async function addTom(page: Page): Promise<string> {
  return page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const doc = e.store.get(`maps/${map}/map.json`) as { spawns: { id: string; pos: number[] }[] };
    const sp = doc.spawns.find((s) => s.id === e.store.manifest.entry.spawn) ?? doc.spawns[0]!;
    const id = 'chr_oldtom0001';
    const r1 = e.exec({
      type: 'character.create',
      payload: { character: { id, name: 'Old Tom', role: 'npc', profile: { name: 'Old Tom' } } },
    });
    const r2 = e.exec({
      type: 'npc.place',
      payload: { map, character: id, pos: [sp.pos[0]! + 3, sp.pos[1]!, sp.pos[2]! + 3], heading: Math.PI },
    });
    if (!r1.ok || !r2.ok) throw new Error(`${r1.error} ${r2.error}`);
    e.studioCharacter.value = id;
    return id;
  });
}

/** Next until the choice shows (a line still appearing shows whole first) */
async function toChoice(page: Page) {
  const next = page.getByRole('button', { name: 'Next ▸' });
  for (let i = 0; i < 6 && (await next.isEnabled()); i++) {
    await next.click();
    await page.waitForTimeout(150);
  }
}

async function talkToTom(page: Page) {
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    const n = s.world.npcs.find((x) => x.profile.name === 'Old Tom') ?? s.world.npcs[0]!;
    s.placeAt([n.state.x, n.state.y + 0.2, n.state.z - 2], 0);
  });
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('t');
}

test('a conversation written as a script, shown as a list and a graph, previewed, then played with the keyboard', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  await open(page, errors);
  const tom = await addTom(page);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  await page.getByRole('tablist', { name: 'Character view' }).getByRole('tab', { name: 'Dialogue' }).click();
  await page.locator('[data-tour="dialogue-new"]').click();
  await expect(page.getByLabel('Conversation name')).toHaveValue('Old Tom talk');
  // the new conversation joined Old Tom's Talk list
  expect(
    await get(page, (e) => (e.store.get('characters/chr_oldtom0001.json') as { talk?: unknown[] }).talk?.length),
  ).toBe(1);
  // Script: write it as a writer would
  await page.getByRole('radio', { name: 'Script' }).click();
  await page.getByLabel('Conversation script').fill(SCRIPT);
  await page.getByRole('button', { name: 'Apply' }).click();
  // List: the rows
  await page.getByRole('radio', { name: 'List' }).click();
  const list = page.getByLabel('Conversation steps');
  await expect(list.getByRole('region', { name: 'Section bridge' })).toBeVisible();
  await expect(list.getByLabel('Line').first()).toHaveValue('Back again, {hero.name}?');
  await expect(list.getByRole('button', { name: 'if gems >= 5' })).toBeVisible();
  // Graph: three boxes
  await page.getByRole('radio', { name: 'Graph' }).click();
  await expect(page.locator('.dlg-node')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/dialogue-graph.png' });
  // Preview: Buy is greyed out with no gems; What bridge? goes to the bridge
  await page.getByRole('button', { name: '▶ Preview' }).click();
  const stage = page.locator('.dlg-stage');
  await expect(stage.getByText('Welcome, traveller! Mind the bridge.')).toBeVisible();
  await toChoice(page);
  await expect(stage.getByRole('button', { name: /Buy a map/ })).toBeDisabled();
  await stage.getByRole('button', { name: /What bridge/ }).click();
  await expect(stage.getByText('The old one to the east.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel('What happened')).toContainText('picked “What bridge?”');
  // with 5 gems Buy works
  await page.getByLabel('Preview value gems').fill('5');
  await page.getByLabel('Preview value gems').press('Tab');
  await toChoice(page);
  await expect(stage.getByRole('button', { name: /Buy a map/ })).toBeEnabled();
  await page.screenshot({ path: 'test-results/dialogue-preview.png' });

  // Project › Dialogue: the Cinematic style, lines at once
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Scene' }).click();
  await page.locator('[data-tour="tab-project"]').click();
  await page.locator('[data-tour="dialogue-style-cinematic"]').click();
  await page.getByRole('slider', { name: 'Text speed' }).fill('0');
  expect(await get(page, (e) => (e.store.manifest as { dialogue?: { style?: string } }).dialogue?.style)).toBe(
    'cinematic',
  );

  // Play: talk with T, move on with Enter, pick with 1
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await talkToTom(page);
  const box = page.getByRole('region', { name: 'Conversation · Old Tom talk' });
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(box).toHaveAttribute('data-style', 'cinematic');
  await expect(box).toContainText('Welcome, traveller!');
  await page.screenshot({ path: 'test-results/dialogue-play.png' });
  await page.keyboard.press('Enter');
  await expect(box.getByRole('button', { name: /What bridge/ })).toBeVisible();
  await page.keyboard.press('1');
  await expect(box).toContainText('The old one to the east.');
  await page.keyboard.press('Enter');
  await expect(box).toHaveCount(0);
  const vars = await get(page, (e) => {
    const v = e.session.value!.logic.vars;
    return { talks: v.get('talks.chr_oldtom0001'), likes: v.get('likes.chr_oldtom0001') };
  });
  expect(vars).toEqual({ talks: 1, likes: 5 });
  // the second time: Back again
  await talkToTom(page);
  await expect(box).toContainText('Back again,');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  expect(tom).toBe('chr_oldtom0001');
  expect(errors).toEqual([]);
});

test('a sign reads a conversation with E, in the Sign style', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const doc = e.store.get(`maps/${map}/map.json`) as { spawns: { id: string; pos: number[] }[] };
    const sp = doc.spawns.find((s) => s.id === e.store.manifest.entry.spawn) ?? doc.spawns[0]!;
    e.exec({
      type: 'dialogue.put',
      payload: {
        conversation: {
          id: 'dlg_signboard1',
          name: 'Notice board',
          sections: [{ label: 'start', steps: [{ k: 'line', who: '', text: 'Beware of the wobbly bridge!' }] }],
        },
      },
    });
    e.exec({
      type: 'item.add',
      payload: {
        map,
        item: {
          id: 'ins_signboard1',
          kind: 'ui',
          widget: 'sign',
          pos: [sp.pos[0]! + 1, sp.pos[1]! + 1.5, sp.pos[2]! + 1],
          text: 'Notice',
          maxDistance: 30,
        },
      },
    });
    (e as unknown as { selectedItem: { value: string } }).selectedItem.value = 'ins_signboard1';
  });
  // the sign's inspector: Read with E
  await page.getByLabel('Sign conversation').selectOption({ label: '💬 Notice board' });
  expect(
    await get(
      page,
      (e) =>
        (
          e.store.get(`maps/${e.store.manifest.entry.map}/instances.json`) as {
            items: { id: string; conversation?: string }[];
          }
        ).items.find((i) => i.id === 'ins_signboard1')?.conversation,
    ),
  ).toBe('dlg_signboard1');
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.evaluate(() => {
    const s = (window as unknown as { __editor: Ed }).__editor.session.value!;
    const e = (window as unknown as { __editor: Ed }).__editor;
    const doc = e.store.get(`maps/${e.store.manifest.entry.map}/map.json`) as { spawns: { pos: number[] }[] };
    const sp = doc.spawns[0]!;
    s.placeAt([sp.pos[0]! + 1, sp.pos[1]! + 0.2, sp.pos[2]! + 2], 0);
  });
  await expect(page.locator('.bw-layer')).toContainText('E · Read', { timeout: 30_000 });
  await page.getByLabel('Game view').focus();
  await page.keyboard.press('e');
  const box = page.getByRole('region', { name: 'Conversation · Notice board' });
  await expect(box).toHaveAttribute('data-style', 'sign');
  await expect(box).toContainText('Beware of the wobbly bridge!', { timeout: 10_000 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(box).toHaveCount(0);
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

test('Dialogue course: Do it for me adds Old Tom, writes his conversation, previews, styles and talks in Play', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: /Dialogue course/ }).click();
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
  expect(titles).toContain('Talk to Old Tom');
  expect(errors).toEqual([]);
});
