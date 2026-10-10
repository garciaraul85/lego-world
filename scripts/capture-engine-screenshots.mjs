#!/usr/bin/env node
// Captures the screenshots used by docs/getting-started.md and the README (Brick Worlds editor).
//   npm run build && node scripts/capture-engine-screenshots.mjs
// Needs Playwright's Chromium (or PW_CHROMIUM_PATH). Writes docs/screenshots/engine/*.png.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots/engine');
const PORT = 4191;
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, [resolve(ROOT, 'scripts/serve.mjs'), '--port', String(PORT)], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const ready = () => page.waitForFunction(() => !!window.__editor?.scene.value, undefined, { timeout: 90_000 });
const shot = async (name, settle = 500) => {
  await wait(settle);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
};
const ws = async (slug) => {
  await page.locator(`[data-tour="ws-${slug}"]`).click();
  await wait(600);
};

try {
  // 1. first run: the Start hub
  await page.goto(`${BASE}/editor.html`);
  await ready();
  await page.getByRole('dialog', { name: 'Start hub' }).waitFor();
  await shot('01-start-hub');

  // 2. open a template game in the editor
  await page.locator('.hub-template').first().click();
  await page.waitForURL(/editor\.html/, { timeout: 90_000 });
  await wait(1500);
  await ready();
  await page.locator('[data-tour="ws-scene"]').click();
  await page.keyboard.press('Home');
  await shot('02-editor-scene', 1500);

  // select a building
  await page.evaluate(() => {
    const e = window.__editor;
    const s = e.scene.value;
    const insts = [...new Set(s.instanceOf.values())];
    const pick = insts.find((i) => i.def.category === 'building') ?? insts[0];
    if (pick) e.select(pick.bricks.map((b) => b.id));
  });
  await page.keyboard.press('f');
  await shot('03-select-and-inspect', 1200);
  await page.keyboard.press('Escape');

  // the Map tab: terrain generator, sky, weather, music
  await page.locator('[data-tour="tab-map"]').click();
  await shot('04-map-tab-generator');

  // brick paint with the dock's brick palette
  await page
    .locator('[data-tour="tab-inspect"]')
    .click()
    .catch(() => {});
  await page.keyboard.press('b');
  await page.keyboard.press('Home');
  await shot('05-brick-paint', 900);
  await page.keyboard.press('v');

  for (const [slug, name] of [
    ['world-graph', '06-world-graph'],
    ['assets', '07-asset-studio'],
    ['characters', '08-character-studio'],
  ]) {
    await ws(slug);
    await shot(name, 900);
  }

  // logic: graph, then code and graph side by side
  await ws('logic');
  await page.evaluate(() => {
    const e = window.__editor;
    const id = e.store.list('logic/lg_')[0]?.slice(6, -5);
    if (id) e.logicGraph.value = id;
    e.logicView.value = 'graph';
  });
  await shot('09-logic-graph', 900);
  await page.evaluate(() => (window.__editor.logicView.value = 'split'));
  await shot('10-logic-code-split', 1800);

  for (const [slug, name] of [
    ['screens', '11-screens'],
    ['cinematics', '12-director'],
    ['audio', '13-audio'],
  ]) {
    await ws(slug);
    await shot(name, 1200);
  }

  // play
  await ws('scene');
  await page.locator('[data-tour="play"] button').first().click();
  await page.waitForFunction(() => (window.__editor.session.value?.runtime.ticks ?? 0) > 60, undefined, {
    timeout: 60_000,
  });
  await shot('14-play', 2500);
  await page
    .getByRole('button', { name: 'Pause' })
    .click()
    .catch(() => {});
  await page.evaluate(() => (window.__editor.dock.value = 'debug'));
  await shot('15-play-debug', 800);
  await page.keyboard.press('F5');
  await wait(800);

  // command palette
  await page.locator('[data-tour="ws-scene"]').click();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('gen');
  await shot('16-command-palette');
  await page.keyboard.press('Escape');

  // help
  await page.keyboard.press('F1');
  await shot('17-help');
  await page.getByLabel('Search help').fill('music zone');
  await shot('18-help-search');
  await page.getByRole('button', { name: 'Close help' }).click();

  // AI builder (scripted model so the screenshot is reproducible)
  await page.evaluate(() => {
    const e = window.__editor;
    const map = e.store.manifest.entry.map;
    window.__aiFake = [
      {
        tools: [
          { name: 'read_project_summary', input: {} },
          { name: 'describe_command', input: { type: 'logic.code' } },
        ],
      },
      {
        tools: [
          {
            name: 'propose_plan',
            input: {
              summary: 'Rainy night with a coin bonus',
              steps: [
                {
                  title: 'Make it a rainy night',
                  explain: 'Sets the map to night with rain. Yourself: Map tab › Time: Night, tick Rain.',
                  commands: [{ type: 'map.setEnvironment', payload: { map, time: 'night', rain: true } }],
                },
                {
                  title: 'Add a bonus variable',
                  explain: 'A number that remembers the bonus. Yourself: Logic › Variables › + and name it bonus.',
                  commands: [
                    {
                      type: 'logic.setVariable',
                      payload: { name: 'bonus', def: { type: 'number', default: 0, scope: 'global' } },
                    },
                  ],
                },
                {
                  title: 'Start with a bonus of five',
                  explain: 'A rule that runs when play starts. Yourself: Logic › + New, Code view, type the line.',
                  commands: [
                    {
                      type: 'logic.code',
                      payload: {
                        graph: 'lg_docsbonus1',
                        name: 'Bonus',
                        code: 'on("start", (e) => {\n  vars.bonus = 5;\n  log("Bonus ready");\n});\n',
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      { text: 'Here is the plan: a rainy night and a starting bonus of five.' },
    ];
  });
  await page.getByRole('dialog', { name: 'Help' }).waitFor({ state: 'detached' });
  await page.locator('[data-tour="ai"]').click();
  const ai = page.getByRole('complementary', { name: 'AI builder' });
  await ai
    .getByLabel('Ask the AI builder')
    .fill('Make it a rainy night and give the player a bonus of five at the start');
  await shot('19-ai-builder-ask', 300);
  await ai.getByRole('button', { name: /Plan it/ }).click();
  await ai.getByRole('region', { name: 'Proposed change' }).waitFor();
  await shot('20-ai-builder-plan');
  for (const n of [1, 2, 3]) {
    await ai.getByRole('button', { name: `Show me step ${n}` }).click();
    await wait(1400);
  }
  await shot('21-ai-builder-show-me', 1200);
  await ai.getByRole('button', { name: /Reject/ }).click();
  await ai.getByRole('button', { name: 'Close the AI builder' }).click();
  await page.evaluate(() => delete window.__aiFake);

  // watch a game being built
  await page.evaluate(() => localStorage.removeItem('brickworlds.intent'));
  await page.goto(`${BASE}/editor.html?hub`);
  await ready();
  const hub = page.getByRole('dialog', { name: 'Start hub' });
  await hub.getByLabel('Seed', { exact: true }).fill('4242');
  await hub.getByRole('button', { name: /Watch it being built/ }).click();
  const view = page.getByRole('complementary', { name: 'Build steps' });
  await view.waitFor({ timeout: 90_000 });
  for (let i = 0; i < 3; i++) {
    await view.getByRole('button', { name: /^Next:/ }).click();
    await wait(1200);
  }
  await shot('22-watch-it-being-built', 1500);

  // editor tour: a step, then its Show me demo
  await page.evaluate(() => localStorage.removeItem('brickworlds.intent'));
  await page.goto(`${BASE}/editor.html?hub`);
  await ready();
  await page
    .getByRole('dialog', { name: 'Start hub' })
    .getByRole('radio', { name: /I try first/ })
    .click();
  await page.getByRole('button', { name: /Start the guided tutorial/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await card.waitFor({ timeout: 90_000 });
  await shot('23-tutorial-welcome', 1000);
  while (!(await card.getByRole('heading', { name: /Generate/ }).isVisible())) {
    await card.getByRole('button', { name: /Next ▶|Skip ▶▶/ }).click();
    await wait(500);
  }
  await shot('24-tutorial-step', 800);
  await card.getByRole('button', { name: /Show me/ }).click();
  await shot('25-tutorial-show-me', 1100);
  await card
    .getByText(/Your turn/)
    .first()
    .waitFor({ timeout: 60_000 });

  // coding course
  await page.evaluate(() => localStorage.removeItem('brickworlds.intent'));
  await page.goto(`${BASE}/editor.html?hub`);
  await ready();
  await page
    .getByRole('dialog', { name: 'Start hub' })
    .getByRole('radio', { name: /I try first/ })
    .click();
  await page.getByRole('button', { name: /Start the coding course/ }).click();
  await card.waitFor({ timeout: 90_000 });
  while (!(await card.getByRole('heading', { name: 'Your first line' }).isVisible())) {
    const doIt = card.getByRole('button', { name: 'Do it for me' });
    if (await doIt.isVisible()) await doIt.click();
    else await card.getByRole('button', { name: /Next ▶/ }).click();
    await wait(2500);
  }
  await shot('26-coding-course', 800);
  await card.getByRole('button', { name: /Show me/ }).click();
  await shot('27-coding-show-me', 1500);
  await card
    .getByText(/Your turn/)
    .first()
    .waitFor({ timeout: 60_000 });

  // phone layout
  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const phone = await phoneCtx.newPage();
  await phone.goto(`${BASE}/editor.html?nohub`);
  await phone.waitForFunction(() => !!window.__editor?.scene.value, undefined, { timeout: 90_000 });
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: resolve(OUT, '28-phone.png') });
  console.log('  28-phone.png');
} finally {
  await browser.close();
  server.kill();
}
