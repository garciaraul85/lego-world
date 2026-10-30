import { builtinAsset } from '../../builtin/assets';
import { type Asset, type Instances, type MapDoc, paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';

export const DUNGEON_HELP =
  'A dungeon keeps its own small keys, boss key, map and compass: keys found here open only this map’s locked doors. In Play its minimap shows only where the hero has been until the Dungeon map is picked up here, and the Compass marks the chests not yet opened and the boss. The HUD shows the small keys (🗝) while the hero is here. Leave it off for towns and fields: their minimap shows everything.';

/** what puzzle pieces stand on a map: locks, keys, switches, blocks */
export function puzzleCounts(ed: ActionCtx['ed'], map: string) {
  const items = ed.store.get<Instances>(paths.instances(map))?.items ?? [];
  const n = { locks: 0, keys: 0, bossKeys: 0, switches: 0, blocks: 0, maps: 0, compasses: 0 };
  for (const i of items) {
    if (i.kind !== 'asset') continue;
    const a = ed.store.get<Asset>(paths.asset(i.asset)) ?? builtinAsset(i.asset);
    if (!a) continue;
    if (a.lock) n.locks++;
    if (a.switch) n.switches++;
    if (a.push) n.blocks++;
    const item = a.pickup?.item.toLowerCase() ?? '';
    if (item === 'small key') n.keys++;
    if (item === 'boss key') n.bossKeys++;
    if (item === 'dungeon map') n.maps++;
    if (item === 'compass') n.compasses++;
    // a chest that gives a key counts as a key
    for (const it of a.interactions)
      for (const d of it.do) if (d.do === 'give' && /^small keys?$/i.test(d.item)) n.keys += d.count ?? 1;
  }
  return n;
}

/** Step 12a: Scene › Map › Dungeon — one undo step per change */
export function DungeonSection({ c, m }: { c: ActionCtx; m: MapDoc }) {
  const { ed } = c;
  const on = !!m.dungeon;
  const n = puzzleCounts(ed, m.id);
  const parts = [
    n.locks && `${n.locks} lock${n.locks === 1 ? '' : 's'}`,
    n.keys && `${n.keys} small key${n.keys === 1 ? '' : 's'}`,
    n.bossKeys && 'the boss key',
    n.switches && `${n.switches} switch${n.switches === 1 ? '' : 'es'}`,
    n.blocks && `${n.blocks} block${n.blocks === 1 ? '' : 's'}`,
    n.maps && 'the map',
    n.compasses && 'the compass',
  ].filter(Boolean);
  return (
    <div class="sec" data-tour="map-dungeon" data-help="scene.map.dungeon">
      <div class="sech">
        <span>
          Dungeon
          <FieldHelp label="Dungeon" text={DUNGEON_HELP} />
        </span>
      </div>
      <label class="lbl">
        <input
          type="checkbox"
          checked={on}
          aria-label="This map is a dungeon"
          data-tour="dungeon-toggle"
          onChange={() =>
            ed.exec(
              { type: 'map.setDungeon', payload: { map: m.id, dungeon: !on } },
              { label: on ? 'Not a dungeon' : 'Dungeon' },
            )
          }
        />{' '}
        This map is a dungeon
      </label>
      <p class="muted small" style={{ margin: '4px 0 0' }}>
        {parts.length
          ? `On this map: ${parts.join(', ')}.`
          : 'No puzzle pieces here yet: Starter pack › Puzzle pieces.'}
        {on && n.locks > n.keys + (n.bossKeys ? 1 : 0) ? ' More locks than keys: some doors cannot be opened.' : ''}
      </p>
    </div>
  );
}
