import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MapBricks } from '../../../core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../../core/commands';
import { mapsUsing } from '../../../core/commands/handlers/assets';
import { newId } from '../../../core/ids';
import { Autosave } from '../../../core/project/autosave';
import { MemoryBackend } from '../../../core/project/backend';
import { ProjectStore } from '../../../core/project/store';
import { type Action, type Asset, BIOMES, BRICK_SIZES, paths, type Socket } from '../../../core/schema';
import type { Marker } from '../../../engine/render/renderer';
import { ACTIONS, type ActionCtx, keyOf, runAction } from '../../actions/registry';
import { assetLibrary, resolveAsset } from '../../assets';
import { ActionListField } from '../../components/ActionListField';
import { AssetThumb } from '../../components/AssetThumb';
import { Swatches } from '../../panels/Inspector';
import { EditorState, type ToolId } from '../../state';
import { Viewport } from '../../viewport/Viewport';
import { assetFromScratch, initialIndex, type Scratch, scratchFor } from './scratch';

/** The studio's own editor state: same tools and commands, on the scratch build plate. */
class StudioState extends EditorState {
  override persistUi() {
    /* the studio never overwrites the Scene editor's saved panel choices */
  }
}

const CATEGORIES: Asset['category'][] = ['building', 'prop', 'nature', 'vehicle', 'decoration', 'structure'];
const STUDIO_TOOLS: [ToolId, string, string][] = [
  ['select', '↖', 'Select (V)'],
  ['move', '✥', 'Move (W)'],
  ['rotate', '↻', 'Rotate (E)'],
  ['place', '▦', 'Brick paint (B)'],
  ['paint', '◐', 'Color paint (C)'],
  ['erase', '⌫', 'Erase (X)'],
  ['spawn', '◎', 'Put the selected socket where you click (P)'],
];
/** Studio shortcuts go to the build plate; everything else stays with the main editor. */
const STUDIO_ACTION = /^(edit\.|tool\.|brush\.|view\.(fit|frame|top))/;

