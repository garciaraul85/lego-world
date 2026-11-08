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
import lights from './content/21-lights.json';
import atmosphere from './content/22-atmosphere.json';
import bigworlds from './content/23-big-worlds.json';
import water from './content/24-water.json';
import models from './content/25-models.json';
import shape from './content/26-shape-draw.json';
import make from './content/27-make-anything.json';
import hair from './content/28-hair.json';
import build from './content/29-build.json';
import bricks from './content/30-bricks.json';
import media from './content/31-media.json';
import swim from './content/32-swim.json';
import pack from './content/33-pack.json';
import templates from './content/34-templates.json';
import puzzles from './content/35-puzzles.json';
import firelight from './content/36-fire-light.json';
import ice from './content/37-ice-platforms.json';
import wind from './content/38-wind-water.json';
import shots from './content/39-bow-boomerang.json';
import hooks from './content/40-hook-magnet.json';
import lens from './content/41-boots-lens.json';
import foes from './content/42-enemies.json';
import behaviours from './content/43-behaviours.json';
import engineApi from './content/44-engine-api.json';
import builtins from './content/45-builtins.json';
import builtins2 from './content/46-world-builtins.json';
import heroBehaviours from './content/47-hero-behaviours.json';
import swimmer from './content/48-swimmer.json';
import makeBrain from './content/49-make-a-brain.json';
import hurtReactions from './content/50-hurt-reactions.json';
import enemyParts from './content/51-enemy-parts.json';
import bosses from './content/52-bosses.json';
import gloomweaver from './content/53-gloomweaver.json';
import items from './content/54-items.json';
import maps from './content/55-maps.json';
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
  | 'lights'
  | 'atmosphere'
  | 'bigworlds'
  | 'water'
  | 'models'
  | 'shape'
  | 'make'
  | 'hair'
  | 'build'
  | 'bricks'
  | 'media'
  | 'swim'
  | 'pack'
  | 'templates'
  | 'puzzles'
  | 'firelight'
  | 'ice'
  | 'wind'
  | 'shots'
  | 'hooks'
  | 'lens'
  | 'foes'
  | 'behaviours'
  | 'engineApi'
  | 'builtins'
  | 'builtins2'
  | 'heroBehaviours'
  | 'swimmer'
  | 'makeBrain'
  | 'hurtReactions'
  | 'enemyParts'
  | 'bosses'
  | 'gloomweaver'
  | 'items'
  | 'maps'
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
/** P27 part 1: a dark map lit by a torch and a crystal switched on by a zone */
export const LIGHTS_STEPS: TrackStep[] = steps([lights].map((c) => Chapter.parse(c)));
export const ATMOSPHERE_STEPS: TrackStep[] = steps([atmosphere].map((c) => Chapter.parse(c)));
export const BIGWORLDS_STEPS: TrackStep[] = steps([bigworlds].map((c) => Chapter.parse(c)));
/** Milestone 2b: a loose crate floating down a river */
export const WATER_STEPS: TrackStep[] = steps([water].map((c) => Chapter.parse(c)));
export const MODELS_STEPS: TrackStep[] = steps([models].map((c) => Chapter.parse(c)));
/** Milestone 3, 10d: the old studio's body shaping and drawing, in the new editor */
export const SHAPE_STEPS: TrackStep[] = steps([shape].map((c) => Chapter.parse(c)));
/** Milestone 3, 10d parts 4–5: assets and maps from words */
export const MAKE_STEPS: TrackStep[] = steps([make].map((c) => Chapter.parse(c)));
export const HAIR_STEPS: TrackStep[] = steps([hair].map((c) => Chapter.parse(c)));
export const BUILD_STEPS: TrackStep[] = steps([build].map((c) => Chapter.parse(c)));
export const BRICKS_STEPS: TrackStep[] = steps([bricks].map((c) => Chapter.parse(c)));
export const MEDIA_STEPS: TrackStep[] = steps([media].map((c) => Chapter.parse(c)));
export const SWIM_STEPS: TrackStep[] = steps([swim].map((c) => Chapter.parse(c)));
export const PACK_STEPS: TrackStep[] = steps([pack].map((c) => Chapter.parse(c)));
export const TEMPLATES_STEPS: TrackStep[] = steps([templates].map((c) => Chapter.parse(c)));
/** step 12a: push blocks, switches, locks and keys, dungeons */
export const PUZZLES_STEPS: TrackStep[] = steps([puzzles].map((c) => Chapter.parse(c)));
export const FIRELIGHT_STEPS: TrackStep[] = steps([firelight].map((c) => Chapter.parse(c)));
/** step 12c: ice, moving platforms, climbing anything */
export const ICE_STEPS: TrackStep[] = steps([ice].map((c) => Chapter.parse(c)));
/** step 12c-2: wind, water currents, putting fire out, throwing */
export const WIND_STEPS: TrackStep[] = steps([wind].map((c) => Chapter.parse(c)));
/** step 13a: the bow, fire and ice arrows, the boomerang */
export const SHOTS_STEPS: TrackStep[] = steps([shots].map((c) => Chapter.parse(c)));
/** step 13b: the hook line, the grapple rope, the magnet glove */
export const HOOKS_STEPS: TrackStep[] = steps([hooks].map((c) => Chapter.parse(c)));
/** step 13c: the hover boots, the Lens of Truth, hidden and fake things, magic */
export const LENS_STEPS: TrackStep[] = steps([lens].map((c) => Chapter.parse(c)));
/** step 14a: the starter enemies' own ways of fighting */
export const FOES_STEPS: TrackStep[] = steps([foes].map((c) => Chapter.parse(c)));
/** Milestone 3b (B1): behaviours — scripts with fields attached to things */
export const BEHAVIOURS_STEPS: TrackStep[] = steps([behaviours].map((c) => Chapter.parse(c)));
/** Milestone 3b (B2): the engine API */
export const ENGINE_API_STEPS: TrackStep[] = steps([engineApi].map((c) => Chapter.parse(c)));
export const BUILTINS_STEPS: TrackStep[] = steps([builtins].map((c) => Chapter.parse(c)));
export const BUILTINS2_STEPS: TrackStep[] = steps([builtins2].map((c) => Chapter.parse(c)));
export const HERO_BEHAVIOURS_STEPS: TrackStep[] = steps([heroBehaviours].map((c) => Chapter.parse(c)));
export const SWIMMER_STEPS: TrackStep[] = steps([swimmer].map((c) => Chapter.parse(c)));
export const MAKE_BRAIN_STEPS: TrackStep[] = steps([makeBrain].map((c) => Chapter.parse(c)));
export const HURT_REACTIONS_STEPS: TrackStep[] = steps([hurtReactions].map((c) => Chapter.parse(c)));
export const ENEMY_PARTS_STEPS: TrackStep[] = steps([enemyParts].map((c) => Chapter.parse(c)));
export const BOSSES_STEPS: TrackStep[] = steps([bosses].map((c) => Chapter.parse(c)));
export const GLOOMWEAVER_STEPS: TrackStep[] = steps([gloomweaver].map((c) => Chapter.parse(c)));
export const ITEMS_STEPS: TrackStep[] = steps([items].map((c) => Chapter.parse(c)));
export const MAPS_STEPS: TrackStep[] = steps([maps].map((c) => Chapter.parse(c)));

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
  lights: { title: 'Lights course', steps: LIGHTS_STEPS },
  atmosphere: { title: 'Atmosphere course', steps: ATMOSPHERE_STEPS },
  bigworlds: { title: 'Big worlds course', steps: BIGWORLDS_STEPS },
  water: { title: 'Water and physics course', steps: WATER_STEPS },
  models: { title: '3D models course', steps: MODELS_STEPS },
  shape: { title: 'Shape and draw course', steps: SHAPE_STEPS },
  make: { title: 'Make anything course', steps: MAKE_STEPS },
  hair: { title: 'Custom hair course', steps: HAIR_STEPS },
  build: { title: 'Build faster course', steps: BUILD_STEPS },
  bricks: { title: 'Custom bricks course', steps: BRICKS_STEPS },
  media: { title: 'Your own media course', steps: MEDIA_STEPS },
  swim: { title: 'Swimming course', steps: SWIM_STEPS },
  pack: { title: 'Starter pack course', steps: PACK_STEPS },
  templates: { title: 'Scripts and scenes course', steps: TEMPLATES_STEPS },
  puzzles: { title: 'Puzzles course', steps: PUZZLES_STEPS },
  firelight: { title: 'Fire and light course', steps: FIRELIGHT_STEPS },
  ice: { title: 'Ice, platforms and climbing course', steps: ICE_STEPS },
  wind: { title: 'Wind, water and throwing course', steps: WIND_STEPS },
  shots: { title: 'Bow and boomerang course', steps: SHOTS_STEPS },
  hooks: { title: 'Hook and magnet course', steps: HOOKS_STEPS },
  lens: { title: 'Hover boots and Lens course', steps: LENS_STEPS },
  foes: { title: 'Enemies course', steps: FOES_STEPS },
  behaviours: { title: 'Behaviours course', steps: BEHAVIOURS_STEPS },
  engineApi: { title: 'Engine API course', steps: ENGINE_API_STEPS },
  builtins: { title: 'Built-in behaviours course', steps: BUILTINS_STEPS },
  builtins2: { title: 'World built-ins course', steps: BUILTINS2_STEPS },
  heroBehaviours: { title: 'Hero behaviours course', steps: HERO_BEHAVIOURS_STEPS },
  swimmer: { title: 'Swimmer course', steps: SWIMMER_STEPS },
  makeBrain: { title: 'Make your own brain course', steps: MAKE_BRAIN_STEPS },
  hurtReactions: { title: 'Hurt reactions course', steps: HURT_REACTIONS_STEPS },
  enemyParts: { title: 'Enemy parts course', steps: ENEMY_PARTS_STEPS },
  bosses: { title: 'Boss course', steps: BOSSES_STEPS },
  gloomweaver: { title: 'Gloomweaver course', steps: GLOOMWEAVER_STEPS },
  items: { title: 'Items course', steps: ITEMS_STEPS },
  maps: { title: 'Maps course', steps: MAPS_STEPS },
  ...Object.fromEntries(
    Object.entries(COURSES).map(([screen, ch]) => [`course.${screen}`, { title: ch.title, steps: steps([ch]) }]),
  ),
};
export const trackOf = (t: Track) => TRACKS[t] ?? TRACKS.editor!;
export type { ScreenId };
