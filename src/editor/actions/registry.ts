import type { Brick } from '../../core/bricks/codec';
import { rotateQuarter } from '../../core/bricks/transform';
import type { EditorState, ToolId } from '../state';

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
    opts?: { fromSelectedSpawn?: boolean; fromEntry?: boolean; cinematic?: string },
  ): void;
  stopPlay(): void;
  /** open the Asset studio on an asset (P3.4) */
  editAsset(id: string | null): void;
  frameSelection(): void;
  fit(): void;
  topView(): void;
  workspace(id: string): void;
  showShortcuts(): void;
  about(): void;
  /** P7: the Start hub, the guided tutorial and the help guide */
  startHub(): void;
  tutorial(): void;
  help(page?: string): void;
  /** opens the AI builder panel (P8.3) */
  aiBuilder(): void;
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
    when: (c) => hasSel(c) || !!c.ed.selectedSpawn.value || !!c.ed.selectedItem.value,
    run: ({ ed }) => {
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
  { id: 'tool.place', label: 'Brick paint (place bricks)', key: 'B', run: tool('place') },
  { id: 'tool.asset', label: 'Place asset', key: 'A', run: tool('asset') },
  { id: 'tool.paint', label: 'Color paint', key: 'C', run: tool('paint') },
  { id: 'tool.erase', label: 'Erase', key: 'X', run: tool('erase') },
  { id: 'tool.spawn', label: 'Spawn point tool', key: 'P', run: tool('spawn') },
  { id: 'tool.zone', label: 'Trigger zone tool', key: 'Z', run: tool('zone') },
  { id: 'tool.sound', label: 'Sound emitter tool', key: 'S', run: tool('sound') },
  { id: 'tool.ui', label: 'World UI tool', key: 'U', run: tool('ui') },
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
  { id: 'view.frame', label: 'Frame selection', key: 'F', run: ({ ui }) => ui.frameSelection() },
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
  { id: 'world.connected', label: 'Generate connected worlds…', run: ({ ui }) => ui.play('edit') },
  // Play
  { id: 'play.start', label: 'Play from the start spawn', key: 'F5', run: ({ ui }) => ui.play('engine') },
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
  ...['Scene', 'World graph', 'Logic', 'Characters', 'Assets', 'Screens', 'Cinematics', 'Audio'].map((name, i) => ({
    id: `window.${i + 1}`,
    label: name,
    key: String(i + 1),
    run: ({ ui }: ActionCtx) => ui.workspace(name),
  })),
  // Help
  { id: 'help.shortcuts', label: 'Keyboard shortcuts', key: '?', run: ({ ui }) => ui.showShortcuts() },
  { id: 'help.about', label: 'About Brick Worlds Engine', run: ({ ui }) => ui.about() },
  { id: 'help.tutorial', label: 'Guided tutorial (every feature, step by step)', run: ({ ui }) => ui.tutorial() },
  { id: 'help.guide', label: 'Help guide', key: 'F1', run: ({ ui }) => ui.help() },
  { id: 'help.build', label: 'Watch a game being built…', run: ({ ui }) => ui.startHub() },
  {
    id: 'help.ai',
    label: 'AI builder (plan a change, watch it, approve it)',
    key: 'Ctrl I',
    run: ({ ui }) => ui.aiBuilder(),
  },
];

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
  Assets: [],
  World: ['world.addMap', 'world.generate', 'world.graph', 'world.validate', '-', 'play.legacy'],
  Play: ['play.start', 'play.here', 'play.entry', 'play.pause', 'play.stop', '-', 'play.v68', 'play.legacy'],
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
    'view.fit',
    'view.frame',
    'view.top',
  ],
  Help: ['help.guide', 'help.tutorial', 'help.build', 'help.shortcuts', 'help.ai', '-', 'help.about'],
};

/** Normalizes a keyboard event to the `key` notation used above. */
export function keyOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && e.key.length > 1) parts.push('Shift');
  if (e.shiftKey && /^[a-z]$/i.test(e.key)) parts.push('Shift');
  let k = e.key;
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
