import type { Health } from '../../core/combat/damage';
import { DAMAGE_TYPES } from '../../core/combat/damage';
import { ENEMY_PRESETS, type Enemy } from '../../core/combat/enemy';
import { DraftText, FieldHelp } from './fields';

/** P9c: what the enemy fields mean (the inspector's “?”) */
export const ENEMY_HELP = {
  make: 'Turns this character into an enemy: it can be harmed (with health from the preset) and, as a neighbour on a map, walks to the hero when it sees them and swings at them. Change any number afterwards.',
  power:
    'How hard its swing hits the hero: 1 takes one heart. A shield blocks it from the front; raising the guard just before it lands parries it.',
  type: 'The kind of hit (slash, blunt, fire…), for your logic and for later resistances.',
  reach: 'Studs: how close the hero must be for it to swing.',
  sight: 'Studs: how far away it notices the hero and comes over. Out of sight it wanders like any neighbour.',
  speed: 'How fast it walks to the hero: 1 is a neighbour’s normal walk, 2 twice as fast.',
  cooldown: 'Seconds it waits after a swing before the next one.',
  windup:
    'Seconds it raises its arm (a red “!” shows over its head) before the swing lands — the time the player has to guard, dodge or parry.',
};

const NUM: [keyof Enemy, string, number, number][] = [
  ['power', 'Hits for', 0, 20],
  ['reach', 'Reach', 1, 6],
  ['sight', 'Sees the hero within', 2, 30],
  ['speed', 'Walking speed', 0.2, 3],
  ['cooldown', 'Seconds between swings', 0.3, 10],
  ['windup', 'Warning before a swing', 0.1, 2],
];

/** “Make enemy” (a preset) when it does not fight yet; its numbers when it does. */
export function EnemyFields({
  enemy,
  onChange,
  onMake,
}: {
  enemy: Enemy | undefined;
  onChange: (e: Enemy | null, label: string) => void;
  onMake: (e: Enemy, health: Health, name: string) => void;
}) {
  if (!enemy)
    return (
      <label class="field">
        <span>
          Make enemy
          <FieldHelp label="Make enemy" text={ENEMY_HELP.make} />
        </span>
        <select
          class="inp"
          data-tour="make-enemy"
          aria-label="Make enemy"
          value=""
          onChange={(e) => {
            const p = ENEMY_PRESETS[(e.target as HTMLSelectElement).value];
            if (p) onMake(structuredClone(p.enemy), structuredClone(p.health), p.name.split(' — ')[0]!);
          }}
        >
          <option value="">choose what kind…</option>
          {Object.entries(ENEMY_PRESETS).map(([id, p]) => (
            <option value={id}>{p.name}</option>
          ))}
        </select>
      </label>
    );
  return (
    <div class="health-fields" data-tour="char-enemy-fields">
      {NUM.map(([k, label, min, max]) => (
        <div class="health-row">
          <DraftText
            class="inp mono"
            aria-label={label}
            tour={`enemy-${k}`}
            value={String(enemy[k])}
            onCommit={(t) => {
              const n = Number(t);
              if (!Number.isFinite(n) || n < min || n > max) return false;
              onChange({ ...enemy, [k]: n }, label);
            }}
          />
          <span class="small">
            {label}
            <FieldHelp label={label} text={ENEMY_HELP[k as keyof typeof ENEMY_HELP]} />
          </span>
        </div>
      ))}
      <label class="small">
        Kind of hit
        <FieldHelp label="Kind of hit" text={ENEMY_HELP.type} />{' '}
        <select
          class="inp"
          aria-label="Kind of hit"
          value={enemy.type}
          onChange={(e) =>
            onChange({ ...enemy, type: (e.target as HTMLSelectElement).value as Enemy['type'] }, 'Kind of hit')
          }
        >
          {DAMAGE_TYPES.map((t) => (
            <option value={t}>{t}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
