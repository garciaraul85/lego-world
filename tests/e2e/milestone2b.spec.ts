import { writeFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { compare } from './helpers/gpu-compare';

/**
 * The Milestone 2b gate (Foundations), on its sample map — the Foundations park — played with the physics engine:
 * a crate floats in a pond and drifts down a river, smashed bricks tumble and come to rest, the hero stands on a
 * 3D model, the lanterns' lights cast shadows, and the park draws the same with WebGPU as with WebGL. Also: the
 * Training yard plays the same with physics movement. (100,000 objects in the frame budget: object-core.spec;
 * an imported glTF model lit beside the bricks: models.spec and webgpu.spec.)
 */
type Pose = { pos: number[] } | null;
type S = {
  runtime: { ticks: number };
  physicsMovement: boolean;
  heroState: { x: number; y: number; z: number };
  placeAt(p: [number, number, number], yaw: number): void;
  breakHit(p: unknown, by: unknown, force: boolean): number;
  pieceById(w: unknown, id: number): unknown;
  loading: unknown;
  world: {
    mapId: string;
    doc: { name: string; spawns: { pos: number[] }[] };
    physics: { objectPose(k: string): Pose; solidKeys(): string[]; looseCount: number } | null;
    debris: { y: number; vx: number; vy: number; vz: number; sleeping?: boolean }[];
    looseObjects: { inst: { inst: { id: string } }; origin: number[] }[];
    instances: { def: { name: string }; inst: { id: string; idBase: number; pos: number[] } }[];
    models: { name?: string; pos: number[] }[];
  };
};
type Ed = {
  scene: { value: { count: number } | null };
  mapDoc: { value: { name: string } | null };
  session: { value: S | null };
  stats: { value: { lights?: number; shadows?: number; drawCalls: number; ms: number } };
  previewQuality: { value: string | null };
  exec(c: unknown): { ok: boolean; error?: string };
};
const get = <T>(page: Page, fn: (e: Ed) => T) =>
  page.evaluate((src) => {
    const f = new Function('e', `return (${src})(e)`) as (e: Ed) => T;
    return f((window as unknown as { __editor: Ed }).__editor);
  }, fn.toString());
const ses = <T>(page: Page, fn: (s: S) => T) =>
  page.evaluate((src) => {
    const f = new Function('s', `return (${src})(s)`) as (s: S) => T;
    return f((window as unknown as { __editor: Ed }).__editor.session.value!);
  }, fn.toString());
const menu = async (page: Page, name: string, item: RegExp) => {
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
};
async function open(page: Page, errors: string[], url = '/editor.html?nohub') {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(
    () => ((window as unknown as { __editor?: Ed }).__editor?.scene.value?.count ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
}

/** the Scene's drawing time and draws, averaged over a few frames, with each renderer */
async function drawSpeed(page: Page) {
  return page.evaluate(async () => {
    const v = (
      window as unknown as {
        __view: () => {
          redraw(): void;
          renderer: { kind: string; stats: { ms: number; drawCalls: number; chunksDrawn: number } };
        };
      }
    ).__view();
    const ms: number[] = [];
    let draws = 0;
    for (let i = 0; i < 12; i++) {
      v.redraw();
      await new Promise((r) => setTimeout(r, 120));
      ms.push(v.renderer.stats.ms);
      draws = v.renderer.stats.drawCalls;
    }
    ms.sort((a, b) => a - b);
    return { kind: v.renderer.kind, medianMs: Math.round(ms[6]! * 100) / 100, draws };
  });
}

test('Milestone 2b gate: the Foundations park floats, drifts, smashes, climbs, lights and draws the same both ways', async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  await open(page, errors, '/editor.html?nohub&gpu=offscreen');
  await get(page, (e) => e.exec({ type: 'project.update', payload: { movement: 'physics' } }));
  await menu(page, 'World', /Add the Foundations park/);
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name)).toBe('Foundations park');

  // the park draws the same with WebGPU and WebGL (water's mirror aside: WebGPU's is a true reflection)
  await compare(page, 'gate-park', { reflections: false });
  // how fast each draws the park (this machine draws in software: the numbers are only for comparing)
  const gpu = await drawSpeed(page);
  await page.getByLabel('Draw with').selectOption('webgl');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __view: () => { renderer: { kind: string } } }).__view().renderer.kind,
        ),
      { timeout: 90_000 },
    )
    .toBe('webgl');
  await page.waitForTimeout(1000);
  const gl = await drawSpeed(page);
  writeFileSync('test-results/gate-speed.json', JSON.stringify({ webgpu: gpu, webgl: gl }, null, 2));
  console.log(
    `draw speed: WebGPU ${gpu.medianMs} ms (${gpu.draws} draws), WebGL ${gl.medianMs} ms (${gl.draws} draws)`,
  );
  expect(gpu.draws).toBeGreaterThan(20);
  expect(gl.draws).toBeGreaterThan(20);

  // play it at High quality (shadows on)
  await get(page, (e) => {
    e.previewQuality.value = 'high';
  });
  await menu(page, 'Play', /^Play this map/);
  await expect
    .poll(() => get(page, (e) => e.session.value?.runtime.ticks ?? 0), { timeout: 120_000 })
    .toBeGreaterThan(5);
  expect(await ses(page, (s) => s.physicsMovement)).toBe(true);
  // every 3D model is solid, both crates are bodies in the physics engine
  expect(await ses(page, (s) => s.world.physics!.solidKeys().length)).toBe(13);
  expect(await ses(page, (s) => s.world.looseObjects.length)).toBe(2);

  // the lanterns light the park and cast shadows
  await expect.poll(() => get(page, (e) => e.stats.value.shadows ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);

  // the river carries its crate west; the pond's crate floats where it is
  const crate = (page: Page, which: 0 | 1) =>
    ses(
      page,
      new Function(
        's',
        `const o = s.world.looseObjects[${which}]; const p = s.world.physics.objectPose(o.inst.inst.id); return { x: p.pos[0], y: p.pos[1], z: p.pos[2], ox: o.origin[0], oy: o.origin[1], oz: o.origin[2] };`,
      ) as (s: S) => { x: number; y: number; z: number; ox: number; oy: number; oz: number },
    );
  await expect
    .poll(
      async () => {
        const c = await crate(page, 0);
        return c.ox - c.x;
      },
      { timeout: 180_000 },
    )
    .toBeGreaterThan(2);
  const pond = await crate(page, 1);
  expect(Math.hypot(pond.x - pond.ox, pond.z - pond.oz)).toBeLessThan(2);
  // it floats: its middle is not on the pond's floor
  expect(pond.y).toBeGreaterThan(0.9);
  await page.screenshot({ path: 'test-results/gate-park-play.png' });

  // the old wall smashes: its bricks tumble and come to rest
  const made = await ses(page, (s) => {
    const wall = s.world.instances.find((i) => i.def.name === 'Old brick wall')!;
    return s.breakHit(s.pieceById(s.world, wall.inst.idBase), undefined, true);
  });
  expect(made).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        ses(page, (s) => {
          const d = s.world.debris;
          return d.length ? d.filter((x) => x.sleeping || Math.hypot(x.vx, x.vy, x.vz) < 0.2).length / d.length : 0;
        }),
      { timeout: 240_000 },
    )
    .toBeGreaterThan(0.7);
  expect(await ses(page, (s) => Math.min(...s.world.debris.map((d) => d.y)))).toBeGreaterThan(0);

  // the hero climbs the boulder (a 3D model): dropped from above, it lands and stands on top
  await ses(page, (s) => {
    const b = s.world.models.find((m) => m.name === 'Climbing boulder')!;
    s.placeAt([b.pos[0]!, b.pos[1]! + 9, b.pos[2]!], 0);
  });
  const above = () =>
    ses(page, (s) => {
      const b = s.world.models.find((m) => m.name === 'Climbing boulder')!;
      return s.heroState.y - b.pos[1]!;
    });
  await expect.poll(above, { timeout: 180_000 }).toBeLessThan(5);
  await page.waitForTimeout(4000);
  expect(await above()).toBeGreaterThan(2);
  await page.screenshot({ path: 'test-results/gate-park-boulder.png' });
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('Milestone 2b gate: the Training yard plays the same with physics movement', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  await open(page, errors);
  await get(page, (e) => e.exec({ type: 'project.update', payload: { movement: 'physics' } }));
  await menu(page, 'World', /Add the Training yard/);
  await expect.poll(() => get(page, (e) => e.mapDoc.value?.name)).toBe('Training yard');
  await menu(page, 'Play', /^Play this map/);
  await expect
    .poll(() => get(page, (e) => e.session.value?.runtime.ticks ?? 0), { timeout: 120_000 })
    .toBeGreaterThan(5);
  expect(await ses(page, (s) => s.physicsMovement)).toBe(true);
  const canvas = page.locator('canvas').first();
  await canvas.click({ position: { x: 20, y: 20 } });
  // the hero walks on the yard's floor as before: forward a few studs, feet on the floor
  const start = await ses(page, (s) => ({ ...s.heroState }));
  await page.keyboard.down('w');
  await expect
    .poll(
      async () => {
        const h = await ses(page, (s) => s.heroState);
        return Math.hypot(h.x - start.x, h.z - start.z);
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThan(2);
  await page.keyboard.up('w');
  await page.waitForTimeout(1500);
  expect(Math.abs((await ses(page, (s) => s.heroState.y)) - 0.4)).toBeLessThan(0.3);
  // the dummies still break when hit, and the cellar stairs still lead down to the dark cellar
  const made = await ses(page, (s) => {
    const d = s.world.instances.find((i) => i.def.name === 'Training dummy')!;
    return s.breakHit(s.pieceById(s.world, d.inst.idBase), undefined, true);
  });
  expect(made).toBeGreaterThan(0);
  await ses(page, (s) => s.placeAt([-18, 0.4, -16], 0));
  await expect.poll(() => ses(page, (s) => s.world.doc.name), { timeout: 120_000 }).toBe('Yard cellar');
  await expect.poll(() => ses(page, (s) => !s.loading), { timeout: 120_000 }).toBe(true);
  // in the cellar the hero stands on its floor with physics too
  await page.waitForTimeout(3000);
  const y = await ses(page, (s) => s.heroState.y);
  const floorY = await ses(page, (s) => s.world.doc.spawns[0]!.pos[1]!);
  expect(Math.abs(y - floorY)).toBeLessThan(1);
  await page.getByRole('group', { name: 'Play controls' }).getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});
