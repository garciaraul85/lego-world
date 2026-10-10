# Build a game from scratch

Twelve steps from an empty project to a small game you can play and share: two maps, a hero, a quest, a HUD, a reward cinematic and music. The Start hub's generator follows these same steps, so you can [watch it build a game stage by stage](action:help.build) first and then do it yourself.

## 1. Start a project

File › New project (Ctrl Alt N) makes an empty project with one generated map. Give it a name in the Inspector's Project tab.

## 2. Generate the terrain

In the Map tab, pick environments (forest, city, prairie, mountains, volcanoes…), then Generate. New seed gives a different world with the same mix. [Open the Scene workspace](open:Scene)

## 3. Shape it

Select objects with V, recolor them with the Inspector swatches or Color paint (C), add bricks with Brick paint (B), erase with X. Bricks sit on studs and never overlap, as in v68. Undo with Ctrl Z.

## 4. Add a second map and a gate

In the World graph, + Add map, generate its terrain, then drag from a spawn's port on the first map to a spawn's port on the second. Walking onto a gate's spawn travels to the other end. World › Validate routes checks every map can be reached. [Open the World graph](open:World graph)

## 5. Place the props

Pick an asset in the dock (Assets) and place it with A; T turns it. A treasure chest already has an interaction: E opens it. Edit what an asset does in the Asset studio. [Open the Asset studio](open:Assets)

## 6. Choose the hero

In Characters, start from a preset, change the look, then Make player character. [Open the Character studio](open:Characters)

## 7. Write the rules

In Logic, + New graph, then add events and actions: On interact (chest) › Add to variable coins › Branch (coins at least 3) › Show screen "win". Wire then pins to in pins. The Code view shows the same graph as script. [Open Logic](open:Logic)

## 8. Show the score

In Screens, open the HUD and add a Text widget that says `Coins: {coins}`. Anything in braces is a live value. Check the phone frame. [Open Screens](open:Screens)

## 9. Direct a reward scene

In Cinematics, New reward scene makes a complete example. Move the actor's marks, add Camera from view shots, and give the giver a line. Then make a trigger zone near the goal play it. [Open the Director](open:Cinematics)

## 10. Mix the sound

In Audio, give each map music, tune the sound events (smash, chest…) and place a Sound emitter (S) by the water. Zones can change the music while the hero is inside. [Open Audio](open:Audio)

## 11. Play and debug

F5 plays from the start spawn, Shift F5 from the selected spawn, Ctrl F5 from the first screen. Pause, Step and the dock's Debug tab show live values. Stop (F5) returns to the editor unchanged.

## 12. Save and share

The project saves itself. File › Save project file (Ctrl Shift S) makes a .bwproj you can keep, send, and open with File › Import.
