# Logic

Logic is what makes a map a game: when something happens (an event), do something (actions), maybe only if a condition holds. [Open Logic](open:Logic)

## Files

A game's logic is split into files: each file is one graph (cards) and its code, with one or more event chains. + New next to **Files** makes one that starts with On start; rename it in the name box at the top. Keep each part of the game in its own file (the main game, rewards, a puzzle, the boss). Files work together: every file reads and changes the same **variables** (`vars.coins`), and a custom event sent in one file (`emit("won")`, Send event) runs `on("custom", { event: "won" })` in every file.

## Nodes

The palette lists every node by category: events (teal), flow (purple), variables, maths and compare, world actions, audio, screens and cinematics. Click one to add it; search finds it by name. Every node is listed in the [logic reference](help:logic-reference).

## Fields: where a value comes from

Every field in the node inspector has a **?**: hover it (or click it) to read what the field is and where its value comes from, with a link there. Fields that name something are lists of what the project has, so names are picked, not guessed:

| Field | The list shows | Defined in |
| --- | --- | --- |
| object (Set state's target, Spawn item's object, Remove) | assets placed on your maps, by the asset's name | Scene (placed copies) and Assets (the name) |
| state | that asset's states | Assets › the asset › States |
| item (Spawn item at object) | every asset | Assets › Asset library |
| Event name | names the project sends or listens to, and who does | wherever it is sent: a scene's Events row, an asset interaction, a Send event node |
| zone, spawn point, map, sound, music, screen, scene | every one in the game, by name (zones by their tag, with the map they are on) | Scene (zones, spawns), Audio, Screens, Cinematics |

Beside a picked sound or music, ▶ plays it; beside a screen or scene, ↗ opens it.

“＋ Type a name…” at the end of a list types a name that is not there yet. A name that matches nothing (an object not placed, a state the asset does not have) shows in orange under the field and counts in the graph's problems.

## Wires

Drag from a node's output pin to another node's input pin. White diamonds carry the flow (then → in); coloured circles carry values. Wrong types are refused with a tooltip.

## Graph or code

The View switch shows Graph, Code or Split. Code is the same graph as a few lines of JavaScript-like script, for example `on("enterZone", { zone: "Pond" }, (e) => { vars.coins += 1; });`. Edit either and the other follows. Code names things the way the editor shows them — zones by their tag, spawn points, maps, sounds, music, screens, scenes and assets by their names (the graph keeps their ids, so renaming one updates the code). Typing inside quotes after `zone:`, `audio.playSound(`, `world.teleport(` and the like (or Ctrl Space) opens a list of what the game has, each with what it is and where; sounds and music have ▶ to listen. Outside quotes the list offers actions and statements, and `vars.` lists the variables.

Click a card in the Graph view and Split opens with that card's code in the middle of the code editor and its settings on the right; in Split, clicking a card scrolls the code to it. Clicking a line of code selects its card. The [coding guide](help:coding) explains the language and the [coding course](action:help.coding) teaches it hands-on.

## Variables

Variables remember things while playing: a score, coins found, hearts. They are global: every logic file, screen and sign sees the same ones. Each is a card with three labelled parts: **Name** (one word you invent, used exactly by logic and screens), **Type** (Number, Text or True / false) and **Starting value** (its value when the game starts). The card lists where the variable is used. Add one in the New variable box under Variables; logic reads them with Get variable (`vars.name` in code) and changes them with Set variable, and screens and signs show them with {name}. On variable changed runs when one changes.

## Example: what is in the chest

The guided tutorial builds this graph, named “Treasure chest”. A variable named `chestItem` (a name we invent), of type Text, starts as `Sword` — the built-in Sword asset's name; changing it changes what the chest gives (any asset by its name). The two event names, `scene-opens-chest` and `scene-takes-sword`, are invented too: the scene sends them. They are not the chest's own `chest-opened`, which its interaction sends when a player presses E.

