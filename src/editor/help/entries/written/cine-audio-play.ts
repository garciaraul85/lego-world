import { area, type HelpEntry } from '../types';

const SCENES = area('Scenes, cast and shots');
const STAGE = area('Director stage and timeline');
const ITEM = area('Item properties');
const SND = area('Sounds and music');
const AED = area('Audio editor');

export const CINEMATICS: HelpEntry[] = [
  {
    id: 'cinematics.screen',
    screen: 'cinematics',
    kind: 'screen',
    name: 'Cinematics (Director)',
    purpose:
      'Short scenes that play in the game: characters walk, face each other and talk, cameras cut and blend, music and sounds play, titles fade in. Logic or a zone starts them.',
    related: ['cinematics.list', 'cinematics.timeline', 'node.cinematic.play'],
  },
  {
    id: 'cinematics.new',
    screen: 'cinematics',
    kind: 'button',
    name: 'New scene',
    purpose: 'Makes a new cinematic: an empty one, or the reward example to learn from.',
    commands: ['cinematic.put'],
    match: [
      { in: area('Director'), name: /^New / },
      { in: SCENES, name: /^(\+ New|\+ Reward)$/ },
    ],
  },
  {
    id: 'cinematics.list',
    screen: 'cinematics',
    kind: 'list',
    name: 'Scenes',
    purpose: 'Every cinematic with its length. Click one to open it.',
    match: [{ in: SCENES, name: /^🎬/ }],
  },
  {
    id: 'cinematics.cast',
    screen: 'cinematics',
    kind: 'field',
    name: 'Cast (roles)',
    purpose: 'The roles in the scene (hero, mayor…): which character plays each and where it starts. + Role adds one.',
    match: [
      { in: SCENES, name: /^(\+ Role|Select |Remove |Role name)/ },
      { in: SCENES, name: / is played by$| starts at$/ },
    ],
  },
  {
    id: 'cinematics.marks',
    screen: 'cinematics',
    kind: 'list',
    name: 'Marks',
    purpose:
      'Spots on the map that actors walk to and cameras look at, each with a direction. Click a mark to select it: its Position (X across, Y up, Z along, in studs) and Facing (° — 0 looks toward +Z, 180 toward −Z) show on the right, to type exact numbers. Drag a mark on the stage to move it in half studs. In a tutorial, a gold ring on the stage shows where a mark should go; it turns green when a mark is inside.',
    commands: ['cinematic.put'],
    match: [{ in: '.dr-marks' }],
  },
  {
    id: 'cinematics.shots',
    screen: 'cinematics',
    kind: 'list',
    name: 'Camera shots',
    purpose:
      'The camera positions of the scene. + From view saves the stage camera as a new shot; click one to edit it.',
    match: [{ in: SCENES, name: /^(\+ From view|\d+\.\d )/ }],
  },
  {
    id: 'cinematics.tools',
    screen: 'cinematics',
    kind: 'area',
    name: 'Director tools',
    purpose:
      'The scene name, To start, ▶ Play (preview here), ● Record hero (act it out with the keys), 🎥 Camera from view, ▶ Play in game, Delete scene.',
    match: [{ in: area('Director tools') }],
  },
  {
    id: 'cinematics.stage',
    screen: 'cinematics',
    kind: 'view',
    name: 'Stage and camera preview',
    purpose: 'The stage shows the scene in the map from any angle; the camera preview shows what the player will see.',
    match: [{ in: STAGE, role: 'canvas' }],
  },
  {
    id: 'cinematics.timeline',
    screen: 'cinematics',
    kind: 'area',
    name: 'Timeline',
    purpose:
      'One track per role, Camera, Music, Sound, Post (fades, titles) and Events. Each block is something that happens at a time; drag the playhead to scrub.',
    steps: [
      'Click Add to … on a track to add a block.',
      'Click a block to edit it on the right; drag it to change its time.',
    ],
    match: [{ in: area('Timeline') }],
  },
  {
    id: 'cinematics.item',
    screen: 'cinematics',
    kind: 'area',
    name: 'Scene and block properties',
    purpose:
      'The selected block’s settings, or the scene’s: name, length, map, whether players can skip it, letterbox bars and hiding the HUD. Each field has a “?” that says what it is and where its value comes from. Clip, Gesture and Item (Hold an item) show a picture of the actor for each choice; Event name lists the names your project uses, with who sends and who hears each (an On custom event node with exactly that name runs when the scene sends it); ▶ Listen plays a sound or music.',
    match: [{ in: ITEM }, { sel: ITEM }],
  },
];

