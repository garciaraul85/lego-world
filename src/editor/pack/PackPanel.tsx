import { useState } from 'preact/hooks';
import { BUILTIN_ASSETS } from '../../builtin/assets';
import type { PackGroup } from '../../builtin/characters/starter';
import { BUILTIN_EFFECTS } from '../../builtin/effects';
import { ADVENTURE_PACK } from '../../builtin/packs/adventure';
import { CUTSCENE_TEMPLATES } from '../../builtin/templates/cutscenes';
import { SCRIPT_TEMPLATES } from '../../builtin/templates/scripts';
import { STYLE_INFO } from '../../core/combat/enemy';
import { paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { AssetThumb } from '../components/AssetThumb';
import { FieldHelp } from '../components/fields';
import { EffectThumb, MusicListen } from '../components/previews';
import { matches, NoMatch, SearchBox } from '../components/SearchBox';
import { endDrag, startDrag } from '../interact/drag';
import { bodyOfChr } from '../workspaces/character-studio/body-of';
import { CharacterThumb } from '../workspaces/character-studio/thumbs';
import { makePackHero, placePackCharacter, placePackEffect, setScreenLook, useTerrainStyle } from './pack';

export const PACK_HELP =
  'The adventure starter pack: a hero, ten neighbours (each with a sample conversation), ten kinds of enemy (each with its weaknesses), twenty buildings and props (dungeon walls, gates, torches, pots, a boss chest, a block to push, a cottage…), three terrain styles, ten script templates and three cutscene templates (fill in a short form and they become ordinary logic and scenes), five effects (fairy sparkle, item get, torch embers, dungeon dust, a boss vanishing), an Adventure screen look, and its own sounds and music. Drag anything onto the map, or press Place. A character comes into your game the first time it is used, so you can change it in the Character studio; buildings and props open in the Asset studio. A terrain style makes the open map again in that style (Undo brings the old one back). The Adventure look dresses every screen and menu (parchment panels, gold-framed buttons, a storybook font, framed hearts); Classic brings the plain look back. The sounds and music are in every game already: listen here, then pick them in the Audio workspace, in logic (Play sound, Play music) or in a cinematic. The sword swish plays on every blade swing and the key jingle when the hero is given a key.';

const GROUPS: [PackGroup, string][] = [
  ['hero', 'Hero'],
  ['npc', 'Neighbours'],
  ['enemy', 'Enemies'],
];

/** Step 11, 4a: the starter pack's panel in the bottom dock (shown in the genre views that use it) */
/** step 12b: a fire or light piece: it burns, shines, turns a beam, answers a beam or fire, or is a bomb or torch */
const fireOrLight = (a: (typeof BUILTIN_ASSETS)[number]) =>
  !!(a.burn || a.beam || a.mirror || a.bombPlant) ||
  a.switch?.by === 'light' ||
  !!a.switch?.hitBy?.includes('fire') ||
  /^(bombs?|torch)$/i.test(a.pickup?.item ?? '');

export function PackPanel({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const [q, setQ] = useState('');
  const cast = ADVENTURE_PACK.cast.filter((x) => matches(q, x.character.name, x.about, x.group));
  const assets = BUILTIN_ASSETS.filter((a) => (ADVENTURE_PACK.assets as readonly string[]).includes(a.id)).filter((a) =>
    matches(
      q,
      a.name,
      a.category,
      a.push || a.switch || a.lock || a.pickup ? 'puzzle' : '',
      fireOrLight(a) ? 'fire light' : '',
    ),
  );
  const puzzle = (a: (typeof assets)[number]) =>
    !!(a.push || a.switch || a.lock || a.pickup || a.climbable) || fireOrLight(a);
  const buildings = assets.filter((a) => !puzzle(a));
  const pieces = assets.filter((a) => puzzle(a) && !fireOrLight(a));
  const fire = assets.filter(fireOrLight);
  const terrain = ADVENTURE_PACK.terrain.filter((t) => matches(q, t.name, t.about));
  const effects = BUILTIN_EFFECTS.filter((e) => (ADVENTURE_PACK.effects as readonly string[]).includes(e.id)).filter(
    (e) => matches(q, e.name, 'effect'),
  );
  const sounds = ADVENTURE_PACK.sounds.filter((x) => matches(q, x.name, x.about, 'sound'));
  const music = ADVENTURE_PACK.music.filter((x) => matches(q, x.name, x.about, 'music'));
  const showLook = matches(q, 'screen look adventure classic menu hud');
  // step 11, 4c: the script and cutscene templates
  const scripts = SCRIPT_TEMPLATES.filter((t) => matches(q, t.name, t.about, 'script logic template'));
  const scenes = CUTSCENE_TEMPLATES.filter((t) => matches(q, t.name, t.about, 'cutscene cinematic scene template'));
  const look = ed.store.manifest.uiLook ?? 'classic';
  const brush = ed.assetBrush.value;
  const hero = ed.store.manifest.hero;
  const nothing =
    !scripts.length &&
    !scenes.length &&
    !cast.length &&
    !assets.length &&
    !terrain.length &&
    !effects.length &&
    !sounds.length &&
    !music.length &&
    !showLook;
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
      {[
        ['Buildings and props', 'Pack buildings and props', buildings] as const,
        // step 12a: blocks, switches, doors, keys
        ['Puzzle pieces', 'Pack puzzle pieces', pieces] as const,
        // step 12b: burnable things, torches, bombs, beams and mirrors
        ['Fire and light', 'Pack fire and light', fire] as const,
      ].map(([title, label, list]) =>
        list.length > 0 ? (
          <section class="pack-group" aria-label={title}>
            <div class="small muted pack-title">{title}</div>
            <div class="cards pack-cards" role="listbox" aria-label={label}>
              {list.map((a) => {
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
        ) : null,
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
      {(scripts.length > 0 || scenes.length > 0) && (
        <section class="pack-group" aria-label="Scripts and cutscenes" data-tour="pack-templates">
          <div class="small muted pack-title">Scripts and cutscenes</div>
          <div class="pack-terrain" role="list">
            {[
              ...scripts.map((t) => ({ t, kind: 'script' as const })),
              ...scenes.map((t) => ({ t, kind: 'cutscene' as const })),
            ].map(({ t, kind }) => (
              <div class="pack-style row" role="listitem" data-tour={`pack-tpl-${t.id}`}>
                <span style={{ flex: 1 }}>
                  <strong class="small">{t.name}</strong>
                  <span class="muted small">
                    {' '}
                    · {kind === 'script' ? 'script' : 'cutscene'} · {t.about}
                  </span>
                </span>
                <button
                  type="button"
                  class="btn small"
                  aria-label={`Use ${t.name}`}
                  onClick={() => (ed.templates.value = { kind, id: t.id })}
                >
                  Use…
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {(showLook || effects.length > 0 || sounds.length > 0 || music.length > 0) && (
        <section class="pack-group" aria-label="Look and sound" data-tour="pack-look">
          <div class="small muted pack-title">Look and sound</div>
          {showLook && (
            <div class="pack-style row" data-tour="pack-screen-look">
              <span style={{ flex: 1 }}>
                <strong class="small">Screen look</strong>
                <span class="muted small">
                  {' '}
                  · parchment panels, gold-framed buttons, a storybook font, framed hearts
                </span>
              </span>
              <div class="seg" role="radiogroup" aria-label="Screen look">
                {(['classic', 'adventure'] as const).map((k) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={look === k}
                    class={`btn small ${look === k ? 'on' : ''}`}
                    onClick={() =>
                      look !== k &&
                      setScreenLook(ed, k) &&
                      ed.notify(
                        k === 'adventure'
                          ? 'Every screen and menu has the Adventure look now. Press Play to see it.'
                          : 'The screens have the classic look again.',
                      )
                    }
                  >
                    {k === 'classic' ? 'Classic' : 'Adventure'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {effects.length > 0 && (
            <div class="cards pack-cards" role="list" aria-label="Pack effects">
              {effects.map((e) => (
                <div
                  class="card pack-card"
                  role="listitem"
                  aria-label={e.name}
                  data-tour={`pack-fx-${e.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                  data-tip={`${e.name}. Point at it to see it play; Place puts it in front of the start. Hits and logic can play it too.`}
                >
                  <span class="thumb" aria-hidden="true">
                    <EffectThumb effect={e} size={56} />
                  </span>
                  <span class="small asset-name">{e.name}</span>
                  <button
                    type="button"
                    class="btn small"
                    aria-label={`Place ${e.name}`}
                    onClick={() => placePackEffect(ed, e.id, e.name) && ed.notify(`${e.name} is on the map.`)}
                  >
                    Place
                  </button>
                </div>
              ))}
            </div>
          )}
          {(sounds.length > 0 || music.length > 0) && (
            <div class="pack-terrain" role="list" aria-label="Pack sounds and music">
              {sounds.map((x) => (
                <div class="pack-style row" role="listitem" data-tour={`pack-sound-${x.id}`}>
                  <button
                    type="button"
                    class="btn icon listen"
                    aria-label={`Listen to ${x.name}`}
                    data-tip={`Listen to ${x.name}`}
                    onClick={() => ed.audio.previewEvent(x.id)}
                  >
                    ▶
                  </button>
                  <span style={{ flex: 1 }}>
                    <strong class="small">{x.name}</strong>
                    <span class="muted small"> · sound · {x.about}</span>
                  </span>
                </div>
              ))}
              {music.map((x) => (
                <div class="pack-style row" role="listitem" data-tour={`pack-music-${x.id}`}>
                  <MusicListen ed={ed} id={x.id} name={`${x.name} music`} />
                  <span style={{ flex: 1 }}>
                    <strong class="small">{x.name}</strong>
                    <span class="muted small"> · music · {x.about}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
