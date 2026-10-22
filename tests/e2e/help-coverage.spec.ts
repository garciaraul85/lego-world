import { expect, test } from '@playwright/test';
import { HELP_STATES, openEditor } from './help/states';

/**
 * P32 coverage: every control on every screen of the editor has a Help entry, so F1 and the screen guides
 * can never point at nothing. A miss lists the state, the area, the role and the name to write an entry for.
 */
test('every visible control in every editor state has a Help entry', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openEditor(page);
  const misses: string[] = [];
  for (const s of HELP_STATES) {
    await s.setup(page);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const h = (
        window as unknown as {
          __help: {
            entryFor(e: Element): string | null;
            name(e: Element): string;
            role(e: Element): string;
            controls(): Element[];
          };
        }
      ).__help;
      const out = new Set<string>();
      for (const el of h.controls()) {
        if (h.entryFor(el)) continue;
        const regions: string[] = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const l = p.getAttribute('aria-label');
          if (l) regions.unshift(l);
        }
        out.add(`${regions.slice(-2).join(' / ') || '(page)'} › ${h.role(el)} › ${h.name(el).slice(0, 60)}`);
      }
      return [...out];
    });
    for (const x of m) misses.push(`[${s.id}] ${x}`);
  }
  if (process.env.HELP_MISSES) console.log(misses.join('\n'));
  expect(misses, `${misses.length} controls have no Help entry`).toEqual([]);
  expect(errors).toEqual([]);
});
