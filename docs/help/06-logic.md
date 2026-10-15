# Logic

Logic is what makes a map a game: when something happens (an event), do something (actions), maybe only if a condition holds. [Open Logic](open:Logic)

## Graphs

A project can have many graphs; each holds one or more event chains. + New makes a graph that starts with On start.

## Nodes

The palette lists every node by category: events (teal), flow (purple), variables, maths and compare, world actions, audio, screens and cinematics. Click one to add it; search finds it by name. Every node is listed in the [logic reference](help:logic-reference).

## Wires

Drag from a node's output pin to another node's input pin. White diamonds carry the flow (then → in); coloured circles carry values. Wrong types are refused with a tooltip.

## Graph or code

The View switch shows Graph, Code or Split. Code is the same graph as a few lines of JavaScript-like script, for example `on("enterZone", { zone: "z1" }, (e) => { vars.coins += 1; });`. Edit either and the other follows. The [coding guide](help:coding) explains the language and the [coding course](action:help.coding) teaches it hands-on.

## Variables

Variables remember things while playing: a score, coins found, hearts. Add them in the Variables list; logic reads and changes them, and screens and signs show them with {name}. On variable changed runs when one changes.

## Example: what is in the chest

The guided tutorial builds this graph, named “Treasure chest”. A text variable `chestItem` starts as `Sword`; changing it changes what the chest gives (any asset by its name).

```js
on("custom", { event: "open-chest" }, (e) => {
  world.setState("Treasure chest", "open");
  const item = world.spawnNear(vars.chestItem, "Treasure chest");
  world.setState(item, "out");
  world.give(vars.chestItem, 1);
});

on("custom", { event: "take-sword" }, (e) => {
  world.despawn(vars.chestItem);
});
```

- **On custom event** runs when something sends its name: here the cinematic sends `open-chest` when the hero lifts the lid.
- **Set state** switches a placed asset's state. Its target is an id, or an asset's name: “Treasure chest” means the copy nearest the hero. The chest's lid is a moving part, so it swings open.
- **Spawn item at object** puts a copy of an asset (by name or id) at an object's item spot — the inside of the chest — turned like it. Its output is the new copy.
- **Set state** “out” on that copy makes the Sword's moving part rise out of the chest.
- **Give item** adds it to the hero's inventory; **Remove** takes the floating copy away when the hero holds the sword.

## Debugging

F9 on a node sets a breakpoint that pauses Play there. While playing, the dock's Debug tab shows variables and the Console shows log() output. A graph stops a chain after 1000 steps so a loop can't freeze the game.
