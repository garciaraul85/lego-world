import { useMemo, useState } from 'preact/hooks';
import { BRICK_SIZES, type Gates, paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import type { EditorState, LogLevel } from '../state';
import { Swatches } from './Inspector';

const CATS: [string, string | null, string][] = [
  ['Bricks', null, 'Pick a shape and a color, then click in the map with Brick paint (B). T turns the brush.'],
  ['Assets', 'Phase 3', 'Reusable objects (houses, chests, stalls) are built in the Asset studio.'],
  ['Characters', 'Phase 3', 'Characters are edited in LEGO World v68 until the Character studio lands.'],
  ['Cinematics', 'Phase 6', 'Directed scenes arrive with the Cinematics director.'],
  ['UI screens', 'Phase 5', 'Splash, HUD and pause screens arrive with the Screens editor.'],
  ['Sounds', 'Phase 5', 'Sound events and emitters arrive with the Audio workspace.'],
  ['Music', 'Phase 5', 'Music zones arrive with the Audio workspace.'],
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
              {later ? '·' : BRICK_SIZES.length * 3}
            </span>
          </button>
        ))}
      </div>
      <div class="scroll" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {cur[1] ? (
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
    const maps = ed.maps.value;
    const gates = ed.store.get<Gates>(paths.gates);
    for (const m of maps) {
      if (!m.spawns.length)
        out.push({
          level: 'warn',
          msg: `${m.name} has no spawn point`,
          where: m.name,
          fix: { label: 'Open', run: () => ed.openMap(m.id) },
        });
      if (m.size)
        for (const s of m.spawns) {
          const hw = m.size.w / 2;
          const hd = m.size.d / 2;
          if (Math.abs(s.pos[0]) > hw || Math.abs(s.pos[2]) > hd)
            out.push({
              level: 'warn',
              msg: `Spawn “${s.name}” is outside the generated world`,
              where: m.name,
              fix: {
                label: 'Select',
                run: () => {
                  ed.openMap(m.id);
                  ed.selectedSpawn.value = s.id;
                },
              },
            });
        }
    }
    if (maps.length > 1 && gates) {
      const entry = ed.store.manifest.entry.map;
      const seen = new Set([entry]);
      const queue = [entry];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const g of gates.gates) {
          const next = g.from.map === cur ? g.to.map : g.twoWay && g.to.map === cur ? g.from.map : null;
          if (next && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      for (const m of maps)
        if (!seen.has(m.id))
          out.push({
            level: 'info',
            msg: `${m.name} can’t be reached from the start map (add a gate in v68 Routes)`,
            where: 'World graph',
          });
    }
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
