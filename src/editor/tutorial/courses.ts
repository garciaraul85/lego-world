import { GUIDES, helpEntry, type Match, SCREENS, type ScreenId } from '../help/entries';
import { Chapter, type Step } from './schema';

/**
 * P32 screen courses: a 3–5 minute course for every screen. First a tour of its areas (each one spotlighted
 * and explained from its Help entry), then the hands-on steps of that screen, each shown first and then
 * done by you (watch, then repeat). Built from the screen guides, so a new area joins its course by itself.
 */

/** The hands-on part of each course: chapters of the editor tour, and the Art steps below. */
const PRACTICE: Record<ScreenId, string[]> = {
  shell: ['welcome'],
  scene: ['first-map'],
  world: ['world'],
  logic: ['logic'],
  characters: ['characters'],
  assets: ['assets'],
  screens: ['screens'],
  art: [],
  cinematics: ['cinematics'],
  audio: ['audio'],
  effects: ['effects'],
  play: ['play'],
};

/** keeps a course within about five minutes; the full editor tour has every step */
const MAX_PRACTICE = 7;

const ART_TAB = '.screens-ws [role="tab"]:nth-child(2)';
const ART_STEPS: Step[] = [
  {
    id: 'art.generate',
    title: 'Generate a background',
    body: 'A background can be generated from a pattern and a few colours, and changed any time; every screen using it follows.',
    task: 'Press Generate a background.',
    target: '[aria-label="Make art"]',
    workspace: 'Screens',
    placement: 'center',
    setup: [{ click: ART_TAB }],
    check: { kind: 'command', type: 'art.put' },
    doItForMe: [{ click: '[aria-label="Make art"] .art-start-card:nth-child(1)' }],
  },
  {
    id: 'art.pattern',
    title: 'Pick a pattern',
    body: 'Patterns: gradient, glow, stripes, dots, checks, bricks, waves, grid, stars. Colours, angle and size change it further.',
    task: 'Pick the Stripes pattern.',
    target: '[aria-label="Pattern"]',
    workspace: 'Screens',
    placement: 'left',
    check: { kind: 'command', type: 'art.put' },
    doItForMe: [{ click: '[aria-label="Pattern"] [role="radio"]:nth-child(4)' }],
  },
  {
    id: 'art.icon',
    title: 'Draw an icon',
    body: 'Icons are drawn pixel by pixel with pencil, fill, line and box, and go on buttons from Pictures and font.',
    task: 'Go back to all art and press Draw an icon.',
    target: '.art-lib',
    workspace: 'Screens',
    placement: 'right',
    check: { kind: 'command', type: 'art.put' },
    doItForMe: [
      { click: '.art-editor .studio-tools .btn' },
      { click: '[aria-label="Make art"] .art-start-card:nth-child(4)' },
    ],
  },
];

/** A CSS selector for an area's spot on screen, from its Help entry. */
function selectorOf(m: Match[] | undefined): string | null {
  for (const x of m ?? []) if (x.sel && !/^(canvas|button|select)$/.test(x.sel)) return x.sel;
  for (const x of m ?? []) if (x.in && !x.name) return x.in;
  return null;
}

const camel = (s: string) =>
  s.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');

function courseOf(screen: ScreenId, chapters: Chapter[]): Chapter {
  const g = GUIDES.find((x) => x.screen === screen)!;
  const sc = SCREENS.find((x) => x.id === screen)!;
  const ws = sc.workspace ?? undefined;
  const setup = screen === 'art' ? [{ click: ART_TAB }] : undefined;
  const tour: Step[] = g.areas.flatMap((id, i): Step[] => {
    const e = helpEntry(id);
    const target = selectorOf(e?.match);
    if (!e || !target) return [];
    return [
      {
        id: `tour.${camel(`${screen} ${'abcdefghij'[i]} ${e.name}`).replace(/[0-9]/g, '')}`.slice(0, 60),
        title: e.name.slice(0, 60),
        body: e.purpose.slice(0, 600),
        task:
          i === 0
            ? `This is the ${sc.name} screen. Read about each area, then press Next.`
            : 'Press Next when you are ready.',
        target,
        ...(ws ? { workspace: ws } : {}),
        ...(setup ? { setup } : {}),
        placement: 'center',
        check: { kind: 'manual' },
        doItForMe: [],
      },
    ];
  });
  const practice =
    screen === 'art'
      ? ART_STEPS
      : PRACTICE[screen].flatMap((c) => chapters.find((x) => x.id === c)?.steps ?? []).slice(0, MAX_PRACTICE);
  return Chapter.parse({ id: `course-${screen}`, title: `${sc.name} course`, steps: [...tour, ...practice] });
}

export function screenCourses(chapters: Chapter[]): Record<ScreenId, Chapter> {
  return Object.fromEntries(SCREENS.map((s) => [s.id, courseOf(s.id, chapters)])) as Record<ScreenId, Chapter>;
}
