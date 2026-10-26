import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BUILTIN_CLIPS } from '../../../builtin/clips';
import type { ResolvedBody } from '../../../core/character/resolve';
import { CommandBus, registerAll } from '../../../core/commands';
import { Autosave } from '../../../core/project/autosave';
import { MemoryBackend } from '../../../core/project/backend';
import { ProjectStore } from '../../../core/project/store';
import type { Asset, Clip } from '../../../core/schema';
import { EditorState } from '../../state';
import type { ViewportApi } from '../../viewport/active';
import { Viewport } from '../../viewport/Viewport';
import { scratchFor } from '../asset-studio/scratch';
import { CharacterPreview, type PreviewInput } from './CharacterPreview';

/**
 * Before using a match from From a picture: a big preview of it to look at from every side. Drag to turn it, scroll
 * to zoom (right-drag pans a map). A character turns on its own (Turntable) and tries moves (a creature walks); an
 * asset shows each of its states (a door closed and open); a map is shown whole, built exactly as Make this map will
 * make it. Nothing is added to the game until Use.
 */
export type PreviewWhat =
  | { kind: 'character'; name: string; profile: Record<string, unknown>; body: ResolvedBody | null }
  | { kind: 'asset'; name: string; def: Asset }
  | { kind: 'map'; name: string; store: ProjectStore; map: string; notes: string[] };

const TRY: [string, string][] = [
  ['clp_emotewave0', 'Wave'],
  ['clp_emotecheer', 'Cheer'],
  ['clp_cbspin0000', 'Spin attack'],
  ['clp_cbjumpatk0', 'Jump attack'],
  ['clp_cbroll0000', 'Roll'],
];

/** an editor of its own over a scratch project (the preview never touches the game) */
function scratchEditor(store: ProjectStore, map?: string): EditorState {
  const bus = registerAll(new CommandBus(store));
  const autosave = new Autosave(store, new MemoryBackend(), { setTimer: () => null, clearTimer: () => {} });
  const ed = new EditorState({ store, bus, autosave, backend: new MemoryBackend() });
  if (map) ed.openMap(map);
  ed.tool.value = 'select';
  return ed;
}

export function FromPicturePreview({
  what,
  onClose,
  onUse,
  onPlace,
  useLabel,
}: {
  what: PreviewWhat;
  onClose(): void;
  onUse(): void;
  onPlace?: () => void;
  useLabel: string;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  return (
    <div class="fp-preview" role="region" aria-label={`Preview: ${what.name}`} data-tour="fp-preview">
      <div class="fp-preview-head row">
        <button type="button" class="btn small" data-tour="fp-preview-back" onClick={onClose}>
          ◀ Back to the matches
        </button>
        <b class="fp-preview-name">{what.name}</b>
        <span class="muted small">
          Drag to turn it, scroll to zoom{what.kind === 'map' ? ', right-drag to move' : ''}.
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" class="btn on" data-tour="fp-preview-use" onClick={onUse}>
          {useLabel}
        </button>
        {onPlace && (
          <button type="button" class="btn" data-tour="fp-preview-place" onClick={onPlace}>
            Use and place on the map
          </button>
        )}
      </div>
      {what.kind === 'character' && <CharacterView what={what} />}
      {what.kind === 'asset' && <AssetView def={what.def} />}
      {what.kind === 'map' && <MapView what={what} />}
    </div>
  );
}

function CharacterView({ what }: { what: Extract<PreviewWhat, { kind: 'character' }> }) {
  const [turntable, setTurntable] = useState(true);
  const [walking, setWalking] = useState(false);
  const [clipId, setClipId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const clip: Clip | null = clipId ? (BUILTIN_CLIPS.find((c) => c.id === clipId) ?? null) : null;
  const input = useRef<PreviewInput>({ profile: what.profile, clip: null, time: 0, turntable: true });
  input.current = {
    profile: what.profile,
    clip: what.body ? null : clip,
    time,
    turntable,
    body: what.body,
    walking: !!what.body && walking,
  };
  // a move plays once in real time
  useEffect(() => {
    if (!clip) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= clip.length) {
        setClipId(null);
        setTime(0);
        return;
      }
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clipId]);
  return (
    <>
      <div class="fp-preview-tools row" role="group" aria-label="Try it">
        <label class="lbl small">
          <input
            type="checkbox"
            checked={turntable}
            data-tour="fp-preview-turntable"
            onChange={() => setTurntable(!turntable)}
          />{' '}
          Turntable
        </label>
        {what.body ? (
          <button
            type="button"
            class={`chip ${walking ? 'on' : ''}`}
            aria-pressed={walking}
            data-tour="fp-preview-walk"
            onClick={() => setWalking(!walking)}
          >
            {walking ? '■ Stop' : '▶ Walk'}
          </button>
        ) : (
          TRY.map(([id, label]) => (
            <button
              type="button"
              class={`chip ${clipId === id ? 'on' : ''}`}
              data-tour={`fp-preview-try-${label.toLowerCase().replace(/ /g, '-')}`}
              onClick={() => {
                setClipId(id);
                setTime(0);
              }}
            >
              {label}
            </button>
          ))
        )}
      </div>
      <div class="fp-preview-view viewport-wrap">
        <CharacterPreview input={input} />
      </div>
    </>
  );
}

function AssetView({ def }: { def: Asset }) {
  const [state, setState] = useState(def.initialState);
  const ed = useMemo(() => {
    const s = scratchFor(def, state);
    return scratchEditor(new ProjectStore(s.files), s.mapId);
  }, [def, state]);
  const api = useRef<ViewportApi | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api.current?.fit(), 120);
    return () => clearTimeout(t);
  }, [ed]);
  return (
    <>
      <div class="fp-preview-tools row">
        <span class="muted small">
          {def.bricks.length} bricks · {def.footprint[0]} × {def.footprint[1]} studs
        </span>
        {def.states.length > 1 && (
          <span class="group" role="radiogroup" aria-label="Showing state">
            {def.states.map((s) => (
              <button
                type="button"
                role="radio"
                aria-checked={s === state}
                class={`btn small ${s === state ? 'on' : ''}`}
                data-tour={`fp-preview-state-${s}`}
                onClick={() => setState(s)}
              >
                {s}
              </button>
            ))}
          </span>
        )}
      </div>
      <div class="fp-preview-view">
        <Viewport key={state} ed={ed} mode="scene" api={(a) => (api.current = a)} />
      </div>
    </>
  );
}

function MapView({ what }: { what: Extract<PreviewWhat, { kind: 'map' }> }) {
  const ed = useMemo(() => scratchEditor(what.store, what.map), [what.store, what.map]);
  const api = useRef<ViewportApi | null>(null);
  useEffect(() => {
    const t = setTimeout(() => api.current?.fit(), 200);
    return () => clearTimeout(t);
  }, [ed]);
  return (
    <>
      {what.notes.length > 0 && (
        <div class="fp-preview-tools row">
          <span class="muted small" role="status">
            {what.notes.join(' ')}
          </span>
        </div>
      )}
      <div class="fp-preview-view">
        <Viewport ed={ed} mode="scene" api={(a) => (api.current = a)} />
      </div>
    </>
  );
}
