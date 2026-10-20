import type { ScreenId } from '../help/entries';
import cBasics from './coding/01-basics.json';
import cVars from './coding/02-vars.json';
import cEvents from './coding/03-events.json';
import cFlow from './coding/04-flow.json';
import cWorld from './coding/05-world.json';
import cMedia from './coding/06-media.json';
import cDebug from './coding/07-debug.json';
import cGame from './coding/08-game.json';
import welcome from './content/01-welcome.json';
import firstMap from './content/02-first-map.json';
import world from './content/03-world.json';
import assets from './content/04-assets.json';
import characters from './content/05-characters.json';
import logic from './content/06-logic.json';
import screens from './content/07-screens.json';
import cinematics from './content/08-cinematics.json';
import audio from './content/09-audio.json';
import play from './content/10-play.json';
import combat from './content/11-combat.json';
import saving from './content/12-saving.json';
import brix from './content/13-brix.json';
import dialogue from './content/14-dialogue.json';
import sheet from './content/15-sheet.json';
import bodies from './content/16-bodies.json';
import faces from './content/17-faces.json';
import effects from './content/18-effects.json';
import screenfx from './content/19-screen-effects.json';
import posing from './content/20-posing.json';
import { screenCourses } from './courses';
import { Chapter, type Step } from './schema';

export type Track =
  | 'editor'
  | 'coding'
  | 'combat'
  | 'saving'
  | 'brix'
  | 'dialogue'
  | 'sheet'
  | 'bodies'
  | 'screenfx'
  | 'posing'
  | `course.${string}`;
export type TrackStep = Step & { chapter: string; chapterTitle: string };

const steps = (chapters: Chapter[]): TrackStep[] =>
  chapters.flatMap((c) => c.steps.map((s) => ({ ...s, chapter: c.id, chapterTitle: c.title })));

/** The editor tour (P7.4): every workspace and tool. */
export const CHAPTERS: Chapter[] = [
  welcome,
  firstMap,
  world,
  assets,
  characters,
  logic,
  screens,
  cinematics,
  audio,
  play,
].map((c) => Chapter.parse(c));
/** The coding course (P8): the logic script language end to end, typed in the Code view. */
export const CODING_CHAPTERS: Chapter[] = [cBasics, cVars, cEvents, cFlow, cWorld, cMedia, cDebug, cGame].map((c) =>
  Chapter.parse(c),
);

/** P9c: the combat course — the Training yard, an enemy, a wire, a fight. */
export const COMBAT_CHAPTERS: Chapter[] = [combat].map((c) => Chapter.parse(c));
/** P26: the saving course — settings, a checkpoint, a save point, Continue. */
export const SAVING_CHAPTERS: Chapter[] = [saving].map((c) => Chapter.parse(c));
/** P19: meet Brix — ask, Show me, Explain. */
export const BRIX_CHAPTERS: Chapter[] = [brix].map((c) => Chapter.parse(c));
/** P22: the dialogue course — a villager, a conversation as a script, list and graph, preview, style, Play. */
export const DIALOGUE_CHAPTERS: Chapter[] = [dialogue].map((c) => Chapter.parse(c));

export const STEPS: TrackStep[] = steps(CHAPTERS);
export const COMBAT_STEPS: TrackStep[] = steps(COMBAT_CHAPTERS);
export const SAVING_STEPS: TrackStep[] = steps(SAVING_CHAPTERS);
export const BRIX_STEPS: TrackStep[] = steps(BRIX_CHAPTERS);
export const DIALOGUE_STEPS: TrackStep[] = steps(DIALOGUE_CHAPTERS);
/** P22 part 2: the character sheet course */
export const SHEET_STEPS: TrackStep[] = steps([sheet].map((c) => Chapter.parse(c)));
/** P22 part 3: the creatures course (body plans) */
export const BODIES_STEPS: TrackStep[] = steps([bodies].map((c) => Chapter.parse(c)));
/** P22 part 4: faces for moods, and characters from a picture */
export const FACES_STEPS: TrackStep[] = steps([faces].map((c) => Chapter.parse(c)));
export const CODING_STEPS: TrackStep[] = steps(CODING_CHAPTERS);
/** P23 part 2: screen effects — a thunder of your own, hooked to the hero being hurt; a stormy night mood */
export const SCREENFX_CHAPTERS: Chapter[] = [screenfx].map((c) => Chapter.parse(c));
export const SCREENFX_STEPS: TrackStep[] = steps(SCREENFX_CHAPTERS);
/** P23 part 4: a clip made pose by pose, and the hero's animation states */
export const POSING_STEPS: TrackStep[] = steps([posing].map((c) => Chapter.parse(c)));

/** P32: a short course for every screen (tour of its areas, then its hands-on steps). */
export const COURSES = screenCourses([...CHAPTERS, Chapter.parse(effects)]);

export const TRACKS: Record<string, { title: string; steps: TrackStep[] }> = {
  editor: { title: 'Editor tour', steps: STEPS },
  coding: { title: 'Coding course', steps: CODING_STEPS },
  combat: { title: 'Combat course', steps: COMBAT_STEPS },
  saving: { title: 'Saving and progress course', steps: SAVING_STEPS },
  brix: { title: 'Meet Brix', steps: BRIX_STEPS },
  dialogue: { title: 'Dialogue course', steps: DIALOGUE_STEPS },
  sheet: { title: 'Character sheet course', steps: SHEET_STEPS },
  bodies: { title: 'Creatures course', steps: BODIES_STEPS },
  faces: { title: 'Faces and pictures course', steps: FACES_STEPS },
  screenfx: { title: 'Screen effects course', steps: SCREENFX_STEPS },
  posing: { title: 'Posing and states course', steps: POSING_STEPS },
  ...Object.fromEntries(
    Object.entries(COURSES).map(([screen, ch]) => [`course.${screen}`, { title: ch.title, steps: steps([ch]) }]),
  ),
};
export const trackOf = (t: Track) => TRACKS[t] ?? TRACKS.editor!;
export type { ScreenId };