```js
on("custom", { event: "scene-opens-chest" }, (e) => {
  world.setState("Treasure chest", "open");
  const item = world.spawnNear(vars.chestItem, "Treasure chest");
  world.setState(item, "out");
  world.give(vars.chestItem, 1);
});

on("custom", { event: "scene-takes-sword" }, (e) => {
  world.despawn(vars.chestItem);
});
```

- **On custom event** runs when something sends its name: here the cinematic sends `scene-opens-chest` when the hero lifts the lid.
- **Set state** switches a placed asset's state. Its target is an id, or an asset's name: “Treasure chest” is the built-in asset's name, and means the copy nearest the hero. “open” is one of its states (Assets › Treasure chest › States: closed, open). The chest's lid is a moving part, so it swings open.
- **Spawn item at object** puts a copy of an asset (by name or id) at an object's item spot — the inside of the chest — turned like it. Its output is the new copy.
- **Set state** “out” on that copy makes the Sword's moving part rise out of the chest.
- **Give item** adds it to the hero's inventory; **Remove** takes the floating copy away when the hero holds the sword.

## Templates

**+ From a template…** (next to + New) opens the starter pack's eleven script templates: Locked door and key, Switch opens a gate, Light all the torches, Collect them all then it opens, Shop counter, Boss fight, Checkpoint, Race against the clock, Follow me home, Waves of enemies, and Clear the room to find the treasure. Pick one, fill in the blanks (which door, which boss, how many, which zone) and press **Make it**: it becomes an ordinary logic file, with any variables it keeps, that you can read and change as a graph or as code. A zone or spawn point must be on the map first. Each Make it is one undo step. The same window opens from **Starter pack › Scripts and cutscenes**.

## Messages, items, followers and visitors

**Show message** puts a line of text in the middle of the screen for a few seconds (`say("It’s locked.", 2)`). **Count items** reads how many of an item the hero carries and **Take items** takes some away, never below zero (`if ((items.count("coin") >= 10)) { items.take("coin", 10); … }`). **Follow the hero** makes a character (by name) walk after the hero, run to catch up and jump to it when far behind; off, it stays put (`character.follow("Nim", true)`). **Spawn character** puts a character, the game's or the starter pack's, on the map at a spawn point while the game plays (`character.spawn("Rattlebones", "Arrival")`); it acts like one placed there and is not kept when the game is played again.

## Puzzles

Switches, push blocks, locks and pickups do their own work (Asset studio › Puzzle); logic only hears them. **On switch** runs when a switch turns on or off (`on("switch", { asset: "Floor switch", to: "on" }, (e) => { … })`; leave To empty for both ways). **On pushed** runs when a push block stops after a shove or a pull, **On unlocked** when a lock opens with its key (`e.key` is the key used), and **On picked up** when the hero takes a pickup (`on("pickedUp", { item: "Compass" }, …)`). **Give item** and **Count items** work with the small key, boss key, dungeon map and compass too: they count the ones found on this map. **On burned** runs when a burnable thing has burned away (`on("burned", { asset: "Vines" }, …)`). A torch stand or a light sensor is a switch, so **On switch** hears it light; the **Light all the torches** template counts them and opens a gate when they all burn.

## Health

**On damaged** runs when something with health is hurt and still has some left; **On defeated** when it reaches zero. Both give the target (the hero, an object or a neighbour's name), and On damaged gives the amount and the health left; pick an asset to react only to its copies, or type a name in **Who** to react to one character only (Gloomweaver, hero; capitals don't matter). **Damage** hurts the hero, an object or a neighbour like a hit of that power and type would (armour and resistances count), **Heal** gives health back (never above its maximum), and **Set invulnerable** stops all damage until it is switched off. **On locked on** runs when the hero locks on (Z) to something: a neighbour, an object with health, or an asset with **Can be locked on** (a switch in a puzzle). In code: `on("damaged", { asset: "Wooden crate" }, (e) => { ... })`, `on("lockedOn", { asset: "Switch" }, (e) => { ... })`, `health.damage("hero", 1, "fire")`.

## Lights

