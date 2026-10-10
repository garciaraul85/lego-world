import { useEffect, useRef } from 'preact/hooks';
import { footprint } from '../../core/bricks/inspect';
import type { ActionCtx } from '../actions/registry';
import type { ViewTab } from '../state';
import { Viewport, type ViewportApi } from './Viewport';

export function ViewportPanel({ c, onApi }: { c: ActionCtx; onApi: (a: ViewportApi) => void }) {
  const { ed } = c;
  const view = ed.view.value;
  const tabs: [ViewTab, string][] = [
    ['scene', 'Scene'],
    ['game', 'Game'],
    ['graph', 'World graph'],
    ['nav', 'Walkable map'],
  ];
  const m = ed.mapDoc.value;
  return (
    <section class="panel" aria-label="Viewport" style={{ minHeight: 0 }}>
      <div class="ptabs">
        {tabs.map(([id, label]) => (
          <button
            type="button"
            class={`tab ${view === id ? 'on' : ''}`}
            onClick={() => {
              if (id === 'graph') return c.ui.workspace('World graph');
              ed.view.value = id;
              ed.persistUi();
            }}
          >
            {label}
          </button>
        ))}
        <div class="vp-chips">
          <span class="chip">{view === 'game' ? 'Game camera' : 'Perspective'}</span>
          {m && (
            <span class="chip">
              {m.sky.time}
              {m.weather.rain ? ' · rain' : ''}
              {m.weather.snowing ? ' · snowing' : ''}
            </span>
          )}
        </div>
      </div>
      {(view === 'scene' || view === 'graph') && <Viewport ed={ed} mode="scene" api={onApi} />}
      {view === 'game' && (
        <div class="viewport-wrap">
          <Viewport ed={ed} mode="game" />
          <div class="vp-overlay">
            Game camera from{' '}
            <strong>
              {m?.spawns.find((s) => s.id === ed.store.manifest.entry.spawn)?.name ?? m?.spawns[0]?.name ?? 'spawn'}
            </strong>{' '}
            · not running
            <button type="button" class="btn go" style={{ minHeight: '26px' }} onClick={() => c.ui.play('engine')}>
              Play
            </button>
          </div>
        </div>
      )}
      {view === 'nav' && <WalkableView c={c} />}
    </section>
  );
}

/** Top-down height map of the current map: walkable ground, climbable steps, blocked walls. */
function WalkableView({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const ref = useRef<HTMLCanvasElement>(null);
  const rev = ed.revision.value;
  useEffect(() => {
    const s = ed.scene.value;
    const cv = ref.current;
    if (!s || !cv) return;
    const b = s.bounds();
    if (!b) return;
    const x0 = Math.floor(b.min[0]);
    const z0 = Math.floor(b.min[2]);
    const w = Math.max(1, Math.ceil(b.max[0]) - x0);
    const d = Math.max(1, Math.ceil(b.max[2]) - z0);
    const top = new Int16Array(w * d).fill(-1);
    for (const br of s.all()) {
      const [bw, bd] = footprint(br);
      const h = br.y + (br.type.startsWith('brick') ? 3 : 1);
      for (let x = 0; x < bw; x++)
        for (let z = 0; z < bd; z++) {
          const i = (br.z + z - z0) * w + (br.x + x - x0);
          if (i >= 0 && i < top.length && h > top[i]!) top[i] = h;
        }
    }
    cv.width = w;
    cv.height = d;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(w, d);
    for (let z = 0; z < d; z++)
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        const h = top[i]!;
        let step = 0;
        for (const [dx, dz] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue;
          step = Math.max(step, Math.abs((top[nz * w + nx] ?? -1) - h));
        }
        const c = h < 0 ? [17, 22, 27] : step <= 1 ? [79, 154, 90] : step <= 3 ? [138, 90, 42] : [90, 42, 42];
        img.data.set([...c, 255], i * 4);
      }
    ctx.putImageData(img, 0, 0);
  }, [ed.scene.value, rev]);
  return (
    <div class="viewport-wrap">
      <div class="navview">
        <canvas ref={ref} aria-label="Walkable map" style={{ width: '92%', height: '92%', objectFit: 'contain' }} />
      </div>
      <div class="legend">
        <span class="chip">
          <span style={{ width: '10px', height: '10px', background: '#4f9a5a', borderRadius: '2px' }} />
          Walkable (step ≤ 1 plate)
        </span>
        <span class="chip">
          <span style={{ width: '10px', height: '10px', background: '#8a5a2a', borderRadius: '2px' }} />
          Climb / jump
        </span>
        <span class="chip">
          <span style={{ width: '10px', height: '10px', background: '#5a2a2a', borderRadius: '2px' }} />
          Blocked
        </span>
      </div>
    </div>
  );
}
