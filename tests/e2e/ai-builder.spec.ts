import { expect, type Page, test } from '@playwright/test';

type Ed = {
  scene: { value: unknown };
  store: { manifest: { entry: { map: string } }; get(p: string): unknown; has(p: string): boolean };
  bus: { history(): { label: string; source: string }[] };
};
const ed = <T>(page: Page, fn: string) =>
  page.evaluate(`(() => { const e = window.__editor; return ${fn}; })()`) as Promise<T>;

/** A scripted model: reads the summary, proposes three steps in three workspaces, then answers. */
async function scriptModel(page: Page, opts: { brokenFirst?: boolean } = {}) {
  await page.evaluate((broken) => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.store.manifest.entry.map;
    const plan = (bad: boolean) => ({
      summary: 'Rainy night with a coin rule',
      steps: [
        {
          title: 'Make it a rainy night',
          explain: 'Map tab › time Night, tick Rain.',
          commands: [{ type: 'map.setEnvironment', payload: { map, time: 'night', rain: true } }],
        },
        {
          title: 'Add a coins variable',
          explain: 'Logic › Variables › + coins.',
          commands: [
            {
              type: 'logic.setVariable',
              payload: { name: 'coins', def: { type: 'number', default: 0, scope: 'global' } },
            },
          ],
        },
        {
          title: 'Start with five coins',
          explain: 'Logic › + New graph, Code view: on start set coins to 5.',
          commands: [
            {
              type: 'logic.code',
              payload: {
                graph: 'lg_e2ecoins01',
                name: 'Coins',
                code: bad
                  ? 'on("start", (e) => {\n  vars.coins = ;\n});'
                  : 'on("start", (e) => {\n  vars.coins = 5;\n});\n',
              },
            },
          ],
        },
      ],
    });
    (window as unknown as { __aiFake: unknown }).__aiFake = [
      { tools: [{ name: 'read_project_summary', input: {} }] },
      ...(broken ? [{ tools: [{ name: 'propose_plan', input: plan(true) }] }] : []),
      { tools: [{ name: 'propose_plan', input: plan(false) }] },
      { text: 'Here is the plan: a rainy night and a coin rule.' },
    ];
  }, !!opts.brokenFirst);
}

test('AI builder: plan → watch each step live in its workspace → back → accept as one undo step → undo', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await scriptModel(page, { brokenFirst: true });
  await page
    .getByRole('button', { name: /AI builder/ })
    .first()
    .click();
  const panel = page.getByRole('complementary', { name: 'AI builder' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Ask the AI builder').fill('Make it a rainy night and give the player five coins');
  await panel.getByRole('button', { name: /Plan it/ }).click();

  // what the AI did is visible: it read the project, a plan was refused and repaired
  await expect(panel.getByText(/Reading the project/)).toBeVisible();
  await expect(panel.getByText(/The editor refused that plan/)).toBeVisible();
  const review = panel.getByRole('region', { name: 'Proposed change' });
  await expect(review).toBeVisible();
  await expect(review.getByText('Rainy night with a coin rule')).toBeVisible();
  await expect(review.locator('.aip-steps > li')).toHaveCount(3);
  // nothing applied yet
  expect(await ed<number>(page, 'e.bus.history().length')).toBe(0);

  // Show me step 1: the change happens in the Scene
  await review.getByRole('button', { name: 'Show me step 1' }).click();
  await expect(review.getByText('✓ shown')).toHaveCount(1);
  expect(await ed<boolean>(page, 'e.store.get(`maps/${e.store.manifest.entry.map}/map.json`).weather.rain')).toBe(true);
  await expect(page.locator('[data-tour="ws-scene"]')).toHaveAttribute('aria-current', 'page');

  await review.getByRole('button', { name: 'Show me step 2' }).click();
  await review.getByRole('button', { name: 'Show me step 3' }).click();
  await expect(review.getByText('✓ shown')).toHaveCount(3);
  await expect(page.locator('[data-tour="ws-logic"]')).toHaveAttribute('aria-current', 'page');
  expect(await ed<boolean>(page, 'e.store.has("logic/lg_e2ecoins01.json")')).toBe(true);
  // the Logic workspace shows the new graph
  await expect(page.getByText('Coins').first()).toBeVisible();

  // Back takes the last step out again
  await review.getByRole('button', { name: '◀ Back' }).click();
  expect(await ed<boolean>(page, 'e.store.has("logic/lg_e2ecoins01.json")')).toBe(false);

  // the diff lists the files
  await review.getByRole('button', { name: /Files that change/ }).click();
  await expect(review.getByText('logic/lg_e2ecoins01.json')).toBeVisible();

  // Accept all: one undo step labelled "AI: …", no preview steps left
  await review.getByRole('button', { name: /Accept all/ }).click();
  await expect(panel.getByText(/Applied “Rainy night with a coin rule”/)).toBeVisible();
  const labels = await ed<string[]>(page, 'e.bus.history().map((h) => h.label)');
  expect(labels).toEqual(['AI: Rainy night with a coin rule']);
  expect(await ed<string>(page, 'e.bus.history()[0].source')).toBe('ai');
  expect(await ed<boolean>(page, 'e.store.has("logic/lg_e2ecoins01.json")')).toBe(true);

  // one Ctrl Z undoes all of it
  await page.locator('[data-tour="ws-scene"]').click();
  await page.keyboard.press('Control+z');
  expect(await ed<boolean>(page, 'e.store.has("logic/lg_e2ecoins01.json")')).toBe(false);
  expect(await ed<boolean>(page, 'e.store.get(`maps/${e.store.manifest.entry.map}/map.json`).weather.rain')).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test('AI builder: Reject after a preview leaves the project exactly as it was', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await scriptModel(page);
  await page.keyboard.press('Control+i');
  const panel = page.getByRole('complementary', { name: 'AI builder' });
  await panel.getByLabel('Ask the AI builder').fill('Rainy night please');
  await panel.getByLabel('Ask the AI builder').press('Enter');
  const review = panel.getByRole('region', { name: 'Proposed change' });
  await review.getByRole('button', { name: /Show all/ }).click();
  await expect(review.getByText('✓ shown')).toHaveCount(3, { timeout: 20_000 });
  await review.getByRole('button', { name: /Reject/ }).click();
  await expect(panel.getByText(/Rejected/)).toBeVisible();
  expect(await ed<number>(page, 'e.bus.history().length')).toBe(0);
  expect(await ed<boolean>(page, 'e.store.has("logic/lg_e2ecoins01.json")')).toBe(false);
});
