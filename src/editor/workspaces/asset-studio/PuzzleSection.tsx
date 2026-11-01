import { DAMAGE_INFO, DAMAGE_TYPES, type DamageType } from '../../../core/combat/damage';
import {
  describeSwitch,
  type LockDef,
  type PickupDef,
  type PushDef,
  puzzleProblems,
  SWITCH_BY,
  SWITCH_STAYS,
  type SwitchDef,
} from '../../../core/puzzles/puzzle';
import type { Asset } from '../../../core/schema';
import { FieldHelp } from '../../components/fields';

export const PUZZLE_HELP = {
  push: 'A push block: in Play the hero holds Action (Grab) at it and walks into it, and it slides one step (its own size, or the studs you set) square along the floor. It stops at walls, other blocks and edges, steps up onto a switch, and holds a floor switch down (it weighs 3). With Can be pulled on, the hero can also hold Grab and step back to drag it. Walked into without Grab, it is climbed.',
  switch:
    'A switch: its first two states are off and on (Floor switch: up and down). Stepped on: weight on it (the hero, neighbours, blocks, loose crates; Needs weight says how much). Hit: a sword, an arrow, a boomerang, a bomb or fire (choose which: a torch stand answers Fire). Pressed: Action at its interact socket (a lever). Lit by a beam: a beam of light reaching it (a light sensor). It stays on, is on only while held down, goes back after some seconds (ticking), or flips each time. Logic’s On switch runs each time it turns on or off.',
  lock: 'A lock: its first two states are locked and open. Action at its interact socket opens it when the hero has the key: a small key found on this map (used up), the boss key (kept), or any item you name. Logic’s On unlocked runs when it opens.',
  climbable:
    'Climbable: the hero walking into it holds on and climbs it like a ladder — forward up, back down, off at the bottom; at the top it climbs over onto it or onto what is beyond. Jump lets go. Vines and the Ladder are climbable.',
  pickup:
    'A pickup: when the hero touches it, it is gone and the hero has the item. A small key, the boss key, the dungeon map and the compass belong to the map where they are found; a heart heals; anything else goes into the inventory. Logic’s On picked up runs.',
};

const STAYS_LABEL: Record<SwitchDef['stays'], string> = {
  on: 'Stays on',
  held: 'Held down only',
  timed: 'Timed',
  toggle: 'Flips each time',
};
const BY_LABEL: Record<SwitchDef['by'], string> = {
  step: 'Stepped on',
  hit: 'Hit',
  press: 'Pressed (Action)',
  light: 'Lit by a beam',
};

/**
 * Step 12a: the Asset studio's Puzzle section: push block, switch, lock and pickup. Each change is one undo step.
 * A switch or lock on an asset with one state gets an off/on (locked/open) pair of states added.
 */
