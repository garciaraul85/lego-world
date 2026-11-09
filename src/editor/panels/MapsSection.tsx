/**
 * Milestone 3b (B7a-1): Project › Maps — how the game's maps look: the pause map (and the one dungeons use) and the
 * map in play. Each has a type (after a Zelda game) and its colours, frame, icons, fog and markers, with a live
 * preview drawn from the start map.
 */
import { useEffect, useRef } from 'preact/hooks';
import { expandInstances } from '../../core/assets/instances';
import {
  FOGS,
  FRAMES,
  type FullMini,
  type FullPause,
  ICON_SETS,
  MARKER_KINDS,
  MARKER_LABELS,
  type MapColors,
  type MapLooks,
  MINI_TYPE_INFO,
  MINI_TYPES,
  type MiniLook,
  miniLookOf,
  PAUSE_TYPE_INFO,
  PAUSE_TYPES,
  type PauseLook,
  pauseLookOf,
} from '../../core/maps/look';
import type { ProjectStore } from '../../core/project/store';
import { BRICK_STRIDE, type Chunk, chunkRows, type MapDoc, paths, type Settings } from '../../core/schema';
import { drawMini, drawPause } from '../../engine/maps/draw';
import { type MapMarker, type MapModel, type MapPiece, mapModel } from '../../engine/maps/model';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';

export const MAPS_HELP =
  'How the game’s maps look. The pause map opens with M (or Map on the pause screen): pick its type — each is after a Zelda game — and its colours, frame, icons and fog. Dungeons have their own (a room plan, floor by floor, by default). The map in play is the HUD’s Minimap (where it sits is the HUD screen’s). Markers: what they show — chests (opened or not), keys, the boss, locked doors, ways out, region names (zones with Show name on the maps), people, the player’s pins, and where to go next. A map can choose its own in its Map tab.';

const COLOR_LABELS: Record<keyof MapColors, string> = {
  back: 'Paper / ground',
  water: 'Water',
  wall: 'Walls / land',
  fog: 'Fog',
  ink: 'Ink',
  accent: 'Highlight',
};

/** a model of a map for previews, from the project's files: its bricks, its markers, the hero at its start */
export function previewModel(store: ProjectStore, mapId: string): MapModel {
  const pieces: MapPiece[] = [];
  for (const p of store.list(paths.chunkDir(mapId))) {
    const c = store.get<Chunk>(p)!;
    const r = chunkRows(c);
    const dims = c.palette.types.map((t) => {
      const m = /(\d+)x(\d+)$/.exec(t);
      return [Number(m?.[1] ?? 1), Number(m?.[2] ?? 1)] as const;
    });
    for (let o = 0; o < r.length; o += BRICK_STRIDE) {
      const [rows, cols] = dims[r[o]!]!;
      pieces.push({
        x: r[o + 1]!,
        y: r[o + 2]!,
        z: r[o + 3]!,
        rows,
        cols,
        turn: r[o + 4]!,
        color: 0,
        hex: c.palette.colors[r[o + 5]!],
      });
    }
  }
  const markers: MapMarker[] = [];
  for (const e of expandInstances(store, mapId)) {
    for (const b of e.bricks)
      pieces.push({ x: b.x, y: b.y, z: b.z, rows: 1, cols: 1, turn: 0, color: 0, hex: b.color });
    const box = e.box;
    if (!box) continue;
    const y0 = Math.min(...e.bricks.map((b) => b.y));
    const at = { x: (box[0] + box[2]) / 2, z: (box[1] + box[3]) / 2, y: (Number.isFinite(y0) ? y0 : 0) * 0.4 };
    if (/chest/i.test(e.def.name) && e.def.states.length >= 2) markers.push({ kind: 'chest', ...at });
    else if (e.def.pickup && /^(small key|boss key)$/i.test(e.def.pickup.item))
      markers.push({ kind: /boss/i.test(e.def.pickup.item) ? 'boss-key' : 'key', ...at });
    else if (e.def.lock && e.def.lock.key !== 'item')
      markers.push({ kind: e.def.lock.key === 'boss' ? 'boss-door' : 'door', ...at });
  }
  const doc = store.get<MapDoc>(paths.map(mapId));
  for (const zn of doc?.zones ?? [])
    if (zn.tags.includes('region') && zn.tags[0] && zn.tags[0] !== 'region')
      markers.push({ kind: 'name', x: (zn.min[0] + zn.max[0]) / 2, z: (zn.min[2] + zn.max[2]) / 2, label: zn.tags[0] });
  const sp = doc?.spawns[0];
  const hero = sp ? { x: sp.pos[0], y: sp.pos[1], z: sp.pos[2], heading: sp.yaw } : { x: 0, y: 0, z: 0, heading: 0 };
  // (a sample: where to go next and a pin, so their look shows)
  markers.push({ kind: 'goal', x: hero.x + 18, z: hero.z - 12 });
  markers.push({ kind: 'pin', x: hero.x - 14, z: hero.z + 8, stamp: 'star' });
  return mapModel({
    mapId,
    name: doc?.name ?? 'Map',
    pieces,
    dungeon: !!doc?.dungeon,
    seen: null,
    hasMap: true,
    hasCompass: true,
    markers,
    hero,
  });
}

