import { batch, computed, signal } from '@preact/signals';
import type { Brick } from '../core/bricks/codec';
import type { Command, CommandBus, ExecuteResult, Source } from '../core/commands';
import type { Problem } from '../core/migrate/problems';
import type { Autosave, SaveStatus } from '../core/project/autosave';
import type { FileBackend } from '../core/project/backend';
import type { ProjectStore } from '../core/project/store';
import { type Gates, type MapDoc, paths } from '../core/schema';
import type { FrameStats } from '../engine/render/renderer';
import { CATEGORIES, type CategoryId } from './categories';
import { SceneModel } from './scene';

export type ToolId = 'select' | 'move' | 'rotate' | 'place' | 'paint' | 'erase' | 'spawn' | 'zone' | 'sound' | 'ui';
export type LogLevel = 'INFO' | 'EDIT' | 'WARN' | 'ERROR' | 'LOGIC' | 'AUDIO';
export type LogLine = { t: string; level: LogLevel; msg: string };
export type ViewTab = 'scene' | 'game' | 'graph' | 'nav';
export type LeftTab = 'hier' | 'layers' | 'search';
export type RightTab = 'inspect' | 'map' | 'project';
export type DockTab = 'assets' | 'console' | 'timeline' | 'profiler' | 'problems';
export type Layer = { visible: boolean; locked: boolean };

