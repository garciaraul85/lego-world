import { builtinAsset } from '../../builtin/assets';
import type { Brick } from '../../core/bricks/codec';
import { rotateQuarter } from '../../core/bricks/transform';
import { checkPlayable } from '../../core/checks/playable';
import { trainingYard } from '../../core/gamegen/training-yard';
import { changedBuiltins, newAssetDef } from '../assets';
import type { EditorState, ToolId } from '../state';
import type { ViewOp } from '../viewport/active';

export type ActionCtx = { ed: EditorState; ui: EditorUi };

/** Things only the app shell can do (files, dialogs, play overlay, viewport camera). */
export interface EditorUi {
  newProject(): void;
  openProjectDialog(): void;
  importFile(): void;
  exportProject(): void;
  exportLegacySave(): void;
  /** engine: new runtime (P2); v68: LEGO World v68 runtime; edit: v68 studio */
  play(
    mode: 'engine' | 'v68' | 'edit',
    opts?: {
      fromSelectedSpawn?: boolean;
      fromEntry?: boolean;
      cinematic?: string;
      map?: string;
      /** P28: start the hero at this point of the open map (test from any spot) */
      at?: [number, number, number];
    },
  ): void;
  stopPlay(): void;
  /** open the Asset studio on an asset (P3.4) */
  editAsset(id: string | null): void;
  frameSelection(): void;
  fit(): void;
  topView(): void;
  /** zoom and orbit the 3D view in steps (P31 view controls) */
  view(op: ViewOp): void;
  /** full-screen scene on/off (P31) */
  fullscreen(on?: boolean): void;
  workspace(id: string): void;
  showShortcuts(): void;
  about(): void;
  /** P7: the Start hub, the guided tutorial and the help guide */
  startHub(): void;
  /** editor, coding, or a screen course: course.<screen> (P32) */
  tutorial(track?: string): void;
  help(page?: string): void;
  /** opens the AI builder panel (P8.3); P19: with a request typed in (from Brix), for you to send */
  aiBuilder(prompt?: string): void;
  /** P19: opens Brix, the helper (answers from Help, Show me, Explain) */
  brix?(): void;
}

export type EditorAction = {
  id: string;
  label: string;
  /** shortcut as shown, e.g. "Ctrl Z"; matched by matchKey() */
  key?: string;
  /** greyed out when this returns false */
  when?: (c: ActionCtx) => boolean;
  run: (c: ActionCtx) => void;
  /** which future phase delivers it (shown instead of running) */
  later?: string;
};

const hasSel = ({ ed }: ActionCtx) => ed.selection.value.size > 0;

function selectedIds(ed: EditorState) {
  return [...ed.selection.value];
}

function duplicate(ed: EditorState) {
  const sel = ed.selectedBricks.value;
  if (!sel.length) return;
  // Stack the copy on top of the selection's highest point so it stays stud-connected.
  const top = Math.max(...sel.map((b) => b.y + (b.type.startsWith('brick') ? 3 : 1)));
  const base = Math.min(...sel.map((b) => b.y));
  const dy = top - base;
  const r = ed.exec(
    {
      type: 'bricks.place',
      payload: {
        map: ed.mapId.value,
        bricks: sel.map((b: Brick) => ({ type: b.type, x: b.x, y: b.y + dy, z: b.z, rot: b.rot, color: b.color })),
      },
    },
    { label: `Duplicate ${sel.length === 1 ? 'brick' : `${sel.length} bricks`}` },
  );
  if (r.ok) {
    const s = ed.scene.value!;
    const fresh = [...s.byId.keys()].sort((a, b) => b - a).slice(0, sel.length);
    ed.select(fresh);
  }
}

function nudge(ed: EditorState, dx: number, dy: number, dz: number) {
  const ids = selectedIds(ed);
  if (!ids.length) return;
  ed.exec(
    { type: 'bricks.move', payload: { map: ed.mapId.value, ids, dx, dy, dz } },
    { label: ids.length === 1 ? 'Move brick' : `Move ${ids.length} bricks` },
  );
}

const tool =
  (id: ToolId) =>
  ({ ed }: ActionCtx) => {
    ed.tool.value = id;
    ed.persistUi();
  };

