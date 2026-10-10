import start from '../../../docs/help/00-start.md?raw';
import buildAGame from '../../../docs/help/01-build-a-game.md?raw';
import scene from '../../../docs/help/02-scene.md?raw';
import world from '../../../docs/help/03-world.md?raw';
import assets from '../../../docs/help/04-assets.md?raw';
import characters from '../../../docs/help/05-characters.md?raw';
import logic from '../../../docs/help/06-logic.md?raw';
import screens from '../../../docs/help/07-screens.md?raw';
import cinematics from '../../../docs/help/08-cinematics.md?raw';
import audio from '../../../docs/help/09-audio.md?raw';
import play from '../../../docs/help/10-play.md?raw';
import projects from '../../../docs/help/11-projects.md?raw';
import troubleshooting from '../../../docs/help/12-troubleshooting.md?raw';
import { MAX_BRICKS_PER_MAP } from '../../core/bricks/map-bricks';
import { MAX_CINEMATICS } from '../../core/commands/handlers/cinematics';
import { MAX_GATES } from '../../core/commands/handlers/gates';
import { MAX_ITEMS_PER_MAP } from '../../core/commands/handlers/items';
import { MAX_MAPS, MAX_SPAWNS, MAX_ZONES } from '../../core/commands/handlers/map';
import { logicReferenceMarkdown } from '../../core/logic/reference';
import { MAX_FILE_BYTES, MAX_PROJECT_BYTES } from '../../core/media/import';
import { MAX_STEPS } from '../../engine/logic/interpreter';
import { MAX_WORLD_UI } from '../../engine/ui/WorldUI';
import { ACTIONS, MENUS } from '../actions/registry';
import type { HelpPage } from './search';

/** The keyboard and touch reference, built from the action registry so it always matches the editor. */
function keysMarkdown(): string {
  const out = [
    '# Keyboard and touch',
    '',
    'Every editor shortcut, by menu. Shortcuts work when the focus is not in a text field. Ctrl means ⌘ on a Mac.',
    '',
  ];
  const listed = new Set<string>();
  const row = (id: string) => {
    const a = ACTIONS.find((x) => x.id === id);
    if (!a?.key || listed.has(id)) return null;
    listed.add(id);
    return `| ${a.label.replace(/\|/g, '/')} | \`${a.key}\` |`;
  };
  for (const [menu, ids] of Object.entries(MENUS)) {
    const rows = ids
      .filter((i) => i !== '-')
      .map(row)
      .filter(Boolean);
    if (!rows.length) continue;
    out.push(`## ${menu}`, '', '| Command | Key |', '|---|---|', ...(rows as string[]), '');
  }
  const rest = ACTIONS.filter((a) => a.key && !listed.has(a.id)).map((a) => row(a.id)!);
  out.push('## Tools and selection', '', '| Command | Key |', '|---|---|', ...rest, '');
  out.push(
    '## Camera',
    '',
    '| Do | Mouse | Touch |',
    '|---|---|---|',
    '| Orbit | drag | one finger |',
    '| Pan | right-drag or Shift-drag | two fingers |',
    '| Zoom | wheel | pinch |',
    '',
    '## Selecting',
    '',
    '- Click selects a whole object, Alt-click a single brick, Shift-click adds to the selection.',
    '',
    '## Playing',
    '',
    '| Do | Key | Touch |',
    '|---|---|---|',
    '| Move | WASD or arrows | arrow buttons |',
    '| Run | Shift | |',
    '| Jump | Space | jump button |',
    '| Smash | F | smash button |',
    '| Use, open, rebuild (hold) | E | use button |',
    '| Talk | T | |',
    '| Emotes | 1–4 | |',
    '| Pause menu | Esc | |',
    '| Stop playing | F5 | ■ Stop |',
    '',
    '## Logic graph',
    '',
    '- Delete removes the selected nodes or wire, F9 toggles a breakpoint on the selected node.',
  );
  return out.join('\n');
}

function limitsMarkdown(): string {
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
  return [
    '# Limits',
    '',
    'The editor refuses an edit that would go over a limit and says why.',
    '',
    '| What | Limit |',
    '|---|---|',
    `| Maps per project | ${MAX_MAPS} |`,
    `| Pieces (bricks) per map | ${MAX_BRICKS_PER_MAP.toLocaleString('en')} |`,
    `| Spawn points per map | ${MAX_SPAWNS} |`,
    `| Trigger zones per map | ${MAX_ZONES} |`,
    `| Sound emitters and signs per map | ${MAX_ITEMS_PER_MAP} |`,
    `| Signs shown at once in Play | ${MAX_WORLD_UI} |`,
    `| Gates | ${MAX_GATES} |`,
    `| Cinematics | ${MAX_CINEMATICS} |`,
    `| Logic steps per event chain | ${MAX_STEPS} |`,
    `| Imported file | ${mb(MAX_FILE_BYTES)} |`,
    `| Imported media per project | ${mb(MAX_PROJECT_BYTES)} |`,
  ].join('\n');
}

const title = (md: string) => /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? 'Help';
const page = (id: string, md: string): HelpPage => ({ id, title: title(md), md });

export type HelpGroup = { name: string; pages: HelpPage[] };

let cache: HelpGroup[] | null = null;
/** Help pages in reading order (P7.5). */
export function helpGroups(): HelpGroup[] {
  cache ??= [
    { name: 'Start', pages: [page('start', start), page('build-a-game', buildAGame)] },
    {
      name: 'Workspaces',
      pages: [
        page('scene', scene),
        page('world', world),
        page('assets', assets),
        page('characters', characters),
        page('logic', logic),
        page('screens', screens),
        page('cinematics', cinematics),
        page('audio', audio),
        page('play', play),
        page('projects', projects),
      ],
    },
    {
      name: 'Reference',
      pages: [
        { ...page('logic-reference', logicReferenceMarkdown()), rank: 0.6 },
        { ...page('keys', keysMarkdown()), rank: 0.8 },
        page('limits', limitsMarkdown()),
        page('troubleshooting', troubleshooting),
      ],
    },
  ];
  return cache;
}
export const helpPages = () => helpGroups().flatMap((g) => g.pages);