export function AssetStudio({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const id = ed.studioAsset.value ?? assetLibrary(ed)[0]?.asset.id ?? null;
  const def = resolveAsset(ed, id);
  const [viewState, setViewState] = useState<string | null>(null);
  const state = def && viewState && def.states.includes(viewState) ? viewState : (def?.initialState ?? 'default');
  const [newOnlyIn, setNewOnlyIn] = useState(false);
  const [socket, setSocket] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const synced = useRef<string>('');

  // Rebuild the build plate when another asset or state is opened, or the asset changed outside the studio.
  const studio = useMemo(() => {
    if (!def) return null;
    const scratch: Scratch = scratchFor(def, state);
    const store = new ProjectStore(scratch.files);
    const bus = registerAll(new CommandBus(store));
    const autosave = new Autosave(store, new MemoryBackend(), { setTimer: () => null, clearTimer: () => {} });
    const sed = new StudioState({ store, bus, autosave, backend: new MemoryBackend() });
    sed.tool.value = ['select', 'move', 'rotate', 'place', 'paint', 'erase'].includes(ed.tool.value)
      ? ed.tool.value
      : 'place';
    sed.brush.value = ed.brush.value;
    synced.current = JSON.stringify(def);
    return { scratch, sed, def, indexOf: initialIndex(def, scratch.hidden), hidden: scratch.hidden };
  }, [id, state, nonce, !!def]);

  // asset changed outside the studio (undo in the Scene, another tab) -> reload the plate
  useEffect(() => {
    if (def && studio && JSON.stringify(def) !== synced.current) setNonce((n) => n + 1);
  });

  // build plate edits -> the project's asset (one undoable step each)
  useEffect(() => {
    if (!studio) return;
    const { sed, scratch } = studio;
    return sed.bus.onChange(() => {
      const base = resolveAsset(ed, studio.def.id)!;
      const r = assetFromScratch(
        base,
        new MapBricks(sed.store, scratch.mapId).all(),
        studio.hidden,
        studio.indexOf,
        newOnlyIn ? state : null,
      );
      if (!r.asset.bricks.length) {
        setError('An asset needs at least one brick. Undo to bring one back.');
        return;
      }
      if (commit(r.asset, 'Edit asset bricks')) {
        studio.indexOf = r.indexOf;
        studio.hidden = r.hidden;
      }
    });
  }, [studio, newOnlyIn, state]);

  /** Saves an asset definition into the project (copying a built-in first). */
  const commit = (next: Asset, label: string): boolean => {
    const cmds = ed.store.has(paths.asset(next.id))
      ? [{ type: 'asset.update', payload: { asset: next } }]
      : [
          { type: 'asset.create', payload: { asset: resolveAsset(ed, next.id)! } },
          { type: 'asset.update', payload: { asset: next } },
        ];
    const r = ed.bus.execute(cmds, { source: 'user', label });
    if (!r.ok) {
      setError(r.error ?? 'That change is not possible.');
      return false;
    }
    setError(null);
    synced.current = JSON.stringify(next);
    ed.log('EDIT', `${label} · ${next.name}`);
    return true;
  };
  const patch = (p: Partial<Asset>, label = 'Edit asset') => def && commit({ ...def, ...p }, label);

  // keyboard: studio tools and undo act on the build plate
  useEffect(() => {
    if (!studio) return;
    const sc: ActionCtx = { ed: studio.sed, ui: c.ui };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable]')) return;
      const a = ACTIONS.find((x) => x.key === keyOf(e));
      if (!a || !STUDIO_ACTION.test(a.id)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      runAction(a, sc);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [studio]);

  if (!def || !studio) return <Library c={c} current={null} />;
  const sed = studio.sed;
  sed.revision.value;
  const sel = sed.selectedBricks.value;
  const used = ed.store.has(paths.asset(def.id)) ? mapsUsing(ed.store, def.id).length : 0;
  const sock = def.sockets.find((s) => s.id === socket) ?? null;
  const hooks = {
    markers: (): Marker[] =>
      def.sockets.map((s) => ({
        pos: [s.pos[0], s.pos[1] + 0.2, s.pos[2]] as [number, number, number],
        size: [0.5, 0.5, 0.5] as [number, number, number],
        color: (s.id === socket ? [1, 0.72, 0.2] : s.kind === 'interact' ? [0.31, 0.82, 0.77] : [0.78, 0.57, 0.92]) as [
          number,
          number,
          number,
        ],
        alpha: 0.9,
      })),
    onPoint: (pos: [number, number, number]) => {
      if (!sock) {
        ed.notify('Select a socket in the list on the right, then click where it goes.');
        return;
      }
      patch({ sockets: def.sockets.map((s) => (s.id === sock.id ? { ...s, pos } : s)) }, 'Move socket');
      sed.revision.value++;
    },
  };

  return (
    <div class="studio">
      <Library c={c} current={def.id} />
      <section class="panel studio-main" aria-label="Asset build plate">
        <div class="ptabs studio-head">
          <strong class="studio-title">{def.name}</strong>
          <span class="muted small mono">
            {def.bricks.length} pieces · {def.footprint[0]} × {def.footprint[1]} studs
            {def.origin === 'builtin' && !ed.store.has(paths.asset(def.id)) ? ' · built-in (copied on first edit)' : ''}
          </span>
          {def.states.length > 1 && (
            <span class="group" role="radiogroup" aria-label="Showing state">
              {def.states.map((s) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={s === state}
                  class={`btn ${s === state ? 'on' : ''}`}
                  onClick={() => setViewState(s)}
                >
                  {s}
                </button>
              ))}
            </span>
          )}
        </div>
        <div class="studio-tools" role="toolbar" aria-label="Build tools">
          {STUDIO_TOOLS.map(([t, glyph, label]) => (
            <button
              type="button"
              class={`btn icon ${sed.tool.value === t ? 'on' : ''}`}
              title={label}
              aria-label={label}
              aria-pressed={sed.tool.value === t}
              onClick={() => (sed.tool.value = t)}
            >
              <span aria-hidden="true" class="mono">
                {glyph}
              </span>
            </button>
          ))}
          <span class="sep" />
          <button type="button" class="btn" disabled={!sed.bus.canUndo()} onClick={() => sed.undo()}>
            Undo
          </button>
          <button type="button" class="btn" disabled={!sed.bus.canRedo()} onClick={() => sed.redo()}>
            Redo
          </button>
          <BrushPicker ed={sed} />
          {def.states.length > 1 && (
            <label class="lbl small">
              <input type="checkbox" checked={newOnlyIn} onChange={() => setNewOnlyIn(!newOnlyIn)} /> New bricks only in
              “{state}”
            </label>
          )}
        </div>
        <div class="studio-plate">
          <Viewport key={`${def.id}|${state}|${nonce}`} ed={sed} mode="scene" studio={hooks} />
          {error && (
            <div class="vp-overlay" role="alert" style={{ borderColor: 'var(--err)' }}>
              Not saved: {error}
            </div>
          )}
        </div>
        <div class="studio-foot muted small">
          {sel.length
            ? `${sel.length} selected · Delete removes · R turns`
            : 'Build with Brick paint (B). Every change is saved to the asset and to every placed copy.'}
          {used ? ` · placed on ${used} map${used === 1 ? '' : 's'}` : ''}
        </div>
      </section>
      <Properties c={c} def={def} patch={patch} socket={socket} setSocket={setSocket} />
    </div>
  );
}

function BrushPicker({ ed }: { ed: EditorState }) {
  const b = ed.brush.value;
  const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(b.type)!;
  return (
    <span class="row studio-brush">
      <select
        class="inp"
        aria-label="Piece kind"
        value={m[1]}
        onChange={(e) => (ed.brush.value = { ...b, type: `${(e.target as HTMLSelectElement).value}${m[2]}x${m[3]}` })}
      >
        <option value="brick">Brick</option>
        <option value="plate">Plate</option>
        <option value="tile">Tile</option>
      </select>
      <select
        class="inp"
        aria-label="Piece size"
        value={`${m[2]}x${m[3]}`}
        onChange={(e) => (ed.brush.value = { ...b, type: `${m[1]}${(e.target as HTMLSelectElement).value}` })}
      >
        {BRICK_SIZES.map(([r, cc]) => (
          <option value={`${r}x${cc}`}>
            {r}×{cc}
          </option>
        ))}
      </select>
      <Swatches value={b.color} onPick={(color) => (ed.brush.value = { ...b, color })} />
    </span>
  );
}

function Library({ c, current }: { c: ActionCtx; current: string | null }) {
  const { ed } = c;
  const [q, setQ] = useState('');
  const lib = assetLibrary(ed).filter(({ asset }) => asset.name.toLowerCase().includes(q.toLowerCase()));
  const groups: [string, typeof lib][] = [
    ['Mine', lib.filter((x) => x.asset.origin === 'user' || !x.asset.origin)],
    ['Built-in', lib.filter((x) => x.asset.origin === 'builtin')],
    ['From generated maps', lib.filter((x) => x.asset.origin === 'generated')],
  ];
  const newAsset = () => {
    const asset: Asset = {
      id: newId('asset'),
      name: `New asset ${lib.length + 1}`,
      category: 'prop',
      bricks: [[0, 0, 0, 0, 0, 0, 0]],
      palette: { types: ['brick2x4'], colors: ['#d20c20'] },
      pivot: [0, 0, 0],
      footprint: [4, 2],
      sockets: [],
      states: ['default'],
      initialState: 'default',
      interactions: [],
      smash: { enabled: true, rebuild: true, sound: null, studs: 0 },
      generator: null,
      origin: 'user',
    };
    if (ed.exec({ type: 'asset.create', payload: { asset } }).ok) ed.studioAsset.value = asset.id;
  };
  return (
    <section class="panel studio-lib" aria-label="Asset library">
      <div class="ptabs">
        <span class="tab on">Asset library</span>
      </div>
      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button type="button" class="btn on" onClick={newAsset}>
          + New asset
        </button>
        <input
          class="inp"
          placeholder="Find an asset"
          aria-label="Find an asset"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="scroll" role="listbox" aria-label="Assets">
        {groups.map(([name, list]) =>
          list.length ? (
            <>
              <div class="sech" style={{ padding: '8px 10px 4px' }}>
                <span>{name}</span>
                <span>{list.length}</span>
              </div>
              {list.map(({ asset }) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={asset.id === current}
                  class={`lib-item ${asset.id === current ? 'on' : ''}`}
                  onClick={() => (ed.studioAsset.value = asset.id)}
                >
                  <AssetThumb def={asset} size={32} />
                  <span class="asset-name">{asset.name}</span>
                  <span class="mono small muted">{asset.bricks.length}</span>
                </button>
              ))}
            </>
          ) : null,
        )}
      </div>
      <div class="hint" style={{ padding: '8px 10px' }}>
        Characters and NPCs live in the Characters studio. Everything else in the world is built here.
      </div>
    </section>
  );
}

