import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { usesOf } from '../../core/audio/usage';
import { MAX_BRICKS_PER_MAP } from '../../core/bricks/map-bricks';
import { LIGHT_PRESET, LIGHT_PRESETS, type LightPreset } from '../../core/lighting/light';
import type { Cinematic, LightInstance } from '../../core/schema';
import { type Character, type MapDoc, paths } from '../../core/schema';
import { validateWorld } from '../../core/world/validate';
import { allScreens } from '../../engine/ui/screens';
import type { ActionCtx } from '../actions/registry';
import { runPlayCheck } from '../actions/registry';
import { assetLibrary } from '../assets';
import { AssetThumb } from '../components/AssetThumb';
import { EffectThumb, ScreenThumb } from '../components/previews';
import { matches, NoMatch, SearchBox } from '../components/SearchBox';
import { shows } from '../genres/view';
import { endDrag, startDrag } from '../interact/drag';
import { mapItems, placeEffectAt, placeLightAt, selectOnly } from '../interact/place';
import { keysFor } from '../platform';
import { MELEE } from '../play/debug';
import type { EditorState, LogLevel } from '../state';
import { MixerView } from '../workspaces/audio/MixerView';
import { bodyOfChr } from '../workspaces/character-studio/Body';
import { CharacterThumb } from '../workspaces/character-studio/thumbs';
import { allEffects } from '../workspaces/effects/EffectsStudio';
import { cinematicOptions, musicOptions, soundOptions } from './AudioFields';
import { LightSwatch } from './LightFields';

/**
 * P9c: the game's characters, each with “Place” — it stands on the open map as a neighbour, a few studs in
 * front of the map's first spawn point (an enemy fights the hero there in Play). Looks are made in the studio.
 */
function CharacterCards({ c, hint, q }: { c: ActionCtx; hint: string; q: string }) {
  const { ed } = c;
  ed.revision.value;
  const list = ed.store
    .list('characters/')
    .map((p) => ed.store.get<Character>(p)!)
    .filter((x) => x && x.id !== ed.store.manifest.hero && matches(q, x.name, x.role, x.enemy ? 'enemy' : ''));
  const place = (chr: Character) => {
    const map = ed.mapId.value;
    const sp = ed.store.get<MapDoc>(paths.map(map))?.spawns[0];
    const yaw = sp?.yaw ?? 0;
    const at = sp?.pos ?? [0, 0.4, 0];
    const pos: [number, number, number] = [at[0] - Math.sin(yaw) * 5, at[1], at[2] - Math.cos(yaw) * 5];
    ed.exec(
      { type: 'npc.place', payload: { map, character: chr.id, pos, heading: yaw } },
      { label: `Place ${chr.name}` },
    );
  };
  return (
    <div
      data-tour="dock-characters"
      data-help="scene.dock.characters"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <span class="muted small">
        {hint} Place puts one on this map as a neighbour, in front of the first spawn point.
      </span>
      <NoMatch q={list.length ? '' : q} what="characters" />
      {list.map((chr) => (
        <div class="row small" style={{ gap: '6px' }}>
          <CharacterThumb profile={chr.profile} size={26} body={bodyOfChr(chr, (p) => ed.store.get(p))} />
          <span style={{ flex: 1 }}>
            {chr.name}
            {chr.enemy ? ' · enemy' : ''}
          </span>
          <button type="button" class="btn" aria-label={`Place ${chr.name}`} onClick={() => place(chr)}>
            Place
          </button>
        </div>
      ))}
      <button type="button" class="btn on" onClick={() => c.ui.workspace('Characters')}>
        Open the Character studio
      </button>
    </div>
  );
}