export function PuzzleSection({ def, reset }: { def: Asset; reset: (to: Asset, label: string) => void }) {
  const set = <K extends 'push' | 'switch' | 'lock' | 'pickup' | 'climbable'>(
    k: K,
    v: Asset[K] | undefined,
    label: string,
  ) => {
    const { [k]: _old, ...rest } = def;
    let next = (v === undefined ? rest : { ...rest, [k]: v }) as Asset;
    // a switch or a lock needs two states: add them when the asset has one
    if (v && (k === 'switch' || k === 'lock') && next.states.length < 2) {
      const pair = k === 'switch' ? ['off', 'on'] : ['locked', 'open'];
      next = { ...next, states: pair, initialState: pair[0]! };
    }
    // a push block slides square: it is not loose too
    if (k === 'push' && v) {
      const { loose: _l, ...r } = next;
      next = r as Asset;
    }
    reset(next, label);
  };
  const problems = puzzleProblems(def);
  const sw = def.switch;
  return (
    <div class="sec" data-help="asset.puzzle" data-tour="asset-puzzle">
      <div class="sech">
        <span>Puzzle</span>
      </div>
      <label class="lbl" data-tour="asset-climbable">
        <input
          type="checkbox"
          checked={!!def.climbable}
          onChange={() => set('climbable', def.climbable ? undefined : true, 'Climbable')}
        />{' '}
        Climbable (like a ladder)
        <FieldHelp label="Climbable" text={PUZZLE_HELP.climbable} />
      </label>
      <label class="lbl" data-tour="asset-push">
        <input
          type="checkbox"
          checked={!!def.push}
          onChange={() => set('push', def.push ? undefined : ({ pull: true } satisfies PushDef), 'Push block')}
        />{' '}
        Push block
        <FieldHelp label="Push block" text={PUZZLE_HELP.push} />
      </label>
      {def.push && (
        <div class="row" style={{ gap: '10px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="lbl">
            <input
              type="checkbox"
              checked={!!def.push.pull}
              aria-label="Can be pulled"
              onChange={() => set('push', { ...def.push, pull: !def.push?.pull }, 'Can be pulled')}
            />{' '}
            Can be pulled
          </label>
          <label class="field" style={{ minWidth: '120px' }}>
            <span>Step {def.push.step ? `${def.push.step} studs` : '(its size)'}</span>
            <input
              type="range"
              aria-label="Push step (studs)"
              min={0}
              max={8}
              value={def.push.step ?? 0}
              onChange={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                const { step: _s, ...p } = def.push!;
                set('push', n ? { ...p, step: n } : p, 'Push step');
              }}
            />
          </label>
        </div>
      )}

      <label class="lbl" data-tour="asset-switch">
        <input
          type="checkbox"
          checked={!!sw}
          onChange={() => set('switch', sw ? undefined : ({ by: 'step', stays: 'on' } satisfies SwitchDef), 'Switch')}
        />{' '}
        Switch{sw ? `: ${describeSwitch(sw)}` : ''}
        <FieldHelp label="Switch" text={PUZZLE_HELP.switch} />
      </label>
      {sw && (
        <div style={{ margin: '2px 0 6px 22px' }}>
          <div class="row" style={{ gap: '4px', flexWrap: 'wrap' }} role="group" aria-label="Switch is used when">
            {SWITCH_BY.map((b) => (
              <button
                type="button"
                class={`btn small ${sw.by === b ? 'on' : ''}`}
                aria-pressed={sw.by === b}
                onClick={() =>
                  set(
                    'switch',
                    { ...sw, by: b, stays: sw.stays === 'held' && b !== 'step' ? 'on' : sw.stays },
                    `Switch: ${BY_LABEL[b]}`,
                  )
                }
              >
                {BY_LABEL[b]}
              </button>
            ))}
          </div>
          <div
            class="row"
            style={{ gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}
            role="group"
            aria-label="Switch stays"
          >
            {SWITCH_STAYS.filter((s) => s !== 'held' || sw.by === 'step').map((s) => (
              <button
                type="button"
                class={`btn small ${sw.stays === s ? 'on' : ''}`}
                aria-pressed={sw.stays === s}
                onClick={() =>
                  set(
                    'switch',
                    { ...sw, stays: s, ...(s === 'timed' ? { seconds: sw.seconds ?? 10 } : {}) },
                    `Switch: ${STAYS_LABEL[s]}`,
                  )
                }
              >
                {STAYS_LABEL[s]}
              </button>
            ))}
          </div>
          {sw.stays === 'timed' && (
            <label class="field">
              <span>Back off after {sw.seconds ?? 10} s</span>
              <input
                type="range"
                aria-label="Seconds before it goes back"
                min={1}
                max={60}
                value={sw.seconds ?? 10}
                onChange={(e) =>
                  set('switch', { ...sw, seconds: Number((e.target as HTMLInputElement).value) }, 'Switch time')
                }
              />
            </label>
          )}
          {sw.by === 'step' && (
            <label class="field">
              <span>Held down by</span>
              <select
                aria-label="Held down by"
                value={sw.heavy ?? 'any'}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as NonNullable<SwitchDef['heavy']>;
                  const { heavy: _h, ...rest } = sw;
                  set('switch', v === 'any' ? rest : { ...rest, heavy: v }, 'Held down by');
                }}
              >
                <option value="any">Anyone or anything</option>
                <option value="hero">The hero only</option>
                <option value="block">Blocks and loose things only</option>
              </select>
            </label>
          )}
          {sw.by === 'step' && (
            <label
              class="field"
              title="How much must stand on it: the hero or a neighbour weighs 1, a loose crate 1 to 3 by its size, a push block 3."
            >
              <span>Needs weight</span>
              <input
                type="number"
                min={1}
                max={10}
                step={1}
                aria-label="Needs weight"
                value={sw.weight ?? 1}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(10, Math.round(Number((e.target as HTMLInputElement).value) || 1)));
                  const { weight: _w, ...rest } = sw;
                  set('switch', v === 1 ? rest : { ...rest, weight: v }, 'Needs weight');
                }}
              />
            </label>
          )}
          {sw.by === 'hit' && (
            <fieldset class="row" style={{ gap: '6px', flexWrap: 'wrap', border: 0, padding: 0, marginTop: '4px' }}>
              <legend class="small muted">Hit by (none ticked: any hit)</legend>
              {DAMAGE_TYPES.filter((t) => t !== 'electric').map((t: DamageType) => (
                <label class="lbl small" title={DAMAGE_INFO[t].about}>
                  <input
                    type="checkbox"
                    checked={!!sw.hitBy?.includes(t)}
                    aria-label={`Hit by ${DAMAGE_INFO[t].label}`}
                    onChange={() => {
                      const list = sw.hitBy?.includes(t) ? sw.hitBy.filter((x) => x !== t) : [...(sw.hitBy ?? []), t];
                      const { hitBy: _h, ...rest } = sw;
                      set('switch', list.length ? { ...rest, hitBy: list } : rest, 'Switch hit by');
                    }}
                  />{' '}
                  {DAMAGE_INFO[t].label}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}

      <label class="lbl" data-tour="asset-lock">
        <input
          type="checkbox"
          checked={!!def.lock}
          onChange={() => set('lock', def.lock ? undefined : ({ key: 'small' } satisfies LockDef), 'Lock')}
        />{' '}
        Lock
        <FieldHelp label="Lock" text={PUZZLE_HELP.lock} />
      </label>
      {def.lock && (
        <div class="row" style={{ gap: '8px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="field">
            <span>Opens with</span>
            <select
              aria-label="Opens with"
              value={def.lock.key}
              onChange={(e) => {
                const key = (e.target as HTMLSelectElement).value as LockDef['key'];
                set('lock', key === 'item' ? { key, item: def.lock?.item ?? 'Key' } : { key }, 'Lock key');
              }}
            >
              <option value="small">A small key (used up)</option>
              <option value="boss">The boss key (kept)</option>
              <option value="item">An item…</option>
            </select>
          </label>
          {def.lock.key === 'item' && (
            <>
              <label class="field">
                <span>Item</span>
                <input
                  aria-label="Lock item"
                  value={def.lock.item ?? ''}
                  onChange={(e) =>
                    set(
                      'lock',
                      { ...def.lock!, item: (e.target as HTMLInputElement).value.trim() || 'Key' },
                      'Lock item',
                    )
                  }
                />
              </label>
              <label class="lbl">
                <input
                  type="checkbox"
                  checked={!!def.lock.keep}
                  aria-label="The hero keeps the item"
                  onChange={() => set('lock', { ...def.lock!, keep: !def.lock?.keep }, 'Keep the item')}
                />{' '}
                Kept
              </label>
            </>
          )}
          {!def.sockets.some((s) => s.kind === 'interact') && (
            <p class="small" role="alert" style={{ color: 'var(--warn)', margin: 0 }}>
              Add an interact socket (Sockets) where the hero opens it.
            </p>
          )}
        </div>
      )}

      <label class="lbl" data-tour="asset-pickup">
        <input
          type="checkbox"
          checked={!!def.pickup}
          onChange={() => set('pickup', def.pickup ? undefined : ({ item: 'Small key' } satisfies PickupDef), 'Pickup')}
        />{' '}
        Pickup{def.pickup ? `: ${def.pickup.item}` : ''}
        <FieldHelp label="Pickup" text={PUZZLE_HELP.pickup} />
      </label>
      {def.pickup && (
        <div class="row" style={{ gap: '8px', flexWrap: 'wrap', margin: '2px 0 6px 22px' }}>
          <label class="field">
            <span>Item</span>
            <input
              aria-label="Pickup item"
              list="pickup-items"
              value={def.pickup.item}
              onChange={(e) =>
                set(
                  'pickup',
                  { ...def.pickup!, item: (e.target as HTMLInputElement).value.trim() || 'Small key' },
                  'Pickup item',
                )
              }
            />
            <datalist id="pickup-items">
              {['Small key', 'Boss key', 'Dungeon map', 'Compass', 'Heart', 'Rupee', 'Bomb', 'Arrow'].map((x) => (
                <option value={x} />
              ))}
            </datalist>
          </label>
          <label class="field" style={{ width: '90px' }}>
            <span>How many</span>
            <input
              type="number"
              aria-label="Pickup count"
              min={1}
              max={99}
              value={def.pickup.count ?? 1}
              onChange={(e) => {
                const n = Math.max(1, Math.min(99, Math.round(Number((e.target as HTMLInputElement).value) || 1)));
                const { count: _c, ...p } = def.pickup!;
                set('pickup', n > 1 ? { ...p, count: n } : p, 'Pickup count');
              }}
            />
          </label>
        </div>
      )}
      {problems.map((p) => (
        <p class="small" role="alert" style={{ color: 'var(--warn)', margin: '4px 0 0' }}>
          {p}
        </p>
      ))}
    </div>
  );
}
