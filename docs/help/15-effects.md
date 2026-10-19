# Effects

Effects are clouds of tiny pieces: fire, smoke, sparks, dust, magic, confetti. They play on maps, when things are hit, when the hero levels up, and whenever logic says so. [Open Effects](open:Effects)

!shot guide:effects

## The library

**Mine** lists the effects of this game; **Built-in** has the 22 that come with the editor (Fire, Smoke, Sparks, Magic sparkles, Explosion, Dust, Splash, Bubbles, Snow flurry, Falling leaves, Hit flash, Healing glow, Level-up burst, Portal swirl, Glowing aura, Dragon breath, Exhaust, Muzzle flash, Coin pop, Electric zap, Splinters and Confetti). Click one and it plays in the preview, over and over, on a floor of studs; drag to turn it, the wheel zooms. **▶ Play again** starts it over.

## Your own effects

A built-in effect cannot be changed, so every game can count on it: **Make a copy to change it** gives you one of your own, under Mine. **+ New effect** starts from Sparks.

- **Made of**: what each piece is (brick, plate, tile or stud).
- **Colours** (up to 4), from birth to death: a particle starts with the first and fades through the others to the last.
- **Size**, **How many** and **Speed**.
- **Every setting** shows the rest: **Plays as** a burst (all at once, like a hit) or a stream (so many a second, like fire); **Starts from** a point, a ball, a ring, a box or a line, and how wide; **Flies** up, out, down or forward, and how far it spreads; how long each particle lives; **Gravity** (negative: they rise, like smoke); **Drag** (they slow down); **Bounce** (how much speed they keep when they land).

Each change is one undo step. A game has up to 80 effects of its own.

## Effects on a map

**Place on the map** (above the preview) puts the effect beside where the player starts and opens the Scene with it selected. In the Scene, right-click the ground and **Add an effect here**. Its properties: which effect, its size, a tint, how often a burst plays again, how far away it still plays, and whether it plays from the start. Effects are in the Outliner under Effects (✦).

## Game effects

Under the settings, **Game effects** picks the effect for each kind of hit (slash, blunt, pierce, fire, explosive, electric) and for level up, healing, picking up treasure, bricks breaking and an enemy beaten. **Built-in** keeps the editor's own; **None** plays nothing.

## From logic and actions

The logic cards **Play effect**, **Start effect** and **Stop effect** (category Effects) play one at a place or on a character. Actions (zones, interactions, buttons) have **Play effect** and **Start or stop a placed effect**, which starts or stops a placed effect by its name. At most 2,000 particles are alive at once (fewer when the game's quality setting is low or medium); past that, new ones are skipped.

[Effects course](action:help.effects)