const CATS: [string, string | null, string][] = [
  [
    'Assets',
    null,
    'Click an asset, then click in the map (Place, B), or drag it straight in. Press T to turn it a quarter turn before you put it down. Build and change assets (brick by brick) in the Assets screen.',
  ],
  ['Characters', null, 'Characters, their looks and their clips (emotes) are made in the Character studio.'],
  ['Cinematics', null, 'Directed scenes: click one to open it in the Director; ▶ plays it in the game.'],
  ['UI screens', null, 'Splash, title, HUD, pause, dialogue, game over and your own screens.'],
  ['Effects', null, 'Fire, smoke, sparks, magic: point at one to see it play; Place puts it beside the start.'],
  [
    'Lights',
    null,
    'Torches, lamps and glows that light the bricks and characters around them: Place puts one beside the start (or right-click the ground: Add a light here). Map › Darkness makes the map dark, so only its lights show it.',
  ],
  ['Sounds', null, 'Sound events: ▶ to listen; place one in the map as an emitter (Sound emitter tool, S).'],
  ['Music', null, 'Music states: ▶ to audition; pick one as the map music or a zone’s music.'],
];

export function Dock({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const tab = ed.dock.value;
  const problems = useProblems(ed, (w) => c.ui.workspace(w));
  const tabs: [DockTab, string][] = [
    ['assets', 'Assets'],
    ['console', 'Console'],
    ['timeline', 'Timeline'],
    ['profiler', 'Profiler'],
    ['problems', `Problems${problems.length ? ` (${problems.length})` : ''}`],
    ['debug', ed.session.value ? 'Debug ●' : 'Debug'],
    ['audio', 'Mixer'],
  ];
  return (
    <section class="panel dockpanel" aria-label="Bottom dock" data-tour="dock">
      <div class="ptabs">
        {/* P18: the genre view hides dock tabs it does not use (the open one stays) */}
        {tabs
          .filter(([id]) => id === tab || shows(ed, 'dock', id))
          .map(([id, label]) => (
            <button
              type="button"
              class={`tab ${tab === id ? 'on' : ''}`}
              onClick={() => {
                ed.dock.value = id;
                ed.persistUi();
              }}
            >
              {label}
            </button>
          ))}
      </div>
      {tab === 'assets' && <Assets c={c} />}
      {tab === 'console' && <Console ed={ed} />}
      {tab === 'timeline' && <MapTimeline c={c} />}
      {tab === 'profiler' && <Profiler ed={ed} />}
      {tab === 'problems' && <Problems c={c} problems={problems} />}
      {tab === 'debug' && <Debug c={c} />}
      {tab === 'audio' && (
        <div class="scroll">
          <MixerView ed={ed} compact />
        </div>
      )}
    </section>
  );
}

function Assets({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const cat = ed.assetCat.value;
  const cur = CATS.find((x) => x[0] === cat) ?? CATS[0]!;
  // every category has a search box (Assets keeps its own, beside its kinds)
  const [q, setQ] = useState('');
  const what = cur[0] === 'UI screens' ? 'screens' : cur[0].toLowerCase();
  return (
    <div class="assets">
      <div class="cats">
        {CATS.map(([name, later]) => (
          <button
            type="button"
            class={`cat ${cat === name ? 'on' : ''}`}
            onClick={() => {
              ed.assetCat.value = name;
              ed.persistUi();
              setQ('');
            }}
          >
            {name}
            <span class="mono small" style={{ color: '#6f7a89' }}>
              {later ? '·' : catCount(ed, name)}
            </span>
          </button>
        ))}
      </div>
      <div class="scroll" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {cur[0] !== 'Assets' && <SearchBox label={what} value={q} onInput={setQ} tour="dock-search" />}
        {cur[0] === 'Assets' ? (
          <AssetCards c={c} />
        ) : cur[0] === 'Characters' ? (
          <CharacterCards c={c} hint={cur[2]} q={q} />
        ) : cur[0] === 'Cinematics' ? (
          <MediaCards
            c={c}
            q={q}
            items={cinematicOptions(ed).map((o) => ({ id: o.id, name: o.name, sub: 'scene' }))}
            play={(id) => c.ui.play('engine', { cinematic: id })}
            open={(id) => {
              ed.cinematicId.value = id;
              c.ui.workspace('Cinematics');
            }}
            hint={cur[2]}
          />
        ) : cur[0] === 'UI screens' ? (
          <MediaCards
            c={c}
            q={q}
            items={allScreens(ed.store).map((s) => ({
              id: s.id,
              name: s.name,
              sub: s.kind,
              thumb: <ScreenThumb ed={ed} screen={s} width={56} />,
            }))}
            open={(id) => {
              ed.screenId.value = id;
              ed.widgetPath.value = '';
              c.ui.workspace('Screens');
            }}
            hint={cur[2]}
          />
        ) : cur[0] === 'Effects' ? (
          <EffectCards c={c} hint={cur[2]} q={q} />
        ) : cur[0] === 'Lights' ? (
          <LightCards c={c} hint={cur[2]} q={q} />
        ) : cur[0] === 'Sounds' ? (
          <MediaCards
            c={c}
            q={q}
            items={soundOptions(ed).map((o) => ({ id: o.id, name: o.name, sub: o.bus }))}
            play={(id) => ed.audio.previewEvent(id)}
            open={(id) => {
              ed.audioSel.value = { kind: 'event', id };
              c.ui.workspace('Audio');
            }}
            hint={cur[2]}
          />
        ) : cur[0] === 'Music' ? (
          <MediaCards
            c={c}
            q={q}
            items={musicOptions(ed).map((o) => ({ id: o.id, name: o.name, sub: 'music' }))}
            play={(id) => ed.audio.previewMusic(id)}
            open={(id) => {
              ed.audioSel.value = { kind: 'music', id };
              c.ui.workspace('Audio');
            }}
            hint={cur[2]}
          />
        ) : cur[1] ? (
          <div class="placeholder" style={{ padding: '8px' }}>
            <strong>
              {cur[0]} · {cur[1]}
            </strong>
            <span class="muted">{cur[2]}</span>
          </div>
        ) : null}
        <div class="hint">{cur[2]}</div>
      </div>
    </div>
  );
}

/** How many things each library category has. */
function catCount(ed: EditorState, cat: string): number {
  switch (cat) {
    case 'Assets':
      return assetLibrary(ed).length;
    case 'Characters':
      return ed.store.list('characters/').length;
    case 'Cinematics':
      return cinematicOptions(ed).length;
    case 'UI screens':
      return allScreens(ed.store).length;
    case 'Effects': {
      const { own, builtin } = allEffects(ed.store);
      return own.length + builtin.length;
    }
    case 'Lights':
      return mapItems(ed).filter((i) => i.kind === 'light').length;
    case 'Sounds':
      return soundOptions(ed).length;
    default:
      return musicOptions(ed).length;
  }
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: '#8fb7ff',
  EDIT: '#9aa4b2',
  WARN: '#ffd277',
  ERROR: '#ff8a7a',
  LOGIC: '#d9ceff',
  AUDIO: '#c3e88d',
};

function Console({ ed }: { ed: EditorState }) {
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const logs = ed.logs.value.filter((l) => filter === 'ALL' || l.level === filter);
  return (
    <>
      <div class="row" style={{ padding: '6px 10px', borderBottom: '1px solid #1f252e' }}>
        {(['ALL', 'EDIT', 'INFO', 'WARN'] as const).map((f) => (
          <button
            type="button"
            class={`chip ${filter === f ? 'on' : ''}`}
            style={filter === f ? { borderColor: 'var(--acc)' } : undefined}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <button type="button" class="link" style={{ marginLeft: 'auto' }} onClick={() => (ed.logs.value = [])}>
          Clear
        </button>
      </div>
      <div class="scroll" role="log" aria-live="polite">
        {!logs.length && (
          <div class="muted" style={{ padding: '8px 12px' }}>
            No messages yet.
          </div>
        )}
        {[...logs].reverse().map((l) => (
          <div class="log">
            <span style={{ color: '#6f7a89' }}>{l.t}</span>
            <span style={{ width: '48px', color: LEVEL_COLOR[l.level] }}>{l.level}</span>
            <span style={{ color: 'var(--fg2)' }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Profiler({ ed }: { ed: EditorState }) {
  const st = ed.stats.value;
  const times = ed.frameTimes.value;
  const max = Math.max(16.7, ...times);
  return (
    <div class="scroll" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '10px 12px' }}>
      <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div class="muted small">
          Render time of the last {times.length} redraws (budget 8 ms; the viewport redraws only when something changes)
        </div>
        <div class="bars" aria-hidden="true">
          {times.map((t) => (
            <span style={{ height: `${(t / max) * 100}%`, background: t > 8 ? '#ffd277' : '#2f8f78' }} />
          ))}
        </div>
      </div>
      <div
        class="mono small"
        style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '4px', color: 'var(--fg2)' }}
      >
        <span>Last redraw {st.ms.toFixed(2)} ms</span>
        <span>Draw calls {st.drawCalls}</span>
        <span>Instances {st.instances.toLocaleString('en-US')}</span>
        <span>
          Chunks drawn {st.chunksDrawn} / {st.chunks}
        </span>
        <span>
          Pieces {(ed.scene.value?.count ?? 0).toLocaleString('en-US')} / {MAX_BRICKS_PER_MAP.toLocaleString('en-US')}
        </span>
        <span>Undo steps {ed.bus.history().length}</span>
        <span>Files {[...ed.store.keys()].length}</span>
      </div>
    </div>
  );
}

type LiveProblem = {
  level: 'warn' | 'info' | 'error';
  msg: string;
  where: string;
  fix?: { label: string; run: () => void };
};

/** Problems from import plus live checks of the project. */
function useProblems(ed: EditorState, openWorkspace: (w: string) => void): LiveProblem[] {
  const rev = ed.revision.value;
  return useMemo(() => {
    const out: LiveProblem[] = ed.problems.value
      .filter((p) => p.level !== 'info')
      .map((p) => ({ level: p.level === 'error' ? 'error' : 'warn', msg: p.message, where: p.file ?? 'project' }));
    const name = (id: string) => ed.maps.value.find((m) => m.id === id)?.name ?? 'World graph';
    for (const i of validateWorld(ed.store))
      out.push({
        level: i.level,
        msg: i.message,
        where: i.code === 'unreachable' || i.code === 'noReturn' ? 'World graph' : name(i.map),
        fix: i.spawn
          ? {
              label: 'Select',
              run: () => {
                ed.openMap(i.map);
                ed.selectedSpawn.value = i.spawn!;
              },
            }
          : { label: 'Open', run: () => ed.openMap(i.map) },
      });
    // P28: the last “Can this game be finished?” check
    for (const i of ed.playCheck.value?.issues ?? []) {
      const map = i.map;
      out.push({
        level: i.level,
        msg: i.message,
        where: map ? name(map) : i.conversation ? 'Characters › Dialogue' : 'Project › Progress',
        ...(i.conversation
          ? {
              fix: {
                label: 'Open',
                run: () => {
                  ed.dialogueId.value = i.conversation!;
                  ed.charTab.value = 'dialogue';
                  openWorkspace('Characters');
                },
              },
            }
          : {}),
        ...(map
          ? {
              fix: {
                label: 'Select',
                run: () => {
                  ed.openMap(map);
                  if (i.spawn) ed.selectedSpawn.value = i.spawn;
                  else if (i.zone) ed.selectedZone.value = i.zone;
                  else if (i.instance) {
                    const s = ed.scene.value;
                    const pick = s && [...new Set(s.instanceOf.values())].find((x) => x.inst.id === i.instance);
                    if (pick) ed.select(pick.bricks.map((b) => b.id));
                  }
                },
              },
            }
          : {}),
      });
    }
    return out;
  }, [rev, ed.problems.value, ed.playCheck.value]);
}

function Problems({ c, problems }: { c: ActionCtx; problems: LiveProblem[] }) {
  const check = c.ed.playCheck.value;
  // P28: “Can this game be finished?” — run on demand (it walks every map)
  const bar = (
    <div class="row small" style={{ padding: '6px 12px', gap: '8px' }} data-tour="play-check" data-help="play.check">
      <button type="button" class="btn" onClick={() => runPlayCheck(c.ed)}>
        {check ? 'Check again' : 'Can this game be finished? Check'}
      </button>
      <span class="muted">
        {check
          ? `Checked ${new Date(check.at).toLocaleTimeString()}: ${
              check.issues.filter((i) => i.level !== 'info').length
                ? `${check.issues.filter((i) => i.level !== 'info').length} thing(s) to look at`
                : 'nothing blocks finishing the game'
            }.`
          : 'Walks every map from where the hero arrives: gates, objects to use, zones, achievements, collections, an ending.'}
      </span>
    </div>
  );
  if (!problems.length)
    return (
      <div class="scroll">
        {bar}
        <div class="muted" style={{ padding: '10px 12px' }}>
          No problems found.
        </div>
      </div>
    );
  return (
    <div class="scroll">
      {bar}
      {problems.map((p) => (
        <div class="problem">
          <span
            aria-hidden="true"
            style={{ color: p.level === 'info' ? 'var(--info)' : p.level === 'error' ? 'var(--err)' : 'var(--warn)' }}
          >
            {p.level === 'info' ? '●' : '▲'}
          </span>
          <span style={{ flex: 1 }}>{p.msg}</span>
          <span class="mono small" style={{ color: 'var(--mut2)' }}>
            {p.where}
          </span>
          {p.fix && (
            <button type="button" class="btn" style={{ minHeight: '24px', fontSize: '11px' }} onClick={p.fix.run}>
              {p.fix.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Watch values, debug drawing and cheats for the running Play session (P2.4). */
function Debug({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const s = ed.session.value;
  ed.playTick.value;
  const dd = ed.debugDraw.value;
  const toggle = (k: keyof typeof dd) => (ed.debugDraw.value = { ...dd, [k]: !dd[k] });
  const draw = (
    <div class="row">
      <label class="lbl">
        <input type="checkbox" checked={dd.colliders} onChange={() => toggle('colliders')} /> Colliders near the hero
      </label>
      <label class="lbl">
        <input type="checkbox" checked={dd.spawns} onChange={() => toggle('spawns')} /> Spawn points and gates
      </label>
    </div>
  );
  if (!s)
    return (
      <div class="scroll" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span class="muted">
          {keysFor('Press Play (F5) to watch the running game here. Debug drawing applies to Play.')}
        </span>
        {draw}
      </div>
    );
  const h = s.heroState;
  const w = s.world;
  const st = ed.playStats.value;
  const f = (n: unknown) => (typeof n === 'number' ? n.toFixed(2) : String(n));
  return (
    <div class="scroll" style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', padding: '10px 12px' }}>
      <dl class="watch mono" aria-label="Watch">
        <dt>map</dt>
        <dd>{w.doc.name}</dd>
        <dt>hero</dt>
        <dd>
          {f(h.x)}, {f(h.y)}, {f(h.z)}
        </dd>
        <dt>speed</dt>
        <dd>
          {f(h.speed)} {h.grounded ? '· grounded' : '· in air'}
          {h.building ? ' · building' : ''}
        </dd>
        <dt>held</dt>
        <dd>{String(s.hero.held)}</dd>
        <dt>pieces</dt>
        <dd>{w.pieces.length.toLocaleString('en-US')}</dd>
        <dt>broken</dt>
        <dd>
          {w.broken.length} objects · {w.debris.length} debris
        </dd>
        <dt>NPCs</dt>
        <dd>
          {w.npcs.length}
          {s.talking ? ` · talking to ${s.talking.profile.name}` : ''}
        </dd>
        <dt>variables</dt>
        <dd>{[...s.logic.vars].map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' · ') || 'none'}</dd>
        <dt>items</dt>
        <dd>{[...s.inventory].map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'}</dd>
        <dt>logic</dt>
        <dd>
          {s.logic.programs.length} event handler{s.logic.programs.length === 1 ? '' : 's'} · {s.logic.active} waiting
          {s.logic.problems.length ? ` · ${s.logic.problems.length} problem(s)` : ''}
        </dd>
        <dt>screens</dt>
        <dd>
          {s.screens
            .screens()
            .map((x) => x.name)
            .join(' › ') || 'none'}
          {s.screenPaused ? ' · game held' : ''}
        </dd>
        <dt>audio</dt>
        <dd>
          music {ed.audio.stats.music ?? '—'} · {ed.audio.pool.active.length} voices · {s.emitterSystem.active.length}{' '}
          emitter loop(s)
        </dd>
        <dt>time</dt>
        <dd>
          {s.runtime.time.toFixed(1)} s · tick {st.ticks} · {ed.timeScale.value}×{ed.paused.value ? ' · paused' : ''}
        </dd>
        <dt>frame</dt>
        <dd>
          {st.fps} fps · {st.steps} steps · draw {st.ms.toFixed(1)} ms
        </dd>
      </dl>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 260px' }}>
        {draw}
        <div class="row" role="group" aria-label="Cheats">
          <button type="button" class="btn" onClick={() => s.cheat('respawn')}>
            Respawn
          </button>
          <button type="button" class="btn" disabled={!w.broken.length} onClick={() => s.cheat('rebuildAll')}>
            Rebuild all
          </button>
          <label class="lbl">
            Teleport
            <select
              class="inp"
              value=""
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) s.cheat('teleport', v);
              }}
            >
              <option value="">spawn…</option>
              {w.doc.spawns.map((sp) => (
                <option value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </label>
          <label class="lbl">
            Held
            <select
              class="inp"
              value={String(s.hero.held)}
              onChange={(e) => s.cheat('held', (e.target as HTMLSelectElement).value)}
            >
              {(MELEE.includes(String(s.hero.held) as (typeof MELEE)[number])
                ? MELEE
                : [String(s.hero.held), ...MELEE]
              ).map((n) => (
                <option value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <TestShortcuts c={c} />
        <span class="muted small">Cheats change only this Play session; Stop discards them.</span>
      </div>
    </div>
  );
}

/** P28: test shortcuts — god mode, set any variable, a snapshot to come back to (this Play only) */
function TestShortcuts({ c }: { c: ActionCtx }) {
  const s = c.ed.session.value;
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  if (!s) return null;
  const vars = [...s.logic.vars.keys()].sort();
  return (
    <div class="row" role="group" aria-label="Test shortcuts" data-tour="test-shortcuts" data-help="play.test">
      <label class="lbl">
        <input
          type="checkbox"
          aria-label="God mode"
          checked={s.god}
          onChange={(e) => {
            s.god = (e.target as HTMLInputElement).checked;
            s.emit('cheat', `God mode ${s.god ? 'on' : 'off'}`);
          }}
        />{' '}
        God mode
      </label>
      <button type="button" class="btn" onClick={() => s.snapshotMoment()}>
        Snapshot
      </button>
      <button type="button" class="btn" disabled={!s.moment} onClick={() => s.restoreMoment()}>
        Back to snapshot
      </button>
      <label class="lbl">
        Set
        <input
          class="inp mono"
          style={{ width: '90px' }}
          list="test-vars"
          aria-label="Variable to set"
          placeholder="variable"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <datalist id="test-vars">
          {vars.map((v) => (
            <option value={v} />
          ))}
        </datalist>
        =
        <input
          class="inp mono"
          style={{ width: '70px' }}
          aria-label="New value"
          placeholder="value"
          value={value}
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !name.trim()) return;
            let v: unknown = value;
            try {
              v = JSON.parse(value);
            } catch {
              /* plain text */
            }
            s.logic.setVar(name.trim(), v);
            s.emit('cheat', `Set ${name.trim()} = ${JSON.stringify(v)}`);
          }}
        />
      </label>
    </div>
  );
}

export const ASSET_FILTERS: [string, string][] = [
  ['all', 'All'],
  ['mine', 'Mine'],
  ['building', 'Buildings'],
  ['nature', 'Nature'],
  ['prop', 'Props'],
  ['structure', 'Structures'],
  ['vehicle', 'Vehicles'],
  ['decoration', 'Decoration'],
  ['generated', 'From maps'],
];

function AssetCards({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const lib = assetLibrary(ed).filter(
    ({ asset: a }) =>
      (filter === 'generated'
        ? a.origin === 'generated'
        : a.origin !== 'generated' &&
          (filter === 'all' || (filter === 'mine' ? a.origin === 'user' || !a.origin : a.category === filter))) &&
      // P32: find an asset by name (or kind) as you type
      words.every((w) => `${a.name} ${a.category ?? ''}`.toLowerCase().includes(w)),
  );
  const brush = ed.assetBrush.value;
  return (
    <>
      <div class="row" style={{ gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          class="inp asset-search"
          aria-label="Search assets"
          placeholder="Search assets…"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
        <div class="row" role="radiogroup" aria-label="Asset kind">
          {ASSET_FILTERS.filter(([id]) => id === filter || shows(c.ed, 'assetFilter', id)).map(([id, label]) => (
            <button
              type="button"
              role="radio"
              aria-checked={filter === id}
              class={`chip ${filter === id ? 'on' : ''}`}
              style={filter === id ? { borderColor: 'var(--acc)' } : undefined}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div class="cards" role="listbox" aria-label="Assets">
        {!lib.length && (
          <span class="muted small">{q ? `No assets match “${q}”.` : 'No assets of this kind yet.'}</span>
        )}
        {lib.map(({ asset: a, inProject }) => {
          const on = brush.asset === a.id && ed.tool.value === 'asset';
          return (
            <button
              type="button"
              class={`card ${on ? 'on' : ''}`}
              role="option"
              aria-selected={on}
              data-tip={`${a.name} · ${a.bricks.length} bricks${a.sockets.length ? ` · ${a.sockets.length} socket(s)` : ''}. Drag it into the scene, or click it and then click the ground. Before you place it, T turns it a quarter turn.`}
              data-help="assets"
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
                {a.origin === 'builtin' || !inProject ? 'built-in' : a.origin === 'generated' ? 'generated' : 'mine'} ·{' '}
                {a.bricks.length}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/** P23: the Dock's effects: each one plays while the pointer is over it; Place puts it beside the start. */
function EffectCards({ c, hint, q }: { c: ActionCtx; hint: string; q: string }) {
  const { ed } = c;
  ed.revision.value;
  const { own, builtin } = allEffects(ed.store);
  const place = (id: string) => {
    const sp = ed.mapDoc.value?.spawns[0]?.pos ?? [0, 0, 0];
    placeEffectAt(ed, { x: sp[0]! + 3, y: Math.round(sp[1]! / 0.4), z: sp[2]! + 3 }, id);
  };
  return (
    <>
      <span class="muted small">{hint}</span>
      <div class="fx-cards" data-tour="dock-effects" data-help="scene.dock.effects">
        <NoMatch q={[...own, ...builtin].some((e) => matches(q, e.name)) ? '' : q} what="effects" />
        {[...own, ...builtin]
          .filter((e) => matches(q, e.name))
          .map((e) => (
            <div class="fx-card" data-name={e.name}>
              <EffectThumb effect={e} size={48} />
              <span class="small">{e.name}</span>
              <button type="button" class="btn small" aria-label={`Place ${e.name}`} onClick={() => place(e.id)}>
                Place
              </button>
            </div>
          ))}
      </div>
    </>
  );
}

/** P27: kinds of light to place, and the lights on this map (click one to pick it) */
function LightCards({ c, hint, q }: { c: ActionCtx; hint: string; q: string }) {
  const { ed } = c;
  ed.revision.value;
  const placed = mapItems(ed).filter((i): i is LightInstance => i.kind === 'light');
  const kinds = LIGHT_PRESETS.filter((k) => matches(q, LIGHT_PRESET[k].name, LIGHT_PRESET[k].about));
  const place = (k: LightPreset) => {
    const sp = ed.mapDoc.value?.spawns[0]?.pos ?? [0, 0, 0];
    placeLightAt(ed, { x: sp[0]! + 3, y: Math.round(sp[1]! / 0.4), z: sp[2]! + 3 }, k);
  };
  return (
    <>
      <span class="muted small">{hint}</span>
      <NoMatch q={kinds.length || placed.some((l) => matches(q, l.name)) ? '' : q} what="lights" />
      <div class="fx-cards" data-tour="dock-lights" data-help="scene.dock.lights">
        {kinds.map((k) => (
          <div class="fx-card" data-name={LIGHT_PRESET[k].name} title={LIGHT_PRESET[k].about}>
            <LightSwatch light={LIGHT_PRESET[k].light} size={48} />
            <span class="small">{LIGHT_PRESET[k].name}</span>
            <button
              type="button"
              class="btn small"
              data-tour={`dock-light-${k}`}
              aria-label={`Place ${LIGHT_PRESET[k].name}`}
              onClick={() => place(k)}
            >
              Place
            </button>
          </div>
        ))}
      </div>
      {placed.length > 0 && (
        <div class="col" style={{ gap: '4px' }}>
          <span class="muted small">On this map</span>
          {placed
            .filter((l) => matches(q, l.name))
            .map((l) => (
              <button type="button" class="lib-item" onClick={() => selectOnly(ed, 'item', l.id)}>
                <LightSwatch light={l.light} size={20} />
                <span class="asset-name">{l.name ?? l.id}</span>
                <span class="mono small muted">{l.on ? 'on' : 'off'}</span>
              </button>
            ))}
        </div>
      )}
    </>
  );
}

/** Dock cards for screens, sound events and music: ▶ to preview, click to open in its workspace. */
function MediaCards({
  c,
  q,
  items,
  play,
  open,
  hint,
}: {
  c: ActionCtx;
  q: string;
  items: { id: string; name: string; sub: string; thumb?: ComponentChildren }[];
  play?: (id: string) => void;
  open: (id: string) => void;
  hint: string;
}) {
  void c;
  return (
    <>
      <span class="muted small">{hint}</span>
      <NoMatch q={items.some((it) => matches(q, it.name, it.sub)) ? '' : q} what="things" />
      <div class="media-cards" data-help="scene.dock.sounds">
        {items
          .filter((it) => matches(q, it.name, it.sub))
          .map((it) => (
            <div class="media-card">
              {it.thumb}
              {play && (
                <button type="button" class="btn icon" aria-label={`Play ${it.name}`} onClick={() => play(it.id)}>
                  ▶
                </button>
              )}
              <button type="button" class="link asset-name" onClick={() => open(it.id)}>
                {it.name}
              </button>
              <span class="mono small muted">{it.sub}</span>
            </div>
          ))}
      </div>
    </>
  );
}

/**
 * Map timeline: what is set to happen on this map, in order: its music and ambience, zones with
 * music or actions, emitters, and the cinematics that play here and what triggers them.
 */
function MapTimeline({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const m = ed.mapDoc.value;
  if (!m) return null;
  const scenes = ed.store
    .list('cinematics/')
    .map((p) => ed.store.get<Cinematic>(p)!)
    .filter((x) => x?.map === m.id);
  const zones = m.zones.filter((z) => z.music !== undefined || z.ambience || z.onEnter?.length || z.onExit?.length);
  return (
    <div class="scroll" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div class="small">
        <strong>{m.name}</strong> · music {m.music ?? 'none'} · ambience {m.ambience ?? 'none'}
      </div>
      {zones.map((z) => (
        <div class="small">
          ⬚ {z.tags[0] ?? z.id}: {z.music !== undefined ? `music ${z.music ?? 'silence'} · ` : ''}
          {z.onEnter?.length ? `${z.onEnter.length} action(s) on enter · ` : ''}
          {z.onExit?.length ? `${z.onExit.length} on exit` : ''}
        </div>
      ))}
      {scenes.map((x) => {
        const uses = usesOf(ed.store, x.id).filter((u) => !u.path.startsWith('cinematics/'));
        return (
          <div class="row small">
            <button
              type="button"
              class="link"
              onClick={() => {
                ed.cinematicId.value = x.id;
                c.ui.workspace('Cinematics');
              }}
            >
              🎬 {x.name}
            </button>
            <span class="muted">
              {x.length}s · {uses.length ? `played by ${uses.map((u) => u.what).join(', ')}` : 'not triggered yet'}
            </span>
          </div>
        );
      })}
      {!scenes.length && !zones.length && <span class="muted small">Nothing scheduled on this map yet.</span>}
    </div>
  );
}

/** P18: every dock tab (for the tag tests) */
export const DOCK_TABS = ['assets', 'console', 'timeline', 'profiler', 'problems', 'debug', 'audio'] as const;
type DockTab = (typeof DOCK_TABS)[number];
