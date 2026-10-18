// Built-in screens (P5.7): splash → title → HUD, with pause, dialogue and game over.
// A project overrides one by saving screens/<same id>.json (Screens workspace edits do that).
import { Screen } from '../../core/schema';
import achievements from './achievements.json';
import dialogue from './dialogue.json';
import gameover from './gameover.json';
import hud from './hud.json';
import pause from './pause.json';
import saves from './saves.json';
import settings from './settings.json';
import splash from './splash.json';
import title from './title.json';

export const BUILTIN_SCREENS: readonly Screen[] = [
  splash,
  title,
  hud,
  pause,
  dialogue,
  gameover,
  saves,
  settings,
  achievements,
].map((s) => Screen.parse(s));

export const SCR = {
  splash: 'scr_splash0000',
  title: 'scr_title00000',
  hud: 'scr_hud0000000',
  pause: 'scr_pause00000',
  dialogue: 'scr_dialogue00',
  gameover: 'scr_gameover00',
  saves: 'scr_saves00000',
  settings: 'scr_settings00',
  achievements: 'scr_achieve000',
} as const;
