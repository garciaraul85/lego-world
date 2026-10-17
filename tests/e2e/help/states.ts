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
  store: { list(p: string): string[]; get(p: string): unknown };
  select: (ids: number[]) => void;
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
  ...(['console', 'timeline', 'profiler', 'problems', 'debug', 'audio'] as const).map((d) => ({
    id: `scene-dock-${d}`,
    screen: 'scene',
    setup: async (p: Page) => {
      await ws(p, 'Scene');
      await signals(p, { left: 'hier', dock: d });
    },
  })),
  ...['Assets', 'Characters', 'Cinematics', 'UI screens', 'Sounds', 'Music'].map((c) => ({
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
    // P32: the bricks to build with, in the Asset library's Bricks tab
    id: 'assets-bricks',
    screen: 'assets',
    setup: async (p) => {
      await ws(p, 'Assets');
      await p.getByRole('region', { name: 'Asset library' }).getByRole('tab', { name: 'Bricks' }).click();
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
];
