import { useState } from 'preact/hooks';
import { BUILTIN_ASSETS } from '../../builtin/assets';
import type { PackGroup } from '../../builtin/characters/starter';
import { ADVENTURE_PACK } from '../../builtin/packs/adventure';
import { STYLE_INFO } from '../../core/combat/enemy';
import { paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { AssetThumb } from '../components/AssetThumb';
import { FieldHelp } from '../components/fields';
import { matches, NoMatch, SearchBox } from '../components/SearchBox';
import { endDrag, startDrag } from '../interact/drag';
import { bodyOfChr } from '../workspaces/character-studio/body-of';
import { CharacterThumb } from '../workspaces/character-studio/thumbs';
import { makePackHero, placePackCharacter, useTerrainStyle } from './pack';

export const PACK_HELP =
  'The adventure starter pack: a hero, ten neighbours (each with a sample conversation), ten kinds of enemy (each with its weaknesses), twenty buildings and props (dungeon walls, gates, torches, pots, a boss chest, a block to push, a cottage…) and three terrain styles. Drag anything onto the map, or press Place. A character comes into your game the first time it is used, so you can change it in the Character studio; buildings and props open in the Asset studio. A terrain style makes the open map again in that style (Undo brings the old one back).';

const GROUPS: [PackGroup, string][] = [
  ['hero', 'Hero'],
  ['npc', 'Neighbours'],
  ['enemy', 'Enemies'],
];

/** Step 11, 4a: the starter pack's panel in the bottom dock (shown in the genre views that use it) */
export function PackPanel({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const [q, setQ] = useState('');
  const cast = ADVENTURE_PACK.cast.filter((x) => matches(q, x.character.name, x.about, x.group));
  const assets = BUILTIN_ASSETS.filter((a) => (ADVENTURE_PACK.assets as readonly string[]).includes(a.id)).filter((a) =>
    matches(q, a.name, a.category),
  );
  const terrain = ADVENTURE_PACK.terrain.filter((t) => matches(q, t.name, t.about));
  const brush = ed.assetBrush.value;
  const hero = ed.store.manifest.hero;
  const nothing = !cast.length && !assets.length && !terrain.length;
  return (
    <div class="scroll pack-panel" data-tour="dock-pack" data-help="scene.dock.pack">
      <div class="row" style={{ gap: '8px', alignItems: 'center' }}>
        <strong>{ADVENTURE_PACK.name}</strong>
        <FieldHelp label="Starter pack" text={PACK_HELP} />
        <span class="muted small" style={{ flex: 1 }}>
          {ADVENTURE_PACK.about}. Drag onto the map, or Place.
        </span>
        <SearchBox label="the pack" value={q} onInput={setQ} tour="pack-search" />
      </div>
      <NoMatch q={nothing ? q : ''} what="pack items" />
      {GROUPS.map(([g, title]) => {
        const list = cast.filter((x) => x.group === g);
        if (!list.length) return null;
        return (
          <section class="pack-group" aria-label={title}>
            <div class="small muted pack-title">{title}</div>
            <div class="cards pack-cards" role="list">
              {list.map((x) => {
                const chr = { ...x.character, id: x.id };
                const inGame = ed.store.has(paths.character(x.id));
                const enemy = x.character.enemy;
                return (
                  <div
                    class="card pack-card"
                    role="listitem"
                    aria-label={x.character.name}
                    data-tour={`pack-${x.slug}`}
                    draggable={g !== 'hero'}
                    onDragStart={(e) =>
                      startDrag(e as unknown as DragEvent, {
                        kind: 'character',
                        character: x.id,
                        name: x.character.name,
                      })
                    }
                    onDragEnd={endDrag}
                    data-tip={`${x.character.name}: ${x.about}.${enemy?.style ? ` ${STYLE_INFO[enemy.style].label}; today it ${STYLE_INFO[enemy.style].now}.` : ''} Drag it onto the map, or press Place.`}
                  >
                    <span class="thumb" aria-hidden="true">
                      <CharacterThumb
                        profile={x.character.profile}
                        size={56}
                        body={bodyOfChr(chr, (p) => ed.store.get(p))}
                      />
                    </span>
                    <span class="small asset-name">{x.character.name}</span>
                    <span class="mono small" style={{ color: 'var(--mut2)' }}>
                      {inGame ? 'in your game' : 'pack'}
                      {enemy ? ` · ${x.character.harm?.health.hp ?? 1} hp` : ''}
                    </span>
                    {g === 'hero' ? (
                      <button
                        type="button"
                        class="btn small"
                        disabled={hero === x.id}
                        aria-label={`Play as ${x.character.name}`}
                        onClick={() =>
                          makePackHero(ed, x) && ed.notify(`${x.character.name} is the player character now.`)
                        }
                      >
                        {hero === x.id ? 'Player' : 'Play as'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        class="btn small"
                        aria-label={`Place ${x.character.name}`}
                        onClick={() => placePackCharacter(ed, x)}
                      >
                        Place
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {assets.length > 0 && (
        <section class="pack-group" aria-label="Buildings and props">
          <div class="small muted pack-title">Buildings and props</div>
          <div class="cards pack-cards" role="listbox" aria-label="Pack buildings and props">
            {assets.map((a) => {
              const on = brush.asset === a.id && ed.tool.value === 'asset';
              return (
                <button
                  type="button"
                  class={`card ${on ? 'on' : ''}`}
                  role="option"
                  aria-selected={on}
                  data-tour={`pack-asset-${a.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                  data-tip={`${a.name}. Drag it into the scene, or click it and then click the ground (T turns it).`}
                  draggable
                  onDragStart={(e) =>
                    startDrag(e as unknown as DragEvent, {
                      kind: 'asset',
                      asset: a.id,
                      rot: brush.asset === a.id ? brush.rot : 0,
                    })
                  }
                  onDragEnd={endDrag}
                  onClick={() => {
                    ed.assetBrush.value = { asset: a.id, rot: brush.asset === a.id ? brush.rot : 0 };
                    ed.tool.value = 'asset';
                  }}
                  onDblClick={() => c.ui.editAsset(a.id)}
                >
                  <span class="thumb asset-thumb" aria-hidden="true">
                    <AssetThumb def={a} size={56} />
                  </span>
                  <span class="small asset-name">{a.name}</span>
                  <span class="mono small" style={{ color: 'var(--mut2)' }}>
                    {a.category}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {terrain.length > 0 && (
        <section class="pack-group" aria-label="Terrain styles">
          <div class="small muted pack-title">Terrain styles</div>
          <div class="pack-terrain" role="list">
            {terrain.map((t) => (
              <div class="pack-style row" role="listitem" data-tour={`pack-terrain-${t.id}`}>
                <span style={{ flex: 1 }}>
                  <strong class="small">{t.name}</strong>
                  <span class="muted small"> · {t.about}</span>
                </span>
                <button
                  type="button"
                  class="btn small"
                  aria-label={`Make this map ${t.name}`}
                  onClick={() => {
                    if (useTerrainStyle(ed, t)) {
                      c.ui.fit();
                      ed.notify(`The map is ${t.name} now. Undo brings the old map back.`);
                    }
                  }}
                >
                  Use on this map
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
