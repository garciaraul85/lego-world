import type { HelpEntry } from '../types';
import { BEHAVIOURS } from './behaviours';
import { ASSETS, CHARACTERS } from './characters-assets';
import { AUDIO, CINEMATICS, PLAY } from './cine-audio-play';
import { EFFECTS } from './effects';
import { FIRE_LIGHT } from './firelight';
import { FOES } from './foes';
import { GUIDES } from './guides';
import { HOOKS } from './hooks';
import { ICE_MOVE } from './icemove';
import { LENS } from './lens';
import { LIGHTS } from './lights';
import { PHYSICS } from './physics';
import { PUZZLES } from './puzzles';
import { SCENE } from './scene';
import { ART, SCREENS } from './screens-art';
import { SHELL } from './shell';
import { SHOTS } from './shots';
import { WIND } from './wind';
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
  ...WIND,
  ...SHOTS,
  ...HOOKS,
  ...LENS,
  ...FOES,
  ...BEHAVIOURS,
  ...PLAY,
];

export { GUIDES };