/** P28: runs the playability check, keeps its findings for the Problems tab, and opens it */
export function runPlayCheck(ed: EditorState) {
  const issues = checkPlayable(ed.store);
  ed.playCheck.value = { at: Date.now(), issues };
  ed.dock.value = 'problems';
  const warn = issues.filter((i) => i.level !== 'info').length;
  ed.log(
    warn ? 'WARN' : 'INFO',
    warn
      ? `Can this game be finished? ${warn} thing(s) to look at (see Problems).`
      : 'Can this game be finished? Nothing blocks it.',
  );
}

export const ACTIONS: EditorAction[] = [
  // File
  { id: 'file.hub', label: 'Start hub (make a game in one click)…', key: 'Ctrl Alt H', run: ({ ui }) => ui.startHub() },
  { id: 'file.new', label: 'New project', key: 'Ctrl Alt N', run: ({ ui }) => ui.newProject() },
  { id: 'file.open', label: 'Open project…', key: 'Ctrl O', run: ({ ui }) => ui.openProjectDialog() },
  { id: 'file.save', label: 'Save now', key: 'Ctrl S', run: ({ ed }) => void ed.autosave.flush() },
  { id: 'file.import', label: 'Import project or LEGO World save…', run: ({ ui }) => ui.importFile() },
  {
    id: 'file.exportProject',
    label: 'Save project file (.bwproj)',
    key: 'Ctrl Shift S',
    run: ({ ui }) => ui.exportProject(),
  },
  { id: 'file.exportLegacy', label: 'Export LEGO World save (.json)', run: ({ ui }) => ui.exportLegacySave() },
  { id: 'file.exportGame', label: 'Export playable game…', run: () => {}, later: 'Phase 8' },
  // Edit
  { id: 'edit.undo', label: 'Undo', key: 'Ctrl Z', when: ({ ed }) => ed.bus.canUndo(), run: ({ ed }) => ed.undo() },
  {
    id: 'edit.redo',
    label: 'Redo',
    key: 'Ctrl Shift Z',
    when: ({ ed }) => ed.bus.canRedo(),
    run: ({ ed }) => ed.redo(),
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    key: 'Delete',
    when: (c) => hasSel(c) || !!c.ed.selectedSpawn.value || !!c.ed.selectedItem.value || !!c.ed.selectedZone.value,
    run: ({ ed }) => {
      if (ed.selectedZone.value) {
        if (ed.exec({ type: 'map.removeZone', payload: { map: ed.mapId.value, zone: ed.selectedZone.value } }).ok)
          ed.selectedZone.value = null;
        return;
      }
      if (ed.selectedItem.value) {
        if (ed.exec({ type: 'item.remove', payload: { map: ed.mapId.value, id: ed.selectedItem.value } }).ok)
          ed.selectedItem.value = null;
        return;
      }
      if (ed.selectedSpawn.value) {
        if (ed.exec({ type: 'map.removeSpawn', payload: { map: ed.mapId.value, spawn: ed.selectedSpawn.value } }).ok)
          ed.selectedSpawn.value = null;
        return;
      }
      if (ed.exec({ type: 'bricks.remove', payload: { map: ed.mapId.value, ids: selectedIds(ed) } }).ok) ed.select([]);
    },
  },
  { id: 'edit.duplicate', label: 'Duplicate', key: 'Ctrl D', when: hasSel, run: ({ ed }) => duplicate(ed) },
  {
    id: 'edit.rotate',
    label: 'Rotate selection 90°',
    key: 'R',
    when: hasSel,
    run: ({ ed }) => {
      const turned = rotateQuarter(ed.selectedBricks.value);
      ed.exec(
        {
          type: 'bricks.update',
          payload: { map: ed.mapId.value, bricks: turned.map((t) => ({ id: t.id, x: t.x, z: t.z, rot: t.rot })) },
        },
        { label: 'Rotate 90°' },
      );
    },
  },
  { id: 'edit.selectNone', label: 'Deselect', key: 'Escape', run: ({ ed }) => ed.select([]) },
  {
    id: 'edit.selectGroup',
    label: 'Select whole object',
    key: 'G',
    when: hasSel,
    run: ({ ed }) => {
      const s = ed.scene.value!;
      const ids = new Set<number>();
      for (const b of ed.selectedBricks.value)
        for (const id of b.group ? (s.groups.get(b.group) ?? [b.id]) : [b.id]) ids.add(id);
      ed.select(ids);
    },
  },
  { id: 'edit.left', label: 'Move selection −X', key: 'ArrowLeft', when: hasSel, run: ({ ed }) => nudge(ed, -1, 0, 0) },
  {
    id: 'edit.right',
    label: 'Move selection +X',
    key: 'ArrowRight',
    when: hasSel,
    run: ({ ed }) => nudge(ed, 1, 0, 0),
  },
  {
    id: 'edit.forward',
    label: 'Move selection −Z',
    key: 'ArrowUp',
    when: hasSel,
    run: ({ ed }) => nudge(ed, 0, 0, -1),
  },
  { id: 'edit.back', label: 'Move selection +Z', key: 'ArrowDown', when: hasSel, run: ({ ed }) => nudge(ed, 0, 0, 1) },
  {
    id: 'edit.up',
    label: 'Raise selection one plate',
    key: 'PageUp',
    when: hasSel,
    run: ({ ed }) => nudge(ed, 0, 1, 0),
  },
  {
    id: 'edit.down',
    label: 'Lower selection one plate',
    key: 'PageDown',
    when: hasSel,
    run: ({ ed }) => nudge(ed, 0, -1, 0),
  },
  // Tools
  { id: 'tool.select', label: 'Select tool', key: 'V', run: tool('select') },
  { id: 'tool.move', label: 'Move tool', key: 'W', run: tool('move') },
  { id: 'tool.rotate', label: 'Rotate tool', key: 'E', run: tool('rotate') },
  { id: 'tool.resize', label: 'Resize tool', key: 'Q', run: tool('resize') },
  // P32: B places assets in the Scene and bricks on an asset's build plate (Assets screen)
  {
    id: 'tool.place',
    label: 'Place tool',
    key: 'B',
    run: (c) => tool(c.ed.buildsBricks ? 'place' : 'asset')(c),
  },
  { id: 'tool.asset', label: 'Place asset', key: 'A', run: tool('asset') },
  {
    id: 'tool.paint',
    label: 'Color paint (Assets screen)',
    key: 'C',
    run: (c) => {
      if (c.ed.buildsBricks) tool('paint')(c);
      else c.ed.notify('Colors are painted in the Assets screen: open an asset there and use Color paint (C).');
    },
  },
  { id: 'tool.erase', label: 'Erase', key: 'X', run: tool('erase') },
  { id: 'tool.spawn', label: 'Spawn point tool', key: 'P', run: tool('spawn') },
  { id: 'tool.zone', label: 'Trigger zone tool', key: 'Z', run: tool('zone') },
  { id: 'tool.sound', label: 'Sound emitter tool', key: 'S', run: tool('sound') },
  { id: 'tool.ui', label: 'Sign tool', key: 'U', run: tool('ui') },
  {
    id: 'brush.rotate',
    label: 'Turn the brush 90°',
    key: 'T',
    run: ({ ed }) => {
      if (ed.tool.value === 'asset') {
        ed.assetBrush.value = { ...ed.assetBrush.value, rot: (ed.assetBrush.value.rot + 1) % 4 };
        return;
      }
      ed.brush.value = { ...ed.brush.value, rot: (ed.brush.value.rot + 1) % 4 };
      ed.persistUi();
    },
  },
  // View
  { id: 'view.frame', label: 'Focus on selection', key: 'F', run: ({ ui }) => ui.frameSelection() },
  { id: 'view.zoomIn', label: 'Zoom in', key: '+', run: ({ ui }) => ui.view('zoomIn') },
  { id: 'view.zoomOut', label: 'Zoom out', key: '-', run: ({ ui }) => ui.view('zoomOut') },
  { id: 'view.orbitLeft', label: 'Turn the view left', key: 'Alt ArrowLeft', run: ({ ui }) => ui.view('orbitLeft') },
  {
    id: 'view.orbitRight',
    label: 'Turn the view right',
    key: 'Alt ArrowRight',
    run: ({ ui }) => ui.view('orbitRight'),
  },
  { id: 'view.orbitUp', label: 'Look more from above', key: 'Alt ArrowUp', run: ({ ui }) => ui.view('orbitUp') },
  {
    id: 'view.orbitDown',
    label: 'Look more from the side',
    key: 'Alt ArrowDown',
    run: ({ ui }) => ui.view('orbitDown'),
  },
  {
    id: 'view.fullscreen',
    label: 'Full-screen scene',
    key: 'Ctrl Shift F',
    run: ({ ui }) => ui.fullscreen(),
  },
  { id: 'view.fit', label: 'Fit whole map', key: 'Home', run: ({ ui }) => ui.fit() },
  { id: 'view.top', label: 'Top view', key: 'Numpad7', run: ({ ui }) => ui.topView() },
  { id: 'view.palette', label: 'Command palette', key: 'Ctrl K', run: ({ ed }) => (ed.palette.value = true) },
  // World
  {
    id: 'world.addMap',
    label: 'Add map',
    run: ({ ed }) => {
      const n = ed.maps.value.length + 1;
      const r = ed.exec({
        type: 'map.create',
        payload: {
          name: `Map ${n}`,
          generate: { environments: ['prairie'], size: 16, seed: Math.floor(Math.random() * 99_999_999) },
        },
      });
      if (r.ok) ed.openMap(ed.maps.value.at(-1)!.id);
    },
  },
  {
    // P9c: a sample map to practise combat, lock-on and wiring
    id: 'world.trainingYard',
    label: 'Add the Training yard',
    run: ({ ed }) => {
      const y = trainingYard();
      const r = ed.exec(y.commands, { label: 'Add the Training yard' });
      if (r.ok) {
        ed.openMap(y.map);
        ed.notify(
          'The Training yard: dummies, a hill, a cracked wall, a target that opens a gate and a sparring knight. Play › Play this map tries it.',
        );
      }
    },
  },
  { id: 'world.generate', label: 'Generate terrain…', run: ({ ed }) => (ed.right.value = 'map') },
  { id: 'world.graph', label: 'World graph', run: ({ ui }) => ui.workspace('World graph') },
  {
    id: 'world.validate',
    label: 'Validate routes',
    run: ({ ed }) => {
      ed.dock.value = 'problems';
      ed.log('INFO', 'Checked routes between maps (see Problems).');
    },
  },
  {
    // P28: walk the game the way a player would meet it, without playing it
    id: 'world.checkPlayable',
    label: 'Can this game be finished? (check)',
    run: ({ ed }) => runPlayCheck(ed),
  },
  { id: 'world.connected', label: 'Generate connected worlds…', run: ({ ui }) => ui.play('edit') },
  // Play
  { id: 'play.start', label: 'Play from the start spawn', key: 'F5', run: ({ ui }) => ui.play('engine') },
  {
    // P9c: the open map from its first spawn (the Training yard, a map being tested on its own)
    id: 'play.map',
    label: 'Play this map',
    run: ({ ed, ui }) => ui.play('engine', { map: ed.mapId.value }),
  },
  {
    id: 'play.here',
    label: 'Play from the selected spawn',
    key: 'Shift F5',
    when: ({ ed }) => !!ed.selectedSpawn.value,
    run: ({ ui }) => ui.play('engine', { fromSelectedSpawn: true }),
  },
  {
    id: 'play.entry',
    label: 'Play from the first screen (splash, title)',
    key: 'Ctrl F5',
    run: ({ ui }) => ui.play('engine', { fromEntry: true }),
  },
  {
    id: 'play.pause',
    label: 'Pause / resume',
    when: ({ ed }) => !!ed.session.value,
    run: ({ ed }) => (ed.paused.value = !ed.paused.value),
  },
  { id: 'play.stop', label: 'Stop', when: ({ ed }) => !!ed.session.value, run: ({ ui }) => ui.stopPlay() },
  {
    // P26: what pressing E at a save point does, from the menu (to test saving quickly)
    id: 'play.saveNow',
    label: 'Save the game now (test)',
    when: ({ ed }) => !!ed.session.value,
    run: ({ ed }) => {
      const s = ed.session.value;
      if (s) s.saveGame(s.slot);
    },
  },
  {
    // P26 part 2: the player's Settings screen (volume, camera, text size, difficulty)
    id: 'play.settingsMenu',
    label: 'Player settings (while playing)',
    when: ({ ed }) => !!ed.session.value,
    run: ({ ed }) => ed.session.value?.gameOp('settingsMenu'),
  },
  {
    id: 'play.v68',
    label: 'Play in LEGO World v68 (guns, magic, powers, volcano)',
    key: 'F6',
    run: ({ ui }) => ui.play('v68'),
  },
  {
    id: 'play.legacy',
    label: 'Open in LEGO World v68 (characters, neighbors)',
    key: 'Shift F6',
    run: ({ ui }) => ui.play('edit'),
  },
  // Window
  ...['Scene', 'World graph', 'Logic', 'Characters', 'Assets', 'Screens', 'Cinematics', 'Audio', 'Effects'].map(
    (name, i) => ({
      id: `window.${i + 1}`,
      label: name,
      key: String(i + 1),
      run: ({ ui }: ActionCtx) => ui.workspace(name),
    }),
  ),
  // Help
  { id: 'help.shortcuts', label: 'Keyboard shortcuts', key: '?', run: ({ ui }) => ui.showShortcuts() },
  { id: 'help.about', label: 'About Brick Worlds Engine', run: ({ ui }) => ui.about() },
  { id: 'help.tutorial', label: 'Guided tutorial (every feature, step by step)', run: ({ ui }) => ui.tutorial() },
  {
    id: 'help.coding',
    label: 'Coding course (the logic language, line by line)',
    run: ({ ui }) => ui.tutorial('coding'),
  },
  {
    id: 'help.combat',
    label: 'Combat course (Training yard, enemies, wires)',
    run: ({ ui }) => ui.tutorial('combat'),
  },
  {
    id: 'help.saving',
    label: 'Saving course (checkpoints, save points, achievements, settings)',
    run: ({ ui }) => ui.tutorial('saving'),
  },
  { id: 'help.guide', label: 'Help guide', key: 'F1', run: ({ ui }) => ui.help() },
  {
    id: 'help.brix',
    label: 'Ask Brix (how do I…? Show me where, Explain a control)',
    key: 'Shift F1',
    run: ({ ui }) => ui.brix?.(),
  },
  {
    id: 'help.sheet',
    label: 'Character sheet course (outfits, stats, moves, voice)',
    run: ({ ui }) => ui.tutorial('sheet'),
  },
  {
    id: 'help.bodies',
    label: 'Creatures course (body plans, skeletons)',
    run: ({ ui }) => ui.tutorial('bodies'),
  },
  {
    id: 'help.faces',
    label: 'Faces and pictures course (moods, from a picture)',
    run: ({ ui }) => ui.tutorial('faces'),
  },
  {
    id: 'help.effects',
    label: 'Effects course (fire, colours, game effects)',
    run: ({ ui }) => ui.tutorial('course.effects'),
  },
  {
    id: 'help.screenfx',
    label: 'Screen effects course (shake, flash, moods)',
    run: ({ ui }) => ui.tutorial('screenfx'),
  },
  {
    id: 'help.lights',
    label: 'Lights course (darkness, torches, shadows)',
    run: ({ ui }) => ui.tutorial('lights'),
  },
  {
    id: 'help.atmosphere',
    label: 'Atmosphere course (fog, shadows’ colour, day and night)',
    run: ({ ui }) => ui.tutorial('atmosphere'),
  },
  {
    id: 'help.posing',
    label: 'Posing and states course (clips pose by pose, walk, run, attack)',
    run: ({ ui }) => ui.tutorial('posing'),
  },
  {
    id: 'help.dialogue',
    label: 'Dialogue course (conversations, choices, styles)',
    run: ({ ui }) => ui.tutorial('dialogue'),
  },
  { id: 'help.brixCourse', label: 'Meet Brix course (ask, Show me, Explain)', run: ({ ui }) => ui.tutorial('brix') },
  // P32: Macs send F1 to the screen brightness unless fn is held; ⌘/ (Ctrl / elsewhere) works everywhere
  { id: 'help.here', label: 'Help on what the pointer is on', key: 'Ctrl /', run: ({ ui }) => ui.help() },
  { id: 'help.build', label: 'Watch a game being built…', run: ({ ui }) => ui.startHub() },
  {
    id: 'help.ai',
    label: 'AI builder (plan a change, watch it, approve it)',
    key: 'Ctrl I',
    run: ({ ui }) => ui.aiBuilder(),
  },
];

