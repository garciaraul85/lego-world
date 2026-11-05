import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * P32: the editor states Help covers. The coverage test checks every visible control in each state has a
 * Help entry; the screenshot script captures each state for screen guides and entry pictures.
 */
export type HelpState = {
  id: string;
  /** the screen guide this state's picture belongs to (the first state of a screen is its guide picture) */
  screen: string;
  /** puts the editor in this state (from any other state) */
  setup: (page: Page) => Promise<void>;
};

type Sig = { value: unknown };
type Ed = {
  scene: Sig;
  mapId: Sig;
  selectedZone: Sig;
  selectedSpawn: Sig;
  selectedItem: Sig;
  logicGraph: Sig;
  exec: (c: unknown, o?: unknown) => { ok: boolean };
  store: { list(p: string): string[]; get(p: string): unknown; has(p: string): boolean };
  select: (ids: number[]) => void;
  effectId: Sig;
  right: Sig;
};

export const ed = <T>(page: Page, f: (e: Ed) => T) => page.evaluate(`(${f.toString()})(window.__editor)`) as Promise<T>;

export async function openEditor(page: Page) {
  await page.goto('/editor.html?nohub');
  await page.waitForFunction(
    () =>
      (((window as unknown as { __editor?: Ed }).__editor?.scene?.value as { count: number } | null)?.count ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  // a calm page: no hover tips or toasts left from the last step
  await page.mouse.move(0, 0);
}

const ws = async (page: Page, name: string) => {
  await page.keyboard.press('Escape');
  // P19: Brix's walk-through and panel close first (they would cover the screen)
  const done = page.getByRole('dialog', { name: 'Brix shows you' }).getByRole('button', { name: /^(Done|Stop)$/ });
  if (await done.isVisible()) await done.click();
  const close = page.getByRole('button', { name: 'Close Brix' });
  if (await close.isVisible()) await close.click();
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(250);
};
const signals = (page: Page, values: Record<string, unknown>) =>
  page.evaluate((v) => {
    const e = (window as unknown as { __editor: Record<string, { value: unknown }> }).__editor;
    for (const [k, x] of Object.entries(v)) e[k]!.value = x;
  }, values);

/** the first placed asset copy on the map, selected (Inspector shows the asset) */
async function selectAsset(page: Page) {
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const s = e.scene.value as { instances: { bricks: { id: number }[] }[] };
    e.select(s.instances[0]!.bricks.map((b) => b.id));
  });
}

async function ensureZone(page: Page) {
  await page.evaluate(() => {
    const e = (window as unknown as { __editor: Ed }).__editor;
    const map = e.mapId.value as string;
    const doc = e.store.get(`maps/${map}/map.json`) as { zones: { id: string }[] };
    if (!doc.zones.length) e.exec({ type: 'map.addZone', payload: { map, zone: { min: [0, 0, 0], max: [4, 3, 4] } } });
    const z = (e.store.get(`maps/${map}/map.json`) as { zones: { id: string }[] }).zones[0]!.id;
    e.selectedZone.value = z;
  });
}

