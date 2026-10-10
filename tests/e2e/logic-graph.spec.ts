import { expect, type Page, test } from '@playwright/test';

type G = { id: string; nodes: { id: string; type: string; pos: [number, number] }[]; edges: string[][] };
type Ed = {
  scene: { value: { count: number } };
  store: { list(p: string): string[]; get(p: string): unknown };
  logicGraph: { value: string | null };
  logicBreak: { value: { node: string } | null };
  session: { value: { logic: { vars: Map<string, unknown> }; inventory: Map<string, number> } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
};
const W = (page: Page) => page.evaluate(() => (window as unknown as { __editor: Ed }).__editor !== undefined);

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    {
      timeout: 30_000,
    },
  );
  expect(await W(page)).toBe(true);
}
const graph = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store.get(`logic/${e.logicGraph.value}.json`) as G;
  });

test('logic graph: add nodes, wire pins (wrong types refused), edit as code, and both views agree', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Logic' }).click();
  await page.getByRole('button', { name: '+ New logic graph' }).click();
  page.setDefaultTimeout(15_000);
  await expect.poll(async () => (await graph(page))?.nodes.length).toBe(1);
  // add Log and Add from the palette
  await page.locator('.lg-pal', { hasText: 'Log' }).first().click();
  await page.locator('.lg-pal', { hasText: /^Add$/ }).click();
  await expect.poll(async () => (await graph(page)).nodes.length).toBe(3);
  const g = await graph(page);
  const [start, log, add] = [g.nodes[0]!, g.nodes[1]!, g.nodes[2]!];
  const pin = (node: string, name: string, side: string) => page.locator(`[data-pin="${node}|${name}|${side}"]`);
  // flow: start.then -> log.in
  await pin(start.id, 'then', 'out').dragTo(pin(log.id, 'in', 'in'));
  await expect.poll(async () => (await graph(page)).edges.length).toBe(1);
  // a number into a flow pin is refused with the reason
  await pin(add.id, 'out', 'out').dragTo(pin(log.id, 'in', 'in'));
  await expect(page.locator('.lg-tip')).toContainText('Flow wires');
  expect((await graph(page)).edges.length).toBe(1);
  // number -> any is fine
  await pin(add.id, 'out', 'out').dragTo(pin(log.id, 'value', 'in'));
  await expect.poll(async () => (await graph(page)).edges.length).toBe(2);

  // the code view shows it, and an edit there changes the graph
  await page.getByRole('radio', { name: 'Code' }).click();
  await expect(page.locator('.cm-content')).toContainText('log((0 + 0));');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\non("custom", { event: "ping" }, (e) => {\n  world.give("gem", 2);\n});\n');
  await expect
    .poll(async () => (await graph(page)).nodes.some((n) => n.type === 'world.give'), { timeout: 10_000 })
    .toBe(true);
  // an error is shown at its line and leaves the graph alone
  const before = (await graph(page)).nodes.length;
  await page.keyboard.insertText('\nwhile (true) {}\n');
  await expect(page.locator('.lg-code-status')).toContainText('Line');
  expect((await graph(page)).nodes.length).toBe(before);
  expect(errors).toEqual([]);
});

test('a breakpoint pauses Play on the node and Continue runs on; the logic changes the game', async ({ page }) => {
  test.setTimeout(420_000); // software GL on CI draws a few frames per second
  const errors: string[] = [];
  await open(page, errors);
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const graph = {
      id: 'lg_e2etest001',
      name: 'Start reward',
      scope: 'global',
      nodes: [
        { id: 'n1', type: 'event.onStart', pos: [0, 0] },
        { id: 'n2', type: 'var.set', pos: [240, 0], args: { var: 'started', value: true } },
        { id: 'n3', type: 'world.give', pos: [480, 0], args: { item: 'map', count: 1 } },
      ],
      edges: [
        ['n1', 'then', 'n2', 'in'],
        ['n2', 'then', 'n3', 'in'],
      ],
    };
    e.exec([
      {
        type: 'logic.setVariable',
        payload: { name: 'started', def: { type: 'bool', default: false, scope: 'global' } },
      },
      { type: 'logic.create', payload: { graph } },
    ]);
    e.logicGraph.value = graph.id;
  });
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Logic' }).click();
  await page.locator('[data-node="n3"] .lg-head').click();
  await page.keyboard.press('F9');
  await expect(page.locator('[data-node="n3"] .lg-bp')).toBeVisible();
  await page.getByRole('button', { name: '▶ Play & trace' }).click();
  await page.waitForFunction(() => !!(window as unknown as { __editor: Ed }).__editor.logicBreak.value, undefined, {
    timeout: 120_000,
  });
  await expect(page.locator('.lg-break')).toContainText('Give item');
  expect(
    await page.evaluate(() =>
      (window as unknown as { __editor: Ed }).__editor.session.value!.logic.vars.get('started'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { __editor: Ed }).__editor.session.value!.inventory.get('map') ?? 0,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForFunction(
    () => ((window as unknown as { __editor: Ed }).__editor.session.value?.inventory.get('map') ?? 0) === 1,
    undefined,
    { timeout: 120_000 },
  );
  await page.keyboard.press('F5'); // stop (Esc is the game's back / pause now)
  expect(errors).toEqual([]);
});
