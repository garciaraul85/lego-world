# Combat (P9b)

How the hero fights in Play: kinds of attack, guarding, moves and lock-on. Health and damage are in
[health.md](health.md). Everything here lives in play only.

## Attacks

`ATTACKS` (`src/engine/runtime/combat.ts`) multiplies what the held item does (`heldAttack`):

| Kind | How | Power × | Knock-back | Stun | Hits |
| --- | --- | --- | --- | --- | --- |
| light | tap F | 1 | 0.6 | – | in front |
| heavy | Shift F | 1.75 | 2.2 | 0.5 s | in front |
| charged | hold F ≥ 0.6 s, let go | 2 | 2.6 | 0.6 s | in front |
| spin | hold F ≥ 1.2 s, let go | 1.5 | 2.4 | 0.5 s | all around |
| jump | F while rising | 1.5 | 1.6 | 0.4 s | in front |
| plunge | F while falling | 2 | 2 | 0.8 s | all around, on landing |
| bash | F while guarding | 0.5 (blunt) | 2.5 | 1 s | in front, never breaks plain bricks |

Knock-back pushes a neighbour away from the hero; a stunned neighbour stops walking. Light, heavy and
charged attacks swing the held item (the v68 swing, then the hit at contact); the others hit at their
clip's moment (`Combat.stepMove`).

## Guarding

Hold Q. With a shield in the off hand (`Character.gear.offHand: 'Shield'`, the Character studio's **Off hand**
picker) the hero plays **Guard**, without one **Defend**. A hit with a source (`health.damage`'s `from` pin)
within about 70° of where the hero faces is:

- **parried** if the guard went up at most `PARRY_WINDOW` (0.25 s) before: no damage, no stamina, a
  neighbour that hit is stunned for 1.2 s;
- **blocked** otherwise: stamina drops by 15 × power (shield) or 25 × power (no shield, and half the damage,
  rounded down, gets through);
- the guard **breaks** when stamina reaches zero: the hero staggers for 0.8 s.

Stamina (`MAX_STAMINA` 100) comes back at 30 per second, 0.8 s after the last block, while not guarding. The
`stamina` and `maxStamina` variables show it to screens. Hits from behind, or without a source, are never
blocked. The hero moves at 45 % speed while guarding or charging.

## Moves

| Move | Key | What |
| --- | --- | --- |
| Dodge roll | C | 0.45 s roll the way the hero faces; can't be hurt for the first 0.3 s |
| Side hop | Space + A / D, locked on | a short sideways jump, still facing the target |
| Back flip | Space + S, locked on | a jump backwards, still facing the target |

During a spin attack the hero can keep walking (at 60 % speed): `Combat.pose()` swaps the clip's legs for a walk cycle while the hero moves (also while guarding or charging).

Each move plays a clip from the **Combat** group (`src/builtin/clips/combat.ts`: Guard, Defend, Charge, Spin
attack, Dodge roll, Side hop, Back flip, Jump attack, Plunge, Shield bash) on its own animator, drawn over
walking.

## Lock-on

Z locks on to the best candidate: any neighbour, an object with health, or an asset with `lockOn: true` (**Can
be locked on**), within `LOCK_RANGE` (14 studs) and in front of the camera (nearest and most central first).
While nothing is locked, `Combat.hint` is that candidate and a yellow arrow bobs over it; out of range it goes.
Tab picks the next one. While locked, the hero faces the target, the camera turns to look past the hero at it
and a red arrow pulses over it; T talks to a locked-on neighbour within 7 studs. It lets go on Z, when the
target is defeated or broken, or beyond `LOCK_RELEASE` (16 studs). Each lock fires `event.onLockedOn`
(target: the object's id or the neighbour's name; filter by asset).

## Touch

The touch pad adds **Guard** (hold), **Roll** and **Lock**; the smash button is F (hold to charge).
