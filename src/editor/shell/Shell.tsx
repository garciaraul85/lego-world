import { useEffect, useRef, useState } from 'preact/hooks';
import { ACTIONS, type ActionCtx, action, type EditorAction, MENUS, runAction } from '../actions/registry';
import type { EditorState, ToolId } from '../state';

export function MenuBar({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const open = ed.menu.value;
  const [pos, setPos] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.popmenu,.menu-tab')) ed.menu.value = null;
    };
    window.addEventListener('pointerdown', close);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const s = ed.save.value;
  const label =
    s.state === 'saved'
      ? 'Saved to device'
      : s.state === 'saving'
        ? 'Saving…'
        : s.state === 'error'
          ? 'Save failed — retrying'
          : `Unsaved changes (${s.dirty})`;
  ed.revision.value;
  return (
    <div class="menubar">
      <div class="brand">
        <i aria-hidden="true" />
        <span class="name">Brick Worlds Engine</span>
      </div>
      <nav class="menus" aria-label="Menu">
        {Object.keys(MENUS).map((m) => (
          <button
            type="button"
            class={`tab menu-tab ${open === m ? 'on' : ''}`}
            aria-expanded={open === m}
            aria-haspopup="menu"
            data-tour={`menu-${m.toLowerCase()}`}
            onClick={(e) => {
              setPos((e.currentTarget as HTMLElement).getBoundingClientRect().left);
              ed.menu.value = open === m ? null : m;
            }}
          >
            {m}
          </button>
        ))}
      </nav>
      <div class="right">
        <span class="mono projname" title="Project name">
          {ed.store.manifest.name}
        </span>
        <span class="chip" role="status" aria-live="polite">
          <span class={`dot ${s.state}`} aria-hidden="true" />
          <span class="label">{label}</span>
        </span>
      </div>
      {open && (
        <div
          class="popmenu"
          role="menu"
          ref={menuRef}
          style={{ top: '36px', left: `${Math.min(pos, window.innerWidth - 290)}px` }}
        >
          {(MENUS[open] ?? []).length === 0 && (
            <div class="muted" style={{ padding: '6px 10px' }}>
              Asset creation arrives with the Asset studio (Phase 3).
            </div>
          )}
          {(MENUS[open] ?? []).map((id, i) =>
            id === '-' ? <div class="sep" key={`s${i}`} /> : <MenuItem key={id} a={action(id)} c={c} />,
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ a, c }: { a: EditorAction; c: ActionCtx }) {
  const disabled = !a.later && a.when ? !a.when(c) : false;
  return (
    <button
      type="button"
      class="mi"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        c.ed.menu.value = null;
        runAction(a, c);
      }}
    >
      <span>{a.label}</span>
      {a.later ? <span class="later">{a.later}</span> : <span class="k">{a.key ?? ''}</span>}
    </button>
  );
}

export const WORKSPACES = [
  ['Scene', null],
  ['World graph', null],
  ['Logic', null],
  ['Characters', null],
  ['Assets', null],
  ['Screens', null],
  ['Cinematics', null],
  ['Audio', null],
] as const;

export function WorkspaceTabs({ current, onPick }: { current: string; onPick: (w: string) => void }) {
  return (
    <nav class="workspaces" aria-label="Workspaces" data-tour="workspaces">
      {WORKSPACES.map(([w, later]) => (
        <button
          type="button"
          class={`tab ${current === w ? 'on' : ''}`}
          aria-current={current === w ? 'page' : undefined}
          data-tour={`ws-${w.toLowerCase().replace(/ /g, '-')}`}
          title={later ? `Full workspace in ${later}` : undefined}
          onClick={() => onPick(w)}
        >
          {w}
        </button>
      ))}
    </nav>
  );
}

export const TOOLS: { id: ToolId; glyph: string; label: string; key: string; help: string; later?: string }[] = [
  {
    id: 'select',
    glyph: '↖',
    label: 'Select',
    key: 'V',
    help: 'Select: click an object (Alt: one brick, Shift: add). Drag to orbit, right-drag to pan.',
  },
  {
    id: 'move',
    glyph: '✥',
    label: 'Move',
    key: 'W',
    help: 'Move: drag a selected object across the ground; arrows nudge, PgUp/PgDn change height.',
  },
  {
    id: 'rotate',
    glyph: '↻',
    label: 'Rotate 90°',
    key: 'E',
    help: 'Rotate: click an object to turn it a quarter (Alt: one brick).',
  },
  {
    id: 'place',
    glyph: '▦',
    label: 'Brick paint',
    key: 'B',
    help: 'Brick paint: click to place the brush brick. T turns it; pick shape and color in the dock.',
  },
  {
    id: 'asset',
    glyph: '⌂',
    label: 'Place asset',
    key: 'A',
    help: 'Place asset: click to put down the asset picked in Assets › Assets. T turns it.',
  },
  {
    id: 'paint',
    glyph: '◐',
    label: 'Color paint',
    key: 'C',
    help: 'Color paint: click an object to recolor it with the brush color (Alt: one brick).',
  },
  {
    id: 'erase',
    glyph: '⌫',
    label: 'Erase',
    key: 'X',
    help: 'Erase: click a brick to remove it (Shift: whole object). Supporting bricks are protected.',
  },
  {
    id: 'spawn',
    glyph: '⚑',
    label: 'Spawn point',
    key: 'P',
    help: 'Spawn point: click open ground to add one, facing the way the camera looks.',
  },
  {
    id: 'zone',
    glyph: '⬚',
    label: 'Trigger zone',
    key: 'Z',
    help: 'Trigger zone: drag on the ground to draw a zone; logic reacts when the hero walks in or out.',
  },
  {
    id: 'sound',
    glyph: '♫',
    label: 'Sound emitter',
    key: 'S',
    help: 'Sound emitter: click the ground to place a looping or repeating sound. Music and ambience zones: pick a zone’s Music in the Inspector.',
  },
  {
    id: 'ui',
    glyph: '▭',
    label: 'World UI',
    key: 'U',
    help: 'World UI: click to place a sign above the ground; its text can show {variables} while playing.',
  },
];

export function Toolbar({ c }: { c: ActionCtx }) {
  const { ed, ui } = c;
  ed.revision.value;
  const tool = TOOLS.find((t) => t.id === ed.tool.value) ?? TOOLS[0]!;
  return (
    <div class="toolbar">
      <div class="group" role="group" aria-label="Tools" data-tour="tools">
        {TOOLS.map((t) => (
          <button
            type="button"
            class={`btn icon ${ed.tool.value === t.id ? 'on' : ''}`}
            aria-label={`${t.label} (${t.key})`}
            aria-pressed={ed.tool.value === t.id}
            title={t.later ? `${t.label} — ${t.later}` : `${t.label} (${t.key})`}
            disabled={!!t.later}
            onClick={() => {
              ed.tool.value = t.id;
              ed.persistUi();
            }}
          >
            <span aria-hidden="true" class="mono">
              {t.glyph}
            </span>
          </button>
        ))}
      </div>
      <span class="toolhint opt" title={tool.help}>
        {tool.help}
      </span>
      <div class="group" role="group" aria-label="Play controls" data-tour="play">
        <button
          type="button"
          class="btn go"
          onClick={() => (ed.session.value ? ui.stopPlay() : ui.play('engine'))}
          title={
            ed.session.value
              ? 'Stop playing (Esc)'
              : 'Play from the start spawn (F5) · Shift F5 plays from the selected spawn'
          }
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 1l9 5-9 5z" fill="currentColor" />
          </svg>
          {ed.session.value ? 'Stop' : 'Play'}
        </button>
        <button
          type="button"
          class="btn opt"
          onClick={() => ui.play('v68')}
          title="Play in the LEGO World v68 runtime: guns, magic, super powers and the volcano still run there (F6)"
        >
          Play in v68
        </button>
        <button
          type="button"
          class="btn opt"
          onClick={() => ui.play('edit')}
          title="Open in LEGO World v68: characters and neighbors are still edited there (Shift F6)"
        >
          v68 studio
        </button>
      </div>
      <label class="group lbl" data-tour="map-select">
        Map
        <select
          class="inp"
          style={{ width: '180px' }}
          value={ed.mapId.value}
          onChange={(e) => ed.openMap((e.target as HTMLSelectElement).value)}
        >
          {ed.maps.value.map((m) => (
            <option value={m.id}>
              {m.name}
              {m.generator ? ` · ${m.generator.environments.join(' + ')}` : ' · free build'}
            </option>
          ))}
        </select>
      </label>
      <div class="group">
        <button type="button" class="btn" disabled={!ed.bus.canUndo()} onClick={() => ed.undo()} title="Undo (Ctrl Z)">
          Undo
        </button>
        <button
          type="button"
          class="btn"
          disabled={!ed.bus.canRedo()}
          onClick={() => ed.redo()}
          title="Redo (Ctrl Shift Z)"
        >
          Redo
        </button>
      </div>
      <div class="group opt">
        <button type="button" class="btn ai" onClick={() => runAction(action('help.ai'), c)}>
          ✦ AI builder
        </button>
        <button type="button" class="btn icon" aria-label="Keyboard shortcuts" onClick={() => ui.showShortcuts()}>
          ?
        </button>
      </div>
    </div>
  );
}

export function StatusBar({ ed }: { ed: EditorState }) {
  const sel = ed.selectedBricks.value;
  const cur = ed.cursor.value;
  const m = ed.mapDoc.value;
  const s = ed.save.value;
  ed.revision.value;
  const groups = new Set(sel.map((b) => b.group ?? '')).size;
  return (
    <div class="statusbar" role="status">
      <span>
        {sel.length
          ? `Selected: ${sel.length} brick${sel.length === 1 ? '' : 's'}${groups === 1 && sel[0]?.group ? ` · ${sel[0].group}` : ''}`
          : ed.selectedSpawn.value
            ? 'Selected: spawn point'
            : 'Nothing selected'}
      </span>
      <span>{cur ? `Cursor: X ${cur.x} · Z ${cur.z} · H ${cur.y}` : 'Cursor: —'}</span>
      <span>
        {m?.name} · {ed.maps.value.length} map{ed.maps.value.length === 1 ? '' : 's'} · {m?.spawns.length ?? 0} spawns
      </span>
      <span class="end">
        {s.state === 'saved'
          ? 'All changes saved'
          : s.state === 'error'
            ? `Save error: ${s.error}`
            : `${s.dirty} file(s) waiting to save`}
      </span>
    </div>
  );
}

export function Toast({ ed }: { ed: EditorState }) {
  const t = ed.toast.value;
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => (ed.toast.value = null), t.error ? 5000 : 3000);
    return () => clearTimeout(h);
  }, [t]);
  if (!t) return null;
  return (
    <div class={`toast ${t.error ? 'error' : ''}`} role={t.error ? 'alert' : 'status'}>
      {t.msg}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: preact.ComponentChildren;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div class="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="btn icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div class="content">{children}</div>
      </div>
    </div>
  );
}