function Properties({
  c,
  def,
  patch,
  socket,
  setSocket,
}: {
  c: ActionCtx;
  def: Asset;
  patch: (p: Partial<Asset>, label?: string) => unknown;
  socket: string | null;
  setSocket: (s: string | null) => void;
}) {
  const { ed } = c;
  const inProject = ed.store.has(paths.asset(def.id));
  const used = inProject ? mapsUsing(ed.store, def.id).length : 0;
  const [newState, setNewState] = useState('');
  const setInteractions = (interactions: Asset['interactions']) => patch({ interactions }, 'Edit interactions');
  return (
    <section class="panel right studio-props" aria-label="Asset properties">
      <div class="ptabs">
        <span class="tab on">Asset</span>
      </div>
      <div class="scroll">
        <div class="sec">
          <label class="field">
            Name
            <input
              class="inp"
              value={def.name}
              aria-label="Asset name"
              onChange={(e) => {
                const name = (e.target as HTMLInputElement).value.trim().slice(0, 60);
                if (name) patch({ name }, 'Rename asset');
              }}
            />
          </label>
          <label class="field">
            Kind
            <select
              class="inp"
              value={def.category}
              onChange={(e) => patch({ category: (e.target as HTMLSelectElement).value as Asset['category'] })}
            >
              {CATEGORIES.map((k) => (
                <option value={k}>{k}</option>
              ))}
            </select>
          </label>
          <div class="row">
            <button
              type="button"
              class="btn on"
              style={{ flex: 1 }}
              onClick={() => {
                ed.assetBrush.value = { asset: def.id, rot: 0 };
                ed.tool.value = 'asset';
                c.ui.workspace('Scene');
                ed.notify(`Click in the map to place ${def.name}. T turns it.`);
              }}
            >
              Test in world
            </button>
            <button
              type="button"
              class="btn danger"
              disabled={!inProject || used > 0 || def.origin === 'builtin'}
              title={used ? 'Remove or unpack the placed copies first' : 'Delete this asset from the project'}
              onClick={() => {
                if (ed.exec({ type: 'asset.delete', payload: { asset: def.id } }).ok) ed.studioAsset.value = null;
              }}
            >
              Delete
            </button>
          </div>
        </div>

        <div class="sec">
          <div class="sech">
            <span>States</span>
            <span class="mono">start: {def.initialState}</span>
          </div>
          <div class="row">
            {def.states.map((s) => (
              <span class="chip">
                {s}
                {s !== def.initialState && (
                  <button type="button" class="link" onClick={() => patch({ initialState: s }, 'Set starting state')}>
                    make start
                  </button>
                )}
                {def.states.length > 1 && (
                  <button
                    type="button"
                    class="link"
                    aria-label={`Remove state ${s}`}
                    onClick={() => {
                      const states = def.states.filter((x) => x !== s);
                      const { [s]: _gone, ...onlyIn } = def.onlyIn ?? {};
                      patch(
                        {
                          states,
                          initialState: def.initialState === s ? states[0]! : def.initialState,
                          onlyIn,
                          interactions: def.interactions.filter((i) => i.when?.state !== s),
                        },
                        'Remove state',
                      );
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          <div class="row">
            <input
              class="inp"
              style={{ flex: 1 }}
              placeholder="New state (e.g. open)"
              aria-label="New state name"
              value={newState}
              onInput={(e) => setNewState((e.target as HTMLInputElement).value)}
            />
            <button
              type="button"
              class="btn"
              disabled={!newState.trim() || def.states.includes(newState.trim())}
              onClick={() => {
                patch({ states: [...def.states, newState.trim().slice(0, 30)] }, 'Add state');
                setNewState('');
              }}
            >
              Add
            </button>
          </div>
          <div class="hint">
            Bricks can show in only one state (a chest lid closed or open). Pick the state above the build plate and
            tick “New bricks only in …”.
          </div>
        </div>

        <div class="sec">
          <div class="sech">
            <span>Sockets</span>
            <span>{def.sockets.length}</span>
          </div>
          {def.sockets.map((s) => (
            <div class={`socket-row ${s.id === socket ? 'on' : ''}`}>
              <button type="button" class="link" onClick={() => setSocket(s.id === socket ? null : s.id)}>
                {s.id === socket ? '◉' : '○'} {s.id}
              </button>
              <select
                class="inp"
                aria-label="Socket kind"
                value={s.kind}
                onChange={(e) =>
                  patch({
                    sockets: def.sockets.map((x) =>
                      x.id === s.id ? { ...x, kind: (e.target as HTMLSelectElement).value as Socket['kind'] } : x,
                    ),
                  })
                }
              >
                {(['interact', 'sign', 'sound', 'npc', 'spawn'] as const).map((k) => (
                  <option value={k}>{k}</option>
                ))}
              </select>
              <input
                class="inp"
                aria-label="Prompt"
                placeholder="Prompt"
                value={s.prompt ?? ''}
                onChange={(e) => {
                  const prompt = (e.target as HTMLInputElement).value.trim().slice(0, 40);
                  patch({
                    sockets: def.sockets.map((x) => {
                      if (x.id !== s.id) return x;
                      const { prompt: _p, ...rest } = x;
                      return prompt ? { ...rest, prompt } : rest;
                    }),
                  });
                }}
              />
              <span class="mono small muted">{s.pos.map((v) => Math.round(v * 10) / 10).join(', ')}</span>
              <button
                type="button"
                class="btn icon"
                aria-label={`Remove socket ${s.id}`}
                onClick={() =>
                  patch(
                    {
                      sockets: def.sockets.filter((x) => x.id !== s.id),
                      interactions: def.interactions.filter((i) => i.socket !== s.id),
                    },
                    'Remove socket',
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            class="btn"
            onClick={() => {
              let n = def.sockets.length + 1;
              while (def.sockets.some((s) => s.id === `socket-${n}`)) n++;
              const top = Math.max(
                ...def.bricks.map((b) => b[2] + (def.palette.types[b[0]]!.startsWith('brick') ? 3 : 1)),
              );
              const s: Socket = {
                id: `socket-${n}`,
                kind: 'interact',
                pos: [def.footprint[0] / 2, top * 0.4, def.footprint[1] / 2],
                prompt: 'Use',
              };
              patch({ sockets: [...def.sockets, s] }, 'Add socket');
              setSocket(s.id);
            }}
          >
            + Socket
          </button>
          <div class="hint">Select a socket, then use ◎ and click the build plate to move it.</div>
        </div>

        <div class="sec">
          <div class="sech">
            <span>Interactions</span>
            <span>E in play</span>
          </div>
          {def.interactions.map((it, i) => (
            <div class="interaction">
              <div class="row">
                <select
                  class="inp"
                  aria-label="Socket"
                  value={it.socket}
                  onChange={(e) =>
                    setInteractions(
                      def.interactions.map((x, j) =>
                        j === i ? { ...x, socket: (e.target as HTMLSelectElement).value } : x,
                      ),
                    )
                  }
                >
                  {[...new Set([...def.sockets.map((s) => s.id), it.socket])].map((s) => (
                    <option value={s}>{s}</option>
                  ))}
                </select>
                <select
                  class="inp"
                  aria-label="When"
                  value={it.when?.state ?? ''}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    setInteractions(
                      def.interactions.map((x, j) => {
                        if (j !== i) return x;
                        const { when: _w, ...rest } = x;
                        return v ? { ...rest, when: { state: v } } : rest;
                      }),
                    );
                  }}
                >
                  <option value="">in any state</option>
                  {def.states.map((s) => (
                    <option value={s}>when {s}</option>
                  ))}
                </select>
                <button
                  type="button"
                  class="btn icon"
                  aria-label="Remove interaction"
                  onClick={() => setInteractions(def.interactions.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
              <ActionListField
                value={it.do}
                states={def.states}
                onChange={(next: Action[]) =>
                  setInteractions(def.interactions.map((x, j) => (j === i ? { ...x, do: next } : x)))
                }
              />
            </div>
          ))}
          <button
            type="button"
            class="btn"
            disabled={!def.sockets.length}
            title={def.sockets.length ? undefined : 'Add a socket first'}
            onClick={() =>
              setInteractions([
                ...def.interactions,
                {
                  socket: def.sockets[0]!.id,
                  do: [{ do: 'emit', event: `${def.name.toLowerCase().replace(/\W+/g, '-')}-used` }],
                },
              ])
            }
          >
            + Interaction
          </button>
        </div>

        <div class="sec">
          <div class="sech">
            <span>Smash</span>
          </div>
          <label class="lbl">
            <input
              type="checkbox"
              checked={def.smash.enabled}
              onChange={() => patch({ smash: { ...def.smash, enabled: !def.smash.enabled } })}
            />{' '}
            Can be smashed in play
          </label>
          <label class="lbl">
            <input
              type="checkbox"
              checked={def.smash.rebuild}
              disabled={!def.smash.enabled}
              onChange={() => patch({ smash: { ...def.smash, rebuild: !def.smash.rebuild } })}
            />{' '}
            Can be rebuilt (hold E)
          </label>
        </div>

        <div class="sec" style={{ borderBottom: 0 }}>
          <div class="sech">
            <span>Use in generator</span>
          </div>
          <label class="lbl">
            <input
              type="checkbox"
              checked={!!def.generator}
              onChange={() =>
                patch(
                  { generator: def.generator ? null : { environments: ['prairie'], weight: 0.3, placeOn: 'ground' } },
                  'Generator rules',
                )
              }
            />{' '}
            Place copies when a map is generated
          </label>
          {def.generator && (
            <>
              <div class="row" role="group" aria-label="Environments">
                {BIOMES.map((b) => {
                  const on = def.generator!.environments.includes(b);
                  return (
                    <button
                      type="button"
                      class={`chip ${on ? 'on' : ''}`}
                      aria-pressed={on}
                      style={on ? { borderColor: 'var(--acc)' } : undefined}
                      onClick={() => {
                        const environments = on
                          ? def.generator!.environments.filter((x) => x !== b)
                          : [...def.generator!.environments, b];
                        if (environments.length)
                          patch({ generator: { ...def.generator!, environments } }, 'Generator rules');
                      }}
                    >
                      {b.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
              <label class="field">
                How many
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={def.generator.weight}
                  aria-label="How many copies"
                  onChange={(e) =>
                    patch(
                      { generator: { ...def.generator!, weight: Number((e.target as HTMLInputElement).value) } },
                      'Generator rules',
                    )
                  }
                />
              </label>
              <div class="hint">
                Takes effect the next time a map with one of these environments is generated (Map tab › Generate).
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
