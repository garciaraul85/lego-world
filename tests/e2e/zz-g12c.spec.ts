import { expect, test, type Page } from '@playwright/test';

// Step 12c-1: pictures for the testing guide (ice, moving platforms, climbing)
const OUT = '/home/claude/work/g12c/';
const S = (page: Page, f: string) => page.evaluate(`(() => { const s = window.__editor.session.value; ${f} })()`);
const cam = (page: Page, yaw: number, pitch = 0.3, zoom = 50) =>
  page.evaluate(([y, p, z]) => { (window as any).__cam = { y, p, z }; }, [yaw, pitch, zoom]);
const shot = async (page: Page, n: string, wait = 400) => {
  await page.waitForTimeout(wait);
  await page.locator('[aria-label="Play view"]').first().screenshot({ path: OUT + n });
};
const until = (page: Page, cond: string, timeout = 60_000) =>
  page.waitForFunction(`(() => { const s = window.__editor.session.value; return !!s && (${cond}); })()`, undefined, { timeout });

test('g12c', async ({ page }) => {
  test.setTimeout(1_500_000);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(() => ((window as any).__editor?.scene.value?.count ?? 0) > 0, undefined, { timeout: 60_000 });
  await page.locator('[data-tour="menu-help"]').click();
  await page.getByRole('menuitem', { name: 'Courses…' }).click();
  await page.getByRole('menuitem', { name: /Ice, platforms and climbing course/ }).click();
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const next = async () => {
    const pos = await card.locator('header .mono').innerText();
    await card.getByRole('button', { name: 'Next ▶' }).click();
    await expect(card.locator('header .mono')).not.toHaveText(pos, { timeout: 60_000 });
  };
  const doIt = async () => {
    const b = card.getByRole('button', { name: 'Do it for me' });
    await expect(b).toBeEnabled({ timeout: 30_000 });
    await b.click();
    const rest = card.getByRole('button', { name: 'Do the rest ▶▶' });
    const done = card.getByText(/✓ Done!/);
    await expect(rest.or(done)).toBeVisible({ timeout: 300_000 });
    if (await rest.isVisible()) await rest.click();
    await expect(done).toBeVisible({ timeout: 300_000 });
  };
  // 1–2: the pack, and the icy floor, block and wall placed; a picture of the Scene view
  await doIt();
  await next();
  await doIt();
  await page.locator('canvas').first().screenshot({ path: `${OUT}s-ice-placed.png` }).catch(() => {});
  await next();
  // 3: Play; on the ice, sliding on after letting go
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await until(page, 's.runtime.ticks > 10', 180_000);
  await page.evaluate(() => {
    const loop = () => {
      const s = (window as any).__editor.session.value;
      const c = (window as any).__cam;
      if (s && c) {
        s.camYaw = s.heroState.heading + Math.PI + c.y;
        s.camPitch = c.p;
        s.zoom = c.z;
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
  for (const n of [...(await S(page, 'return s.world.npcs.map((_, i) => i);') as number[])]) void n;
  const box = (n: string) =>
    S(page, `const t = s.world.instances.find(i => i.def.name === '${n}'); if (!t) return null; const xs = t.bricks.map(b => b.x), zs = t.bricks.map(b => b.z), ys = t.bricks.map(b => b.y); return [Math.min(...xs), Math.max(...xs) + 1, Math.min(...zs), Math.max(...zs) + 1, Math.max(...ys) + 1];`) as Promise<number[]>;
  const fl = await box('Icy floor');
  // across the floor, from one side to the other, then let go: the slide
  await S(page, `s.placeAt([${fl[0]! + 1}, 0.4, ${(fl[2]! + fl[3]!) / 2}], Math.PI / 2); s.camYaw = -Math.PI / 2; s.input.keys.add('forward');`);
  await cam(page, 0.9, 0.35, 45);
  await page.waitForTimeout(1600);
  await S(page, "s.input.keys.delete('forward');");
  await shot(page, 'i1-sliding.png', 250);
  await page.waitForTimeout(1500);
  // the ice block, pushed: it slides on to the ice wall
  const bl = await box('Ice block');
  await cam(page, 0.6, 0.45, 32);
  await S(page, `s.placeAt([${(bl[0]! + bl[1]!) / 2}, 0.4, ${bl[2]!} - 1.2], 0);`);
  await shot(page, 'i2-block-before.png', 1200);
  await doIt();
  await cam(page, 0.6, 0.45, 32);
  await shot(page, 'i3-block-slid.png', 800);
  await next();
  // 4–5: the torch, and the wall melting
  await doIt();
  await next();
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await until(page, 's.runtime.ticks > 10', 180_000);
  await S(page, "s.give('Torch', 1);");
  const wl = await box('Ice wall');
  await S(page, `s.placeAt([${(wl[0]! + wl[1]!) / 2}, 0.4, ${wl[2]!} - 1.6], 0);`);
  await cam(page, 0.7, 0.3, 50);
  await page.waitForTimeout(1200);
  await S(page, "s.useItem('Torch', s.buttons.slots.indexOf('Torch') + 1);");
  await shot(page, 'i4-melting.png', 700);
  await until(page, "!s.world.instances.some(i => i.def.name === 'Ice wall')", 30_000);
  await shot(page, 'i5-melted.png', 600);
  await doIt();
  await next();
  // 6–7: the platform, ridden
  await doIt();
  await page.locator('canvas').first().screenshot({ path: `${OUT}s-platform-path.png` }).catch(() => {});
  await next();
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await until(page, 's.runtime.ticks > 10', 180_000);
  const pl = await box('Moving platform');
  await S(page, `s.placeAt([${(pl[0]! + pl[1]!) / 2}, ${pl[4]! * 0.4}, ${(pl[2]! + pl[3]!) / 2}], 0);`);
  await cam(page, 1.2, 0.35, 40);
  await until(page, '!!s.platforms.ride', 20_000);
  await shot(page, 'p1-riding.png', 1500);
  await page.waitForTimeout(2500);
  await shot(page, 'p2-riding-far.png', 200);
  await doIt();
  await next();
  // 8–9: Climbing: Anything (a picture of the Project tab), a rock face
  await doIt();
  await page.locator('[data-help="project.climbing"]').screenshot({ path: `${OUT}c0-setting.png` }).catch(() => {});
  await next();
  await doIt();
  await next();
  // 10: climb, with the stamina bar
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Play', exact: true }).click();
  await until(page, 's.runtime.ticks > 10', 180_000);
  const rk = await box('Rock face');
  await S(page, `s.placeAt([${(rk[0]! + rk[1]!) / 2}, 0.4, ${rk[2]!} - 1.1], 0); s.camYaw = Math.PI; s.input.keys.add('forward');`);
  await cam(page, 0.9, 0.2, 45);
  await until(page, '!!s.puzzles.wall', 20_000);
  await page.waitForTimeout(1800);
  await shot(page, 'c1-climbing.png', 100);
  await S(page, 's.input.jump = true;');
  await shot(page, 'c2-climb-jump.png', 300);
  await until(page, "s.events.some(e => e.msg.includes('Over the top of the wall'))", 60_000);
  await page.waitForTimeout(900);
  await S(page, "s.input.keys.delete('forward');");
  await shot(page, 'c3-top.png', 500);
  console.log('done', JSON.stringify(await S(page, 'return [s.heroState.y, s.combat.stamina];')));
});
