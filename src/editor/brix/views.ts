import SHOTS from '../../../docs/help/shots/index.json';
import type { ActionCtx } from '../actions/registry';
import { helpEntry, SCREENS } from '../help/entries';
import { findControl } from '../help/show';

/**
 * P19 Brix “Show me”: the path from wherever the editor is now to the control a Help entry describes, as
 * steps the person can watch. Each step points at a real control of the editor (a workspace button, a panel
 * tab, a menu) and then presses it, the way the person would; the last step points at the control itself.
 * The steps only move around the editor: they open workspaces, tabs, menus and selections and never
 * change the project (no command runs). Which view an entry's control lives in comes from the Help
 * screenshots index (the state each control was found in when the pictures were taken).
 */
export type ShowStep = {
  /** what Brix says while pointing */
  say: string;
  /** the control to point at (looked up again until it shows) */
  find: () => HTMLElement | null;
  /** press it once pointed at (a step that only points leaves this out) */
  press?: boolean;
  /** a step with nothing to point at runs this instead (selecting something, a view the UI has no tab for) */
  run?: (c: ActionCtx) => void;
  /** already there: the step is skipped */
  done?: (c: ActionCtx) => boolean;
  /** the Help entry the last step shows */
  entry?: string;
};

type ShotIndex = { entries: Record<string, { s: string }> };
const INDEX = SHOTS as unknown as ShotIndex;

/** The view (help-shot state) an entry's control was found in, if pictures were taken of it. */
export const viewOf = (entryId: string): string | null => INDEX.entries[entryId]?.s ?? null;

const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 1 && r.height > 1;
};

/** A button-like control in a container whose label starts with `name` (any case) or matches it. */
export function control(
  container: string,
  name: string | RegExp,
  roles = 'button,[role="tab"],[role="menuitem"],[role="option"]',
) {
  return (): HTMLElement | null => {
    for (const box of document.querySelectorAll(container)) {
      for (const el of box.querySelectorAll<HTMLElement>(roles)) {
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        const ok = typeof name === 'string' ? label.toLowerCase().startsWith(name.toLowerCase()) : name.test(label);
        if (ok && visible(el)) return el;
      }
    }
    return null;
  };
}

const ws = (name: string): ShowStep => ({
  say: `Open the ${name} workspace.`,
  find: () => {
    const nav = document.querySelector('nav[aria-label="Workspaces"]');
    for (const b of nav?.querySelectorAll<HTMLElement>('button') ?? [])
      if ((b.textContent ?? '').trim() === name && visible(b)) return b;
    return null;
  },
  press: true,
  // a genre view can tuck the workspace under More ▾: then Brix opens it directly
  run: (c) => c.ui.workspace(name),
  done: (c) => c.ed.workspace.value === name,
});

const tab = (panel: string, label: string, done: (c: ActionCtx) => boolean): ShowStep => ({
  say: `Open the ${label} tab.`,
  find: control(`[aria-label="${panel}"] .ptabs`, label),
  press: true,
  done,
});

const select = (say: string, pick: (c: ActionCtx) => boolean): ShowStep => ({
  say,
  find: () => null,
  run: (c) => {
    if (!pick(c)) c.ed.notify(`${say.replace(/\.$/, '')}: there isn't one on this map yet.`);
  },
});

type MapDoc = { zones?: { id: string }[]; spawns?: { id: string }[]; items?: { id: string }[] };
const mapDoc = (c: ActionCtx) => c.ed.store.get<MapDoc>(`maps/${c.ed.mapId.value}/map.json`);
type SceneLike = {
  instances: { bricks: { id: number }[] }[];
  all(): { id: number; y: number }[];
  ownerOf(id: number): unknown;
};
const scene = (c: ActionCtx) => c.ed.scene.value as unknown as SceneLike | null;

