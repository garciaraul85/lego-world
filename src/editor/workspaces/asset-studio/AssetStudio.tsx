import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { builtinAsset } from '../../../builtin/assets';
import { expandAsset } from '../../../core/assets/expand';
import { partPose } from '../../../core/assets/free';
import { bricksBox, hasScale, hasTilt, type Scale, type Tilt } from '../../../core/assets/tilt';
import type { Brick } from '../../../core/bricks/codec';
import { MapBricks } from '../../../core/bricks/map-bricks';
import { CommandBus, registerAll } from '../../../core/commands';
import { mapsUsing } from '../../../core/commands/handlers/assets';
import { newId } from '../../../core/ids';
import { stableStringify } from '../../../core/json/stable';
import { Autosave } from '../../../core/project/autosave';
import { MemoryBackend } from '../../../core/project/backend';
import { ProjectStore } from '../../../core/project/store';
import { type Action, type Asset, BIOMES, paths, type Socket } from '../../../core/schema';
import type { Marker } from '../../../engine/render/renderer';
import { ACTIONS, type ActionCtx, keyOf, runAction } from '../../actions/registry';
import { assetLibrary, newAssetDef, resolveAsset, sameAsset } from '../../assets';
import { ActionListField } from '../../components/ActionListField';
import { AssetThumb } from '../../components/AssetThumb';
import { BrickIcon, BrickPicker } from '../../components/BrickIcon';
import { FieldHelp, Num } from '../../components/fields';
import { HealthFields, MakeBreakable } from '../../components/HealthFields';
import { shows } from '../../genres/view';
import { endDrag, startDrag } from '../../interact/drag';
import { actionChoices } from '../../panels/AudioFields';
import { Swatches } from '../../panels/Inspector';
import type { StudioPart } from '../../scene';
import { EditorState, type ToolId } from '../../state';
import { Viewport, type ViewportApi } from '../../viewport/Viewport';
import { assetFromScratch, initialIndex, type Scratch, scratchFor, turnPart } from './scratch';

/** The studio's own editor state: same tools and commands, on the scratch build plate. */
export class StudioState extends EditorState {
  /** the main editor: the plate's notices and log lines show there (the plate has no toast or console) */
  parent: EditorState | null = null;
  override get buildsBricks() {
    return true;
  }
  override notify(msg: string, error = false) {
    if (this.parent) this.parent.notify(msg, error);
    else super.notify(msg, error);
  }
  override log(level: Parameters<EditorState['log']>[0], msg: string) {
    if (this.parent) this.parent.log(level, `Asset plate: ${msg}`);
    else super.log(level, msg);
  }
  override persistUi() {
    /* the studio never overwrites the Scene editor's saved panel choices */
  }
}

const CATEGORIES: Asset['category'][] = ['building', 'prop', 'nature', 'vehicle', 'decoration', 'structure'];
const STUDIO_TOOLS: [ToolId, string, string][] = [
  ['select', '↖', 'Select (V)'],
  ['move', '✥', 'Move (W)'],
  ['rotate', '↻', 'Rotate (E)'],
  ['resize', '⤡', 'Resize one brick (Q)'],
  ['place', '▦', 'Place bricks (B)'],
  ['paint', '◐', 'Color paint (C)'],
  ['erase', '⌫', 'Erase (X)'],
  ['spawn', '◎', 'Put the selected socket where you click (P)'],
];
/** Studio shortcuts go to the build plate; everything else stays with the main editor. */
const STUDIO_ACTION = /^(edit\.|tool\.|brush\.)/;
/** the build plate's tool, kept while you switch assets (Place bricks to start with) */
let plateTool: ToolId = 'place';
/** what the Scene had selected or picked the last time the Assets screen opened */
const followed = { inst: '', brush: '' };

/**
 * P32: an asset you select in the Scene (or pick in its dock) is the one the Assets screen opens, so going
 * from a placed chest to the Assets screen shows that chest ready to change.
 */
export function followScene(ed: EditorState) {
  const s = ed.scene.value;
  const first = ed.selection.value.values().next().value;
  const inst = (first !== undefined && s?.ownerOf(first)?.def.id) || '';
  const brush = ed.assetBrush.value.asset ?? '';
  const pick = inst && inst !== followed.inst ? inst : brush && brush !== followed.brush ? brush : null;
  followed.inst = inst;
  followed.brush = brush;
  if (pick && resolveAsset(ed, pick)) ed.studioAsset.value = pick;
}

