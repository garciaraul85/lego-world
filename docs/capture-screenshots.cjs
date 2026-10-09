// Documentation-only browser capture. Does not patch the app or its renderer.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'screenshots');
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root, 'dist/index.html')));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      window.captureTools = new Map();
      window.capturePaused = false;
      // Use the app's normal hidden-page pause between captured frames.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.capturePaused });
      Object.defineProperty(document, 'modelContext', { configurable: true, value: {
        registerTool(tool) { window.captureTools.set(tool.name, tool); }
      } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.captureTools?.has('read_brick_build'), { timeout: 30000 });
    const act = (name, input) => page.evaluate(([name, input]) => window.captureTools.get(name).execute(input), [name, input]);
    const click = id => page.locator('#' + id).click();
    const shot = async name => {
      await page.evaluate(() => { window.capturePaused = false; });
      await page.waitForTimeout(350);
      await page.evaluate(() => { window.capturePaused = true; });
      await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true, timeout: 120000 });
      console.log('Captured', name);
    };
    const resume = process.env.CAPTURE_RESUME === 'maps';
    if (!resume) {
    await shot('character-studio');
    await page.selectOption('#bb-animation-clip', 'weapon:Club');
    await page.locator('#bb-animation-scrub').evaluate(el => { el.value = '350'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#bb-animation-section').scrollIntoViewIfNeeded();
    await shot('animation-preview');
    await click('bb-paint-character');
    await page.selectOption('#bb-art-part', 'head');
    await shot('drawing-studio');
    await click('bb-art-done');
    await click('bb-photo-character');
    await shot('photo-import');
    await click('bb-photo-done');
    await click('bb-world-tab');
    await page.locator('#bb-map-workshop').evaluate(el => { el.open = false; });
    await page.locator('#bb-editor-scroll').evaluate(el => { el.scrollTop = 0; });
    await shot('world-workshop');
    await click('bb-bricks-tab');
    await shot('brick-workshop');
    }
    await click('bb-world-tab');
    await act('manage_lego_maps', { action: 'generateRandom', count: 2, seed: 682026, size: 16, biomes: ['prairie', 'beach'] });
    await click('bb-world-tab');
    await page.locator('#bb-map-workshop').evaluate(el => { el.open = true; });
    await page.locator('#bb-spawn-select').scrollIntoViewIfNeeded();
    await shot('map-settings');
    await page.locator('#bb-map-diagram-open').evaluate(el => el.click());
    await shot('map-connections');
    await click('bb-map-diagram-close');
    await act('explore_lego_world', { playing: true });
    await shot('exploration');
    await click('bb-help-open');
    await shot('field-guide');
    await click('bb-help-close');
    await click('bb-menu');
    await click('bb-save');
    await shot('save-dialog');
    await click('bb-dialog-close');
    await click('bb-character-tab');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('mobile-workshop');
    await act('explore_lego_world', { playing: true });
    await shot('mobile-exploration');
    await page.setViewportSize({ width: 844, height: 390 });
    await shot('mobile-landscape');
    assert.equal(errors.length, 0, 'Browser errors: ' + errors.join('; '));
    console.log('PASS: 14 actual browser captures; no page errors.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
