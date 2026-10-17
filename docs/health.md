# Health and damage (P9a)

Anything can have health: an asset, a neighbour whose character **can be harmed**, and the hero (its hearts,
the `hp` / `maxHp` variables). It lives in play only: Stop forgets every wound, as it forgets smashed bricks.

## Data

`Health` (`src/core/combat/damage.ts`), on an asset (`asset.health`) or a character (`character.harm.health`
with `canBeHarmed`):

| Field | Meaning |
| --- | --- |
| `hp` | hit points: the damage it takes before zero |
| `armor` | taken off every hit (a weaker hit does nothing) |
| `resist` | per damage type: 0 immune, 0.5 half, 1 normal, 2 weak |
| `invulnerable` | starts unable to take damage (logic can switch it) |
| `atZero` | `break` into loose bricks, `drop` `{ item, count }` (an asset by name put there, else an inventory item), `emit` a custom event |

Damage types: slash, blunt, pierce, fire, explosive, electric. One hit does
`max(0, power × resist[type] − armor)`.

An asset without health keeps the old rule: one hit smashes it when **Can be smashed** is on.

## Hits

The hero's F swing hits with what it holds (`HELD_ATTACKS`): bare hands, hammer, wrench 1 blunt; club, bat,
crowbar 1.5; mace 2; war hammer 2.5; sledgehammer 3 blunt; sword 2 and battle axe 2.5 slash; torch 1 fire. A
neighbour that can be harmed, in front of the hero and in reach, takes the hit before the bricks behind it.

## Play

`PlaySession.health` (`src/engine/runtime/health.ts`) keeps each target's hit points: `hero`, `i:<instance
id>`, `n:<neighbour id>`. `hitInstance`, `hitNpc`, `damage(ref, amount, type)`, `heal(ref, amount)` and
`setInvulnerable(ref, on)` change them. A hit says how much is left and fires `event.onDamaged`; at zero the
target breaks (assets), leaves the play (neighbours), drops its item, sends its event and fires
`event.onDefeated`.

## Logic

`event.onDamaged` (target, amount, hp left), `event.onDefeated` (target), `health.damage`, `health.heal`,
`health.setInvulnerable`; all tagged `combat`, so genre views without combat fold them under More nodes.

## Editor

Asset studio › **Health** (Make breakable presets, hit points, armour, hits by type, at zero) and Character
studio › **Health** (Can be harmed). The built-in **Wooden crate** takes 2 hits.

Next (P9b): sword and shield, guard, parry, moves, attack kinds and lock-on.
