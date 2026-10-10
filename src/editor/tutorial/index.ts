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
import { Chapter, type Step } from './schema';

export type Track = 'editor' | 'coding';
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

export const STEPS: TrackStep[] = steps(CHAPTERS);
export const CODING_STEPS: TrackStep[] = steps(CODING_CHAPTERS);

export const TRACKS: Record<Track, { title: string; steps: TrackStep[] }> = {
  editor: { title: 'Editor tour', steps: STEPS },
  coding: { title: 'Coding course', steps: CODING_STEPS },
};
