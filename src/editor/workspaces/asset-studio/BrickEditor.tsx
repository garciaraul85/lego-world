import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  CUSTOM_SHAPES,
  type CustomBrick,
  type CustomShape,
  customType,
  registerCustomBrick,
  SHAPE_INFO,
  unregisterCustomBrick,
} from '../../../core/bricks/custom';
import { CommandBus, registerAll } from '../../../core/commands';
import { customBrickUses } from '../../../core/commands/handlers/custombricks';
import { newId } from '../../../core/ids';
import { Autosave } from '../../../core/project/autosave';
import { MemoryBackend } from '../../../core/project/backend';
import { newProjectFiles } from '../../../core/project/new-project';
import { ProjectStore } from '../../../core/project/store';
import { paths } from '../../../core/schema';
import { EditorState } from '../../state';
import type { ViewportApi } from '../../viewport/active';
import { Viewport } from '../../viewport/Viewport';

/** a new custom brick to start from */
export const newCustomBrick = (): CustomBrick => ({
  id: newId('custombrick') as CustomBrick['id'],
  name: 'My slope',
  base: 'brick',
  w: 2,
  d: 2,
  shape: 'slope',
  studs: 'flat',
});

/** the sizes a shape can have: round ones as deep as wide, an arch 3 wide or more */
const fit = (b: CustomBrick): CustomBrick => {
  let { w, d } = b;
  if (b.shape === 'round' || b.shape === 'cone' || b.shape === 'dome') d = w;
  if (b.shape === 'arch') w = Math.max(3, w);
  return { ...b, w, d };
};

/** the brick alone on an empty plate, to turn and zoom (an editor of its own, never the game) */
function previewEditor(b: CustomBrick, color: string): EditorState {
  const files = newProjectFiles({ name: 'Brick preview', mapName: 'Brick' });
  const store = new ProjectStore(files);
  const bus = registerAll(new CommandBus(store));
  const autosave = new Autosave(store, new MemoryBackend(), { setTimer: () => null, clearTimer: () => {} });
  const ed = new EditorState({ store, bus, autosave, backend: new MemoryBackend() });
  bus.execute(
    [
      {
        type: 'bricks.place',
        payload: { map: ed.mapId.value, bricks: [{ type: customType(b), x: 0, y: 0, z: 0, rot: 0, color }] },
      },
    ],
    { source: 'user' },
  );
  ed.tool.value = 'select';
  return ed;
}

/**
 * Step 11 (P24 part 2): the brick editor — a shape of the game's own: a slope, an inverted slope, a curve, a round
 * brick, a cone, a dome, an arch or a wedge; a brick, plate or tile high; 1 to 8 studs wide and deep; studs on its
 * flat top or none. The preview turns and zooms. Saved, it is in the Bricks tab's Custom group, placed and painted like
 * any brick, in assets and maps. Once bricks of it are used, its height and size stay (Save a copy for another).
 */
