# Screens and HUD

Screens are the 2D layer over the game: splash, title, HUD, pause, dialogue, game over, and your own. [Open Screens](open:Screens)

## Built-in screens

Edit a built-in and the project keeps its own copy; Reset brings the original back. The Project tab picks the first screen Ctrl F5 starts from.

## Widgets

Add widget adds text, buttons, images, hearts, bars, lists, dialogue, minimap and panels. The tree on the left is also the order keyboard and gamepad focus follow.

## Live values

Write {name} in a text to show a value while playing: {hp}, {map.name}, {inventory.coin}, or any logic variable such as {score}.

## Buttons

A button's actions run when it is pressed: show or hide a screen, play a cinematic, start or resume the game, or send On screen button to logic.

## Every screen size

Screens are laid out at 1280×720 and scaled to fit. Anchors keep a widget on its edge. Check the phone and tablet frames; the hatched strips are safe areas (notches, rounded corners).

## Signs in the world

The World UI tool (U) places signs above the ground in the 3D view; their text can show {values} too.
