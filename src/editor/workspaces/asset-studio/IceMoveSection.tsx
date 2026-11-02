import type { ICE_MELTS, IceDef, MoveDef } from '../../../core/puzzles/puzzle';
import type { Asset } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';

export const ICE_MOVE_HELP = {
  ice: 'It is ice. As a floor, it is slippery: the hero speeds up and slows down slowly on it and slides on after letting go (like the icy floors of Ocarina of Time). A push block of ice, held and pushed, slides on by itself until something stops it (a wall, a block, an edge). Ice melts with fire (a torch, a burning stick, a bomb’s blast; it steams, then is gone for good), with fire or a beam of light, or never. A swing does nothing to it.',
  moves:
    'It moves: from where it is placed to the far end (studs across, up and deep) and back, easing in and out, waiting at each end. Whoever stands on it rides along. Up only makes a lift. With Only when on it runs only in its second state (logic’s Set state, a switch wired to it, or Light all the torches can turn it on, like the Forest Temple’s lift that runs while its torches burn).',
  noClimb:
    'With Project › Climbing set to Anything, the hero climbs almost any wall while its stamina lasts (like Breath of the Wild). Ticked, this asset cannot be climbed: polished stone, ancient walls.',
};

/**
 * Step 12c: the Asset studio's Ice, moving and climbing section: ice (slippery floor, slides when pushed, melts),
 * moving platform (where to, how fast, waits, only when on), and Not climbable. Each change is one undo step.
 */
export function IceMoveSection({ def, reset }: { def: Asset; reset: (to: Asset, label: string) => void }) {
  const set = <K extends 'ice' | 'moves' | 'noClimb'>(k: K, v: Asset[K] | undefined, label: string) => {
    const { [k]: _old, ...rest } = def;
    let next = (v === undefined ? rest : { ...rest, [k]: v }) as Asset;
    // only when on: off, then on
    if (k === 'moves' && (v as MoveDef | undefined)?.whenOn && next.states.length < 2)
      next = { ...next, states: ['off', 'on'], initialState: 'off' };
    reset(next, label);
  };
  const ice = def.ice;
  const mv = def.moves;
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const axis = (i: 0 | 1 | 2, label: string, min: number, max: number) =>
    mv && (
      <label class="field" style={{ width: '70px' }}>
        <span>{label}</span>
        <input
          class="inp"
          type="number"
          aria-label={`Moves ${label}`}
          min={min}
          max={max}
          value={mv.by[i]}
          onChange={(e) => {
            const by = [...mv.by] as MoveDef['by'];
            by[i] = Math.max(min, Math.min(max, Math.round(num(e))));
            set('moves', { ...mv, by }, 'Where it moves');
          }}
        />
      </label>
    );
  return (
    <div class="sec" data-help="asset.iceMove" data-tour="asset-ice-move">
      <div class="sech">
        <span>Ice, moving and climbing</span>
      </div>
      <label class="lbl" data-tour="asset-ice">
        <input
          type="checkbox"
          checked={!!ice}
          onChange={() => set('ice', ice ? undefined : ({ floor: true } satisfies IceDef), 'Ice')}
        />{' '}
        Ice
        <FieldHelp label="Ice" text={ICE_MOVE_HELP.ice} />
      </label>
      {ice && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="lbl">
            <input
              type="checkbox"
              checked={ice.floor !== false}
              onChange={() => set('ice', { ...ice, floor: ice.floor === false }, 'Slippery floor')}
            />{' '}
            Slippery floor
          </label>
          <label class="lbl">
            <input
              type="checkbox"
              checked={!!ice.slides}
              disabled={!def.push}
              title={def.push ? '' : 'Make it a Push block first (Puzzle section)'}
              onChange={() => set('ice', { ...ice, slides: !ice.slides }, 'Slides when pushed')}
            />{' '}
            Slides when pushed
          </label>
          <label class="field" style={{ minWidth: '150px' }}>
            <span>Melts with</span>
            <select
              class="inp"
              aria-label="Melts with"
              value={ice.melts ?? 'fire'}
              onChange={(e) =>
                set(
                  'ice',
                  { ...ice, melts: (e.target as HTMLSelectElement).value as (typeof ICE_MELTS)[number] },
                  'Melts with',
                )
              }
            >
              <option value="fire">Fire</option>
              <option value="fire-or-light">Fire or a beam of light</option>
              <option value="never">Nothing</option>
            </select>
          </label>
          {(ice.melts ?? 'fire') !== 'never' && (
            <label class="field" style={{ minWidth: '130px' }}>
              <span>Melts in {ice.seconds ?? 2} s</span>
              <input
                type="range"
                aria-label="Melts in (seconds)"
                min={0.5}
                max={10}
                step={0.5}
                value={ice.seconds ?? 2}
                onChange={(e) => set('ice', { ...ice, seconds: num(e) }, 'Melt time')}
              />
            </label>
          )}
        </div>
      )}
      <label class="lbl" data-tour="asset-moves">
        <input
          type="checkbox"
          checked={!!mv}
          onChange={() =>
            set('moves', mv ? undefined : ({ by: [0, 0, 8], seconds: 3, pause: 1 } satisfies MoveDef), 'Moves')
          }
        />{' '}
        Moves (a platform or lift){mv ? `: to ${mv.by.join(', ')} studs and back` : ''}
        <FieldHelp label="Moves" text={ICE_MOVE_HELP.moves} />
      </label>
      {mv && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px', alignItems: 'end' }}>
          {axis(0, 'Across', -64, 64)}
          {axis(1, 'Up', -32, 32)}
          {axis(2, 'Deep', -64, 64)}
          <label class="field" style={{ minWidth: '120px' }}>
            <span>Takes {mv.seconds ?? 3} s</span>
            <input
              type="range"
              aria-label="Moves in (seconds)"
              min={0.5}
              max={20}
              step={0.5}
              value={mv.seconds ?? 3}
              onChange={(e) => set('moves', { ...mv, seconds: num(e) }, 'Move time')}
            />
          </label>
          <label class="field" style={{ minWidth: '120px' }}>
            <span>Waits {mv.pause ?? 1} s</span>
            <input
              type="range"
              aria-label="Waits at each end (seconds)"
              min={0}
              max={10}
              step={0.5}
              value={mv.pause ?? 1}
              onChange={(e) => set('moves', { ...mv, pause: num(e) }, 'Move wait')}
            />
          </label>
          <label class="lbl">
            <input
              type="checkbox"
              checked={!!mv.whenOn}
              onChange={() => {
                const { whenOn: _w, ...rest } = mv;
                set('moves', mv.whenOn ? rest : { ...mv, whenOn: true }, 'Only when on');
              }}
            />{' '}
            Only when on
          </label>
        </div>
      )}
      <label class="lbl" data-tour="asset-no-climb">
        <input
          type="checkbox"
          checked={!!def.noClimb}
          onChange={() => set('noClimb', def.noClimb ? undefined : true, 'Not climbable')}
        />{' '}
        Not climbable
        <FieldHelp label="Not climbable" text={ICE_MOVE_HELP.noClimb} />
      </label>
    </div>
  );
}
