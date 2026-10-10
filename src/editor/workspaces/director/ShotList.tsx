import type { Cinematic } from '../../../core/schema';
import type { Sel } from './model';

/** The shot list: every camera item in time order; click to select it and jump there. */
export function ShotList({
  cin,
  sel,
  onPick,
  onFromView,
}: {
  cin: Cinematic;
  sel: Sel;
  onPick: (track: number, item: number, t: number) => void;
  onFromView: () => void;
}) {
  const ti = cin.tracks.findIndex((t) => t.kind === 'camera');
  const items = ti >= 0 ? cin.tracks[ti]!.items.map((it, i) => ({ it, i })).sort((a, b) => a.it.t - b.it.t) : [];
  return (
    <div class="sec">
      <div class="sech">
        <span>Shots · {items.length}</span>
        <button
          type="button"
          class="link"
          onClick={onFromView}
          title="A camera item at the playhead, from the stage view"
        >
          + From view
        </button>
      </div>
      {items.map(({ it, i }) => {
        const on = !!sel && 'track' in sel && sel.track === ti && sel.item === i;
        return (
          <button type="button" class={`lib-item ${on ? 'on' : ''}`} onClick={() => onPick(ti, i, it.t)}>
            <span class="mono small muted">{it.t.toFixed(1)}</span>
            <span class="asset-name">{'shot' in it ? it.shot : ''}</span>
            <span class="mono small muted">{'blend' in it && (it.blend ?? 0) > 0 ? 'blend' : 'cut'}</span>
          </button>
        );
      })}
    </div>
  );
}