export const AUDIO: HelpEntry[] = [
  {
    id: 'audio.screen',
    screen: 'audio',
    kind: 'screen',
    name: 'Audio',
    purpose:
      'Every sound and music of the game: sound events made of clips, music made of layers, the mixer with ducking rules, and imported media.',
    related: ['audio.list', 'audio.event', 'audio.music', 'audio.mixer'],
  },
  {
    id: 'audio.list',
    screen: 'audio',
    kind: 'list',
    name: 'Sounds and music',
    purpose: 'Sound events (jump, door, pickup…) and music (♪). Click one to edit it; + New makes a sound event.',
    commands: ['audio.setEvent', 'audio.setMusic'],
    match: [{ in: SND }, { sel: SND }],
  },
  {
    id: 'audio.search',
    screen: 'audio',
    kind: 'field',
    name: 'Search sounds',
    purpose: 'Shows only sounds and music whose name contains what you type.',
    match: [{ in: SND, name: 'Search sounds' }],
  },
  {
    id: 'audio.import',
    screen: 'audio',
    kind: 'button',
    name: 'Import sounds',
    purpose: 'Adds sound files from your computer (.wav, .mp3, .ogg) to use as clips and music layers.',
    commands: ['media.register'],
    match: [
      { in: SND, name: /^Import sounds/ },
      { in: AED, name: 'Import…' },
    ],
  },
  {
    id: 'audio.event',
    screen: 'audio',
    kind: 'area',
    name: 'Sound event',
    purpose:
      'One sound the game plays (a jump, a door). It picks one of its clips each time (random, in sequence or shuffled), with a volume, a pitch range, a bus, a voice limit, a cooldown and 3D placement.',
    options: [
      ['Clips', 'the sounds it picks from; ▶ plays one, Add a clip adds one'],
      ['random / sequence / shuffle', 'how it picks the next clip'],
      ['Volume, Pitch from–to', 'how loud, and how much it varies'],
      ['Bus', 'which mixer slider controls it'],
      ['Max voices, Cooldown', 'stop the same sound piling up'],
      ['3D', 'quieter far away and panned left / right'],
    ],
    commands: ['audio.setEvent'],
    match: [
      {
        in: AED,
        name: /^(Sound name|▶ Play$|Play clip|Remove clip|Add a clip|Volume|Pitch|Bus|Max voices|Cooldown|3D|Reset to built-in)/,
      },
      { in: `${AED} ${area('Pick')}` },
    ],
  },
  {
    id: 'audio.music',
    screen: 'audio',
    kind: 'area',
    name: 'Music',
    purpose:
      'A music state made of layers that play together, with a loop setting and a crossfade when it starts or stops. Stingers are short tunes (victory, game over).',
    commands: ['audio.setMusic', 'audio.setMusicSettings'],
    match: [
      { in: AED, name: /^(Music name|▶ Audition|Layer \d|Remove layer|Add a layer|Loop|Crossfade|Play stinger)/ },
    ],
  },
  {
    id: 'audio.mixer',
    screen: 'audio',
    kind: 'area',
    name: 'Mixer and ducking',
    purpose:
      'The volume of each bus, and ducking rules: when something plays (a voice, a stinger), turn a bus down by some dB, fading in and out.',
    commands: ['audio.setMixer'],
    match: [
      { in: SND, name: 'Mixer & ducking' },
      { in: AED, name: /^(\+ Rule|When|Target bus|dB|in s|out s|Remove rule)$/ },
      { in: `${AED} ${area('Mixer')}` },
    ],
  },
  {
    id: 'audio.media',
    screen: 'audio',
    kind: 'area',
    name: 'Imported media',
    purpose: 'Every imported file with its size and where it is used; files nothing uses can be removed.',
    commands: ['media.remove'],
    match: [{ in: SND, name: 'Imported media' }],
  },
  {
    id: 'audio.uses',
    screen: 'audio',
    kind: 'area',
    name: 'Where used and live audio',
    purpose: 'Where the selected sound or music is used (zones, emitters, logic, screens), and the live mixer.',
    match: [{ sel: area('Where used and live audio') }, { in: area('Where used and live audio') }],
  },
];

export const PLAY: HelpEntry[] = [
  {
    id: 'play.screen',
    screen: 'play',
    kind: 'screen',
    name: 'Play',
    purpose:
      'The game running inside the editor. The Play bar pauses, steps and changes speed; the dock shows the console, the profiler and cheats. Stop (F5) goes back to editing exactly as before.',
    related: ['shell.play', 'play.bar', 'play.cheats'],
  },
  {
    id: 'play.view',
    screen: 'play',
    kind: 'view',
    name: 'Game view',
    also: ['combat', 'fight', 'attack', 'guard', 'lock on', 'dodge'],
    purpose:
      'The game. WASD or arrows move, Space jumps, E uses, T talks, Esc pauses. Fighting: tap F to attack (Shift+F a heavy attack), hold F to charge and let go (hold longer for a spin attack), F in the air for a jump attack or a plunge; hold Q to guard (F while guarding: shield bash), C to dodge-roll, Z to lock on to the nearest foe (Tab: the next one; Space + left/right side-hops, Space + back back-flips). On a touch screen the Guard, Roll and Lock buttons do the same.',
    match: [{ in: area('Play view'), role: 'canvas' }, { sel: area('Play view') }],
    related: ['help:keys#playing'],
  },
  {
    id: 'play.bar',
    screen: 'play',
    kind: 'area',
    name: 'Play bar',
    purpose: 'Pause and Step (one frame at a time), the game speed, and ■ Stop.',
    match: [{ in: area('Play bar') }],
  },
  {
    id: 'play.hud',
    screen: 'play',
    kind: 'view',
    name: 'Game screens in Play',
    purpose: 'The HUD and other screens as the player sees them; their buttons work.',
    match: [{ sel: `${area('Play view')} .bw-screen` }, { in: `${area('Play view')} .bw-screen` }],
    related: ['guide:screens'],
  },
];