const DOCK: Record<string, string> = {
  console: 'Console',
  timeline: 'Timeline',
  profiler: 'Profiler',
  problems: 'Problems',
  debug: 'Debug',
  audio: 'Audio',
};
const CATS: Record<string, string> = {
  assets: 'Assets',
  characters: 'Characters',
  cinematics: 'Cinematics',
  'ui-screens': 'UI screens',
  sounds: 'Sounds',
  music: 'Music',
};
const MENUS: Record<string, string> = {
  file: 'File',
  edit: 'Edit',
  assets: 'Assets',
  world: 'World',
  play: 'Play',
  window: 'Window',
  help: 'Help',
};
const ART: Record<string, string> = {
  'art-pattern': 'Generate a background',
  'art-pixels': 'Draw an icon',
  'art-font': 'Make a font',
};

/** The steps that open a view (one of the Help screenshot states), from anywhere in the editor. */
export function stepsToView(view: string): ShowStep[] {
  const right = (id: 'inspect' | 'map' | 'project', label: string) =>
    tab('Inspector', label, (c) => c.ed.right.value === id);
  const left = (id: 'hier' | 'layers' | 'search', label: string) =>
    tab('Outliner', label, (c) => c.ed.left.value === id);
  if (view.startsWith('scene-dock-')) {
    const d = view.slice(11);
    return [ws('Scene'), tab('Bottom dock', DOCK[d] ?? d, (c) => c.ed.dock.value === d)];
  }
  if (view.startsWith('scene-cat-')) {
    const cat = CATS[view.slice(10)] ?? 'Assets';
    return [
      ws('Scene'),
      tab('Bottom dock', 'Assets', (c) => c.ed.dock.value === 'assets'),
      {
        say: `Show the ${cat} category.`,
        find: () => null,
        run: (c) => {
          c.ed.assetCat.value = cat;
        },
        done: (c) => c.ed.assetCat.value === cat,
      },
    ];
  }
  if (view.startsWith('menu-')) {
    const m = MENUS[view.slice(5)] ?? 'File';
    return [
      ws('Scene'),
      { say: `Open the ${m} menu.`, find: control('nav[aria-label="Menu"]', new RegExp(`^${m}$`)), press: true },
    ];
  }
  if (view in ART)
    return [
      ws('Screens'),
      artTab(),
      { say: `Open “${ART[view]}”.`, find: control('[aria-label="Make art"]', ART[view]!), press: true },
    ];
  switch (view) {
    case 'scene':
    case 'scene-find':
    case 'genre-explore':
      return [ws('Scene')];
    case 'scene-asset':
    case 'scene-script':
      return [
        ws('Scene'),
        select('Select a placed object.', (c) => {
          const s = scene(c);
          const first = s?.instances[0];
          if (!first) return false;
          c.ed.select(first.bricks.map((b) => b.id));
          return true;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'scene-loose':
      return [
        ws('Scene'),
        select('Select a loose brick.', (c) => {
          const s = scene(c);
          const b = s?.all().find((x) => !s.ownerOf(x.id) && x.y > 0) ?? s?.all().find((x) => !s.ownerOf(x.id));
          if (!b) return false;
          c.ed.select([b.id]);
          return true;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'scene-zone':
      return [
        ws('Scene'),
        select('Select a zone.', (c) => {
          const z = mapDoc(c)?.zones?.[0];
          if (z) c.ed.selectedZone.value = z.id;
          return !!z;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'scene-spawn':
      return [
        ws('Scene'),
        select('Select a spawn point.', (c) => {
          const sp = mapDoc(c)?.spawns?.[0];
          if (sp) c.ed.selectedSpawn.value = sp.id;
          return !!sp;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'scene-item':
      return [
        ws('Scene'),
        select('Select a sign or other world item.', (c) => {
          const it = mapDoc(c)?.items?.[0];
          if (it) c.ed.selectedItem.value = it.id;
          return !!it;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'scene-map':
      return [ws('Scene'), right('map', 'Map')];
    case 'scene-project':
    case 'scene-saving':
    case 'scene-progress':
    case 'scene-dialogue':
      return [ws('Scene'), right('project', 'Project')];
    case 'scene-layers':
      return [ws('Scene'), left('layers', 'Layers')];
    case 'scene-views':
      return [
        ws('Scene'),
        tab('Bottom dock', 'Assets', (c) => c.ed.dock.value === 'assets'),
        {
          say: 'Show the navigation view.',
          find: () => null,
          run: (c) => {
            c.ed.view.value = 'nav';
          },
          done: (c) => c.ed.view.value === 'nav',
        },
      ];
    case 'palette':
      return [
        {
          say: 'Open the command palette (Ctrl K).',
          find: () => null,
          run: (c) => {
            c.ed.palette.value = true;
          },
          done: (c) => c.ed.palette.value,
        },
      ];
    case 'shortcuts':
      return [{ say: 'Open Keyboard shortcuts.', find: control('body', 'Keyboard shortcuts', 'button'), press: true }];
    case 'world':
      return [ws('World graph')];
    case 'logic':
    case 'logic-code':
      return [
        ws('Logic'),
        {
          say: 'Open a logic file.',
          find: () => null,
          run: (c) => {
            const g = c.ed.store.list('logic/')[0];
            const doc = g ? c.ed.store.get<{ id: string }>(g) : null;
            if (doc) c.ed.logicGraph.value = doc.id;
          },
          done: (c) => !!c.ed.logicGraph.value || !c.ed.store.list('logic/').length,
        },
        ...(view === 'logic-code'
          ? [
              {
                say: 'Show the graph and the code side by side.',
                find: () => null,
                run: (c: ActionCtx) => {
                  c.ed.logicView.value = 'split';
                },
                done: (c: ActionCtx) => c.ed.logicView.value !== 'graph',
              },
            ]
          : []),
      ];
    case 'characters':
      return [ws('Characters')];
    case 'characters-outfits':
    case 'characters-stats':
    case 'characters-moves':
    case 'characters-animations':
    case 'characters-voice':
    case 'characters-behaviour': {
      const t = view.slice(11);
      const label = t.charAt(0).toUpperCase() + t.slice(1);
      return [
        ws('Characters'),
        {
          say: `Open the ${label} tab of the sheet.`,
          find: control('[aria-label="Character sheet"]', new RegExp(`^${label}$`)),
          press: true,
          done: (c) => c.ed.sheetTab.value === t,
        },
      ];
    }
    case 'characters-face':
      return [
        ws('Characters'),
        {
          say: 'Open the Face tab of the sheet.',
          find: control('[aria-label="Character sheet"]', /^Face$/),
          press: true,
          done: (c) => c.ed.sheetTab.value === 'face',
        },
      ];
    case 'characters-from-picture':
      return [
        ws('Characters'),
        {
          say: 'Press ✨ From a picture… under + New character.',
          find: control('[aria-label="Characters and clips"]', /From a picture/),
          press: true,
          done: (c) => c.ed.fromPicture.value,
        },
      ];
    case 'characters-body':
    case 'characters-skeleton':
      // P22 part 3: the Body tab (the skeleton editor is in it, below the shape and colours)
      return [
        ws('Characters'),
        {
          say: 'Open the Body tab of the sheet.',
          find: control('[aria-label="Character sheet"]', /^Body$/),
          press: true,
          done: (c) => c.ed.sheetTab.value === 'body',
        },
      ];
    case 'characters-talk':
      // the Dialogue tab of the sheet: who it talks with, its barks
      return [
        ws('Characters'),
        {
          say: 'Open the Dialogue tab of the sheet.',
          find: control('[aria-label="Character sheet"]', /^Dialogue$/),
          press: true,
          done: (c) => c.ed.sheetTab.value === 'dialogue',
        },
      ];
    case 'characters-dialogue':
      return [
        ws('Characters'),
        {
          say: 'Open the Dialogue tab.',
          find: control('[aria-label="Character view"]', 'Dialogue'),
          press: true,
          done: (c) => c.ed.charTab.value === 'dialogue',
        },
      ];
    case 'assets':
      return [ws('Assets')];
    case 'assets-open':
    case 'assets-checkpoint':
      return [
        ws('Assets'),
        {
          say: 'Open an asset from the list.',
          find: () => document.querySelector<HTMLElement>('[role="listbox"] [role="option"]'),
          press: true,
          done: (c) => !!c.ed.studioAsset.value,
        },
      ];
    case 'assets-bricks':
      return [
        ws('Assets'),
        { say: 'Open the Bricks tab.', find: control('[aria-label="Asset library"]', 'Bricks'), press: true },
      ];
    case 'screens':
      return [ws('Screens')];
    case 'screens-widget':
      return [
        ws('Screens'),
        { say: 'Open the Screens tab.', find: control('body', /^Screens$/, '[role="tab"]'), press: true },
        {
          say: 'Select a widget on the screen.',
          find: () => null,
          run: (c) => {
            c.ed.widgetPath.value = '0';
          },
          done: (c) => c.ed.widgetPath.value != null,
        },
      ];
    case 'art':
      return [ws('Screens'), artTab()];
    case 'cinematics':
    case 'cinematics-open':
      return [ws('Cinematics')];
    case 'audio':
      return [ws('Audio')];
    // P23 part 1: effects
    case 'effects':
      return [ws('Effects')];
    case 'effects-own':
      return [
        ws('Effects'),
        select('Open one of your own effects (under Mine).', (c) => {
          const own = c.ed.store.list('effects/')[0];
          if (own) c.ed.effectId.value = own.slice(8, -5);
          return !!own;
        }),
      ];
    // P23 part 2: screen effects
    case 'effects-screen':
      return [
        ws('Effects'),
        { say: 'Open the Screen tab.', find: control('body', /^Screen$/, '[role="tab"]'), press: true },
      ];
    case 'scene-effect':
      return [
        ws('Scene'),
        select('Select an effect on the map.', (c) => {
          const items =
            c.ed.store.get<{ items: { id: string; kind: string }[] }>(`maps/${c.ed.mapId.value}/instances.json`)
              ?.items ?? [];
          const it = items.find((x) => x.kind === 'effect');
          if (it) c.ed.selectedItem.value = it.id;
          return !!it;
        }),
        right('inspect', 'Inspector'),
      ];
    case 'audio-music':
      return [
        ws('Audio'),
        { say: 'Open a music track.', find: control('[aria-label="Sounds and music"]', /^♪/), press: true },
      ];
    case 'audio-mixer':
      return [
        ws('Audio'),
        { say: 'Open Mixer & ducking.', find: control('[aria-label="Sounds and music"]', 'Mixer'), press: true },
      ];
    case 'audio-media':
      return [
        ws('Audio'),
        {
          say: 'Open Imported media.',
          find: control('[aria-label="Sounds and music"]', 'Imported media'),
          press: true,
        },
      ];
    case 'play':
      return [
        ws('Scene'),
        {
          say: 'This shows while you play: press Play (F5) to see it.',
          find: control('[aria-label="Play controls"]', /^Play$/),
        },
      ];
    case 'new-project':
      return [
        ws('Scene'),
        { say: 'Open the File menu.', find: control('nav[aria-label="Menu"]', /^File$/), press: true },
        { say: 'Choose New project…', find: control('body', 'New project', '[role="menuitem"]') },
      ];
    default:
      return [];
  }
}

function artTab(): ShowStep {
  return { say: 'Open the Art tab.', find: control('body', /^Art$/, '[role="tab"]'), press: true };
}

/**
 * Every step from here to an entry's control: the view it lives in (from the Help pictures, else its
 * screen's workspace), then the control itself. Null when the entry has no control to show.
 */
export function showSteps(entryId: string): ShowStep[] | null {
  const e = helpEntry(entryId);
  if (!e?.match?.length) return null;
  const view = viewOf(entryId);
  let path = view ? stepsToView(view) : [];
  if (!path.length) {
    const w = SCREENS.find((s) => s.id === e.screen)?.workspace;
    path = w ? [ws(w)] : [];
  }
  // a view that ends on a point-only step (Play, New project) is as far as Brix can take you
  const last = path[path.length - 1];
  if (last && !last.press && !last.run) return [...path.slice(0, -1), { ...last, entry: entryId }];
  return [...path, { say: e.purpose, find: () => findControl(entryId, true), entry: entryId }];
}
