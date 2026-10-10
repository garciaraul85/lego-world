// Built-in screens (P5.7): splash → title → HUD, with pause, dialogue and game over.
// A project overrides one by saving screens/<same id>.json (Screens workspace edits do that).
import { Screen } from '../../core/schema';
import dialogue from './dialogue.json';
import gameover from './gameover.json';
import hud from './hud.json';
import pause from './pause.json';
import splash from './splash.json';
import title from './title.json';

export const BUILTIN_SCREENS: readonly Screen[] = [splash, title, hud, pause, dialogue, gameover].map((s) =>
  Screen.parse(s),
);

export const SCR = {
  splash: 'scr_splash0000',
  title: 'scr_title00000',
  hud: 'scr_hud0000000',
  pause: 'scr_pause00000',
  dialogue: 'scr_dialogue00',
  gameover: 'scr_gameover00',
} as const;
