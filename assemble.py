from pathlib import Path
import re
root=Path(__file__).parent
html=(root/'dist/index.html').read_text()
html=re.sub(r'/\* GAME_UI_START \*/.*?/\* GAME_UI_END \*/\n?', '', html, flags=re.S)
html=html.replace('</style>', '/* GAME_UI_START */\n'+(root/'game-ui.css').read_text()+'\n/* GAME_UI_END */\n</style>',1)
a=html.index('<script>')+len('<script>');b=html.index('</script>',a)
js='\n'.join((root/f).read_text() for f in ['world-generator.js','volcano-simulation.js','world-sky.js','game-magic.js','super-powers.js','game-weapons.js','studio-motion.js','studio-animations.js','character-catalog.js','rig-collision.js','game-physics.js','character-model.js','character-art.js','npc-world.js','connected-worlds.js'])+'\n'+(root/'builder.js').read_text().replace('/* MAP_NETWORK */','\n'.join((root/f).read_text() for f in ['map-network.js','spawn-editor.js'])).replace('/* VOLCANO_WORLD */',(root/'volcano-effects.js').read_text()).replace('/* CHARACTER_GAME */','\n'.join((root/f).read_text() for f in ['character-game.js','weapon-game.js','hero-game.js','studio-props.js','studio-preview.js','character-art-ui.js','npc-ui.js','game-ui.js','game-screen.js']))
(root/'dist/index.html').write_text(html[:a]+'\n'+js+'\n'+html[b:])
(root/'dist/app-check.js').write_text(js)