/** a live picture of a look on a map */
export function MapPreview({
  model,
  pause,
  mini,
  w,
  h,
  label,
}: {
  model: MapModel;
  pause?: FullPause;
  mini?: FullMini;
  w: number;
  h: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (pause) drawPause(g, w, h, model, pause, { t: 0 });
    else if (mini) drawMini(g, Math.min(w, h), model, mini, 0, 0);
  });
  return <canvas ref={ref} width={w} height={h} role="img" aria-label={label} class="map-look-preview" />;
}

export function MapsSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const looks: MapLooks = ed.store.get<Settings>(paths.settings)?.maps ?? {};
  const save = (next: MapLooks, label: string) =>
    ed.exec({ type: 'project.update', payload: { maps: next } }, { label });
  const model = previewModel(ed.store, ed.store.manifest.entry.map);
  const pause = looks.pause ?? { type: 'parchment' as const };
  const dungeon = looks.dungeon ?? { type: 'floors' as const };
  const mini = looks.mini ?? { type: 'square' as const };
  return (
    <div class="sec" data-tour="project-maps" data-help="project.maps">
      <div class="sech">
        <span>
          Maps
          <FieldHelp label="Maps" text={MAPS_HELP} />
        </span>
      </div>
      <PauseEditor
        title="Pause map"
        which="pause"
        look={pause}
        full={pauseLookOf(looks, undefined, false)}
        model={model}
        onChange={(l, what) => save({ ...looks, pause: l }, `Pause map: ${what}`)}
      />
      <PauseEditor
        title="Pause map in dungeons"
        which="dungeon"
        look={dungeon}
        full={pauseLookOf(looks, undefined, true)}
        model={model}
        onChange={(l, what) => save({ ...looks, dungeon: l }, `Dungeon map: ${what}`)}
      />
      <MiniEditor
        look={mini}
        full={miniLookOf(looks, undefined)}
        model={model}
        onChange={(l, what) => save({ ...looks, mini: l }, `Map in play: ${what}`)}
      />
    </div>
  );
}