**Light on**, **Light off** and **Switch light** (Lights) switch a light placed on the map, or an asset that gives light, by its name; **Set darkness** changes how dark the map is while the game plays (0 lit by its sky … 1 pitch black). A lever wired to a logic file with Switch light turns a room's torches on and off. In code: `lights.on("Torch 1");`, `lights.off(…);`, `lights.toggle(…);`, `lights.darkness(0.9);`.

## Sky

**Set time of day** (Sky) moves the sun to day, noon, evening or night, and the day goes on from there at the map's day length; lights that shine only at night come on as it gets dark. **Set fog** changes the fog while the game plays: a kind (haze, mist, thick, ground, swamp, smoke), `none`, or `map` for the map's own. In code: `sky.time("night");`, `sky.fog("mist");`.

## Debugging

F9 on a node sets a breakpoint that pauses Play there. While playing, the dock's Debug tab shows variables and the Console shows log() output. A graph stops a chain after 1000 steps so a loop can't freeze the game.

## Behaviours: scripts you attach to things

A **behaviour** is a logic file you attach to things, like a component in Unity. Make one under **Behaviours › + New** in the Logic workspace. Attach it in the Scene with **+ Script** in the Inspector: to **every copy** of an asset, or **only this copy**. A character gets one in **Characters › Behaviour tab › Behaviours**.

- **Fields** are its settings. Add them under Fields (a name, a type, a label, a default and, for numbers, a range). The Inspector shows them wherever the behaviour is attached. The asset and each copy can set their own values; a copy's own value wins (↺ puts it back).
- **Own variables** belong to each copy that runs it (a timer, how often it was used). They start again every play.
- **this** is the copy running it. `this.name` reads or changes a field or own variable (cards: Get field, Set field, Add to field).
- Its events run for the copy they are about (used, hit, smashed…). **On start** runs for each copy when play starts. **On update** runs every game step, with `e.dt` the seconds since the last one.

In Code a behaviour is a class:

```js
class Blinker extends Behaviour {
  seconds = field.number(1, { label: "Blinks every (seconds)", min: 0.1, max: 10 });
  timer = 0;
  lit = true;

  update(e) {
    this.timer += e.dt;
    if ((this.timer >= this.seconds)) {
      this.timer = 0;
      if (this.lit) {
        world.setState("this", "off");
        this.lit = false;
      } else {
        world.setState("this", "on");
        this.lit = true;
      }
    }
  }
}
```

Fields are `name = field.type(default, { label, help, min, max })` (types: number, bool, string, item, object, asset, character, sound, effect, zone, event). Own variables are `name = value`. Each method is one event, and its settings go in `e`'s default: `interact(e = { asset: "Chest" }) { … }`. The **Behaviours course** (Help › Courses…) builds this Blinker.

## The engine API

Cards (and calls in Code) that let behaviours, and any logic file, reach into the game:

- **Things:** X of, Height of, Z of, Facing of, State of, Distance (`entity.x("this")`, `entity.distance("this", "hero")`), Move by, Move to (an asset moves in whole studs), Face, Turn toward.
- **Physics:** Push and Set speed (loose objects and the hero), Look ahead (`physics.raycast("this", 10)`: how far something solid is in front, or −1).
- **Messages:** Send message (`msg.send("Gate", "open", 1)`) runs On message (`message(e = { name: "open" }) { … }` in a behaviour) on the other object, with `e.value` and `e.from`.
- **Maths and text:** `/`, `%`, `>`, `<`, `!==`, `math.min`, `math.max`, `math.abs`, `math.clamp(value, low, high)`, `math.lerp(a, b, t)`, `math.sin(degrees)`, `math.cos`, `math.sqrt`, `math.round`, `math.floor`, `text.join(a, b)`.
- **Input and time:** Button held (`input.held("action")`), Game time (`time.now()`).

The bottom dock's **Behaviours** tab lists every behaviour; drag one onto a placed object in the 3D view to attach it to that copy. The **Engine API course** builds a lamp post that sees the hero and tells a crate to slide.

