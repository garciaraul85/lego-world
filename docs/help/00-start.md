# Welcome

Brick Worlds Engine is a game engine made of bricks, grown from LEGO World v68. You build maps from bricks and assets, connect them into a world, dress characters, write game rules, design screens, direct cinematics and mix the sound. Then you press Play.

## Help on anything

Point at any button, field, list or area and press **F1** (on a Mac: **⌘ /**, or fn F1), or press the **?** in its hover tip: Help opens on that control's own page, with a picture of where it is, what it does, how to use it step by step, its options and shortcut. **Show me where it is** closes Help and makes the real control pulse. Right-click menus end with a Help item too.

Every screen has a **screen guide** (left, under Screen guides): a picture of the whole screen with its areas numbered, what each area is for, and the five things people do there most. Each guide ends with a short **course** for that screen (3 to 5 minutes): a tour of its areas, then a few things to do, shown first and then done by you. [Every control](help:controls) lists them all.

## Ways to learn

- **Guided tutorial**: walks through every workspace and tool on a sandbox project. You set the pace: read a step, press **Show me** to watch it done (it waits until you press **My turn**, then puts everything back), do it yourself, and press **Next** when you are ready. [Start the tutorial](action:help.tutorial)
- **Watch a game being built**: the Start hub generates a complete game and replays it stage by stage: name, terrain, maps, gates, hero, props, logic, screens, cinematic, audio. Each stage says what it did and how you would do it yourself. [Open the Start hub](action:help.build)
- **Coding course**: the logic language line by line, in the Code view — events, variables, if/else, wait, once, gates, world actions, sound, screens, scenes and debugging, ending with a whole game written in code. [Start the coding course](action:help.coding)
- **Combat course**: adds the Training yard (dummies, a cracked wall, a target that opens a gate, a sparring knight), makes an enemy hit harder, wires a dummy to a chest, then you fight. [Start the combat course](action:help.combat)
- **AI builder**: ask for a change in plain words and watch it being made, step by step, before you accept it. [About the AI builder](help:ai-builder)
- **This guide**: one page per workspace, a [12-step recipe](help:build-a-game), the [logic reference](help:logic-reference), every [shortcut](help:keys) and the [limits](help:limits). Type in the search box to find anything, for example "music zone".

## The editor at a glance

Across the top are the menus, the workspace tabs and the toolbar. The workspaces are Scene, World graph, Logic, Characters, Assets, Screens, Cinematics and Audio. The number keys 1 to 8 (or the Window menu) switch between them.

The Scene workspace has the Hierarchy on the left, the 3D map in the middle, the dock below it (Assets, Console, Timeline, Profiler, Problems, Debug, Mixer) and the Inspector on the right. The Inspector has three tabs: Inspector (what is selected), Map (terrain, sky, weather, music) and Project (title, start map, hero, first screen).

Everything you do is one undo step and saves itself to this device a moment later. The status bar shows "All changes saved".

## What kind of game? (genres)

Every game has a **genre**: the list at the top right of the editor. The editor shows the tabs, tools, menu items and logic nodes that kind of game uses, and lists its own logic nodes first. **Open (everything)** shows every control.

| Genre | What it shows |
| --- | --- |
| Open (everything) | Every tab, tool and logic node: the advanced view, for any kind of game. |
| Explore and collect | Walking a world, chests, items and people. The World graph tab is under **More**. The v68 buttons, the Profiler and Timeline dock tabs, and advanced logic nodes are hidden. A treasure hunt is its starter game. |

Changing the genre is one undo step and changes nothing else in the game. **Show everything** shows every control on this device without changing the game. If the game uses something the view hides, a chip says **“1 item uses hidden features”**: click it to see what. Hidden controls still work when you play, and a search in the node list finds every node.

Right-click a tab, a tool or a logic node to **pin** it to the current view or **hide** it. Pins and hides are kept on this device, per genre. Recently added logic nodes rise to **Recent** at the top of the node list.

The Start hub and **File › New project** ask **What are you making?** with a card per genre. More genres (racing, platformers, shooters…) arrive with the engine phases whose systems they need.

## Command palette

Ctrl K (⌘K on a Mac) opens the command palette: type a few letters to find and run any command.