export function CommandPalette({ c }: { c: ActionCtx }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  const run = (a: EditorAction) => {
    c.ed.palette.value = false;
    runAction(a, c);
  };
  return (
    <Modal title="Command palette" onClose={() => (c.ed.palette.value = false)}>
      <input
        class="inp"
        placeholder="Type a command…"
        ref={(el) => el?.focus()}
        value={q}
        onInput={(e) => {
          setQ((e.target as HTMLInputElement).value);
          setI(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setI(Math.min(list.length - 1, i + 1));
          if (e.key === 'ArrowUp') setI(Math.max(0, i - 1));
          if (e.key === 'Enter' && list[i]) run(list[i]);
        }}
        aria-label="Search commands"
      />
      <div class="palette-list" role="listbox">
        {list.map((a, k) => (
          <button
            type="button"
            class="mi"
            role="option"
            aria-selected={k === i}
            style={k === i ? { background: 'var(--btnh)' } : undefined}
            onClick={() => run(a)}
          >
            <span>{a.label}</span>
            <span class="k">{a.later ?? a.key ?? ''}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function Shortcuts({ onClose }: { onClose: () => void }) {
  const keyed = ACTIONS.filter((a) => a.key && !a.later);
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div class="muted">
        Mouse: left-drag orbits, right-drag or Shift-drag pans, wheel zooms. Touch: one finger orbits, two fingers pan
        and pinch.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px' }}>
        {keyed.map((a) => [
          <span>{a.label}</span>,
          <span class="mono" style={{ color: 'var(--acc2)' }}>
            {a.key}
          </span>,
        ])}
      </div>
    </Modal>
  );
}
