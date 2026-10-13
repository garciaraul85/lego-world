import { expect, type Page, test } from '@playwright/test';

/**
 * P31 screen design: move / size widgets on the canvas, portrait layouts, pins, the all-sizes check, the colour
 * picker, and art (generated backgrounds, drawn icons, designed fonts) used by widgets.
 */
type Widget = {
  type: string;
  id?: string;
  offset?: [number, number];
  style?: Record<string, string | number>;
  portrait?: { offset?: [number, number]; style?: Record<string, string | number> };
  pin?: { to: string; side: string };
  children?: Widget[];
};
type Ed = {
  scene: { value: { count: number } };
  screenId: { value: string | null };
  store: { get(p: string): unknown; list(p: string): string[] };
};
const SHOTS = process.env.SHOTS_DIR;

async function open(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' && !/Failed to load resource|Permissions check/i.test(m.text()) && errors.push(m.text()),
  );
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'Screens' }).click();
}

/** the widget with this id in the open screen */
const widget = (page: Page, id: string) =>
  page.evaluate((id) => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const s = e.store.get(`screens/${e.screenId.value}.json`) as { root: Widget } | undefined;
    const find = (w: Widget): Widget | undefined => (w.id === id ? w : (w.children ?? []).map(find).find(Boolean));
    return s ? find(s.root) : undefined;
  }, id) as Promise<Widget | undefined>;

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 3 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 3 });
  await page.mouse.up();
}

