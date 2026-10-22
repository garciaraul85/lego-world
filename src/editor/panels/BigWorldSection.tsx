import { useState } from 'preact/hooks';
import { MAX_BRICKS_PER_MAP } from '../../core/bricks/map-bricks';
import { brickCount } from '../../core/commands/handlers/assets';
import { LEGACY_MAX_PIECES } from '../../core/legacy/constants';
import { type MapDoc, paths } from '../../core/schema';
import { LAND_SIZES, type LandSize } from '../../core/worldgen/land';
import { DEFAULT_VIEW_DISTANCE, STREAM_FROM_CHUNKS } from '../../engine/render/stream';
import { WINDOW_FROM } from '../../engine/runtime/session';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';

export const BIG_WORLD_HELP = {
  size: `How big this map is: its bricks (a map holds up to ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')}) and its chunks (32 × 32 studs each). Maps of more than ${STREAM_FROM_CHUNKS} chunks are big maps: the view and the game load the chunks around where you look or play, the nearest first, and the fog closes in where they end. In the game a big map plays the area around the hero (more than ${WINDOW_FROM.toLocaleString('en-US')} pieces): neighbours further away sleep until the hero comes near.`,
  view: 'How far a big map is drawn, in studs from where you look (the hero, in the game). Further shows more but costs more to draw; the fog hides where it ends. Small maps are always drawn whole.',
  land: 'Makes a new map of rolling grass and hills of bricks, with a flat clearing in the middle where the player starts. 2048 studs across is about 950,000 bricks; room for 50,000 more is left for building. One undo step removes it.',
};

/** P27 part 3: Scene › Map — how big the map is, how far it is drawn, and a big land to try it on */
export function BigWorldSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const [size, setSize] = useState<LandSize>(1024);
  const chunks = ed.store.list(paths.chunkDir(m.id)).length;
  const bricks = brickCount(ed.store, m.id);
  const big = chunks > STREAM_FROM_CHUNKS;
  const view = m.viewDistance ?? DEFAULT_VIEW_DISTANCE;
  const make = () => {
    const n = ed.maps.value.filter((x) => x.name.startsWith('Big land')).length;
    const name = n ? `Big land ${n + 1}` : 'Big land';
    const before = new Set(ed.maps.value.map((x) => x.id));
    const r = ed.exec(
      { type: 'map.create', payload: { name, land: { size, seed: Math.floor(Math.random() * 99_999_999) } } },
      { label: `New big land (${size} studs)` },
    );
    if (!r.ok) return;
    const made = ed.maps.value.find((x) => !before.has(x.id));
    if (made) ed.openMap(made.id);
  };
  return (
    <div class="sec" data-tour="map-big" data-help="scene.map.big">
      <div class="sech">
        <span>
          Big worlds
          <FieldHelp label="Big worlds" text={BIG_WORLD_HELP.size} />
        </span>
      </div>
      <div class="field">
        Bricks
        <span class="mono" data-tour="map-bricks">
          {bricks.toLocaleString('en-US')} / {MAX_BRICKS_PER_MAP.toLocaleString('en-US')}
        </span>
      </div>
      <div class="field">
        Chunks
        <span class="mono">
          {chunks.toLocaleString('en-US')} {big ? '· big map (streamed)' : '· drawn whole'}
        </span>
      </div>
      {bricks > LEGACY_MAX_PIECES && (
        <p class="muted small">
          More than {LEGACY_MAX_PIECES.toLocaleString('en-US')} pieces: Play in v68 can’t load this map; ▶ Play can.
        </p>
      )}
      <label class="field">
        <span>
          How far you see: {view} studs
          <FieldHelp label="How far you see" text={BIG_WORLD_HELP.view} />
        </span>
        <input
          type="range"
          aria-label="How far you see (studs)"
          data-tour="view-distance"
          min={64}
          max={1024}
          step={32}
          value={view}
          onChange={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            ed.exec(
              {
                type: 'map.setEnvironment',
                payload: { map: m.id, viewDistance: v === DEFAULT_VIEW_DISTANCE ? null : v },
              },
              { label: `See ${v} studs far` },
            );
          }}
        />
      </label>
      <div class="field">
        <span>
          New big land
          <FieldHelp label="New big land" text={BIG_WORLD_HELP.land} />
        </span>
        <span class="row" style={{ gap: '6px' }}>
          <select
            class="inp"
            aria-label="Big land size"
            data-tour="land-size"
            value={size}
            onChange={(e) => setSize(Number((e.target as HTMLSelectElement).value) as LandSize)}
          >
            {LAND_SIZES.map((s) => (
              <option value={s}>
                {s} × {s} studs
              </option>
            ))}
          </select>
          <button type="button" class="btn" data-tour="land-make" onClick={make}>
            Make
          </button>
        </span>
      </div>
    </div>
  );
}
