import { useMemo, useState } from 'preact/hooks';
import { BRICK_SIZES } from '../../core/schema';
import { validateWorld } from '../../core/world/validate';
import { allScreens } from '../../engine/ui/screens';
import type { ActionCtx } from '../actions/registry';
import { assetLibrary } from '../assets';
import { AssetThumb } from '../components/AssetThumb';
import { MELEE } from '../play/debug';
import type { EditorState, LogLevel } from '../state';
import { MixerView } from '../workspaces/audio/MixerView';
import { musicOptions, soundOptions } from './AudioFields';
import { Swatches } from './Inspector';

const CATS: [string, string | null, string][] = [
  ['Bricks', null, 'Pick a shape and a color, then click in the map with Brick paint (B). T turns the brush.'],
  [
    'Assets',
    null,
    'Click an asset, then click in the map (Place asset, A). T turns it. Edit assets in the Asset studio.',
  ],
  ['Characters', null, 'Characters, their looks and their clips (emotes) are made in the Character studio.'],
  ['Cinematics', 'Phase 6', 'Directed scenes arrive with the Cinematics director.'],
  ['UI screens', null, 'Splash, title, HUD, pause, dialogue, game over and your own screens.'],
  ['Sounds', null, 'Sound events: ▶ to listen; place one in the map as an emitter (Sound emitter tool, S).'],
  ['Music', null, 'Music states: ▶ to audition; pick one as the map music or a zone’s music.'],
];

export function Dock({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const tab = ed.dock.value;
  const problems = useProblems(ed);
  const tabs: [typeof tab, string][] = [
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
        {tabs.map(([id, label]) => (
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
      {tab === 'timeline' && (
        <div class="placeholder">
          <strong>Map timeline · Phase 6</strong>
          <span class="muted">
            Scheduled music, ambience, volcano and logic timers over a sandbox day will appear here with the Cinematics
            director.
          </span>
        </div>
      )}
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
  const brush = ed.brush.value;
  const setBrush = (patch: Partial<typeof brush>) => {
    ed.brush.value = { ...brush, ...patch };
    if (ed.tool.value !== 'place' && patch.type) ed.tool.value = 'place';
    ed.persistUi();
  };
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
            }}
          >
            {name}
            <span class="mono small" style={{ color: '#6f7a89' }}>
              {name === 'Assets' ? assetLibrary(ed).length : later ? '·' : BRICK_SIZES.length * 3}
            </span>
          </button>
        ))}
      </div>
      <div class="scroll" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {cur[0] === 'Assets' ? (
          <AssetCards c={c} />
        ) : cur[0] === 'Characters' ? (
          <div class="placeholder" style={{ padding: '8px' }}>
            <strong>Characters</strong>
            <span class="muted">{cur[2]}</span>
            <button type="button" class="btn on" onClick={() => c.ui.workspace('Characters')}>
              Open the Character studio
            </button>
          </div>
        ) : cur[0] === 'UI screens' ? (
          <MediaCards
            c={c}
            items={allScreens(ed.store).map((s) => ({ id: s.id, name: s.name, sub: s.kind }))}
            open={(id) => {
              ed.screenId.value = id;
              ed.widgetPath.value = '';
              c.ui.workspace('Screens');
            }}
            hint={cur[2]}
          />
        ) : cur[0] === 'Sounds' ? (
          <MediaCards
            c={c}
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
        ) : (
          <>
            <div class="row" role="radiogroup" aria-label="Piece kind">
              {(['brick', 'plate', 'tile'] as const).map((k) => {
                const on = brush.type.startsWith(k);
                return (
                  <button
                    type="button"
                    class={`btn ${on ? 'on' : ''}`}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setBrush({ type: brush.type.replace(/^(brick|plate|tile)/, k) })}
                  >
                    {k === 'brick' ? 'Bricks' : k === 'plate' ? 'Plates' : 'Tiles'}
                  </button>
                );
              })}
              <span class="muted small">Turned {brush.rot * 90}° (T)</span>
            </div>
            <div class="cards" role="listbox" aria-label="Piece sizes">
              {BRICK_SIZES.map(([r, cc]) => {
                const kind = brush.type.replace(/\d.*$/, '');
                const type = `${kind}${r}x${cc}`;
                const on = brush.type === type;
                const h = kind === 'brick' ? 22 : kind === 'plate' ? 9 : 7;
                return (
                  <button
                    type="button"
                    class={`card ${on ? 'on' : ''}`}
                    role="option"
                    aria-selected={on}
                    onClick={() => setBrush({ type })}
                  >
                    <span class="thumb" aria-hidden="true">
                      <span
                        style={{
                          display: 'block',
                          width: `${Math.min(64, 7 * cc)}px`,
                          height: `${h}px`,
                          background: brush.color,
                          borderRadius: '3px',
                          boxShadow: 'inset 0 -4px 0 #00000040',
                        }}
                      />
                    </span>
                    <span class="small">
                      {kind.charAt(0).toUpperCase() + kind.slice(1)} {r}×{cc}
                    </span>
                  </button>
                );
              })}
            </div>
            <Swatches value={brush.color} onPick={(color) => setBrush({ color })} />
          </>
        )}
        <div class="hint">{cur[2]}</div>
      </div>
    </div>
  );
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
        <span>Pieces {(ed.scene.value?.count ?? 0).toLocaleString('en-US')} / 12,000</span>
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
function useProblems(ed: EditorState): LiveProblem[] {
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
    return out;
  }, [rev, ed.problems.value]);
}

function Problems({ problems }: { c: ActionCtx; problems: LiveProblem[] }) {
  if (!problems.length)
    return (
      <div class="muted" style={{ padding: '10px 12px' }}>
        No problems found.
      </div>
    );
  return (
    <div class="scroll">
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
        <span class="muted">Press Play (F5) to watch the running game here. Debug drawing applies to Play.</span>
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
        <span class="muted small">Cheats change only this Play session; Stop discards them.</span>
      </div>
    </div>
  );
}

const ASSET_FILTERS: [string, string][] = [
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
  const lib = assetLibrary(ed).filter(({ asset: a }) =>
    filter === 'generated'
      ? a.origin === 'generated'
      : a.origin !== 'generated' &&
        (filter === 'all' || (filter === 'mine' ? a.origin === 'user' || !a.origin : a.category === filter)),
  );
  const brush = ed.assetBrush.value;
  return (
    <>
      <div class="row" role="radiogroup" aria-label="Asset kind">
        {ASSET_FILTERS.map(([id, label]) => (
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
      <div class="cards" role="listbox" aria-label="Assets">
        {!lib.length && <span class="muted small">No assets of this kind yet.</span>}
        {lib.map(({ asset: a, inProject }) => {
          const on = brush.asset === a.id && ed.tool.value === 'asset';
          return (
            <button
              type="button"
              class={`card ${on ? 'on' : ''}`}
              role="option"
              aria-selected={on}
              title={`${a.name} · ${a.bricks.length} bricks${a.sockets.length ? ` · ${a.sockets.length} socket(s)` : ''}`}
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

/** Dock cards for screens, sound events and music: ▶ to preview, click to open in its workspace. */
function MediaCards({
  c,
  items,
  play,
  open,
  hint,
}: {
  c: ActionCtx;
  items: { id: string; name: string; sub: string }[];
  play?: (id: string) => void;
  open: (id: string) => void;
  hint: string;
}) {
  void c;
  return (
    <>
      <span class="muted small">{hint}</span>
      <div class="media-cards">
        {items.map((it) => (
          <div class="media-card">
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
