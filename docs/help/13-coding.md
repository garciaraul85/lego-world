# Coding guide

Logic can be written as code: a small, safe dialect of JavaScript that the Logic workspace turns into the same graph you can build with nodes. Edit either and the other follows. The [coding course](action:help.coding) teaches it hands-on (it shows each step first, then you type it); this page is the summary. Every event and action is in the [logic reference](help:logic-reference).

## Blocks

A graph is a list of blocks. Each block is an event and the statements that run when it happens:

```
on("start", (e) => {
  log("Hello, bricks!");
});
```

The event's settings go in braces before the function, e.g. `on("enterZone", { zone: "zn_…" }, (e) => { … });`. `e` carries details: `e.who` is who entered a zone. Lines starting with `//` are comments. [Open Logic](open:Logic) and switch View to Code (or Split).

## Events

`start` (play begins) · `enterZone` / `exitZone` { zone } · `interact` { asset } (E at any copy) · `smash` { asset } · `rebuildFinished` { asset } · `varChanged` { var } · `timer` { seconds, repeat } · `cinematicDone` { cinematic } · `screenButton` { screen, button } · `custom` { event } (anything sent with `emit`).

## Variables

`vars.coins` reads a variable; `vars.coins = 10;` sets it; `vars.coins += 1;` adds (a negative number takes away). Add variables in the Variables list; screens and signs show them with `{coins}`. Built-in values for screens: `{hp}`, `{maxHp}`, `{map.name}`, `{inventory.coin}`.

## Decisions

`if (cond) { … } else { … }`. Compare with `>=` at least, `<=` at most, `===` equals; combine with `&&` and, `||` or, `!` not. Put each comparison in parentheses: `if (((vars.coins >= 3) && (vars.hp <= 2))) { … }`. Numbers: `+ - *` and `random(min, max)`.

## Flow

`await wait(2);` pauses the block (write `async (e) =>`). `once(() => { … });` runs its inside the first time only. `gate("door", false, () => { … });` runs its inside only while the gate is open; `gate.open("door");` and `gate.close("door");` switch it (they must be the last line of their block). `forEachInZone("zn_…", (who) => { … });` runs once per thing in a zone.

## Actions

World: `world.give(item, count)`, `world.setState(instance, state)`, `world.teleport(spawn)`, `world.travel(map, spawn)`, `world.spawn(asset, spawn)`, `world.despawn(target)`. Sound: `audio.playSound(sound)`, `audio.setMusic(music)`, `audio.stopMusic()`. Screens: `screen.show(screen)`, `screen.hide(screen)`, `screen.setText(screen, element, text)`. Scenes: `cinematic.play(scene, once)`, `cinematic.stop()`. Other: `log(value)`, `emit(event)`.

## Errors and debugging

If the code can't be understood, nothing changes and the line under the editor says why, with the line number; the graph keeps the last good version. Click the gutter (or F9 on a node) to set a breakpoint: Play pauses there and the Debug tab shows the variables. A chain stops after 1,000 steps so a loop can't freeze the game.

## A whole game

```
on("start", (e) => {
  vars.coins = 0;
});

on("interact", { asset: "ast_…" }, (e) => {
  vars.coins += 1;
  if ((vars.coins >= 3)) {
    emit("won");
  }
});

on("custom", { event: "won" }, (e) => {
  cinematic.play("cin_…", true);
});
```
