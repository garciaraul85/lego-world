# Logic

Logic is what makes a map a game: when something happens (an event), do something (actions), maybe only if a condition holds. [Open Logic](open:Logic)

## Graphs

A project can have many graphs; each holds one or more event chains. + New makes a graph that starts with On start.

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

“＋ Type a name…” at the end of a list types a name that is not there yet. A name that matches nothing (an object not placed, a state the asset does not have) shows in orange under the field and counts in the graph's problems.

## Wires

Drag from a node's output pin to another node's input pin. White diamonds carry the flow (then → in); coloured circles carry values. Wrong types are refused with a tooltip.

## Graph or code

The View switch shows Graph, Code or Split. Code is the same graph as a few lines of JavaScript-like script, for example `on("enterZone", { zone: "z1" }, (e) => { vars.coins += 1; });`. Edit either and the other follows. The [coding guide](help:coding) explains the language and the [coding course](action:help.coding) teaches it hands-on.

## Variables

Variables remember things while playing: a score, coins found, hearts. Each is a card with three labelled parts: **Name** (one word you invent, used exactly by logic and screens), **Type** (Number, Text or True / false) and **Starting value** (its value when the game starts). The card lists where the variable is used. Add one in the New variable box under Variables; logic reads them with Get variable (`vars.name` in code) and changes them with Set variable, and screens and signs show them with {name}. On variable changed runs when one changes.

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

## Debugging

F9 on a node sets a breakpoint that pauses Play there. While playing, the dock's Debug tab shows variables and the Console shows log() output. A graph stops a chain after 1000 steps so a loop can't freeze the game.