## Built-in behaviours and hooks

The engine's own features are behaviours too: **Interactable, Health, Lock, Switch, Pushable, Pickup, Climbable, Checkpoint, Hidden, Fake, Light**, and for fire, ice, light beams, moving things and the hook: **Burnable, Flame, Beam, Mirror, BombPlant, Ice, Platform, Fan, Liftable, PhysicsBody, HookTarget, Magnetic**. An asset with that setting *is* one (a door with a lock is a Lock), so older games need no change. **Logic › Built-in** (left) lists them: what each does, its fields (its settings), its **hooks** and the events it sends.

A hook is one of its decisions. **Extend** makes a behaviour of your own on it, with each hook answered by the engine's own answer, to change:

```js
class GemDoor extends Lock {
  needs = field.number(3, { label: "Gems needed" });

  canOpen(e) {
    return (e.have >= this.needs);
  }
}
```

`return` (the **Return** card) answers; `super.canOpen(e)` (the hook card's **base** value) is what the engine would answer. Not answering keeps the engine's answer. The hooks: Interactable `canUse`, Health `takeDamage` (a number: how much a hit takes), Lock `canOpen`, Switch `isPressed`, Pushable `canPush` (`e.dx`, `e.dz`, `e.pulled`), Pickup `canPickUp`, Climbable `canClimb`, Burnable `canBurn` (`e.why`), Ice `canMelt` (`e.by`: fire, light or thaw), Liftable `canLift`, BombPlant `canPick`, Mirror `canTurn`, HookTarget `canCatch`. Flame, Beam, Platform, Fan, PhysicsBody, Magnetic, Checkpoint, Hidden, Fake and Light have fields (their settings: a platform's far end and speed, a fan's air speed and reach, a light's brightness) but no hooks yet.

Characters have built-ins too (marked ☺): **Hero** (the player character: its fields are the sheet, hearts, speed, jump, strength, defence, stamina; hooks `canJump` (`e.onGround`), `moveSpeed` (`e.base`: return a speed, 1 normal), `hitPower` (`e.power`, `e.kind`), `takeDamage`, `gainXp` (`e.amount`)), **Neighbour** (a character on the map: Stands where it was put; hook `canTalk`) and **Damageable** (one the hero can hurt: Health, Armour; hook `takeDamage`). The hero is also a **Swimmer** (`canDive`; `breath`: seconds of air, asked every step) and a **Climber** (`canClimbWall`); a neighbour is also a **Follower** (`followGap`: how close it keeps while following, 2.5 studs at first). A behaviour that extends one goes on the character, in **Characters › Behaviour**, which lists its built-ins with their fields. The **Hero behaviours course** makes a hero who is out of breath after three quick jumps; the **Swimmer course** a pearl diver with three times the air.

Attaching a behaviour that extends a built-in to an asset makes it that built-in too. In **Scene › Inspector › Behaviours** the built-ins an asset has are listed with their fields; **+ Script** adds one (under Built-in), **Extend** makes your own on it, **×** takes it off. The **Built-in behaviours course** makes a crate that sticks after two pushes; the **World built-ins course** a rock so heavy it takes three tries to lift.

### Enemy brains

Every enemy runs on a brain, and every brain is a class. **Brain** is the root: each step it senses, thinks (which state to be in: idle, chase, windup, circle, swoop, hidden, rise, spit, duck, hang, drop, fadeout, flee…) and acts; `nextState(e)` (`e.from`, `e.to`) can send it to another state, and **On state change** (`stateChange(e)` in a behaviour) hears every change. **EnemyBrain** extends it: its fields are the kind of fighter, wits, damage type and power, and its hooks are `shouldFlee`, `takeDamage` and `hurtReaction`. Its abilities are parts (below).

The kind of fighter picks the template, which extends EnemyBrain:

| Template | Its own hooks | The cast |
|---|---|---|
| Brawler | (EnemyBrain's) | |
| Charger | `shouldCharge` | Cinderjaw |
| Knight | `shouldCounter` | Rattlebones |
| Turret | `trackSpeed` | Watcher Eye |
| Shooter | `keepAway`, `shotKind` | |
| PopUp | `spits`, `shotKind` | Pebblespout, Finspitter |
| Flyer | `circleTime` | |
| Swarm | `circleTime` | Flitterwing |
| Ambusher | `shouldDrop` | Threadback |
| Ghost | `hiddenFor` | Lanternwisp |
| PackHunter | `callsPack` | Howler |

A behaviour that extends a template (`class ThreeShot extends PopUp { spits(e) { return 3; } }`) answers any hook of its line: its own, EnemyBrain's and Brain's. It goes on an enemy of that template, in **Characters › Behaviour**. The **Make your own brain course** makes a pop-up that spits three fireballs. Bosses (BossBrain) come next.

### Hurt reactions

A body reacts to how it was hit — the hero, neighbours and enemies alike, minifigs and creature bodies:

| Reaction | What causes it | What it looks like |
|---|---|---|
| flinch | a light hit | rocks back |
| stagger | a heavy swing, a pounce, a swoop, a hit of 2 or more | steps back, arms out |
| knockdown | a charge, a drop, a bomb (explosive), a big knock-back, a hit of 4 or more | falls flat (a creature rolls onto its side), gets up; it cannot move until it does |
| burn | fire, a breath of fire | hops, patting out the flames |
| freeze | ice | stiff and shivering; it cannot move |
| shock | a beam, light or electric | jolted, arms flung out |
| stun | a stun, a shield bash | dizzy, swaying; it cannot move |

`hurtReaction(e)` (on the Hero, EnemyBrain and Damageable; `e.how` is the reaction) returns another to react that way instead. The **React to a hit** card (`react(who, how)`) makes the hero or a character react without being hurt (a trap, a cutscene's blow). The **Hurt reactions course** makes a howler that a heavy swing knocks flat.

### Enemy parts

An enemy's brain decides what to do; its **parts** do it. Each part fills an interface:

| Interface | Parts | Its hooks | The part's fields |
|---|---|---|---|
| **Senses** | Eyes (sight in a cone, and hearing), Ears (blind: hears running and fighting, feels you right beside it), AllSeeing (sees all round) | `canSee` | sight, cone, hearing |
| **Mover** | Walker, Wings (flies over the ground), Static (stays put, turns), Hider (a pop-up's), Thread (a spider's) | | speed |
| **Attack** | Swing, Bite, Pounce, Spit, Shot, Ray (a beam), Breath, Swoop, Drop | `canAttack`, `attackPower` | power (times the enemy's), hurt reaction, the tell, time between attacks, reach |

Every template comes with its parts (Pebblespout: Eyes, Hider, Spit; Watcher Eye: Eyes, Static, Ray). In **Characters › Behaviour** each part's row swaps it for another its template can take: any brain any Senses; a walking brain Walker, Wings or Static; a close fighter (Brawler, Knight, PackHunter, Ghost) any close strike, or a Spit or a Shot from a few studs away; a Shooter or a PopUp a Spit or a Shot. A pop-up keeps its Hider, a spider its Thread, a turret its Ray. A part is a built-in: `class NightEyes extends Eyes { canSee(e) { … } }`. The **Enemy parts course** gives Rattlebones wings and a spit.

### Bosses

A boss is made in Logic. Extend one of the boss templates and write its **phases** at the top of the class; attach the behaviour to a character and that character is a boss:

```
class Rage extends PhasedBoss {
  phases = [
    { from: 100, fights: "pack" },
    { from: 50, fights: "shooter", speed: 1.5, name: "Wounded" },
  ];

  phase(e) {
    log(text.join("Phase ", e.phase));
  }
}
```

Each phase starts when its health falls to **from** (in %; 100 is its first phase) and fights as **fights** (melee, knight, pack, shooter, ambusher… — left out: as the phase before), with its parts (**senses**, **mover**, **attack**, **hurt**: its hurt reaction), **speed** and **power** (times its own) and a **name**. The **Phases** panel beside the code in Logic shows the same list: change a box and the line in the class changes.

The template it extends says when it can be hurt:

| Template | It can be hurt |
|---|---|
| **PhasedBoss** | always |
| **WeakPointBoss** | only just after it attacks (its opening); otherwise it is guarded |
| **PuzzleBoss** | only while stunned (by what it is stunned by, a parry, or its own shot sent back); a stun hit gets through as its opening |

A glowing part (an eye) is dull while a boss is guarded and glows when it can be hurt. Its hooks: `phaseFor(e)` (`e.hp`, `e.max`, `e.phase`) returns the phase to be in; `isVulnerable(e)` (`e.how`, `e.phase`) whether this hit hurts. The **On phase** event (`phase(e)`: `e.phase`, `e.from`) runs as it changes phase. The **Boss course** makes the Howler a boss that hunts as a pack hunter and, from half its health, backs off and shoots.

**Gloomweaver**, the starter pack's boss, is made this way; placed from the pack, its behaviour comes with it:

```
class Gloomweaver extends WeakPointBoss {
  phases = [
    { from: 100, fights: "melee", attack: "bite" },
    { from: 66, fights: "ambusher", name: "From the dark" },
    { from: 33, fights: "shooter", attack: "spit", hurt: "stun", speed: 1.3, name: "Web storm" },
  ];

  phase(e) {
    if ((e.phase === 2)) {
      say("Gloomweaver climbs into the dark! Watch above.", 3);
    }
    if ((e.phase === 3)) {
      say("Gloomweaver calls its brood!", 3);
      character.spawn("Threadback", "Gloomweaver");
      character.spawn("Threadback", "Gloomweaver");
    }
  }
}
```

It bites; from 66% it climbs into the dark on a thread and drops on the hero; from 33% it backs off and spits webs that stick the hero fast. Strike it when its eye glows: just after it bites, or stunned by light. **Spawn character** takes a spawn point, or **hero** or a character's name: it comes in a few studs from them. The **Gloomweaver course** walks through it.

### Items

Everything the hero carries is a class. **Item** is something used from an item button; **Projectile** extends it for things that fly (shot, thrown or let go). Each built-in item extends one of them: **Bow** (Bow, Fire arrows, Ice arrows), **Slingshot**, **Boomerang** (and the Whirl boomerang) and **StunNut** are Projectiles; **Bomb**, **HoverBoots**, **LensOfTruth**, **HookLine**, **GrappleRope**, **MagnetGlove**, **Torch**, **Branch** and **GustLeaf** are Items. Item behaviours go on the hero (Characters › hero › Behaviour), and each is asked only about its own item.

| Hook | Class | What it decides |
|---|---|---|
| `canUseItem(e)` | Item | Can it be used now? false: nothing happens |
| `useItem(e)` | Item | It is used: do what it does here; return false to keep the engine’s own use from running |
| `magicCost(e)` | Item | How much magic a use takes (the Lens of Truth: each second it is up); without enough it is not used |
| `shotSpeed(e)` | Projectile | How fast it flies (studs a second) |
| `shotPower(e)` | Projectile | How hard it hits (`e.type`: its damage type) |
| `hits(e)` | Projectile | It struck `e.target`: false and it does no harm |

**An item of your own:** extend Item (or Projectile) itself: the behaviour’s name is the item’s. A Whistle behaviour is the Whistle; given to the hero (a pickup, or `world.give("Whistle", 1)`) it goes into an item button:

```
class Whistle extends Item {
  useItem(e) {
    say("Tweet! The birds fly up.", 2);
  }

  magicCost(e) {
    return 4;
  }
}
```

**MagicMeter** is the hero’s magic: a bar under the hearts once it has something that uses magic. Items take from it (their magicCost), jars fill it; in code it is `vars.magic` and `vars.maxMagic`. **On magic empty** runs when an item finds too little. The **Items course** walks through it.
