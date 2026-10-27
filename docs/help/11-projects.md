# Projects, saving and sharing

## Saving

Projects save themselves to this browser a moment after each change; Ctrl S saves at once. File › Open project lists every project on this device.

## Project files

File › Save project file (Ctrl Shift S) makes a .bwproj file (a zip of small JSON files plus imported media) to keep or send. File › Import opens a .bwproj, or an old LEGO World save (.json).

## Media library

File › Media library… lists every file the game imported: pictures (.png .jpg .webp .gif .avif .bmp .svg — a GIF or animated WebP keeps moving), videos (.mp4 .webm), sounds (.wav .mp3 .ogg .m4a), 3D models (.glb .gltf) and fonts. A picture or font can be up to 10 MB, a sound or music 25 MB, a 3D model 20 MB and a video 100 MB. The bar shows the game against 300 MB, the limit for sharing on the web: going over warns but never stops you — when shared, a bigger game is split into parts.

- **Shrink big pictures as they come in** (ticked unless you untick it, remembered on this device; also in Audio › Import): a picture wider or taller than 2048 pixels, over 1 MB, or a BMP is made smaller as it is imported.
- **Drag a file out of the library** onto what should use it: a picture onto an image widget, a button (its icon) or any other widget (its background); a video onto a screen (a Video widget is made, or the one under it gets the clip); a sound onto a button (it plays when pressed) or onto a cutscene's timeline (it plays at that time); a 3D model onto the Scene. The library steps aside while you drag.

- Pick a file to see it, see where it is used, rename it, and say **who made it**: author, licence (CC0, CC BY 4.0, your own work…) and a link. A Credits widget on a screen lists every credited file.
- **Shrink it** (or **Shrink big pictures**) makes a picture at most 2048 pixels across, in the smallest of WebP, PNG and JPEG, everywhere it is used. Undo puts it back. Animated pictures and SVGs are left as they are.
- **Remove unused** removes every file nothing uses; **Remove** on one file works only once nothing uses it.
- A file named for the wrong kind (a .png that is really a JPEG) is caught when it is imported, with the name it should have. A video the browser can't play asks for an .mp4 (H.264) or .webm.

## LEGO World v68

File › Export LEGO World save writes a save v68 can open. Play in v68 runs the project in the original game.

## The Start hub

File › Start hub (Ctrl Alt H) makes a whole game in one click from a theme, a quest, a length and a seed (the same seed always makes the same game), opens templates and recent projects, and starts the tutorial. [Open it](action:help.build)
