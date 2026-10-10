import { useEffect, useState } from 'preact/hooks';
import type { Brick } from '../../core/bricks/codec';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import { worldGenerator } from '../../core/legacy/modules';
import { BIOMES, BRICK_SIZES, TIMES } from '../../core/schema';
import type { GenerateConfig } from '../../core/worldgen/generate';
import { type ActionCtx, action, runAction } from '../actions/registry';
import { groupLabel } from '../categories';

const BIOME_NAMES = Object.fromEntries(worldGenerator().biomes);
const pretty = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Number input that commits on Enter or blur (one command per edit, not per keystroke). */
function Num({
  value,
  onCommit,
  label,
  step = 1,
}: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  step?: number;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <label>
      {label}
      <input
        class="inp mono"
        inputMode="numeric"
        value={v}
        step={step}
        aria-label={label}
        onInput={(e) => setV((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

function TextField({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => (v.trim() && v !== value ? onCommit(v) : setV(value));
  return (
    <input
      class="inp"
      aria-label={label}
      value={v}
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export function Swatches({ value, onPick }: { value?: string; onPick: (hex: string) => void }) {
  return (
    <div class="row" role="listbox" aria-label="Brick colors">
      {LEGACY_COLORS.map(([name, hex]) => (
        <button
          type="button"
          class={`swatch ${value === hex ? 'on' : ''}`}
          role="option"
          aria-selected={value === hex}
          aria-label={name}
          title={name}
          style={{ background: hex }}
          onClick={() => onPick(hex)}
        />
      ))}
    </div>
  );
}

export function RightPanel({ c, className }: { c: ActionCtx; className?: string }) {
  const { ed } = c;
  const tab = ed.right.value;
  return (
    <section class={`panel right ${className ?? ''}`} aria-label="Inspector" data-tour="inspector">
      <div class="ptabs">
        {(
          [
            ['inspect', 'Inspector'],
            ['map', 'Map'],
            ['project', 'Project'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            class={`tab ${tab === id ? 'on' : ''}`}
            data-tour={`tab-${id}`}
            onClick={() => {
              ed.right.value = id;
              ed.persistUi();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="scroll">
        {tab === 'inspect' && <InspectorTab c={c} />}
        {tab === 'map' && <MapTab c={c} />}
        {tab === 'project' && <ProjectTab c={c} />}
      </div>
    </section>
  );
}

function InspectorTab({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const sel = ed.selectedBricks.value;
  const spawnId = ed.selectedSpawn.value;
  const map = ed.mapId.value;
  ed.revision.value;
  if (spawnId) {
    const sp = ed.mapDoc.value?.spawns.find((s) => s.id === spawnId);
    if (!sp) return <div class="sec muted">That spawn point was removed.</div>;
    const isStart = ed.store.manifest.entry.spawn === sp.id && ed.store.manifest.entry.map === map;
    return (
      <>
        <Header title={sp.name} sub={`Spawn point${isStart ? ' · game start' : ''}`} color="#4fd1c5" />
        <div class="sec">
          <div class="field">
            Name
            <TextField
              label="Spawn name"
              value={sp.name}
              onCommit={(name) => ed.exec({ type: 'map.updateSpawn', payload: { map, spawn: sp.id, name } })}
            />
          </div>
          <div class="sech">
            <span>Position</span>
            <span style={{ textTransform: 'none', letterSpacing: 0 }}>studs</span>
          </div>
          <div class="grid3">
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <Num
                label={axis}
                step={i === 1 ? 0.4 : 1}
                value={Math.round(sp.pos[i]! * 100) / 100}
                onCommit={(v) => {
                  const pos = [...sp.pos] as [number, number, number];
                  pos[i] = v;
                  ed.exec({ type: 'map.updateSpawn', payload: { map, spawn: sp.id, pos } });
                }}
              />
            ))}
          </div>
          <div class="field">
            Facing
            <div class="row">
              {[0, 90, 180, 270].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const on = Math.abs((((sp.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - rad) < 0.01;
                return (
                  <button
                    type="button"
                    class={`btn ${on ? 'on' : ''}`}
                    onClick={() => ed.exec({ type: 'map.updateSpawn', payload: { map, spawn: sp.id, yaw: rad } })}
                  >
                    {deg}°
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div class="sec">
          <button
            type="button"
            class="btn wide"
            disabled={isStart}
            onClick={() => ed.exec({ type: 'project.update', payload: { entryMap: map, entrySpawn: sp.id } })}
          >
            {isStart ? 'The game starts here' : 'Start the game here'}
          </button>
          <button
            type="button"
            class="btn wide danger"
            onClick={() => {
              if (ed.exec({ type: 'map.removeSpawn', payload: { map, spawn: sp.id } }).ok)
                ed.selectedSpawn.value = null;
            }}
          >
            Delete spawn point
          </button>
        </div>
      </>
    );
  }
  if (!sel.length)
    return (
      <div class="sec">
        <div class="muted">Nothing selected.</div>
        <p class="hint">
          Click an object in the map or the Hierarchy. Alt-click picks a single brick, Shift-click adds to the
          selection. Use Brick paint (B) to build, and the Map tab to generate terrain.
        </p>
      </div>
    );
  const groups = new Set(sel.map((b) => b.group));
  const one = sel.length === 1 ? sel[0]! : null;
  const title =
    groups.size === 1 && sel[0]!.group
      ? groupLabel(sel[0]!.group)
      : one
        ? pretty(one.type.replace(/(\d)x/, '$1×'))
        : `${sel.length} bricks`;
  const minX = Math.min(...sel.map((b) => b.x));
  const minZ = Math.min(...sel.map((b) => b.z));
  const minY = Math.min(...sel.map((b) => b.y));
  const move = (dx: number, dy: number, dz: number) =>
    ed.exec({ type: 'bricks.move', payload: { map, ids: sel.map((b) => b.id), dx, dy, dz } });
  const colors = new Set(sel.map((b) => b.color));
  return (
    <>
      <Header
        title={title}
        sub={`${sel.length} piece${sel.length === 1 ? '' : 's'}${groups.size === 1 && sel[0]!.group ? ` · object ${sel[0]!.group}` : ''}`}
        color={sel[0]!.color}
      />
      <div class="sec">
        <div class="sech">
          <span>Transform</span>
          <span style={{ textTransform: 'none', letterSpacing: 0 }}>studs · plates</span>
        </div>
        <div class="grid3">
          <Num label="X" value={minX} onCommit={(v) => move(Math.round(v) - minX, 0, 0)} />
          <Num label="Z" value={minZ} onCommit={(v) => move(0, 0, Math.round(v) - minZ)} />
          <Num label="Height" value={minY} onCommit={(v) => move(0, Math.round(v) - minY, 0)} />
        </div>
        <div class="field">
          Turn
          <div class="row">
            <button type="button" class="btn" onClick={() => runRotate(c)}>
              Rotate 90°
            </button>
            {one && <span class="muted mono">{one.rot * 90}°</span>}
          </div>
        </div>
      </div>
      {one && <BrickShape c={c} b={one} />}
      <div class="sec">
        <div class="sech">
          <span>Color</span>
          <span class="mono" style={{ textTransform: 'none' }}>
            {colors.size === 1 ? sel[0]!.color : `${colors.size} colors`}
          </span>
        </div>
        <Swatches
          value={colors.size === 1 ? sel[0]!.color : undefined}
          onPick={(color) => ed.exec({ type: 'bricks.paint', payload: { map, ids: sel.map((b) => b.id), color } })}
        />
      </div>
      <div class="sec">
        <div class="sech">
          <span>Destruction</span>
        </div>
        <div class="hint">
          {sel[0]!.group
            ? 'In play, smashing any brick of this object breaks the whole object; hold E to rebuild it (v68 rules).'
            : 'Loose bricks break one at a time in play.'}
        </div>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Sound, cinematics &amp; UI</span>
        </div>
        <div class="field">
          On smash<span class="chip">Phase 5</span>
        </div>
        <div class="field">
          Cinematic<span class="chip">Phase 6</span>
        </div>
        <div class="field">
          Logic<span class="chip">Phase 4</span>
        </div>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        <div class="row">
          <button type="button" class="btn" style={{ flex: 1 }} onClick={() => c.ui.frameSelection()}>
            Frame (F)
          </button>
          <button
            type="button"
            class="btn danger"
            style={{ flex: 1 }}
            onClick={() =>
              ed.exec({ type: 'bricks.remove', payload: { map, ids: sel.map((b) => b.id) } }).ok && ed.select([])
            }
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

function runRotate(c: ActionCtx) {
  runAction(action('edit.rotate'), c);
}

function BrickShape({ c, b }: { c: ActionCtx; b: Brick }) {
  const { ed } = c;
  const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(b.type)!;
  const set = (type: string) =>
    ed.exec({ type: 'bricks.update', payload: { map: ed.mapId.value, bricks: [{ id: b.id, type }] } });
  return (
    <div class="sec">
      <div class="sech">
        <span>Piece</span>
        <span class="mono">id {b.id}</span>
      </div>
      <div class="field">
        Kind
        <select
          class="inp"
          value={m[1]}
          onChange={(e) => set(`${(e.target as HTMLSelectElement).value}${m[2]}x${m[3]}`)}
        >
          <option value="brick">Brick (3 plates)</option>
          <option value="plate">Plate</option>
          <option value="tile">Tile (no studs)</option>
        </select>
      </div>
      <div class="field">
        Size
        <select
          class="inp"
          value={`${m[2]}x${m[3]}`}
          onChange={(e) => set(`${m[1]}${(e.target as HTMLSelectElement).value}`)}
        >
          {BRICK_SIZES.map(([r, cc]) => (
            <option value={`${r}x${cc}`}>
              {r} × {cc}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Header({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid var(--line2)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '30px',
          height: '30px',
          borderRadius: '6px',
          background: color,
          boxShadow: 'inset 0 -5px 0 #00000040',
          flex: 'none',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: '14px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <div class="mono small muted">{sub}</div>
      </div>
    </div>
  );
}

function MapTab({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const m = ed.mapDoc.value;
  const g = m?.generator;
  const [cfg, setCfg] = useState<GenerateConfig>({
    environments: ['forest', 'city'],
    size: 24,
    seed: 73521,
    mountainShape: 'mixed',
    mountainScale: 'mixed',
  });
  useEffect(() => {
    if (g)
      setCfg({
        environments: [...g.environments],
        size: g.size,
        seed: g.seed,
        mountainShape: g.mountainShape ?? 'mixed',
        mountainScale: g.mountainScale ?? 'mixed',
      });
  }, [m?.id, g?.seed, g?.environments.join()]);
  if (!m) return null;
  const map = m.id;
  const env = (patch: object) => ed.exec({ type: 'map.setEnvironment', payload: { map, ...patch } });
  const gen = worldGenerator();
  const generate = (reroll: boolean) => {
    const next = reroll ? { ...cfg, seed: Math.floor(Math.random() * 99_999_999) } : cfg;
    setCfg(next);
    const r = ed.exec({
      type: 'map.generate',
      payload: {
        map,
        config: { ...next, time: m.sky.time, rain: m.weather.rain, snow: m.weather.snow, snowing: m.weather.snowing },
      },
    });
    if (r.ok) {
      ed.select([]);
      c.ui.fit();
      ed.notify(
        `Generated ${next.environments.length} environment${next.environments.length === 1 ? '' : 's'} · seed ${next.seed}. Undo brings the old map back.`,
      );
    }
  };
  return (
    <>
      <div class="sec">
        <div class="sech">
          <span>Map</span>
          <button type="button" class="link" onClick={() => (ed.view.value = 'graph')}>
            World graph
          </button>
        </div>
        <div class="field">
          Name
          <TextField
            label="Map name"
            value={m.name}
            onCommit={(name) => ed.exec({ type: 'map.rename', payload: { map, name } })}
          />
        </div>
        <div class="field">
          Size<span class="mono">{m.size ? `${m.size.w} × ${m.size.d} studs` : 'free build'}</span>
        </div>
        <div class="field">
          Pieces<span class="mono">{(ed.scene.value?.count ?? 0).toLocaleString('en-US')} / 12,000</span>
        </div>
      </div>
      <div class="sec" data-tour="generate">
        <div class="sech">
          <span>Terrain generator</span>
          <span class="mono" style={{ textTransform: 'none' }}>
            v68
          </span>
        </div>
        <fieldset
          style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}
        >
          <legend class="small muted" style={{ marginBottom: '4px' }}>
            Environments
          </legend>
          {BIOMES.map((b) => (
            <label class="small" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={cfg.environments.includes(b)}
                style={{ accentColor: 'var(--acc)' }}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    environments: (e.target as HTMLInputElement).checked
                      ? [...cfg.environments, b]
                      : cfg.environments.filter((x) => x !== b),
                  })
                }
              />
              {BIOME_NAMES[b] ?? b}
            </label>
          ))}
        </fieldset>
        <div class="field">
          District size
          <select
            class="inp"
            value={cfg.size}
            onChange={(e) => setCfg({ ...cfg, size: Number((e.target as HTMLSelectElement).value) as 16 | 24 | 32 })}
          >
            <option value="16">Small (16)</option>
            <option value="24">Medium (24)</option>
            <option value="32">Large (32)</option>
          </select>
        </div>
        <div class="field">
          Mountains
          <select
            class="inp"
            value={cfg.mountainShape}
            onChange={(e) => setCfg({ ...cfg, mountainShape: (e.target as HTMLSelectElement).value })}
          >
            {gen.mountainShapes.map(([id, label]) => (
              <option value={id}>{label}</option>
            ))}
          </select>
        </div>
        <div class="field">
          Heights
          <select
            class="inp"
            value={cfg.mountainScale}
            onChange={(e) => setCfg({ ...cfg, mountainScale: (e.target as HTMLSelectElement).value })}
          >
            {gen.mountainScales.map(([id, label]) => (
              <option value={id}>{label}</option>
            ))}
          </select>
        </div>
        <div class="field">
          Seed
          <input
            class="inp mono"
            inputMode="numeric"
            value={cfg.seed}
            onInput={(e) =>
              setCfg({
                ...cfg,
                seed: Math.max(0, Math.min(99_999_999, Math.floor(Number((e.target as HTMLInputElement).value) || 0))),
              })
            }
          />
        </div>
        <div class="row">
          <button
            type="button"
            class="btn on"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => generate(false)}
          >
            Generate
          </button>
          <button
            type="button"
            class="btn"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => generate(true)}
          >
            New seed
          </button>
        </div>
        <p class="hint">Generating replaces this map’s bricks and neighbors. Undo restores them.</p>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Sky &amp; weather</span>
        </div>
        <div class="field">
          Start time
          <select class="inp" value={m.sky.time} onChange={(e) => env({ time: (e.target as HTMLSelectElement).value })}>
            {TIMES.map((t) => (
              <option value={t}>{pretty(t)}</option>
            ))}
          </select>
        </div>
        <div class="field">
          Weather
          <div class="row">
            {(['rain', 'snow', 'snowing'] as const).map((w) => (
              <button
                type="button"
                class={`btn ${m.weather[w] ? 'on' : ''}`}
                aria-pressed={m.weather[w]}
                onClick={() => env({ [w]: !m.weather[w] })}
              >
                {w === 'snow' ? 'Snow cover' : pretty(w)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        <div class="sech">
          <span>Audio &amp; first visit</span>
        </div>
        <div class="field">
          Music<span class="chip">Phase 5</span>
        </div>
        <div class="field">
          Cinematic<span class="chip">Phase 6</span>
        </div>
      </div>
    </>
  );
}

function ProjectTab({ c }: { c: ActionCtx }) {
  const { ed, ui } = c;
  ed.revision.value;
  const p = ed.store.manifest;
  const startMap = ed.maps.value.find((m) => m.id === p.entry.map);
  return (
    <>
      <div class="sec">
        <div class="sech">
          <span>Game</span>
        </div>
        <div class="field">
          Title
          <TextField
            label="Game title"
            value={p.name}
            onCommit={(name) => ed.exec({ type: 'project.update', payload: { name } })}
          />
        </div>
        <div class="field">
          Start map
          <select
            class="inp"
            value={p.entry.map}
            onChange={(e) =>
              ed.exec({ type: 'project.update', payload: { entryMap: (e.target as HTMLSelectElement).value } })
            }
          >
            {ed.maps.value.map((m) => (
              <option value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          Start spawn
          <select
            class="inp"
            value={p.entry.spawn ?? ''}
            onChange={(e) =>
              ed.exec({ type: 'project.update', payload: { entrySpawn: (e.target as HTMLSelectElement).value } })
            }
          >
            {startMap?.spawns.map((s) => (
              <option value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div class="field">
          Start screen<span class="chip">Phase 5</span>
        </div>
      </div>
      <div class="sec">
        <div class="sech">
          <span>Limits</span>
        </div>
        <div class="field">
          Maps<span class="mono">{ed.maps.value.length} / 16</span>
        </div>
        <div class="field">
          Pieces / map<span class="mono">12,000</span>
        </div>
        <div class="field">
          Undo history<span class="mono">{ed.bus.history().length} / 200 steps</span>
        </div>
      </div>
      <div class="sec" style={{ borderBottom: 0 }}>
        <div class="sech">
          <span>Files</span>
        </div>
        <button type="button" class="btn wide" onClick={() => ui.exportProject()}>
          Save project file (.bwproj)
        </button>
        <button type="button" class="btn wide" onClick={() => ui.exportLegacySave()}>
          Export LEGO World save (.json)
        </button>
        <button type="button" class="btn wide" onClick={() => ui.importFile()}>
          Import project or save…
        </button>
        <button type="button" class="btn wide" disabled title="Phase 8">
          Export playable game · Phase 8
        </button>
      </div>
    </>
  );
}
