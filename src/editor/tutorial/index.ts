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

/** The tutorial content (P7.4): chapters of data-driven steps, validated when the editor loads. */
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

export const STEPS: (Step & { chapter: string; chapterTitle: string })[] = CHAPTERS.flatMap((c) =>
  c.steps.map((s) => ({ ...s, chapter: c.id, chapterTitle: c.title })),
);