const UI_KEY = 'brickworlds.editor.ui';
function loadUi(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type EditorDeps = {
  store: ProjectStore;
  bus: CommandBus;
  autosave: Autosave;
  backend: FileBackend;
  problems?: Problem[];
};

/** All editor UI state. Panels read signals; every project change goes through exec(). */
export class EditorState {
  readonly store: ProjectStore;
  readonly bus: CommandBus;
  readonly autosave: Autosave;
  readonly backend: FileBackend;

  readonly revision = signal(0);
  readonly mapId = signal<string>('');
  readonly scene = signal<SceneModel | null>(null);
  readonly selection = signal<ReadonlySet<number>>(new Set());
  readonly selectedSpawn = signal<string | null>(null);
  readonly tool = signal<ToolId>('select');
  readonly brush = signal<{ type: string; color: string; rot: number }>({ type: 'brick2x4', color: '#d20c20', rot: 0 });
  readonly view = signal<ViewTab>('scene');
  readonly left = signal<LeftTab>('hier');
  readonly right = signal<RightTab>('inspect');
  readonly dock = signal<DockTab>('assets');
  readonly assetCat = signal('Bricks');
  readonly layers = signal<Record<CategoryId, Layer>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.id, { visible: true, locked: false }])) as Record<CategoryId, Layer>,
  );
  readonly logs = signal<LogLine[]>([]);
  readonly problems = signal<Problem[]>([]);
  readonly save = signal<SaveStatus>({ state: 'saved', dirty: 0 });
  readonly stats = signal<FrameStats & { fps: number }>({
    drawCalls: 0,
    instances: 0,
    chunksDrawn: 0,
    chunks: 0,
    ms: 0,
    fps: 0,
  });
  readonly frameTimes = signal<number[]>([]);
  readonly cursor = signal<{ x: number; z: number; y: number } | null>(null);
  readonly menu = signal<string | null>(null);
  readonly palette = signal(false);
  readonly playing = signal(false);
  readonly toast = signal<{ msg: string; error: boolean } | null>(null);
  readonly snap = signal<'stud' | 'plate'>('stud');

  readonly mapDoc = computed(() => {
    this.revision.value;
    return this.store.get<MapDoc>(paths.map(this.mapId.value)) ?? null;
  });
  readonly maps = computed(() => {
    this.revision.value;
    const g = this.store.get<Gates>(paths.gates);
    return (g?.mapOrder ?? []).map((id) => this.store.get<MapDoc>(paths.map(id))!).filter(Boolean);
  });
  readonly selectedBricks = computed((): Brick[] => {
    const s = this.scene.value;
    this.revision.value;
    if (!s) return [];
    return [...this.selection.value].map((id) => s.get(id)).filter((b): b is Brick => !!b);
  });

  constructor(deps: EditorDeps) {
    this.store = deps.store;
    this.bus = deps.bus;
    this.autosave = deps.autosave;
    this.backend = deps.backend;
    if (deps.problems) this.problems.value = deps.problems;
    const ui = loadUi();
    for (const k of ['view', 'left', 'right', 'dock', 'assetCat', 'tool', 'snap'] as const)
      if (typeof ui[k] === 'string') (this[k] as { value: unknown }).value = ui[k];
    if (ui.layers && typeof ui.layers === 'object')
      this.layers.value = { ...this.layers.value, ...(ui.layers as object) };
    if (ui.brush && typeof ui.brush === 'object') this.brush.value = { ...this.brush.value, ...(ui.brush as object) };
    this.store.subscribe('', () => this.revision.value++);
    this.bus.onChange(() => this.revision.value++);
    this.autosave.onStatus((s) => {
      this.save.value = s;
      if (s.state === 'error') this.log('WARN', `Autosave failed: ${s.error}. Retrying.`);
    });
    this.openMap(this.store.manifest.entry.map);
  }

  /** Persist panel choices for this browser (best effort). */
  persistUi() {
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          view: this.view.value,
          left: this.left.value,
          right: this.right.value,
          dock: this.dock.value,
          assetCat: this.assetCat.value,
          tool: this.tool.value,
          snap: this.snap.value,
          layers: this.layers.value,
          brush: this.brush.value,
        }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  openMap(id: string) {
    if (!this.store.has(paths.map(id))) id = this.maps.value[0]?.id ?? id;
    batch(() => {
      this.scene.value?.dispose();
      this.mapId.value = id;
      this.scene.value = new SceneModel(this.store, id);
      this.selection.value = new Set();
      this.selectedSpawn.value = null;
    });
  }

  log(level: LogLevel, msg: string) {
    const t = new Date().toTimeString().slice(0, 8);
    this.logs.value = [...this.logs.value.slice(-499), { t, level, msg }];
  }

  notify(msg: string, error = false) {
    this.toast.value = { msg, error };
    if (error) this.log('WARN', msg);
  }

  /** The only way the editor changes the project. */
  exec(cmds: Command | Command[], opts: { label?: string; source?: Source; quiet?: boolean } = {}): ExecuteResult {
    const r = this.bus.execute(cmds, { source: opts.source ?? 'user', ...(opts.label ? { label: opts.label } : {}) });
    if (!r.ok) this.notify(r.error ?? 'That change is not possible.', true);
    else if (!opts.quiet && r.touched.length) this.log('EDIT', this.bus.history().at(-1)?.label ?? 'Edit');
    return r;
  }

  undo() {
    const label = this.bus.history().at(-1)?.label;
    if (this.bus.undo()) {
      this.log('EDIT', `Undo ${label}`);
      this.pruneSelection();
    }
  }

  redo() {
    if (this.bus.redo()) {
      this.log('EDIT', `Redo ${this.bus.history().at(-1)?.label}`);
      this.pruneSelection();
    }
  }

  pruneSelection() {
    const s = this.scene.value;
    if (!s) return;
    const keep = [...this.selection.value].filter((id) => s.byId.has(id));
    if (keep.length !== this.selection.value.size) this.selection.value = new Set(keep);
  }

  select(ids: Iterable<number>, add = false) {
    const next = new Set(add ? this.selection.value : []);
    for (const id of ids) {
      if (add && next.has(id)) next.delete(id);
      else next.add(id);
    }
    batch(() => {
      this.selection.value = next;
      this.selectedSpawn.value = null;
      if (next.size) this.right.value = 'inspect';
    });
  }

  /** Clicking a brick that belongs to a group selects the whole group (an object), Alt selects one brick. */
  selectObject(b: Brick, opts: { single?: boolean; add?: boolean } = {}) {
    const s = this.scene.value!;
    const ids = !opts.single && b.group ? (s.groups.get(b.group) ?? [b.id]) : [b.id];
    this.select(ids, opts.add);
  }

  isLocked(b: Brick): boolean {
    const s = this.scene.value;
    return !!s && this.layers.value[s.category(b)].locked;
  }

  isVisible(b: Brick): boolean {
    const s = this.scene.value;
    return !s || this.layers.value[s.category(b)].visible;
  }

  setLayer(id: CategoryId, patch: Partial<Layer>) {
    this.layers.value = { ...this.layers.value, [id]: { ...this.layers.value[id], ...patch } };
    this.persistUi();
  }
}