// P32: the Assets menu
ACTIONS.push(
  { id: 'assets.open', label: 'Open the Assets screen', run: ({ ui }) => ui.workspace('Assets') },
  {
    // P22 part 4
    id: 'characters.fromPicture',
    label: 'New character from a picture…',
    run: ({ ed, ui }) => {
      ui.workspace('Characters');
      ed.fromPicture.value = true;
    },
  },
  {
    id: 'assets.new',
    label: 'New asset',
    run: ({ ed, ui }) => {
      const asset = newAssetDef(ed);
      if (ed.exec({ type: 'asset.create', payload: { asset } }, { label: 'New asset' }).ok) {
        ed.studioAsset.value = asset.id;
        ui.workspace('Assets');
      }
    },
  },
  {
    id: 'assets.resetBuiltins',
    label: 'Reset changed built-in assets',
    run: ({ ed }) => {
      const changed = changedBuiltins(ed);
      if (!changed.length) {
        ed.notify('No built-in asset has been changed.');
        return;
      }
      const r = ed.exec(
        changed.map((a) => ({ type: 'asset.update', payload: { asset: builtinAsset(a.id)! } })),
        { label: 'Reset changed built-in assets' },
      );
      if (r.ok)
        ed.notify(
          `Reset ${changed.map((a) => a.name).join(', ')} as they came with the engine. Undo brings your versions back.`,
        );
    },
  },
);

