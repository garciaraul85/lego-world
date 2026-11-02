import type { HelpEntry } from '../types';
import { ASSETS, CHARACTERS } from './characters-assets';
import { AUDIO, CINEMATICS, PLAY } from './cine-audio-play';
import { EFFECTS } from './effects';
import { FIRE_LIGHT } from './firelight';
import { GUIDES } from './guides';
import { ICE_MOVE } from './icemove';
import { LIGHTS } from './lights';
import { PHYSICS } from './physics';
import { PUZZLES } from './puzzles';
import { SCENE } from './scene';
import { ART, SCREENS } from './screens-art';
import { SHELL } from './shell';
import { LOGIC, WORLD } from './world-logic';

/** Every hand-written entry, by screen. */
export const WRITTEN: HelpEntry[] = [
  ...SHELL,
  ...SCENE,
  ...WORLD,
  ...LOGIC,
  ...CHARACTERS,
  ...ASSETS,
  ...SCREENS,
  ...ART,
  ...CINEMATICS,
  ...AUDIO,
  ...EFFECTS,
  ...LIGHTS,
  ...PHYSICS,
  ...PUZZLES,
  ...FIRE_LIGHT,
  ...ICE_MOVE,
  ...PLAY,
];

export { GUIDES };
