import { useState } from 'preact/hooks';
import { builtinAsset } from '../../builtin/assets';
import { MAX_BRICKS_PER_MAP } from '../../core/bricks/map-bricks';
import type { Command } from '../../core/commands';
import { brickCount } from '../../core/commands/handlers/assets';
import { MAX_ITEMS_PER_MAP } from '../../core/commands/handlers/items';
import { MAX_SCATTER } from '../../core/commands/handlers/scatter';
import { LEGACY_MAX_PIECES } from '../../core/legacy/constants';
import { type Instances, type MapDoc, paths } from '../../core/schema';
import { LAND_SIZES, type LandSize } from '../../core/worldgen/land';
import { DEFAULT_VIEW_DISTANCE, STREAM_FROM_CHUNKS } from '../../engine/render/stream';
import { WINDOW_FROM } from '../../engine/runtime/session';
import type { ActionCtx } from '../actions/registry';
import { assetLibrary } from '../assets';
import { AssetThumb } from '../components/AssetThumb';
import { FieldHelp } from '../components/fields';
import { PreviewPicker } from '../components/PreviewPicker';

export const BIG_WORLD_HELP = {
  size: `How big this map is: its bricks (a map holds up to ${MAX_BRICKS_PER_MAP.toLocaleString('en-US')}) and its chunks (32 × 32 studs each). Maps of more than ${STREAM_FROM_CHUNKS} chunks are big maps: the view and the game load the chunks around where you look or play, the nearest first, and the fog closes in where they end. In the game a big map plays the area around the hero (more than ${WINDOW_FROM.toLocaleString('en-US')} pieces): neighbours further away sleep until the hero comes near.`,
  view: 'How far a big map is drawn, in studs from where you look (the hero, in the game). Further shows more but costs more to draw; the fog hides where it ends. Small maps are always drawn whole.',
  scatter:
    'Sets down many copies of one build at once around where the Scene view looks (a forest of trees, a field of flowers): each on flat ground with studs, clear of the others and of every brick, turned at random. Copies that do not fit are left out. One undo step takes them all away. Up to 5,000 at a time; a map holds 10,000 placed assets.',
  land: 'Makes a new map of rolling grass and hills of bricks, with a flat clearing in the middle where the player starts. 2048 studs across is about 950,000 bricks; room for 50,000 more is left for building. One undo step removes it.',
};

/** P27 part 3: Scene › Map — how big the map is, how far it is drawn, and a big land to try it on */
const assetCount = (ed: ActionCtx['ed'], map: string) =>
  (ed.store.get<Instances>(paths.instances(map))?.items ?? []).filter((i) => i.kind === 'asset').length;

export function BigWorldSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  // counts are read from the project: draw again after every change
  ed.revision.value;
  const [size, setSize] = useState<LandSize>(1024);
  const [what, setWhat] = useState('');
  const [count, setCount] = useState(200);
  const [radius, setRadius] = useState(64);
  const lib = assetLibrary(ed).filter(({ asset }) => asset.origin !== 'generated');
  const pick = lib.find((x) => x.asset.id === what)?.asset ?? null;
  const scatter = () => {
    if (!pick) return;
    const [cx, cz] = ed.viewCentre.map(Math.round) as [number, number];
    const cmds: Command[] = [];
    if (!ed.store.has(paths.asset(pick.id))) {
      const b = builtinAsset(pick.id);
      if (b) cmds.push({ type: 'asset.create', payload: { asset: b } });
    }
    const before = assetCount(ed, m.id);
    cmds.push({
      type: 'asset.scatter',
      payload: {
        map: m.id,
        asset: pick.id,
        area: [cx - radius, cz - radius, cx + radius, cz + radius],
        count,
        seed: Math.floor(Math.random() * 1e9),
      },
    });
    const r = ed.exec(cmds, { label: `Scatter ${pick.name}` });
    if (!r.ok) return;
    const placed = assetCount(ed, m.id) - before;
    // fewer than asked: no more flat, free ground there, or no more room on the map (1,000,000 bricks)
    const full = brickCount(ed.store, m.id) + pick.bricks.length > MAX_BRICKS_PER_MAP;
    ed.notify(
      `${placed.toLocaleString('en-US')} × ${pick.name} placed.${
        placed < count
          ? full
            ? ` The map is now full (${MAX_BRICKS_PER_MAP.toLocaleString('en-US')} bricks).`
            : ' The rest found no flat, free ground there.'
          : ''
      }`,
    );
  };
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
      <div class="field" data-tour="scatter">
        <span>
          Scatter
          <FieldHelp label="Scatter" text={BIG_WORLD_HELP.scatter} />
        </span>
        <PreviewPicker
          label="Asset to scatter"
          tour="scatter-asset"
          value={what}
          placeholder="Pick an asset…"
          options={lib.map(({ asset: a }) => ({
            value: a.id,
            name: a.name,
            note: `${a.bricks.length} bricks`,
            thumb: <AssetThumb def={a} size={40} />,
          }))}
          onPick={setWhat}
        />
      </div>
      <label class="field">
        <span>How many: {count}</span>
        <input
          type="range"
          aria-label="How many copies"
          data-tour="scatter-count"
          min={10}
          max={MAX_SCATTER}
          step={10}
          value={count}
          onInput={(e) => setCount(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <label class="field">
        <span>Around the view: {radius} studs</span>
        <input
          type="range"
          aria-label="Scatter around the view (studs)"
          data-tour="scatter-radius"
          min={8}
          max={1024}
          step={8}
          value={radius}
          onInput={(e) => setRadius(Number((e.target as HTMLInputElement).value))}
        />
      </label>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" class="btn" data-tour="scatter-go" disabled={!pick} onClick={scatter}>
          Scatter
        </button>
      </div>
      <div class="field">
        Placed assets
        <span class="mono" data-tour="map-assets">
          {assetCount(ed, m.id).toLocaleString('en-US')} / {MAX_ITEMS_PER_MAP.toLocaleString('en-US')}
        </span>
      </div>
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