function ColorRow<L extends { colors?: Partial<MapColors> }>({
  look,
  full,
  onChange,
  who,
}: {
  look: L;
  full: MapColors;
  onChange: (l: L, what: string) => void;
  who: string;
}) {
  return (
    <div class="map-look-colors">
      {(Object.keys(COLOR_LABELS) as (keyof MapColors)[]).map((k) => (
        <label class="map-look-color">
          <input
            type="color"
            aria-label={`${who} ${COLOR_LABELS[k]}`}
            value={full[k]}
            onChange={(e) =>
              onChange(
                { ...look, colors: { ...(look.colors ?? {}), [k]: (e.target as HTMLInputElement).value } },
                COLOR_LABELS[k],
              )
            }
          />
          <span class="small">{COLOR_LABELS[k]}</span>
        </label>
      ))}
      {look.colors && (
        <button
          type="button"
          class="link small"
          onClick={() => onChange({ ...look, colors: undefined }, 'type’s colours')}
        >
          Type’s colours
        </button>
      )}
    </div>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onPick: (v: T) => void;
}) {
  return (
    <label class="field">
      {label}
      <select
        class="inp"
        aria-label={label}
        value={value}
        onChange={(e) => onPick((e.target as HTMLSelectElement).value as T)}
      >
        {options.map((o) => (
          <option value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Markers({
  who,
  on,
  onChange,
}: {
  who: string;
  on: Partial<Record<string, boolean>>;
  onChange: (k: string, v: boolean) => void;
}) {
  return (
    <div class="map-look-markers">
      {MARKER_KINDS.map((k) => (
        <label class="check small">
          <input
            type="checkbox"
            aria-label={`${who} shows ${MARKER_LABELS[k]}`}
            checked={on[k] !== false}
            onChange={(e) => onChange(k, (e.target as HTMLInputElement).checked)}
          />
          {MARKER_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

function PauseEditor({
  title,
  which,
  look,
  full,
  model,
  onChange,
}: {
  title: string;
  which: 'pause' | 'dungeon';
  look: PauseLook;
  full: FullPause;
  model: MapModel;
  onChange: (l: PauseLook, what: string) => void;
}) {
  return (
    <fieldset class="map-look" aria-label={title} data-tour={`maps-${which}`}>
      <legend>{title}</legend>
      <div class="map-look-types" role="radiogroup" aria-label={`${title} type`}>
        {PAUSE_TYPES.map((t) => (
          <button
            type="button"
            role="radio"
            aria-checked={look.type === t}
            class={`map-look-type${look.type === t ? ' on' : ''}`}
            title={PAUSE_TYPE_INFO[t].about}
            onClick={() =>
              onChange({ type: t, ...(look.markers ? { markers: look.markers } : {}) }, PAUSE_TYPE_INFO[t].label)
            }
          >
            <MapPreview
              model={model}
              pause={pauseLookOf({ pause: { type: t } }, undefined, false)}
              w={96}
              h={64}
              label={PAUSE_TYPE_INFO[t].label}
            />
            <span class="small">{PAUSE_TYPE_INFO[t].label}</span>
          </button>
        ))}
      </div>
      <div class="hint small">{PAUSE_TYPE_INFO[look.type].about}</div>
      <MapPreview model={model} pause={full} w={300} h={190} label={`${title} preview`} />
      <div class="grid3">
        <Pick
          label="Frame"
          value={full.frame}
          options={FRAMES}
          onPick={(v) => onChange({ ...look, frame: v }, 'frame')}
        />
        <Pick
          label="Icons"
          value={full.icons}
          options={ICON_SETS}
          onPick={(v) => onChange({ ...look, icons: v }, 'icons')}
        />
        <Pick label="Fog" value={full.fog} options={FOGS} onPick={(v) => onChange({ ...look, fog: v }, 'fog')} />
      </div>
      <label class="check small">
        <input
          type="checkbox"
          aria-label={`${title} grid`}
          checked={full.grid}
          onChange={(e) => onChange({ ...look, grid: (e.target as HTMLInputElement).checked }, 'grid')}
        />
        A lettered grid over it
      </label>
      <ColorRow look={look} full={full.colors} who={title} onChange={onChange} />
      <Markers
        who={title}
        on={full.markers}
        onChange={(k, v) =>
          onChange(
            { ...look, markers: { ...(look.markers ?? {}), [k]: v } },
            MARKER_LABELS[k as keyof typeof MARKER_LABELS],
          )
        }
      />
    </fieldset>
  );
}

function MiniEditor({
  look,
  full,
  model,
  onChange,
}: {
  look: MiniLook;
  full: FullMini;
  model: MapModel;
  onChange: (l: MiniLook, what: string) => void;
}) {
  const title = 'Map in play';
  return (
    <fieldset class="map-look" aria-label={title} data-tour="maps-mini">
      <legend>{title}</legend>
      <div class="map-look-types" role="radiogroup" aria-label={`${title} type`}>
        {MINI_TYPES.map((t) => (
          <button
            type="button"
            role="radio"
            aria-checked={look.type === t}
            class={`map-look-type${look.type === t ? ' on' : ''}`}
            title={MINI_TYPE_INFO[t].about}
            onClick={() =>
              onChange({ type: t, ...(look.markers ? { markers: look.markers } : {}) }, MINI_TYPE_INFO[t].label)
            }
          >
            <MapPreview
              model={model}
              mini={miniLookOf({ mini: { type: t } }, undefined)}
              w={64}
              h={64}
              label={MINI_TYPE_INFO[t].label}
            />
            <span class="small">{MINI_TYPE_INFO[t].label}</span>
          </button>
        ))}
      </div>
      <div class="hint small">{MINI_TYPE_INFO[look.type].about}</div>
      {look.type !== 'off' && (
        <>
          <MapPreview model={model} mini={full} w={full.size} h={full.size} label={`${title} preview`} />
          <div class="grid3">
            <Pick
              label="Frame"
              value={full.frame}
              options={FRAMES}
              onPick={(v) => onChange({ ...look, frame: v }, 'frame')}
            />
            <Pick
              label="Icons"
              value={full.icons}
              options={ICON_SETS}
              onPick={(v) => onChange({ ...look, icons: v }, 'icons')}
            />
            <Pick label="Fog" value={full.fog} options={FOGS} onPick={(v) => onChange({ ...look, fog: v }, 'fog')} />
          </div>
          <div class="grid3">
            <label class="field">
              Size (px)
              <input
                class="inp"
                type="number"
                min={90}
                max={320}
                aria-label="Map in play size"
                value={full.size}
                onChange={(e) =>
                  onChange(
                    {
                      ...look,
                      size: Math.max(
                        90,
                        Math.min(320, Math.round(Number((e.target as HTMLInputElement).value) || 150)),
                      ),
                    },
                    'size',
                  )
                }
              />
            </label>
            <label class="field">
              Shows (studs across)
              <input
                class="inp"
                type="number"
                min={16}
                max={400}
                aria-label="Map in play span"
                value={full.span}
                onChange={(e) =>
                  onChange(
                    { ...look, span: Math.max(16, Math.min(400, Number((e.target as HTMLInputElement).value) || 64)) },
                    'span',
                  )
                }
              />
            </label>
            {look.type === 'round' && (
              <label class="check small">
                <input
                  type="checkbox"
                  aria-label="Map in play turns with the camera"
                  checked={full.turns}
                  onChange={(e) => onChange({ ...look, turns: (e.target as HTMLInputElement).checked }, 'turns')}
                />
                Turns with the camera
              </label>
            )}
          </div>
          <ColorRow look={look} full={full.colors} who={title} onChange={onChange} />
          <Markers
            who={title}
            on={full.markers}
            onChange={(k, v) =>
              onChange(
                { ...look, markers: { ...(look.markers ?? {}), [k]: v } },
                MARKER_LABELS[k as keyof typeof MARKER_LABELS],
              )
            }
          />
        </>
      )}
    </fieldset>
  );
}

export const MAP_LOOK_HELP =
  'This map’s own pause map and map in play, over the game’s (Project › Maps). A dungeon uses the game’s dungeon map (a room plan) unless you choose here.';

/** Milestone 3b (B7a-1): Scene › Map › Maps — this map's own pause map and map in play */
export function MapLookSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const own = m.mapLook ?? {};
  const set = (look: MapDoc['mapLook'] | null) =>
    ed.exec({ type: 'map.setLook', payload: { map: m.id, look } }, { label: 'Map look' });
  return (
    <div class="sec" data-tour="map-look" data-help="scene.map.look">
      <div class="sech">
        <span>
          Maps
          <FieldHelp label="Maps" text={MAP_LOOK_HELP} />
        </span>
      </div>
      <label class="field">
        Pause map
        <select
          class="inp"
          aria-label="This map's pause map"
          value={own.pause?.type ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value as PauseLook['type'] | '';
            set({ ...own, pause: v ? { type: v } : undefined });
          }}
        >
          <option value="">The game’s{m.dungeon ? ' (dungeons: room plan)' : ''}</option>
          {PAUSE_TYPES.map((t) => (
            <option value={t}>{PAUSE_TYPE_INFO[t].label}</option>
          ))}
        </select>
      </label>
      <label class="field">
        Map in play
        <select
          class="inp"
          aria-label="This map's map in play"
          value={own.mini?.type ?? ''}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value as MiniLook['type'] | '';
            set({ ...own, mini: v ? { type: v } : undefined });
          }}
        >
          <option value="">The game’s</option>
          {MINI_TYPES.map((t) => (
            <option value={t}>{MINI_TYPE_INFO[t].label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
