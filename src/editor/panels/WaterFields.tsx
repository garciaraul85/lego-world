import { WATER_KINDS, type WaterInstance } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp, Header, Num, TextField } from '../components/fields';
import { WATER_PRESET } from '../interact/place';

export const WATER_HELP = {
  water:
    'Water fills a box on the map, up to its surface. In Play, loose objects and smashed bricks float in it, slow down in it and drift with its current. Pool, River, Lake and Sea only change its colour and starting size; a river flows.',
  current:
    'Which way the water flows and how fast, in studs a second: across (X) and deep (Z). 0, 0 is still water. Things floating in it drift along.',
};

/** Milestone 2b: a body of water selected in the Scene: its kind, size, current and colour */
export function WaterInspector({ c, item: it }: { c: ActionCtx; item: WaterInstance }) {
  const { ed } = c;
  const map = ed.mapId.value;
  const patch = (p: Partial<WaterInstance>, label = 'Edit water') =>
    ed.exec({ type: 'item.update', payload: { map, id: it.id, patch: p } }, { label });
  const cur = it.current ?? [0, 0];
  const vec = (
    title: string,
    v: readonly number[],
    names: readonly string[],
    set: (i: number, n: number) => void,
    step = 1,
  ) => (
    <>
      <div class="sech">
        <span>{title}</span>
      </div>
      <div class={names.length === 3 ? 'grid3' : 'grid2'}>
        {names.map((n, i) => (
          <Num key={n} label={n} step={step} value={Math.round(v[i]! * 100) / 100} onCommit={(x) => set(i, x)} />
        ))}
      </div>
    </>
  );
  return (
    <>
      <Header title={it.name ?? 'Water'} sub={`Water · ${WATER_PRESET[it.body].name}`} color={it.color ?? '#4fa3d9'} />
      <div class="sec" data-help="scene.item.water" data-tour="item-water">
        <div class="field">
          Name
          <TextField label="Water name" value={it.name ?? ''} onCommit={(name) => patch({ name: name.slice(0, 60) })} />
        </div>
        <label class="field">
          <span>
            Kind
            <FieldHelp label="Water" text={WATER_HELP.water} />
          </span>
          <select
            class="inp"
            aria-label="Kind of water"
            data-tour="water-kind"
            value={it.body}
            onChange={(e) =>
              patch({ body: (e.target as HTMLSelectElement).value as WaterInstance['body'] }, 'Kind of water')
            }
          >
            {WATER_KINDS.map((k) => (
              <option key={k} value={k}>
                {WATER_PRESET[k].name}
              </option>
            ))}
          </select>
        </label>
        {vec('Corner (studs)', it.pos, ['X', 'Y', 'Z'], (i, n) => {
          const p = [...it.pos] as [number, number, number];
          p[i] = n;
          patch({ pos: p }, 'Move water');
        })}
        {vec('Size (width, depth to surface, length)', it.size, ['W', 'H', 'D'], (i, n) => {
          const s = [...it.size] as [number, number, number];
          const lim = i === 1 ? [0.4, 120] : [1, 2048];
          s[i] = Math.max(lim[0]!, Math.min(lim[1]!, n));
          patch({ size: s }, 'Water size');
        })}
        <div class="sech">
          <span>
            Current
            <FieldHelp label="Current" text={WATER_HELP.current} />
          </span>
        </div>
        <div class="grid2" data-tour="water-current">
          {(['Across', 'Deep'] as const).map((n, i) => (
            <Num
              key={n}
              label={`Current ${n.toLowerCase()}`}
              step={0.5}
              value={cur[i]!}
              onCommit={(x) => {
                const v = [...cur] as [number, number];
                v[i] = Math.max(-20, Math.min(20, x));
                patch({ current: v }, 'Water current');
              }}
            />
          ))}
        </div>
        <label class="field">
          <span>Colour</span>
          <input
            type="color"
            aria-label="Water colour"
            value={it.color ?? '#4fa3d9'}
            onChange={(e) => patch({ color: (e.target as HTMLInputElement).value }, 'Water colour')}
          />
        </label>
        <p class="muted small">Loose objects and smashed bricks float in it in Play. Right-click it to delete it.</p>
      </div>
    </>
  );
}