type PendingPart = { name: string; ids: number[]; tilt?: Tilt; scale?: Scale };

/**
 * P32: another asset's bricks (as it looks in its starting state) placed on the plate at `at`, turned `rot`
 * quarter turns, with fresh plate ids from `start`, grouped so they are picked up and moved as one; and its
 * turned parts, which keep their turn in the asset they are built into.
 */
export function reuseBricks(
  other: Asset,
  at: [number, number, number],
  rot: number,
  start: number,
): { bricks: Brick[]; parts: PendingPart[] } {
  const shown = expandAsset(other, { pos: at, rot, idBase: 0 }).bricks;
  const group = `reuse-${start}`;
  const idOf = new Map<number, number>();
  const bricks = shown.map((b, k) => {
    idOf.set(b.id, start + k);
    return { ...b, id: start + k, group };
  });
  const parts = (other.parts ?? []).flatMap((p): PendingPart[] => {
    const ids = p.bricks.flatMap((i) => (idOf.has(i) ? [idOf.get(i)!] : []));
    return ids.length ? [{ name: `${other.name} · ${p.name}`, ids, ...turnPart(p, rot) }] : [];
  });
  return { bricks, parts };
}

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
  /** the asset as the plate showed it when saving was refused, so it can be kept as a new asset instead */
  const [rejected, setRejected] = useState<Asset | null>(null);
  /** the asset as it was when it was opened here, for Reset */
  const openedAs = useRef<Asset | null>(null);
  /** true while a refused plate change is being taken back (that undo is not saved again) */
  const rolling = useRef(false);
  // another asset: an old “Not saved” is not about it
  useEffect(() => {
    setError(null);
    setRejected(null);
    openedAs.current = id ? resolveAsset(ed, id) : null;
  }, [id]);
  const synced = useRef<string>('');
  /** turned parts of an asset just built in, waiting for the plate change that adds its bricks */
  const pendingParts = useRef<PendingPart[] | null>(null);
  /** the build plate's 3D view */
  const plateView = useRef<ViewportApi | null>(null);
  // P32: the asset selected in the Scene opens here
  useState(() => followScene(ed));

  // Rebuild the build plate when another asset or state is opened, or the asset changed outside the studio.
  const studio = useMemo(() => {
    if (!def) return null;
    const scratch: Scratch = scratchFor(def, state);
    const store = new ProjectStore(scratch.files);
    const bus = registerAll(new CommandBus(store));
    const autosave = new Autosave(store, new MemoryBackend(), { setTimer: () => null, clearTimer: () => {} });
    const sed = new StudioState({ store, bus, autosave, backend: new MemoryBackend() });
    sed.parent = ed;
    sed.tool.value = plateTool;
    sed.brush.value = ed.brush.value;
    synced.current = stableStringify(def);
    const indexOf = initialIndex(def, scratch.hidden);
    sed.scene.value?.setParts(studioParts(def, indexOf, state));
    return { scratch, sed, def, indexOf, hidden: scratch.hidden };
  }, [id, state, nonce, !!def]);

  // the plate shows the asset's turned parts (after a turn, a Straighten, an undo)
  const partsKey = JSON.stringify(def?.parts ?? []);
  useEffect(() => {
    if (studio) studio.sed.scene.value?.setParts(studioParts(def!, studio.indexOf, state));
  }, [studio, partsKey, state]);

  // asset changed outside the studio (undo in the Scene, another tab) -> reload the plate
  useEffect(() => {
    // (compared field by field in a fixed order: the same asset saved again is not a change)
    // read it now: the `def` of the render that ran this effect can be older than the change just saved, and
    // taking that for an outside change rebuilt the plate (a new 3D view) after nearly every brick
    const now = studio && resolveAsset(ed, studio.def.id);
    if (now && stableStringify(now) !== synced.current) setNonce((n) => n + 1);
  });

  // build plate edits -> the project's asset (one undoable step each)
  useEffect(() => {
    if (!studio) return;
    const { sed, scratch } = studio;
    /**
     * P32: a plate change the project refuses is taken back at once, so the plate always shows the asset as it
     * is saved (otherwise the next change is worked out from bricks the asset does not have).
     */
    const takeBack = () => {
      rolling.current = true;
      try {
        sed.undo();
      } finally {
        rolling.current = false;
      }
      sed.revision.value++;
    };
    return sed.bus.onChange(() => {
      if (rolling.current) return;
      const base = resolveAsset(ed, studio.def.id)!;
      const r = assetFromScratch(
        base,
        new MapBricks(sed.store, scratch.mapId).all(),
        studio.hidden,
        studio.indexOf,
        newOnlyIn ? state : null,
      );
      if (!r.asset.bricks.length) {
        setError('An asset needs at least one brick, so the last one stays.');
        setRejected(null);
        takeBack();
        return;
      }
      const extra = pendingParts.current;
      pendingParts.current = null;
      if (extra?.length) {
        const parts = extra.flatMap((p) => {
          const bricks = p.ids.flatMap((id) => (r.indexOf.has(id) ? [r.indexOf.get(id)!] : []));
          const { ids: _ids, ...rest } = p;
          return bricks.length ? [{ ...rest, bricks }] : [];
        });
        if (parts.length) r.asset = { ...r.asset, parts: [...(r.asset.parts ?? []), ...parts] };
      }
      if (commit(r.asset, extra?.length ? 'Build in another asset' : 'Edit asset bricks')) {
        studio.indexOf = r.indexOf;
        studio.hidden = r.hidden;
        sed.scene.value?.setParts(studioParts(r.asset, r.indexOf, state));
        // the plate shows the saved asset now, every brick (not only the chunks the change touched)
        plateView.current?.resync();
      } else {
        setRejected(r.asset);
        takeBack();
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
      setError(whyNotSaved(ed, next, r.error ?? 'That change is not possible.'));
      return false;
    }
    setError(null);
    setRejected(null);
    // what the project now holds (read back, so a tidied copy is not taken for an outside change)
    synced.current = stableStringify(resolveAsset(ed, next.id) ?? next);
    ed.log('EDIT', `${label} · ${next.name}`);
    return true;
  };
  const patch = (p: Partial<Asset>, label = 'Edit asset') => def && commit({ ...def, ...p }, label);
  /** asset brick indexes of the bricks selected on the plate */
  const selectedIndexes = () =>
    studio
      ? [...studio.sed.selection.value].flatMap((id) => {
          const k = studio.indexOf.get(id as number);
          return k === undefined ? [] : [k];
        })
      : [];

  // the plate's tool and brush stay the same when another asset is opened
  useEffect(() => {
    if (!studio) return;
    const offTool = studio.sed.tool.subscribe((t) => (plateTool = t));
    const offBrush = studio.sed.brush.subscribe((b) => {
      ed.brush.value = b;
      ed.persistUi();
    });
    return () => {
      offTool();
      offBrush();
    };
  }, [studio]);

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

  if (!def || !studio) return <Library c={c} current={null} sed={null} />;
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
    // P31: bricks turned or sized on the plate become a part of the asset (or update the part they are)
    onPart: (p: { index: number | null; ids: number[]; tilt: Tilt; scale: Scale }) => {
      const cur = resolveAsset(ed, def.id)!;
      const idx = p.ids.flatMap((id) => {
        const i = studio.indexOf.get(id);
        return i === undefined ? [] : [i];
      });
      if (!idx.length) return;
      const taken = new Set(idx);
      const parts = (cur.parts ?? []).map((q) => ({ ...q, bricks: q.bricks.filter((i) => !taken.has(i)) }));
      const free = { ...(hasTilt(p.tilt) ? { tilt: p.tilt } : {}), ...(hasScale(p.scale) ? { scale: p.scale } : {}) };
      if (p.index !== null && parts[p.index]) {
        const { tilt: _t, scale: _s, ...q } = parts[p.index]!;
        parts[p.index] = { ...q, bricks: idx, ...free };
      } else parts.push({ name: `Part ${parts.length + 1}`, bricks: idx, ...free });
      // a part that is straight and normal size again is just bricks (unless it moves between states)
      const next = parts.filter((q) => q.bricks.length && (hasTilt(q.tilt) || hasScale(q.scale) || q.pose));
      const { parts: _old, ...rest } = cur;
      const asset = { ...rest, ...(next.length ? { parts: next } : {}) };
      if (commit(asset, p.index === null ? 'Make a turned part' : 'Turn part')) {
        sed.scene.value?.setParts(studioParts(asset, studio.indexOf, state));
        sed.revision.value++;
      }
    },
    reuse: {
      def: (other: string) => resolveAsset(ed, other),
      drop: (other: string, at: [number, number, number], rot: number) => buildIn(other, at, rot),
    },
    onPoint: (pos: [number, number, number]) => {
      if (!sock) {
        ed.notify('Select a socket in the list on the right, then click where it goes.');
        return;
      }
      patch({ sockets: def.sockets.map((s) => (s.id === sock.id ? { ...s, pos } : s)) }, 'Move socket');
      sed.revision.value++;
    },
  };

  /** P32: builds a copy of another asset into this one: its bricks go on the plate, picked up as one. */
  function buildIn(other: string, at: [number, number, number] | null, rot = 0): boolean {
    const o = resolveAsset(ed, other);
    if (!o) return false;
    const map = studio!.scratch.mapId;
    const plate = new MapBricks(sed.store, map).all();
    const start = plate.reduce((m, b) => Math.max(m, b.id), 0) + 1;
    const tryAt = (p: [number, number, number]) => {
      const r = reuseBricks(o, p, rot, start);
      const cmd = { type: 'bricks.place', payload: { map, bricks: r.bricks } };
      return sed.bus.check(cmd) ? null : { r, cmd };
    };
    // no spot given (the + button): right next to what is there, going up until it fits
    let fit: ReturnType<typeof tryAt> = null;
    const base: [number, number, number] = at ?? [def!.footprint[0], 0, 0];
    for (let dy = 0; dy <= 36 && !fit; dy++) fit = tryAt([base[0], base[1] + dy, base[2]]);
    if (!fit) {
      ed.notify(`There is no room for ${o.name} there. Try dropping it somewhere else on the plate.`, true);
      return false;
    }
    pendingParts.current = fit.r.parts;
    const r = sed.exec(fit.cmd, { label: `Build in ${o.name}` });
    // refused by the project (a placed copy would not fit): the plate took it back and says why
    if (!r.ok || !new MapBricks(sed.store, map).all().some((b) => b.id === start)) {
      pendingParts.current = null;
      return false;
    }
    sed.select(fit.r.bricks.map((b) => b.id));
    sed.tool.value = 'move';
    ed.notify(`Built ${o.name} into ${def!.name}. Drag it with Move (W) to put it where you want it.`);
    return true;
  }

  return (
    <div class="studio">
      <Library c={c} current={def.id} sed={sed} onAdd={(other) => buildIn(other, null)} />
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
          <Viewport
            key={`${def.id}|${state}|${nonce}`}
            ed={sed}
            mode="scene"
            studio={hooks}
            api={(a) => (plateView.current = a)}
          />
          {error && (
            <div class="vp-overlay save-problem" role="alert" data-help="assets.saveProblem">
              <span>Not saved: {error}</span>
              <span class="row">
                {rejected && (
                  <button
                    type="button"
                    class="btn on"
                    onClick={() => {
                      const copy: Asset = {
                        ...rejected,
                        id: newId('asset'),
                        name: `${rejected.name} (new)`.slice(0, 60),
                        origin: 'user',
                        generator: null,
                      };
                      if (
                        ed.exec({ type: 'asset.create', payload: { asset: copy } }, { label: 'Keep as a new asset' }).ok
                      )
                        ed.studioAsset.value = copy.id;
                    }}
                  >
                    Keep it as a new asset
                  </button>
                )}
                <button
                  type="button"
                  class="btn"
                  onClick={() => {
                    setError(null);
                    setRejected(null);
                  }}
                >
                  OK
                </button>
              </span>
            </div>
          )}
        </div>
        <div class="studio-foot muted small">
          {sel.length
            ? `${sel.length} selected · Delete removes · R turns`
            : 'Add bricks from the Bricks tab (click, or drag onto the plate), or drag another asset onto it. Every change is saved to the asset and to every placed copy.'}
          {used ? ` · placed on ${used} map${used === 1 ? '' : 's'}` : ''}
        </div>
      </section>
      <Properties
        c={c}
        def={def}
        patch={patch}
        openedAs={openedAs.current}
        reset={(to, label) => {
          if (commit(to, label)) setNonce((n) => n + 1);
        }}
        socket={socket}
        setSocket={setSocket}
        selectedIndexes={selectedIndexes}
      />
    </div>
  );
}

/** The brick brush: a button with a picture of the piece; it opens the kind and size cards and the colors. */
function BrushPicker({ ed }: { ed: EditorState }) {
  const b = ed.brush.value;
  const [open, setOpen] = useState(false);
  const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(b.type)!;
  const name = `${m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)} ${m[2]}×${m[3]}`;
  return (
    <span class="studio-brush">
      <button
        type="button"
        class={`btn brush-btn ${open ? 'on' : ''}`}
        aria-expanded={open}
        aria-label={`Piece: ${name}`}
        data-tip="Pick the piece and color that Place bricks (B) puts down"
        onClick={() => setOpen(!open)}
      >
        <BrickIcon type={b.type} color={b.color} rot={b.rot} size={30} />
        {name} ▾
      </button>
      <Swatches value={b.color} onPick={(color) => (ed.brush.value = { ...b, color })} />
      {open && (
        <div class="brush-pop" role="dialog" aria-label="Pick a piece">
          <BrickPicker
            type={b.type}
            color={b.color}
            rot={b.rot}
            onPick={(type) => {
              ed.brush.value = { ...b, type };
              if (ed.tool.value !== 'place') ed.tool.value = 'place';
            }}
          />
          <div class="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" class="btn on" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function Library({
  c,
  current,
  sed,
  onAdd,
}: {
  c: ActionCtx;
  current: string | null;
  /** the build plate's editor (for the Bricks tab), when an asset is open */
  sed: EditorState | null;
  onAdd?: (asset: string) => void;
}) {
  const { ed } = c;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'assets' | 'bricks'>('assets');
  const open = current ? resolveAsset(ed, current) : null;
  const lib = assetLibrary(ed).filter(({ asset }) => asset.name.toLowerCase().includes(q.toLowerCase()));
  const groups: [string, typeof lib][] = [
    ['Mine', lib.filter((x) => x.asset.origin === 'user' || !x.asset.origin)],
    ['Built-in', lib.filter((x) => x.asset.origin === 'builtin')],
    ['From generated maps', lib.filter((x) => x.asset.origin === 'generated')],
  ];
  const newAsset = () => {
    const asset = newAssetDef(ed);
    if (ed.exec({ type: 'asset.create', payload: { asset } }, { label: 'New asset' }).ok)
      ed.studioAsset.value = asset.id;
  };
  return (
    <section class="panel studio-lib" aria-label="Asset library">
      <div class="ptabs" role="tablist" aria-label="Library">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'assets'}
          class={`tab ${tab === 'assets' ? 'on' : ''}`}
          onClick={() => setTab('assets')}
        >
          Assets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bricks'}
          class={`tab ${tab === 'bricks' ? 'on' : ''}`}
          disabled={!sed}
          onClick={() => setTab('bricks')}
        >
          Bricks
        </button>
      </div>
      {tab === 'bricks' && sed ? <PlateBricks ed={sed} /> : null}
      <div style={{ padding: '8px', display: tab === 'assets' ? 'flex' : 'none', flexDirection: 'column', gap: '6px' }}>
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
      <div class="scroll" role="listbox" aria-label="Assets" hidden={tab !== 'assets'}>
        {groups.map(([name, list]) =>
          list.length ? (
            <>
              <div class="sech" style={{ padding: '8px 10px 4px' }}>
                <span>{name}</span>
                <span>{list.length}</span>
              </div>
              {list.map(({ asset, inProject }) => (
                <div class={`lib-row ${asset.id === current ? 'on' : ''}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={asset.id === current}
                    class={`lib-item ${asset.id === current ? 'on' : ''}`}
                    data-tip={
                      open
                        ? `Click to open ${asset.name}. Drag it onto the build plate to build a copy of it into ${open.name}.`
                        : `Click to open ${asset.name}.`
                    }
                    draggable={!!open}
                    onDragStart={(e) =>
                      startDrag(e as unknown as DragEvent, { kind: 'asset', asset: asset.id, rot: 0 })
                    }
                    onDragEnd={endDrag}
                    onClick={() => (ed.studioAsset.value = asset.id)}
                  >
                    <AssetThumb def={asset} size={32} />
                    <span class="asset-name">
                      {asset.name}
                      {asset.origin === 'builtin' && inProject && !sameAsset(asset, builtinAsset(asset.id)) && (
                        <span
                          class="changed-tag"
                          title="Changed from the built-in one (Reset to built-in puts it back)"
                        >
                          {' '}
                          · changed
                        </span>
                      )}
                    </span>
                    <span class="mono small muted">{asset.bricks.length}</span>
                  </button>
                  {open && onAdd && (
                    <button
                      type="button"
                      class="btn icon lib-add"
                      aria-label={`Build ${asset.name} into ${open.name}`}
                      data-tip={`Build a copy of ${asset.name} into ${open.name}, next to its bricks (or drag the row onto the plate to choose the spot).`}
                      onClick={() => onAdd(asset.id)}
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : null,
        )}
      </div>
      <div class="hint" style={{ padding: '8px 10px' }} hidden={tab !== 'assets'}>
        Click an asset to open it. Drag one onto the build plate (or press +) to build it into the open asset; the
        Bricks tab adds single bricks. Characters and NPCs live in the Characters studio.
      </div>
    </section>
  );
}

/** P32: the bricks to build with: click a piece (then click the plate), or drag it straight onto the plate. */
function PlateBricks({ ed }: { ed: EditorState }) {
  const b = ed.brush.value;
  const set = (patch: Partial<typeof b>) => {
    ed.brush.value = { ...b, ...patch };
    if (patch.type && ed.tool.value !== 'place') ed.tool.value = 'place';
  };
  return (
    <div class="scroll plate-bricks">
      <BrickPicker type={b.type} color={b.color} rot={b.rot} onPick={(type) => set({ type })} draggable />
      <span class="muted small">Turned {b.rot * 90}° (T)</span>
      <Swatches value={b.color} onPick={(color) => set({ color })} />
      <div class="hint">
        Click a piece, then click the build plate (Place bricks, B), or drag the piece straight onto the plate. T turns
        it a quarter turn first.
      </div>
    </div>
  );
}

function Properties({
  c,
  def,
  patch,
  reset,
  openedAs,
  socket,
  setSocket,
  selectedIndexes,
}: {
  c: ActionCtx;
  def: Asset;
  patch: (p: Partial<Asset>, label?: string) => unknown;
  /** puts a changed built-in asset back as it came with the engine */
  reset: (to: Asset, label: string) => void;
  /** the asset as it was when it was opened (for your own assets' reset) */
  openedAs: Asset | null;
  socket: string | null;
  setSocket: (s: string | null) => void;
  /** P32: asset brick indexes of the bricks selected on the plate */
  selectedIndexes: () => number[];
}) {
  const { ed } = c;
  const inProject = ed.store.has(paths.asset(def.id));
  const setPart = (i: number, next: NonNullable<Asset['parts']>[number], label: string) =>
    patch({ parts: (def.parts ?? []).map((q, j) => (j === i ? next : q)) }, label);
  const used = inProject ? mapsUsing(ed.store, def.id).length : 0;
  const [newState, setNewState] = useState('');
  // P32: a changed asset can go back: a built-in to how it came, your own to how it was when you opened it
  const builtin = def.origin === 'builtin' && inProject ? builtinAsset(def.id) : null;
  const original = builtin ?? (inProject ? openedAs : null);
  const changed = !!original && !sameAsset(original, def);
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
                ed.notify(
                  `Click in the map to place ${def.name}. Press T to turn it a quarter turn before you put it down.`,
                );
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
          {changed && (
            <button
              type="button"
              class="btn"
              data-help="assets.reset"
              data-tip="Put this built-in asset back as it came with the engine (every placed copy changes back too). Undo brings your version back."
              onClick={() => reset(original!, builtin ? 'Reset to built-in' : 'Reset asset')}
            >
              {builtin ? 'Reset to built-in' : 'Reset to when I opened it'}
            </button>
          )}
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

        <div class="sec" data-tour="asset-parts">
          <div class="sech">
            <span>Turned parts</span>
            <span>{def.parts?.length ?? 0}</span>
          </div>
          {(def.parts ?? []).map((p, i) => (
            <>
              <div class="socket-row">
                <span class="small">
                  <strong>{p.name}</strong> · {p.bricks.length} brick{p.bricks.length === 1 ? '' : 's'}
                  {p.tilt ? ` · ${p.tilt.map((a) => `${a}°`).join(' ')}` : ''}
                  {p.scale ? ` · ${p.scale.map((v) => `${Math.round(v * 100)}%`).join(' ')}` : ''}
                </span>
                {!p.pose && def.states.length > 1 && (
                  <button
                    type="button"
                    class="btn"
                    style={{ minHeight: '24px', fontSize: '11px' }}
                    data-tip="Give this part a pose in each state: it eases there when the state changes"
                    onClick={() => setPart(i, { ...p, pose: {} }, 'Make part move')}
                  >
                    Moves
                  </button>
                )}
                <button
                  type="button"
                  class="btn"
                  style={{ minHeight: '24px', fontSize: '11px' }}
                  data-tip="Put these bricks back straight and at their real size"
                  onClick={() => {
                    const next = (def.parts ?? []).filter((_, j) => j !== i);
                    patch({ parts: next.length ? next : undefined }, 'Straighten part');
                  }}
                >
                  Straighten
                </button>
              </div>
              {p.pose && (
                <MovingPart def={def} part={p} index={i} onChange={(next, label) => setPart(i, next, label)} />
              )}
            </>
          ))}
          <button
            type="button"
            class="btn"
            data-tour="part-from-selection"
            disabled={!selectedIndexes().length}
            onClick={() => {
              const idx = selectedIndexes();
              const taken = new Set(idx);
              const rest = (def.parts ?? [])
                .map((q) => ({ ...q, bricks: q.bricks.filter((k) => !taken.has(k)) }))
                .filter((q) => q.bricks.length);
              patch(
                { parts: [...rest, { name: `Part ${rest.length + 1}`, bricks: idx, pose: {} }] },
                'Make a moving part',
              );
            }}
          >
            Selected bricks → moving part
          </button>
          <div class="hint">
            Select some bricks (a roof, a branch, a wheel), then turn them with Rotate (E) on the red, green and blue
            rings, or size them with Resize (Q). They become a part that every copy shows turned. A part that moves (a
            lid, a door, a drawbridge) has a pose in each state: pick a state above the plate to see it there.
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

        <div class="sec" data-tour="asset-interactions">
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
                choices={actionChoices(ed)}
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

        {/* P9a: health — how many hits it takes, what each kind of hit does, what happens at zero */}
        {shows(ed, 'section', 'asset.health') && (
          <div class="sec" data-tour="asset-health-sec">
            <div class="sech">
              <span>
                Health
                <FieldHelp
                  label="Health"
                  text="How much it takes to break it. Without health one hit smashes it (when it can be smashed); with health it takes several, some kinds of hit do more or nothing, and at zero it breaks, leaves an item and sends an event."
                />
              </span>
              {def.health && (
                <button
                  type="button"
                  class="link"
                  aria-label="Remove health"
                  onClick={() => {
                    const { health: _h, ...rest } = def;
                    reset(rest as Asset, 'Remove health');
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {def.health ? (
              <HealthFields
                ed={ed}
                tour="asset-health"
                health={def.health}
                onChange={(health, label) => patch({ health }, label)}
              />
            ) : (
              <>
                <p class="hint">No health: one hit smashes it{def.smash.enabled ? '' : ' (when it can be smashed)'}.</p>
                <MakeBreakable
                  tour="make-breakable"
                  onPick={(health, name) =>
                    patch({ health, smash: { ...def.smash, enabled: true } }, `Make breakable: ${name}`)
                  }
                />
              </>
            )}
          </div>
        )}

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

/**
 * P32: why a change to an asset was refused, in words that say what to do. Changing an asset changes every
 * placed copy, so a copy that would run into something on its map stops the change.
 */
function whyNotSaved(ed: EditorState, next: Asset, error: string): string {
  const maps = ed.store.has(paths.asset(next.id)) ? mapsUsing(ed.store, next.id) : [];
  if (!maps.length || !/overlap|float|support|studs/i.test(error)) return error;
  const names = maps.map((m) => ed.maps.value.find((x) => x.id === m)?.name ?? 'a map');
  const what = /overlap/i.test(error)
    ? 'it would run into something next to it'
    : 'a piece of it would have nothing under it to stand on';
  return `${next.name} is placed on ${names.join(', ')}, and that copy changes too: ${what}. Your change was taken back. Move that copy to open ground in the Scene, or keep your change as a new asset.`;
}

/** The asset's parts as plate brick ids (the plate's ids map to asset indexes through indexOf). */
function studioParts(def: Asset, indexOf: Map<number, number>, state: string): StudioPart[] {
  const idOf = new Map([...indexOf].map(([id, i]) => [i, id]));
  return (def.parts ?? []).map((p, index) => ({
    index,
    name: p.name,
    ids: p.bricks.flatMap((i) => (idOf.has(i) ? [idOf.get(i)!] : [])),
    ...(p.tilt ? { tilt: p.tilt as Tilt } : {}),
    ...(p.scale ? { scale: p.scale as Scale } : {}),
    // P32: a moving part stands on the plate as it does in the state shown
    ...(p.pose ? { pose: partPose(p, state), ...(p.hinge ? { hinge: p.hinge } : {}) } : {}),
  }));
}

type Part = NonNullable<Asset['parts']>[number];
/** Hinge choices for a moving part: the middle, or an edge of the part's bottom (asset frame, like sockets). */
export function hingeChoices(def: Asset, part: Pick<Part, 'bricks'>): { name: string; at: [number, number, number] }[] {
  // every brick of the asset, whatever state it shows in (brick id = asset index)
  const all = expandAsset({ ...def, onlyIn: undefined }, { pos: [0, 0, 0], rot: 0, idBase: 0 }).bricks;
  const mine = all.filter((b) => part.bricks.includes(b.id));
  if (!mine.length) return [];
  const [lo, hi] = bricksBox(mine);
  const mid = (a: number, b: number) => Math.round(((a + b) / 2) * 100) / 100;
  const r = (v: number) => Math.round(v * 100) / 100;
  const y = r(lo[1]);
  return [
    { name: 'Its middle', at: [mid(lo[0], hi[0]), mid(lo[1], hi[1]), mid(lo[2], hi[2])] },
    { name: 'Back bottom edge', at: [mid(lo[0], hi[0]), y, r(lo[2])] },
    { name: 'Front bottom edge', at: [mid(lo[0], hi[0]), y, r(hi[2])] },
    { name: 'Left bottom edge', at: [r(lo[0]), y, mid(lo[2], hi[2])] },
    { name: 'Right bottom edge', at: [r(hi[0]), y, mid(lo[2], hi[2])] },
    { name: 'Bottom middle', at: [mid(lo[0], hi[0]), y, mid(lo[2], hi[2])] },
  ];
}

/** P32: how a part moves between the asset's states — its pose in each state, the hinge and the ease time. */
function MovingPart({
  def,
  part,
  index,
  onChange,
}: {
  def: Asset;
  part: Part;
  index: number;
  onChange: (next: Part, label: string) => void;
}) {
  const hinges = hingeChoices(def, part);
  const hingeName =
    hinges.find((h) => part.hinge && h.at.every((v, k) => Math.abs(v - part.hinge![k]!) < 0.01))?.name ??
    (part.hinge ? 'Custom' : 'Its middle');
  const pose = (st: string) => part.pose?.[st] ?? {};
  const setPose = (st: string, key: 'turn' | 'move', k: number, v: number) => {
    const cur = pose(st);
    const vec = [...(cur[key] ?? [0, 0, 0])] as [number, number, number];
    vec[k] = v;
    const nextPose = { ...cur, [key]: vec };
    const clean = Object.fromEntries(
      Object.entries(nextPose).filter(([, x]) => (x as number[]).some((n) => Math.abs(n) > 1e-6)),
    );
    const all = { ...(part.pose ?? {}), [st]: clean };
    onChange({ ...part, pose: all }, 'Part pose');
  };
  return (
    <div class="moving-part" data-tour={`part-${index}`}>
      <div class="small muted">Moves between states (each copy eases there when its state changes):</div>
      {def.states.map((st) => (
        <div class="pose-row" role="group" aria-label={`${part.name} in “${st}”`} data-tour={`pose-${index}-${st}`}>
          <span class="small mono">{st}</span>
          {(['x', 'y', 'z'] as const).map((ax, k) => (
            <Num
              label={`turn ${ax}°`}
              value={pose(st).turn?.[k] ?? 0}
              onCommit={(v) => setPose(st, 'turn', k, Math.max(-360, Math.min(360, v)))}
            />
          ))}
          {(['x', 'y', 'z'] as const).map((ax, k) => (
            <Num
              label={`move ${ax}`}
              value={pose(st).move?.[k] ?? 0}
              onCommit={(v) => setPose(st, 'move', k, Math.max(-50, Math.min(50, v)))}
            />
          ))}
        </div>
      ))}
      <div class="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
        <label class="lbl small">
          Turns around
          <select
            class="inp"
            aria-label={`${part.name} turns around`}
            value={hingeName}
            onChange={(e) => {
              const h = hinges.find((x) => x.name === (e.target as HTMLSelectElement).value);
              if (!h) return;
              const { hinge: _h, ...rest } = part;
              onChange(h.name === 'Its middle' ? rest : { ...rest, hinge: h.at }, 'Part hinge');
            }}
          >
            {hinges.map((h) => (
              <option value={h.name}>{h.name}</option>
            ))}
            {hingeName === 'Custom' && <option value="Custom">Custom</option>}
          </select>
        </label>
        <Num
          label="seconds"
          value={part.ease ?? 0.6}
          onCommit={(v) => onChange({ ...part, ease: Math.max(0, Math.min(10, v)) }, 'Part ease')}
        />
      </div>
    </div>
  );
}