export const action = (id: string) => ACTIONS.find((a) => a.id === id)!;

export const MENUS: Record<string, (string | '-')[]> = {
  File: [
    'file.hub',
    'file.new',
    'file.open',
    'file.save',
    '-',
    'file.import',
    'file.exportProject',
    'file.exportLegacy',
    'file.exportGame',
  ],
  Edit: [
    'edit.undo',
    'edit.redo',
    '-',
    'edit.duplicate',
    'edit.delete',
    'edit.rotate',
    'edit.selectGroup',
    'edit.selectNone',
    '-',
    'view.palette',
  ],
  Assets: ['assets.open', 'assets.new', 'characters.fromPicture', '-', 'assets.resetBuiltins'],
  World: [
    'world.addMap',
    'world.trainingYard',
    'world.generate',
    'world.graph',
    'world.validate',
    'world.checkPlayable',
    '-',
    'play.legacy',
  ],
  Play: [
    'play.start',
    'play.map',
    'play.here',
    'play.entry',
    'play.pause',
    'play.stop',
    'play.saveNow',
    'play.settingsMenu',
    '-',
    'play.v68',
    'play.legacy',
  ],
  Window: [
    'window.1',
    'window.2',
    'window.3',
    'window.4',
    'window.5',
    'window.6',
    'window.7',
    'window.8',
    '-',
    'view.frame',
    'view.zoomIn',
    'view.zoomOut',
    'view.fit',
    'view.top',
    'view.fullscreen',
  ],
  Help: [
    'help.guide',
    'help.brix',
    'help.tutorial',
    'help.coding',
    'help.combat',
    'help.saving',
    'help.dialogue',
    'help.sheet',
    'help.bodies',
    'help.faces',
    'help.effects',
    'help.screenfx',
    'help.posing',
    'help.lights',
    'help.atmosphere',
    'help.brixCourse',
    'help.build',
    'help.shortcuts',
    'help.ai',
    '-',
    'help.about',
  ],
};

/** Normalizes a keyboard event to the `key` notation used above. */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  let k = e.key;
  // ⌥ Option (Alt) on a Mac types a special character (⌥P is π): use the key's place instead
  if (e.altKey && /^Key[A-Z]$/.test(e.code ?? '')) k = e.code.slice(3);
  if (e.altKey && /^Digit\d$/.test(e.code ?? '')) k = e.code.slice(5);
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && k.length > 1) parts.push('Shift');
  if (e.shiftKey && /^[a-z]$/i.test(k)) parts.push('Shift');
  // zoom keys work with or without Shift, and on the number pad
  if (k === '=' || k === 'Add') k = '+';
  if (k === '_' || k === 'Subtract') k = '-';
  if (e.code?.startsWith('Numpad') && /\d/.test(e.key)) k = e.code;
  if (k.length === 1 && k !== '?') k = k.toUpperCase();
  if (k === 'Backspace') k = 'Delete';
  parts.push(k);
  return parts.join(' ');
}

export function runAction(a: EditorAction, c: ActionCtx) {
  if (a.later) {
    c.ed.notify(`${a.label} arrives in ${a.later} of the build plan.`);
    return;
  }
  if (a.when && !a.when(c)) return;
  a.run(c);
}