test('widgets move and size on the canvas, keep a portrait layout, pin to each other and pass the size check', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('button', { name: '+ New' }).click();
  // the palette shows a live preview of each widget; click one to add it
  const palette = page.getByRole('group', { name: 'Add widget' });
  await expect(palette.locator('.sc-pal-preview .bw-button')).toBeVisible();
  await palette.getByRole('button', { name: 'Add Button' }).click();
  const box = page.locator('.sc-box');
  await expect(box).toBeVisible();
  const before = (await widget(page, 'button1'))!;
  const b = (await box.boundingBox())!;
  // drag the middle: moves (snaps to the 8 px grid)
  await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 90, 40);
  const moved = (await widget(page, 'button1'))!;
  expect(moved.offset![0]).toBeGreaterThan((before.offset?.[0] ?? 0) + 40);
  expect(moved.offset![1]).toBeGreaterThan((before.offset?.[1] ?? 0) + 15);
  // the east handle sizes it
  const b2 = (await box.boundingBox())!;
  await drag(page, { x: b2.x + b2.width, y: b2.y + b2.height / 2 }, 60, 0);
  const sized = (await widget(page, 'button1'))!;
  expect(Number(sized.style?.w)).toBeGreaterThan(b2.width);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/screens-handles.png` });
  // one undo step per drag
  await page.keyboard.press('Control+z');
  expect((await widget(page, 'button1'))!.style?.w).toBe(sized.style?.w === undefined ? undefined : before.style?.w);

  // upright: changes go to the portrait layout only
  await page.getByRole('button', { name: /Sideways/ }).click();
  await expect(page.getByRole('note').filter({ hasText: 'portrait layout' }).first()).toBeVisible();
  const b3 = (await box.boundingBox())!;
  await drag(page, { x: b3.x + b3.width / 2, y: b3.y + b3.height / 2 }, 0, 60);
  const up = (await widget(page, 'button1'))!;
  expect(up.portrait?.offset).toBeTruthy();
  expect(up.offset).toEqual(moved.offset);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/screens-portrait.png` });
  await page.getByRole('button', { name: 'Use the normal layout' }).click();
  expect((await widget(page, 'button1'))!.portrait).toBeUndefined();
  await page.getByRole('button', { name: /Upright/ }).click();

  // pin a text below the button
  await palette.getByRole('button', { name: 'Add Text' }).click();
  await page.getByLabel('Place next to widget').selectOption('button1');
  await page.getByLabel('Pin side').selectOption('below');
  expect((await widget(page, 'text1'))!.pin).toEqual({ to: 'button1', side: 'below' });
  const btn = (await page.locator('.sc-device [data-widget="button1"]').first().boundingBox())!;
  const txt = (await page.locator('.sc-device [data-widget="text1"]').first().boundingBox())!;
  expect(txt.y).toBeGreaterThan(btn.y + btn.height - 1);
  expect(Math.abs(txt.x - btn.x)).toBeLessThan(2);

  // every size both ways
  await page.getByRole('button', { name: '✓ Check all sizes' }).click();
  const check = page.getByRole('region', { name: 'Check all sizes' });
  await expect(check.locator('.sc-check-cell')).toHaveCount(10);
  await expect(check.getByRole('group', { name: 'Problems' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/screens-check.png` });
  await page.getByRole('button', { name: '✓ Check all sizes' }).click();

  // any colour from the picker
  await page
    .getByRole('button', { name: /^Background/ })
    .first()
    .click();
  const picker = page.getByRole('dialog', { name: /Background picker/ });
  await expect(picker).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/screens-color.png` });
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('art: generate a background, draw an icon, design a font, and use them on widgets', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  await open(page, errors);
  await page.getByRole('button', { name: '+ New' }).click();
  await page.getByRole('tab', { name: 'Art' }).click();
  const lib = page.locator('.art-lib');
  // Art is just for making art: the selected tab stands out and the screen properties go away
  await expect(page.getByRole('tab', { name: 'Art' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Widget properties' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Make art' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-start.png` });

  // background generator
  await lib.getByRole('region', { name: 'Backgrounds' }).getByRole('button', { name: '+ Generate' }).click();
  const editor = page.getByRole('region', { name: /^Edit Background/ });
  await expect(editor).toBeVisible();
  await editor.getByRole('radio', { name: /Stripes/ }).click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-background.png` });

  // icon drawing
  await lib.getByRole('region', { name: 'Icons' }).getByRole('button', { name: '+ Draw' }).click();
  const canvas = page.getByLabel('Drawing: click and drag to paint');
  await expect(canvas).toBeVisible();
  const c = (await canvas.boundingBox())!;
  await drag(page, { x: c.x + c.width * 0.2, y: c.y + c.height * 0.5 }, c.width * 0.6, 0);
  const icon = await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    return e.store
      .list('art/')
      .map((p) => e.store.get(p) as { id: string; kind: string; source: { data?: string } })
      .find((a) => a.kind === 'icon')!;
  });
  expect(icon.source.data).toMatch(/0/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-icon.png` });

  // font designer: the designed font loads as a real font
  await lib.getByRole('region', { name: 'Fonts' }).getByRole('button', { name: '+ Design' }).click();
  await expect(page.getByRole('grid', { name: 'Letter A' })).toBeVisible();
  await page.waitForFunction(() => [...document.fonts].some((f) => f.family.includes('bwf_') && f.status === 'loaded'));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-font.png` });

  // use them: a button with the icon, the background and the font
  await page.getByRole('button', { name: '← All art' }).click();
  await expect(page.getByRole('region', { name: 'Make art' })).toBeVisible();
  await page.getByRole('tab', { name: 'Screens' }).click();
  await page.getByRole('group', { name: 'Add widget' }).getByRole('button', { name: 'Add Button' }).click();
  // each choice is shown as a preview card: the button shows the current one
  const pick = async (label: string, option: RegExp | string) => {
    await page.getByRole('button', { name: new RegExp(`^${label}: `) }).click();
    const list = page.getByRole('listbox', { name: label });
    await expect(list.locator('.pv-thumb').first()).toBeVisible();
    await list.getByRole('option', { name: option }).click();
    await expect(list).toBeHidden();
  };
  await pick('Background picture', 'Background 1');
  await expect(
    page.getByRole('button', { name: 'Background picture: Background 1' }).locator('.art-thumb'),
  ).toBeVisible();
  // the fit choices preview the chosen picture
  await page.getByRole('button', { name: /^Background fit: / }).click();
  await expect(page.getByRole('listbox', { name: 'Background fit' }).locator('.pv-fit').first()).toHaveCSS(
    'background-image',
    /data:image\/svg/,
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-fit-picker.png` });
  await page.getByRole('listbox', { name: 'Background fit' }).getByRole('option', { name: 'Repeat' }).click();
  await pick('Icon', 'Icon 1');
  await page.getByRole('button', { name: /^Font: / }).click();
  await expect(page.getByRole('listbox', { name: 'Font' }).getByRole('option')).toHaveCount(7); // parent, 5 built-in, 1 designed
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-font-picker.png` });
  await page.getByRole('listbox', { name: 'Font' }).getByRole('option', { name: 'Pixel font 1' }).click();
  const el = page.locator('.sc-device [data-widget="button1"]').first();
  await expect(el.locator('.bw-btn-icon')).toBeVisible();
  const css = await el.evaluate((n) => ({
    bg: getComputedStyle(n).backgroundImage,
    font: getComputedStyle(n).fontFamily,
  }));
  expect(css.bg).toContain('data:image/svg');
  expect(css.font).toContain('bwf_');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/art-used.png` });
  // in use: can't delete
  await page.getByRole('tab', { name: 'Art' }).click();
  await lib.getByRole('button', { name: /\(font\)$/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.toast').last()).toContainText(/used/i);
  expect(errors).toEqual([]);
});