export function BrickEditor({
  ed,
  start,
  color,
  onClose,
  onSaved,
}: {
  ed: Pick<EditorState, 'store' | 'exec' | 'notify'>;
  start: CustomBrick | null;
  color: string;
  onClose(): void;
  onSaved(b: CustomBrick): void;
}) {
  const [b, setB] = useState<CustomBrick>(() => start ?? newCustomBrick());
  const [error, setError] = useState('');
  const saved = ed.store.has(paths.customBrick(b.id));
  const used = saved ? customBrickUses(ed.store, b.id) : [];
  const locked = used.length > 0;
  const set = (patch: Partial<CustomBrick>) => {
    setError('');
    setB((x) => fit({ ...x, ...patch }));
  };
  // the renderer draws the brick being edited (its draft stands in until it is saved)
  registerCustomBrick(b);
  const preview = useMemo(() => previewEditor(b, color), [b.id, b.w, b.d, b.base, color]);
  const [nonce, setNonce] = useState(0);
  useEffect(() => setNonce((n) => n + 1), [b.shape, b.studs]);
  const api = useRef<ViewportApi | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api.current?.fit(), 150);
    return () => clearTimeout(t);
  }, [preview]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      // a draft never saved goes back to how the game has it (or away)
      const kept = ed.store.get<CustomBrick>(paths.customBrick(b.id));
      if (kept) registerCustomBrick(kept);
      else unregisterCustomBrick(b.id);
    };
  }, []);
  const save = (copy: boolean) => {
    const brick = copy
      ? { ...b, id: newId('custombrick') as CustomBrick['id'], name: `${b.name} (copy)`.slice(0, 40) }
      : b;
    const r = ed.exec(
      { type: 'brick.put', payload: { brick } },
      { label: `${saved && !copy ? 'Change' : 'New'} brick ${brick.name}` },
    );
    if (!r.ok) {
      setError(r.error ?? 'It could not be saved.');
      return;
    }
    onSaved(brick);
  };
  const sizes = [1, 2, 3, 4, 5, 6, 7, 8];
  const square = b.shape === 'round' || b.shape === 'cone' || b.shape === 'dome';
  return (
    <div class="fp-back" role="dialog" aria-modal="true" aria-label="Brick editor" data-help="assets.customBricks">
      <div class="fp brick-editor">
        <header class="fp-head">
          <b>🧱 {saved ? 'Change a custom brick' : 'A new brick'}</b>
          <span style={{ flex: 1 }} />
          <button type="button" class="btn small" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div class="brick-editor-body">
          <div class="col" style={{ gap: '8px', minWidth: '260px' }}>
            <label class="field">
              Name
              <input
                class="inp"
                value={b.name}
                maxLength={40}
                data-tour="brick-name"
                onInput={(e) => set({ name: (e.target as HTMLInputElement).value || 'My brick' })}
              />
            </label>
            <div class="field">
              Shape
              <div class="brick-shapes" role="radiogroup" aria-label="Shape">
                {CUSTOM_SHAPES.map((s) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={b.shape === s}
                    class={`btn small ${b.shape === s ? 'on' : ''}`}
                    title={SHAPE_INFO[s].about}
                    data-tour={`brick-shape-${s}`}
                    onClick={() => set({ shape: s as CustomShape, studs: SHAPE_INFO[s].studs })}
                  >
                    {SHAPE_INFO[s].label}
                  </button>
                ))}
              </div>
              <span class="muted small">{SHAPE_INFO[b.shape].about}</span>
            </div>
            <div class="field">
              Height
              <span class="row" role="radiogroup" aria-label="Height" style={{ gap: '4px' }}>
                {(
                  [
                    ['brick', 'Brick'],
                    ['plate', 'Plate'],
                    ['tile', 'Tile'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={b.base === k}
                    disabled={locked}
                    class={`btn small ${b.base === k ? 'on' : ''}`}
                    data-tour={`brick-base-${k}`}
                    onClick={() => set({ base: k })}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            <div class="row" style={{ gap: '8px' }}>
              <label class="field">
                Wide
                <select
                  class="inp"
                  value={b.w}
                  disabled={locked}
                  data-tour="brick-w"
                  onChange={(e) => set({ w: Number((e.target as HTMLSelectElement).value) })}
                >
                  {sizes
                    .filter((n) => b.shape !== 'arch' || n >= 3)
                    .map((n) => (
                      <option value={n}>{n}</option>
                    ))}
                </select>
              </label>
              <label class="field">
                Deep
                <select
                  class="inp"
                  value={b.d}
                  disabled={locked || square}
                  data-tour="brick-d"
                  onChange={(e) => set({ d: Number((e.target as HTMLSelectElement).value) })}
                >
                  {sizes.map((n) => (
                    <option value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div class="field">
              Studs
              <span class="row" role="radiogroup" aria-label="Studs" style={{ gap: '4px' }}>
                {(
                  [
                    ['flat', 'On its flat top'],
                    ['none', 'None'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={b.studs === k}
                    class={`btn small ${b.studs === k ? 'on' : ''}`}
                    data-tour={`brick-studs-${k}`}
                    onClick={() => set({ studs: k })}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            {locked && (
              <p class="muted small">
                Bricks of it are in {used.slice(0, 3).join(', ')}: its height and size stay. Its shape, studs and name
                still change there too. For another size, change it here and press Save a copy.
              </p>
            )}
            {error && (
              <p class="small" role="alert" style={{ color: 'var(--danger, #e5484d)' }}>
                {error}
              </p>
            )}
            <div class="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                class="btn on"
                data-tour="brick-save"
                disabled={locked && !sameSize(ed, b)}
                onClick={() => save(false)}
              >
                {saved ? 'Save' : 'Save the brick'}
              </button>
              {saved && (
                <button type="button" class="btn" data-tour="brick-copy" onClick={() => save(true)}>
                  Save a copy
                </button>
              )}
              {saved && !locked && (
                <button
                  type="button"
                  class="btn danger"
                  data-tour="brick-delete"
                  onClick={() => {
                    if (
                      ed.exec({ type: 'brick.delete', payload: { id: b.id } }, { label: `Delete brick ${b.name}` }).ok
                    )
                      onClose();
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          <div class="brick-editor-view">
            <span class="muted small">Drag to turn it, scroll to zoom.</span>
            <div class="fp-preview-view">
              <Viewport
                key={`${preview.mapId.value}:${nonce}`}
                ed={preview}
                mode="scene"
                api={(a) => (api.current = a)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** a used brick may change everything but its height and size */
function sameSize(ed: Pick<EditorState, 'store'>, b: CustomBrick): boolean {
  const old = ed.store.get<CustomBrick>(paths.customBrick(b.id));
  return !old || customType(old) === customType(b);
}
