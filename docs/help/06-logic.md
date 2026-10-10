# Logic

Logic is what makes a map a game: when something happens (an event), do something (actions), maybe only if a condition holds. [Open Logic](open:Logic)

## Graphs

A project can have many graphs; each holds one or more event chains. + New makes a graph that starts with On start.

## Nodes

The palette lists every node by category: events (teal), flow (purple), variables, maths and compare, world actions, audio, screens and cinematics. Click one to add it; search finds it by name. Every node is listed in the [logic reference](help:logic-reference).

## Wires

Drag from a node's output pin to another node's input pin. White diamonds carry the flow (then → in); coloured circles carry values. Wrong types are refused with a tooltip.

## Graph or code

The View switch shows Graph, Code or Split. Code is the same graph as a few lines of JavaScript-like script, for example `on("enterZone", { zone: "z1" }, (e) => { vars.coins += 1; });`. Edit either and the other follows.

## Variables

Variables remember things while playing: a score, coins found, hearts. Add them in the Variables list; logic reads and changes them, and screens and signs show them with {name}. On variable changed runs when one changes.

## Debugging

F9 on a node sets a breakpoint that pauses Play there. While playing, the dock's Debug tab shows variables and the Console shows log() output. A graph stops a chain after 1000 steps so a loop can't freeze the game.