export const HELP_STATES: HelpState[] = [
  { id: 'scene', screen: 'scene', setup: (p) => ws(p, 'Scene') },
  {
    id: 'scene-asset',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await selectAsset(p);
    },
  },
  {
    // P9c: the same object, scrolled to its name, script and wires
    id: 'scene-script',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await selectAsset(p);
      await p.locator('[data-tour="object-script"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P32: loose bricks (the ground) selected: the Inspector offers to make them an asset
    id: 'scene-loose',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const s = e.scene.value as {
          all(): { id: number; y: number }[];
          ownerOf(id: number): unknown;
        };
        const b = s.all().find((x) => !s.ownerOf(x.id) && x.y > 0) ?? s.all().find((x) => !s.ownerOf(x.id))!;
        e.select([b.id]);
      });
    },
  },
  {
    id: 'scene-zone',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await ensureZone(p);
    },
  },
  {
    id: 'scene-spawn',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const doc = e.store.get(`maps/${map}/map.json`) as { spawns: { id: string }[] };
        e.selectedSpawn.value = doc.spawns[0]!.id;
      });
    },
  },
  {
    id: 'scene-item',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const id = 'ins_helpsign01';
        // (refused harmlessly when it is already there)
        e.exec({
          type: 'item.add',
          payload: {
            map,
            item: { id, kind: 'ui', widget: 'sign', pos: [3, 2, 3], text: 'Coins: {coins}', maxDistance: 30 },
          },
        });
        e.selectedItem.value = id;
      });
    },
  },
  {
    id: 'scene-map',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'map' });
    },
  },
  {
    id: 'scene-project',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
    },
  },
  {
    // P26: the Project tab scrolled to Saving
    id: 'scene-saving',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="game-saving"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P26 part 2: the Project tab scrolled to Progress
    id: 'scene-progress',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="game-progress"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 11b: the Project tab scrolled to Swimming, then to Controls
    id: 'scene-swimming',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="project-swimming"]').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'scene-controls',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="project-controls"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 11, 4c: the template window (script templates, at the boss fight)
    id: 'logic-templates',
    screen: 'logic',
    setup: async (p) => {
      await ws(p, 'Logic');
      await p.evaluate(() => {
        (window as unknown as { __editor: { templates: { value: unknown } } }).__editor.templates.value = {
          kind: 'script',
          id: 'boss',
        };
      });
      await p.getByRole('dialog').waitFor();
    },
  },
  {
    // step 11, 4b: the Project tab scrolled to Screen look
    id: 'scene-look',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="project-look"]').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'scene-dialogue',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'project' });
      await p.locator('[data-tour="game-dialogue"]').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'scene-layers',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'layers', right: 'inspect' });
    },
  },
  {
    id: 'scene-find',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'search' });
    },
  },
  {
    // step 12a: the Starter pack's Puzzle pieces
    id: 'scene-dock-puzzles',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Puzzle pieces"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12b: the Starter pack's Fire and light pieces
    id: 'scene-dock-firelight',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Fire and light"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12c: the Starter pack's ice, platforms and climbing pieces
    id: 'scene-dock-icemove',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Ice, platforms and climbing"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12c-2: the Starter pack's wind and throwing pieces
    id: 'scene-dock-wind',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Wind and throwing"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 13a: the Starter pack's bow and boomerang pieces
    id: 'scene-dock-shots',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Bow and boomerang"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 13b: the Starter pack's hook and magnet pieces
    id: 'scene-dock-hooks',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Hook and magnet"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 13c: the Starter pack's hover boots, Lens of Truth, hidden and fake pieces
    id: 'scene-dock-lens',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: 'pack' });
      await p.locator('[aria-label="Boots and Lens"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12a: the Map tab scrolled to Dungeon
    id: 'scene-map-dungeon',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'map' });
      await p.locator('[data-tour="map-dungeon"]').scrollIntoViewIfNeeded();
    },
  },
  ...(['pack', 'library', 'console', 'timeline', 'profiler', 'problems', 'debug', 'audio'] as const).map((d) => ({
    id: `scene-dock-${d}`,
    screen: 'scene',
    setup: async (p: Page) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: d });
    },
  })),
  ...[
    'Assets',
    'Characters',
    'Cinematics',
    'UI screens',
    'Effects',
    'Lights',
    'Water',
    '3D models',
    'Sounds',
    'Music',
  ].map((c) => ({
    id: `scene-cat-${c.toLowerCase().replace(/ /g, '-')}`,
    screen: 'scene',
    setup: async (p: Page) => {
      await ws(p, 'Scene');
      await signals(p, { dock: 'assets', assetCat: c });
    },
  })),
  {
    id: 'scene-views',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { dock: 'assets', assetCat: 'Assets', view: 'nav' });
    },
  },
  ...['File', 'Edit', 'Assets', 'World', 'Play', 'Window', 'Help'].map((m) => ({
    id: `menu-${m.toLowerCase()}`,
    screen: 'shell',
    setup: async (p: Page) => {
      await ws(p, 'Scene');
      await signals(p, { view: 'scene' });
      await p.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: m, exact: true }).click();
    },
  })),
  {
    id: 'palette',
    screen: 'shell',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.keyboard.press('Control+k');
      await p.getByRole('dialog', { name: 'Command palette' }).waitFor();
    },
  },
  {
    id: 'shortcuts',
    screen: 'shell',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      await p.getByRole('dialog').first().waitFor();
    },
  },
  { id: 'world', screen: 'world', setup: (p) => ws(p, 'World graph') },
  {
    id: 'logic',
    screen: 'logic',
    setup: async (p) => {
      await ws(p, 'Logic');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        let g = e.store.list('logic/')[0];
        if (!g) {
          e.exec({
            type: 'logic.create',
            payload: {
              graph: {
                id: 'lg_helpexampl',
                name: 'Help example',
                scope: 'global',
                nodes: [
                  { id: 'n1', type: 'event.onStart', pos: [0, 0] },
                  { id: 'n2', type: 'misc.log', pos: [260, 0] },
                ],
                edges: [['n1', 'then', 'n2', 'in']],
              },
            },
          });
          g = e.store.list('logic/')[0];
        }
        e.logicGraph.value = (e.store.get(g!) as { id: string }).id;
      });
    },
  },
  {
    // Milestone 3b (B1): a behaviour open in Logic (its fields and own variables on the left, the class in Split)
    id: 'logic-behaviour',
    screen: 'logic',
    setup: async (p) => {
      await ws(p, 'Logic');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const id = 'lg_helpbehave';
        if (!e.store.get(`logic/${id}.json`))
          e.exec({
            type: 'logic.create',
            payload: {
              graph: {
                id,
                name: 'Gem door',
                scope: 'global',
                behaviour: {
                  fields: [{ name: 'gemsNeeded', type: 'number', default: 3, label: 'Gems needed', min: 1, max: 99 }],
                  vars: { tries: 0 },
                },
                nodes: [
                  { id: 'n1', type: 'event.onInteract', pos: [0, 0] },
                  { id: 'n2', type: 'self.add', pos: [260, 0], args: { name: 'tries', amount: 1 } },
                  { id: 'n3', type: 'event.onUpdate', pos: [0, 160] },
                ],
                edges: [['n1', 'then', 'n2', 'in']],
              },
            },
          });
        e.logicGraph.value = id;
      });
      await signals(p, { logicView: 'split' });
    },
  },
  {
    id: 'logic-code',
    screen: 'logic',
    setup: async (p) => {
      await ws(p, 'Logic');
      await signals(p, { logicView: 'split' });
    },
  },
  {
    id: 'characters',
    screen: 'characters',
    setup: async (p) => {
      await signals(p, { logicView: 'graph' });
      await ws(p, 'Characters');
    },
  },
  ...(['outfits', 'stats', 'moves', 'animations', 'voice', 'behaviour'] as const).map((t) => ({
    id: `characters-${t}`,
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      await signals(p, { charTab: 'look', sheetTab: t });
      // a character of the game, so every tab shows its fields
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        if (!e.store.list('characters/').length)
          e.exec({
            type: 'character.create',
            payload: { character: { id: 'chr_helpsheet1', name: 'Sam', role: 'npc', profile: { name: 'Sam' } } },
          });
        e.studioCharacter!.value = e.store.list('characters/')[0]!.replace(/^characters\/|\.json$/g, '');
      });
      if (t === 'outfits' && !(await p.locator('.outfit-row').count()))
        await p.locator('[data-tour="outfit-new"]').click();
    },
  })),
  {
    // P23 part 4: a clip of the game's own in the Poses view (pose pictures, the tools and the joint sliders)
    id: 'characters-poses',
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        const id = 'clp_helppose01';
        if (!e.store.has(`clips/${id}.json`))
          e.exec({
            type: 'clip.create',
            payload: {
              clip: {
                id,
                name: 'Wave hello',
                length: 2,
                loop: true,
                tracks: [
                  {
                    bone: 'rightArm',
                    prop: 'z',
                    keys: [
                      [0, 0.06, 'easeInOut'],
                      [1, 2.6, 'easeInOut'],
                      [2, 0.06, 'easeInOut'],
                    ],
                  },
                ],
                events: [],
              },
            },
          });
        e.studioClip!.value = id;
        e.clipPlaying!.value = false;
        e.clipTime!.value = 1;
        e.clipView!.value = 'poses';
      });
      // the joint sliders are under the pose pictures: scroll the panel to them
      await p.locator('[data-tour="pose-joints"]').scrollIntoViewIfNeeded();
    },
  },
  ...(['body', 'moves', 'skeleton'] as const).map((v) => ({
    // P22 part 3: a dragon from the family's sliders; the skeleton editor on a body plan of the game's own
    // Milestone 3, 10d part 2: and the dragon's moves (the Body tab scrolled to them)
    id: v === 'moves' ? 'characters-body-moves' : `characters-${v}`,
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      await signals(p, { charTab: 'look', sheetTab: 'body' });
      await p.evaluate((v) => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        const id = v !== 'skeleton' ? 'chr_helpdragon' : 'chr_helpcrab01';
        if (!e.store.get(`characters/${id}.json`)) {
          if (v === 'skeleton')
            e.exec({
              type: 'bodyplan.put',
              payload: {
                plan: {
                  id: 'bpl_helpcrab01',
                  name: 'Crab',
                  family: 'custom',
                  move: 'walk',
                  stride: 1.5,
                  hover: 0,
                  bones: [
                    { name: 'body', at: [0, 1.2, 0], role: 'root', swing: 3 },
                    { name: 'left claw', parent: 'body', at: [-1.5, 0.4, 1], role: 'arm', swing: 20, side: -1 },
                    { name: 'right claw', parent: 'body', at: [1.5, 0.4, 1], role: 'arm', swing: 20, side: 1 },
                    {
                      name: 'left leg',
                      parent: 'body',
                      at: [-1.5, 0, -0.5],
                      role: 'leg',
                      swing: 25,
                      phase: 0,
                      side: -1,
                    },
                    {
                      name: 'right leg',
                      parent: 'body',
                      at: [1.5, 0, -0.5],
                      role: 'leg',
                      swing: 25,
                      phase: 0.5,
                      side: 1,
                    },
                  ],
                  bricks: [
                    { bone: 'body', w: 3, d: 3, kind: 'brick', x: -1.5, y: 0, z: -1.5, color: 'main' },
                    { bone: 'body', w: 3, d: 2, kind: 'plate', x: -1.5, y: 3, z: -1, color: 'accent' },
                    { bone: 'left claw', w: 2, d: 2, kind: 'brick', x: -2, y: 0, z: 0, color: 'accent' },
                    { bone: 'right claw', w: 2, d: 2, kind: 'brick', x: 0, y: 0, z: 0, color: 'accent' },
                    { bone: 'left leg', w: 1, d: 1, kind: 'brick', x: -1, y: -3, z: -0.5, color: 'main' },
                    { bone: 'right leg', w: 1, d: 1, kind: 'brick', x: 0, y: -3, z: -0.5, color: 'main' },
                  ],
                },
              },
            });
          e.exec({
            type: 'character.create',
            payload: {
              character: {
                id,
                name: v !== 'skeleton' ? 'Ember' : 'Pinch',
                role: 'npc',
                profile: { name: v !== 'skeleton' ? 'Ember' : 'Pinch' },
                body: v !== 'skeleton' ? { family: 'dragon' } : { plan: 'bpl_helpcrab01', colors: { main: '#c91a09' } },
              },
            },
          });
        }
        e.studioCharacter!.value = id;
        e.bodyBones!.value = v === 'skeleton';
        e.bodyBone!.value = v === 'skeleton' ? 'left claw' : null;
        e.bodyWalk!.value = false;
      }, v);
      if (v === 'skeleton') await p.locator('[data-tour="char-skeleton"]').scrollIntoViewIfNeeded();
      if (v === 'moves') await p.locator('[data-tour="body-moves"]').scrollIntoViewIfNeeded();
    },
  })),
  {
    // step 11, 4a: a wolf-man's Extra parts (a copy of the starter pack's Howler)
    id: 'characters-extras',
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      await signals(p, { charTab: 'look', sheetTab: 'body' });
      await p.evaluate(() => {
        const w = window as unknown as {
          __editor: Ed & Record<string, { value: unknown }>;
          __builtinCharacters: { name: string; profile: unknown; body?: unknown }[];
        };
        const e = w.__editor;
        const id = 'chr_helpwolf01';
        if (!e.store.get(`characters/${id}.json`)) {
          const h = w.__builtinCharacters.find((c) => c.name === 'Howler')!;
          e.exec({
            type: 'character.create',
            payload: { character: { id, name: 'Wolfie', role: 'npc', profile: h.profile, body: h.body } },
          });
        }
        e.studioCharacter!.value = id;
        e.bodyBones!.value = false;
      });
      await p.locator('[data-tour="char-extras"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P22 part 4: the Face tab, an angry face picked
    id: 'characters-face',
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      const has = await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return e.store.list('characters/').some((k) => (e.store.get(k) as { name?: string })?.name === 'Tom');
      });
      if (!has) {
        await p.locator('[data-tour="char-new"]').click();
        await p.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
      }
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        type C = { id: string; name: string; profile: Record<string, unknown> };
        const all = e.store.list('characters/').map((k) => e.store.get(k) as C);
        const tom = all.find((c) => c.name === 'Tom') ?? all.find((c) => c.id === e.studioCharacter!.value)!;
        if (tom.name !== 'Tom')
          e.exec({
            type: 'character.update',
            payload: {
              character: {
                ...tom,
                name: 'Tom',
                profile: { ...tom.profile, name: 'Tom' },
                faces: { angry: { expression: 'Angry', eyes: 'Wide' } },
              },
            },
          });
        e.studioCharacter!.value = tom.id;
        e.sheetTab!.value = 'face';
        e.faceMood!.value = 'angry';
      });
    },
  },
  ...(['shape', 'draw'] as const).map((v) => ({
    // Milestone 3, 10d: the old body shaping in Look (a sculpted figure), and the Draw tab with a face drawn on
    id: `characters-${v}`,
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      const has = await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return e.store.list('characters/').some((k) => (e.store.get(k) as { name?: string })?.name === 'Nova');
      });
      if (!has) {
        await p.locator('[data-tour="char-new"]').click();
        await p.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
      }
      await p.evaluate((v) => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        type C = { id: string; name: string; profile: Record<string, unknown> };
        const all = e.store.list('characters/').map((k) => e.store.get(k) as C);
        const nova = all.find((c) => c.name === 'Nova') ?? all.find((c) => c.id === e.studioCharacter!.value)!;
        // a star and freckles on the cheek, drawn on the head's front (v68 part paint: six 128-pixel sides)
        const cv = document.createElement('canvas');
        cv.width = 384;
        cv.height = 256;
        const g = cv.getContext('2d')!;
        g.fillStyle = '#c91a09';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 7 : 16;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(38 + r * Math.cos(a), 62 + r * Math.sin(a));
        }
        g.fill();
        g.fillStyle = '#8a4b26';
        for (const [x, y] of [
          [82, 66],
          [90, 70],
          [86, 74],
          [96, 66],
        ])
          g.fillRect(x!, y!, 3, 3);
        if (nova.name !== 'Nova' || !(nova.profile.paint as Record<string, string> | undefined)?.head)
          e.exec({
            type: 'character.update',
            payload: {
              character: {
                ...nova,
                name: 'Nova',
                profile: {
                  ...nova.profile,
                  name: 'Nova',
                  gender: 'Female',
                  breastMode: 'Sculpted',
                  breastShape: 'Natural',
                  breastSize: 70,
                  buttShape: 'Athletic',
                  buttSize: 45,
                  neckline: 'V-neck',
                  paint: { ...((nova.profile.paint as object) ?? {}), head: cv.toDataURL('image/png') },
                },
              },
            },
          });
        e.studioCharacter!.value = nova.id;
        e.sheetTab!.value = v === 'shape' ? 'look' : 'draw';
        e.drawPart!.value = 'head';
        e.drawSide!.value = 0;
      }, v);
      if (v === 'shape') await p.locator('[data-tour="breastSize"]').scrollIntoViewIfNeeded();
      else await p.locator('[data-tour="draw-canvas"]').scrollIntoViewIfNeeded();
      await p.waitForTimeout(800);
    },
  })),
  {
    // Milestone 3, 10d part 3: painting and sculpting a creature (a dog with a painted brick, Add on)
    id: 'characters-sculpt',
    screen: 'characters',
    setup: async (p: Page) => {
      await signals(p, { fromPicture: false });
      await ws(p, 'Characters');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        if (!e.store.get('characters/chr_helpsculp1.json'))
          e.exec({
            type: 'character.create',
            payload: {
              character: {
                id: 'chr_helpsculp1',
                name: 'Patch',
                role: 'npc',
                profile: { name: 'Patch' },
                body: { family: 'fourLegs', params: { size: 1.3 }, colors: { main: '#f4f4f4', accent: '#1b1b1b' } },
              },
            },
          });
        e.studioCharacter!.value = 'chr_helpsculp1';
        e.sheetTab!.value = 'body';
      });
      await p.locator('[data-tour="sculpt-add"]').click();
      await p.locator('[data-tour="body-sculpt"]').scrollIntoViewIfNeeded();
      const c = (await p.getByLabel('Character preview').first().boundingBox())!;
      await p.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.45);
      await p.waitForTimeout(900);
    },
  },
  {
    // Milestone 3, 10d part 3: the Hair editor in Look, a character with space buns and pink tips
    id: 'characters-hair',
    screen: 'characters',
    setup: async (p: Page) => {
      await signals(p, { fromPicture: false });
      await ws(p, 'Characters');
      const has = await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        return e.store.list('characters/').some((k) => (e.store.get(k) as { name?: string })?.name === 'Mira');
      });
      if (!has) {
        await p.locator('[data-tour="char-new"]').click();
        await p.getByRole('listbox', { name: 'New character from a preset' }).getByRole('option').first().click();
      }
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        type C = { id: string; name: string; profile: Record<string, unknown> };
        const all = e.store.list('characters/').map((k) => e.store.get(k) as C);
        const mira = all.find((c) => c.name === 'Mira') ?? all.find((c) => c.id === e.studioCharacter!.value)!;
        if (mira.name !== 'Mira')
          e.exec({
            type: 'character.update',
            payload: {
              character: {
                ...mira,
                name: 'Mira',
                profile: {
                  ...mira.profile,
                  name: 'Mira',
                  gender: 'Female',
                  hat: 'None',
                  hairColor: '#8a4fbf',
                  hair: 'Custom',
                  customHair: {
                    top: 'Smooth',
                    length: 30,
                    volume: 45,
                    parting: 'Middle',
                    fringe: 'Straight',
                    tie: 'Two buns',
                    tieLength: 55,
                    beard: 'None',
                    beardLength: 40,
                    tips: '#e4adc8',
                    name: 'Space buns',
                  },
                },
              },
            },
          });
        e.studioCharacter!.value = mira.id;
        e.sheetTab!.value = 'look';
      });
      await p.locator('[data-tour="hair-editor"]').scrollIntoViewIfNeeded();
      await p.waitForTimeout(1200);
    },
  },
  {
    // P22 part 4: A character from a picture, with three matches from words
    id: 'characters-from-picture',
    screen: 'characters',
    setup: async (p: Page) => {
      await ws(p, 'Characters');
      await signals(p, { makeKind: 'character', fromPicture: true });
      const words = p.locator('[data-tour="fp-words"]');
      await words.fill('a green owl with orange wings');
      await p.locator('[data-tour="fp-create"]').click();
      await p.locator('[data-tour="fp-match-2"]').waitFor({ timeout: 30_000 });
    },
  },
  ...(
    [
      [
        'assets-from-picture',
        'assets',
        'Assets',
        'asset',
        'a red brick house with a blue door, two floors and a chimney',
      ],
      [
        'world-from-picture',
        'scene',
        'Scene',
        'map',
        'a snowy mountain village at night with a lighthouse, three red houses, a blacksmith and two guards',
      ],
    ] as const
  ).map(([id, screen, workspace, kind, text]) => ({
    // Milestone 3, 10d parts 4–5: From a picture making an asset, and a whole map
    id,
    screen,
    setup: async (p: Page) => {
      // the box from the state before closes first (it covers the screen tabs)
      await signals(p, { fromPicture: false });
      await ws(p, workspace);
      await signals(p, { makeKind: kind, fromPicture: true });
      await p.locator('[data-tour="fp-words"]').fill(text);
      await p.locator('[data-tour="fp-create"]').click();
      await p.locator('[data-tour="fp-match-2"]').waitFor({ timeout: 30_000 });
      await p.waitForTimeout(600);
    },
  })),
  {
    // the sheet's Dialogue tab: a neighbour's conversations and barks
    id: 'characters-talk',
    screen: 'characters',
    setup: async (p) => {
      await signals(p, { fromPicture: false });
      await ws(p, 'Characters');
      await signals(p, { charTab: 'look', sheetTab: 'dialogue' });
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        if (!e.store.get('characters/chr_helpsheet1.json'))
          e.exec({
            type: 'character.create',
            payload: { character: { id: 'chr_helpsheet1', name: 'Sam', role: 'npc', profile: { name: 'Sam' } } },
          });
        e.studioCharacter!.value = 'chr_helpsheet1';
      });
    },
  },
  {
    id: 'characters-dialogue',
    screen: 'characters',
    setup: async (p) => {
      await ws(p, 'Characters');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed & Record<string, { value: unknown }> }).__editor;
        const id = 'dlg_helpsample';
        if (!e.store.get(`dialogue/${id}.json`))
          e.exec({
            type: 'dialogue.put',
            payload: {
              conversation: {
                id,
                name: 'Old Tom',
                sections: [
                  {
                    label: 'start',
                    steps: [
                      { k: 'line', who: 'Old Tom', text: 'Welcome, traveller! Mind the bridge.', mood: 'happy' },
                      {
                        k: 'choice',
                        options: [
                          { text: 'What bridge?', to: 'bridge' },
                          { text: 'Buy a map', to: 'end', if: 'gems >= 5', failed: 'grey' },
                        ],
                      },
                    ],
                  },
                  {
                    label: 'bridge',
                    steps: [
                      { k: 'like', by: 5 },
                      { k: 'line', who: 'Old Tom', text: 'The one to the east. It wobbles.' },
                    ],
                  },
                ],
              },
            },
          });
        e.dialogueId!.value = id;
        e.dialogueView!.value = 'list';
        e.charTab!.value = 'dialogue';
      });
      const prev = p.getByRole('button', { name: '▶ Preview' });
      if ((await prev.getAttribute('aria-pressed')) !== 'true') await prev.click();
    },
  },
  { id: 'assets', screen: 'assets', setup: (p) => ws(p, 'Assets') },
  {
    id: 'assets-open',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
    },
  },
  {
    // P26: an open asset scrolled to its Checkpoint box
    id: 'assets-checkpoint',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      await p.locator('[data-tour="asset-checkpoint"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12a: an open asset scrolled to its Puzzle section
    id: 'assets-puzzle',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      await p.locator('[data-tour="asset-puzzle"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12b: an open asset scrolled to its Fire and light section
    id: 'assets-firelight',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      await p.locator('[data-tour="asset-fire-light"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12c: an open asset scrolled to its Ice, moving and climbing section
    id: 'assets-icemove',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      await p.locator('[data-tour="asset-ice-move"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // step 12c-2: an open asset scrolled to its Wind and lifting section
    id: 'assets-wind',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      await p.locator('[data-tour="asset-wind-sec"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P32: the bricks to build with, in the Asset library's Bricks tab
    id: 'assets-bricks',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('region', { name: 'Asset library' }).getByRole('tab', { name: 'Bricks' }).click();
    },
  },
  {
    // Step 11 (P24 part 2): the brick editor making a curve, over an open asset's Bricks tab
    id: 'assets-custom-brick',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('listbox').getByRole('option').first().click();
      const lib = p.getByRole('region', { name: 'Asset library' });
      await lib.getByRole('tab', { name: 'Bricks' }).click();
      await lib.locator('[data-tour="brick-kind-custom"]').click();
      await lib.locator('[data-tour="brick-new"]').click();
      const dlg = p.getByRole('dialog', { name: 'Brick editor' });
      await dlg.locator('[data-tour="brick-name"]').fill('Roof curve');
      await dlg.locator('[data-tour="brick-shape-curve"]').click();
      await dlg.locator('[data-tour="brick-d"]').selectOption('3');
      await p.waitForTimeout(1500);
    },
  },
  { id: 'screens', screen: 'screens', setup: (p) => ws(p, 'Screens') },
  {
    id: 'screens-widget',
    screen: 'screens',
    setup: async (p) => {
      await ws(p, 'Screens');
      await p.getByRole('tab', { name: 'Screens', exact: true }).click();
      await signals(p, { widgetPath: '0' });
    },
  },
  {
    // Step 11 (P24 part 3): the Media library with a GIF, a video and a big picture, the GIF credited
    id: 'media-library',
    screen: 'shell',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { mediaLibrary: true });
      const lib = p.getByRole('dialog', { name: 'Media library' });
      const fix = resolve(process.cwd(), 'tests/fixtures/media');
      // the wide picture comes in as it is, so the picture shows it marked big (then the choice goes back on)
      await lib.locator('[data-tour="media-shrink-in"]').uncheck();
      await lib
        .getByLabel('Files to import')
        .setInputFiles(['spin.gif', 'clip.webm', 'wide.png'].map((f) => resolve(fix, f)));
      await lib.getByRole('option', { name: /spin\.gif/ }).waitFor({ timeout: 20_000 });
      await lib.getByRole('option', { name: /wide\.png/ }).waitFor({ timeout: 20_000 });
      await lib.locator('[data-tour="media-shrink-in"]').check();
      await lib.getByRole('option', { name: /spin\.gif/ }).click();
      await lib.locator('[data-tour="media-author"]').fill('Ana');
      await lib.locator('[data-tour="media-license"]').fill('CC BY 4.0');
      await lib.locator('[data-tour="media-name"]').click();
      await p.waitForTimeout(600);
    },
  },
  {
    // Step 11 (P24 part 3): a Video widget with its clip and a Credits widget on a new screen
    id: 'screens-video',
    screen: 'screens',
    setup: async (p) => {
      await signals(p, { mediaLibrary: false });
      await ws(p, 'Screens');
      await p.getByRole('tab', { name: 'Screens', exact: true }).click();
      await p.getByRole('button', { name: '+ New' }).click();
      const palette = p.getByRole('group', { name: 'Add widget' });
      await palette.getByRole('button', { name: 'Add Credits' }).click();
      await palette.getByRole('button', { name: 'Add Video' }).click();
      await p.getByLabel('Video file').setInputFiles(resolve(process.cwd(), 'tests/fixtures/media/clip.webm'));
      await p.locator('.sc-device video.bw-video-el').first().waitFor({ timeout: 20_000 });
      await p.waitForTimeout(1200);
    },
  },
  {
    // the Credits widget selected (its lines)
    id: 'screens-credits',
    screen: 'screens',
    setup: async (p) => {
      await p
        .getByRole('treeitem', { name: /credits1/ })
        .first()
        .click()
        .catch(async () => {
          await p.locator('.sc-device [data-widget="credits1"]').first().click();
        });
      await p.waitForTimeout(400);
    },
  },
  {
    id: 'art',
    screen: 'art',
    setup: async (p) => {
      await ws(p, 'Screens');
      await p.getByRole('tab', { name: 'Art', exact: true }).click();
    },
  },
  ...(
    [
      ['art-pattern', 'Generate a background'],
      ['art-pixels', 'Draw an icon'],
      ['art-font', 'Design a font'],
    ] as const
  ).map(([id, card]) => ({
    id,
    screen: 'art',
    setup: async (p: Page) => {
      await ws(p, 'Screens');
      await p.getByRole('tab', { name: 'Art', exact: true }).click();
      const back = p.getByRole('button', { name: '← All art' });
      if (await back.isVisible()) await back.click();
      await p.getByRole('region', { name: 'Make art' }).getByRole('button', { name: card }).click();
    },
  })),
  { id: 'cinematics', screen: 'cinematics', setup: (p) => ws(p, 'Cinematics') },
  {
    id: 'cinematics-open',
    screen: 'cinematics',
    setup: async (p) => {
      await ws(p, 'Cinematics');
      const ex = p.getByRole('button', { name: 'New reward scene (example)' });
      if (await ex.isVisible()) await ex.click();
    },
  },
  // P23 part 1: effects
  { id: 'effects', screen: 'effects', setup: (p) => ws(p, 'Effects') },
  {
    id: 'effects-screen',
    screen: 'effects',
    setup: async (p) => {
      await ws(p, 'Effects');
      await p.getByRole('tab', { name: 'Screen', exact: true }).click();
    },
  },
  {
    id: 'effects-own',
    screen: 'effects',
    setup: async (p) => {
      await ws(p, 'Effects');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const id = 'fx_helpfire01';
        if (!e.store.has(`effects/${id}.json`))
          e.exec({
            type: 'effect.put',
            payload: {
              effect: {
                id,
                name: 'Blue fire',
                shape: 'stud',
                mode: 'stream',
                count: 1,
                rate: 40,
                duration: 0,
                spawn: 'sphere',
                radius: 0.35,
                direction: 'up',
                spread: 18,
                speed: [1.2, 2.6],
                life: [0.45, 0.9],
                size: [0.45, 0.08],
                colors: ['#fff2a8', '#3a7bff', '#1f3fbf', '#5a1d0c'],
                gravity: -1.5,
                drag: 0,
                bounce: 0,
              },
            },
          });
        e.effectId.value = id;
      });
    },
  },
  {
    id: 'scene-effect',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const id = 'ins_helpfire01';
        e.exec({
          type: 'item.add',
          payload: {
            map,
            item: {
              id,
              kind: 'effect',
              name: 'Campfire',
              effect: 'fx_fire000001',
              pos: [3, 1, 3],
              scale: 1,
              interval: [2, 4],
              maxDistance: 40,
              playing: true,
            },
          },
        });
        e.selectedItem.value = id;
        e.right.value = 'inspect';
      });
    },
  },
  {
    // P27 part 2: the Map tab scrolled to Fog, with a mist, ground fog and tinted shadows
    id: 'scene-atmosphere',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        e.exec({
          type: 'map.setEnvironment',
          payload: {
            map: e.mapId.value,
            fog: { near: 10, far: 60, thickness: 0.85, color: '#c8d2dc', height: 2.5, groundThickness: 0.8 },
            ambient: { color: '#7a9cff', strength: 1 },
          },
        });
      });
      await signals(p, { right: 'map' });
      await p.locator('[data-tour="map-fog"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P27 part 3: the Map tab scrolled to Big worlds
    id: 'scene-bigworld',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await signals(p, { right: 'map' });
      await p.locator('[data-tour="map-big"]').scrollIntoViewIfNeeded();
    },
  },
  {
    // P27: a torch placed on a dark map, picked in the Scene
    id: 'scene-light',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const id = 'ins_helplight1';
        e.exec({ type: 'map.setEnvironment', payload: { map, darkness: 0.7, fog: null, ambient: null } });
        if (!(e.store.get(`maps/${map}/instances.json`) as { items: { id: string }[] }).items.some((i) => i.id === id))
          e.exec({
            type: 'item.add',
            payload: {
              map,
              item: {
                id,
                kind: 'light',
                name: 'Torch 1',
                pos: [3, 2.4, 3],
                on: true,
                light: { color: '#ff9a3c', brightness: 1.6, range: 11, flicker: 0.5, shadow: true },
              },
            },
          });
        e.selectedItem.value = id;
        e.right.value = 'inspect';
      });
    },
  },
  {
    // Milestone 2b: a pool beside the start, picked in the Scene
    id: 'scene-water',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const id = 'ins_helpwater1';
        if (!(e.store.get(`maps/${map}/instances.json`) as { items: { id: string }[] }).items.some((i) => i.id === id))
          e.exec({
            type: 'item.add',
            payload: {
              map,
              item: { id, kind: 'water', name: 'Pool 1', pos: [2, 0, 2], size: [8, 2, 8], body: 'pool' },
            },
          });
        e.selectedItem.value = id;
        e.right.value = 'inspect';
      });
    },
  },
  {
    // Milestone 2b, 10c part 5: a 3D model beside the start, picked in the Scene
    id: 'scene-model',
    screen: 'scene',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const map = e.mapId.value as string;
        const id = 'ins_helpmodel1';
        if (!(e.store.get(`maps/${map}/instances.json`) as { items: { id: string }[] }).items.some((i) => i.id === id))
          e.exec({
            type: 'item.add',
            payload: {
              map,
              item: { id, kind: 'model', name: 'Round tree 1', model: 'builtin:round-tree', pos: [4, 0.4, 4], size: 2 },
            },
          });
        e.selectedItem.value = id;
        e.right.value = 'inspect';
      });
    },
  },
  { id: 'audio', screen: 'audio', setup: (p) => ws(p, 'Audio') },
  {
    id: 'audio-music',
    screen: 'audio',
    setup: async (p) => {
      await ws(p, 'Audio');
      await p.getByRole('button', { name: /^♪ explore/ }).click();
    },
  },
  {
    id: 'audio-mixer',
    screen: 'audio',
    setup: async (p) => {
      await ws(p, 'Audio');
      await p.getByRole('button', { name: 'Mixer & ducking' }).click();
    },
  },
  {
    id: 'audio-media',
    screen: 'audio',
    setup: async (p) => {
      await ws(p, 'Audio');
      await p.getByRole('button', { name: 'Imported media' }).click();
    },
  },
  {
    id: 'play',
    screen: 'play',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.keyboard.press('F5');
      await p.getByLabel('Game view').waitFor({ timeout: 60_000 });
      await p.waitForTimeout(1500);
    },
  },
  // P18: the New project dialog asks what you are making
  {
    id: 'new-project',
    screen: 'shell',
    setup: async (p) => {
      await p.keyboard.press('Escape');
      if (await p.getByLabel('Game view').isVisible()) await p.keyboard.press('F5');
      await ws(p, 'Scene');
      await p.getByRole('navigation', { name: 'Menu' }).getByRole('button', { name: 'File', exact: true }).click();
      await p.getByRole('menuitem', { name: /^New project/ }).click();
      await p.getByRole('radiogroup', { name: 'What are you making?' }).waitFor();
    },
  },
  // P19: Brix with an answer, then Show me pointing at the Project tab's Saving section
  {
    id: 'brix',
    screen: 'shell',
    setup: async (p) => {
      await ws(p, 'Scene');
      await p.getByRole('button', { name: 'Ask Brix' }).click();
      const box = p.getByRole('complementary', { name: 'Brix' }).getByRole('textbox', { name: 'Ask Brix' });
      await box.fill('how do I add a checkpoint?');
      await box.press('Enter');
      await p.locator('.brix-answer').first().waitFor();
    },
  },
  {
    id: 'brix-show',
    screen: 'shell',
    setup: async (p) => {
      await p.locator('.brix-answer .brix-acts button.on').first().click();
      await p
        .getByRole('dialog', { name: 'Brix shows you' })
        .getByRole('button', { name: 'Done' })
        .waitFor({ timeout: 30_000 });
    },
  },
  // P18: a genre view (last: it changes which tabs show), with More open and a hidden feature in use
  {
    id: 'genre-explore',
    screen: 'shell',
    setup: async (p) => {
      await p.keyboard.press('Escape');
      const cancel = p.getByRole('dialog', { name: 'New project' }).getByRole('button', { name: 'Cancel' });
      if (await cancel.isVisible()) await cancel.click();
      if (await p.getByLabel('Game view').isVisible()) await p.keyboard.press('F5');
      await p.getByLabel('Genre', { exact: true }).selectOption('explore');
      await p.evaluate(() => {
        const e = (window as unknown as { __editor: Ed }).__editor;
        const g = e.store.list('logic/lg_')[0];
        if (!g) return;
        const graph = e.store.get(g) as { id: string; nodes: { type: string }[] };
        if (!graph.nodes.some((n) => n.type === 'misc.log'))
          e.exec({ type: 'logic.addNode', payload: { graph: graph.id, node: { type: 'misc.log', pos: [40, 400] } } });
      });
      await ws(p, 'Logic');
      await p.getByRole('navigation', { name: 'Workspaces' }).getByRole('button', { name: 'More ▾' }).click();
    },
  },
];
