// Order and insertion markers copied from the original assemble.py (LEGO World v68).
// Changing anything here changes dist/index.html; tests/unit/legacy-build.test.ts guards it.
export const LEGACY_DIR = 'src/legacy';
export const SHELL = 'shell.html';
export const GAME_UI_CSS = 'game-ui.css';
export const HEAD_SCRIPTS = [
  'world-generator.js',
  'volcano-simulation.js',
  'world-sky.js',
  'game-magic.js',
  'super-powers.js',
  'game-weapons.js',
  'studio-motion.js',
  'studio-animations.js',
  'character-catalog.js',
  'rig-collision.js',
  'game-physics.js',
  'character-model.js',
  'character-art.js',
  'npc-world.js',
  'connected-worlds.js',
];
export const BUILDER = 'builder.js';
export const BUILDER_INSERTS = [
  ['/* MAP_NETWORK */', ['map-network.js', 'spawn-editor.js']],
  ['/* VOLCANO_WORLD */', ['volcano-effects.js']],
  [
    '/* CHARACTER_GAME */',
    [
      'character-game.js',
      'weapon-game.js',
      'hero-game.js',
      'studio-props.js',
      'studio-preview.js',
      'character-art-ui.js',
      'npc-ui.js',
      'game-ui.js',
      'game-screen.js',
    ],
  ],
];
