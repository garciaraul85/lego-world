import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { HELP_STATES, openEditor } from './help/states';

/**
 * P32 Help pictures, taken from the real editor: `npm run help:shots` (or HELP_SHOTS=1 with Playwright).
 * Each editor state becomes docs/help/shots/<state>.webp, and index.json records where every Help entry's
 * controls and areas are, so Help can outline them. Re-run after UI changes; the pictures then match again.
 */
const OUT = resolve('docs/help/shots');
type Rect = [number, number, number, number];
const GUIDE_STATE: Record<string, string> = { shell: 'scene', cinematics: 'cinematics-open' };

test('capture Help pictures', async ({ page }) => {
  test.skip(!process.env.HELP_SHOTS, 'set HELP_SHOTS=1 to capture Help pictures');
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openEditor(page);
  // no hover tips, toasts or blinking caret in the pictures
  await page.addStyleTag({
    content: '.hovertip,.toast,.toasts{display:none!important} *{caret-color:transparent!important}',
  });
  const states: Record<string, string> = {};
  const seen: Record<string, { s: string; screen: string; r: Rect[] }[]> = {};
  const screenOf: Record<string, string> = {};
  for (const s of HELP_STATES) {
    await s.setup(page);
    await page.mouse.move(1279, 799);
    await page.waitForTimeout(s.id === 'play' ? 1500 : 450);
    const png = await page.screenshot({ type: 'png' });
    // the browser encodes WebP (small, sharp text)
    const webp = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.72).split(',')[1]!;
    }, png.toString('base64'));
    writeFileSync(resolve(OUT, `${s.id}.webp`), Buffer.from(webp, 'base64'));
    states[s.id] = `${s.id}.webp`;
    screenOf[s.id] = s.screen;
    const rects = await page.evaluate(() =>
      (window as unknown as { __help: { rects(): Record<string, Rect[]> } }).__help.rects(),
    );
    for (const [id, r] of Object.entries(rects)) {
      seen[id] ??= [];
      seen[id].push({ s: s.id, screen: s.screen, r });
    }
  }
  const entryScreen = await page.evaluate(() =>
    Object.fromEntries(
      (window as unknown as { __helpEntries?: { id: string; screen: string }[] }).__helpEntries?.map((e) => [
        e.id,
        e.screen,
      ]) ?? [],
    ),
  );
  // each entry is shown in the first state of its own screen that has it, else the first state that has it
  const entries: Record<string, { s: string; r: Rect[] }> = {};
  for (const [id, list] of Object.entries(seen)) {
    const best = list.find((x) => x.screen === entryScreen[id]) ?? list[0]!;
    entries[id] = { s: best.s, r: best.r };
  }
  const guides: Record<string, { s: string; areas: Record<string, Rect> }> = {};
  for (const screen of new Set(HELP_STATES.map((x) => x.screen).concat('shell'))) {
    const s = GUIDE_STATE[screen] ?? HELP_STATES.find((x) => x.screen === screen)!.id;
    const areas: Record<string, Rect> = {};
    for (const [id, list] of Object.entries(seen)) {
      const hit = list.find((x) => x.s === s);
      if (hit) areas[id] = hit.r[0]!;
    }
    guides[screen] = { s, areas };
  }
  // keep only pictures some entry or guide shows
  const used = new Set([...Object.values(entries).map((e) => e.s), ...Object.values(guides).map((g) => g.s)]);
  for (const id of Object.keys(states))
    if (!used.has(id)) {
      rmSync(resolve(OUT, states[id]!), { force: true });
      delete states[id];
    }
  writeFileSync(
    resolve(OUT, 'index.json'),
    `${JSON.stringify({ base: 'help-shots/', w: 1280, h: 800, states, entries, guides })}\n`,
  );
  expect(Object.keys(entries).length).toBeGreaterThan(150);
});
