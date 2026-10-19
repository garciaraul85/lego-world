import { test } from '@playwright/test';

type Ed = {
  scene: { value: { count: number } | null };
  exec(c: unknown, o?: unknown): { ok: boolean; error?: string };
  charTab: { value: string };
  dialogueId: { value: string | null };
};

test('every style in the preview', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Characters' }).click();
  for (const style of ['adventure', 'rpg', 'novel', 'bubble', 'cinematic', 'chat', 'sign', 'narrator']) {
    await page.evaluate((style) => {
      const e = (window as unknown as { __editor: Ed }).__editor;
      e.exec({
        type: 'dialogue.put',
        payload: {
          conversation: {
            id: 'dlg_styles0001',
            name: 'Styles',
            style,
            sections: [
              {
                label: 'start',
                steps: [
                  {
                    k: 'line',
                    who: 'Old Tom',
                    text: 'Welcome, traveller! Mind the bridge, it wobbles.',
                    mood: 'happy',
                  },
                  { k: 'choice', options: [{ text: 'Thanks!' }, { text: 'What bridge?' }] },
                ],
              },
            ],
          },
        },
      });
      e.dialogueId.value = 'dlg_styles0001';
      e.charTab.value = 'dialogue';
    }, style);
    const prev = page.getByRole('button', { name: '▶ Preview' });
    if ((await prev.getAttribute('aria-pressed')) !== 'true') await prev.click();
    await page.getByRole('button', { name: '↺ Restart' }).click();
    await page.waitForTimeout(2200);
    await page.locator('.dlg-stage').screenshot({ path: `test-results/style-${style}.png` });
    await page.getByRole('button', { name: 'Next ▸' }).click();
    await page.waitForTimeout(400);
    await page.locator('.dlg-stage').screenshot({ path: `test-results/style-${style}-choice.png` });
  }
});
