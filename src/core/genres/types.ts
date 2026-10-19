import { z } from 'zod';
import { DialogueLook } from '../dialogue/schema';
import { Saving } from '../save/save';

/**
 * P18: what a control is about. Every control (tab, tool, menu action, dock tab, asset filter, logic node)
 * names the features it belongs to and its level; a genre names the features it uses. A genre view shows a
 * control when the genre uses one of its features (or it is `core`) and its level is within the genre's level.
 */
export const FEATURES = [
  /** always shown: selecting, undo, files, play, help */
  'core',
  /** maps, terrain, placing assets, spawn points */
  'build',
  /** several maps joined by gates (World graph) */
  'world',
  /** the Asset studio and the asset library */
  'assets',
  /** the Character studio and clips */
  'characters',
  /** rules: logic graphs, variables, trigger zones */
  'logic',
  /** picking things up, inventory, chests, doors */
  'collect',
  /** game screens: HUD, title, pause, signs */
  'screens',
  /** cutscenes */
  'cinematics',
  /** sounds, music, the mix */
  'audio',
  /** the LEGO World v68 runtime and studio (guns, magic, powers, volcano) */
  'v68',
  /** watching the running game: console, debug drawing, profiler */
  'debug',
  /** health, damage, breakable things, fighting (P9) */
  'combat',
  /** the AI builder */
  'ai',
  /** P22: conversations, choices, barks, dialogue styles */
  'dialogue',
] as const;
export type Feature = (typeof FEATURES)[number];

/** simple controls suit everyone; advanced ones show in genres that ask for them, and always in Open */
export const LEVELS = ['simple', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

export type ControlTags = { tags: readonly Feature[]; level: Level };

const GenreId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/);

/** A genre is data (src/builtin/genres/*.json): no code per genre. */
export const Genre = z.strictObject({
  id: GenreId,
  name: z.string().min(1).max(40),
  /** one line for the start hub card */
  blurb: z.string().min(1).max(160),
  icon: z.string().min(1).max(4),
  /** the features this genre uses ('all' = every control: the Open view) */
  features: z.union([z.literal('all'), z.array(z.enum(FEATURES)).min(1)]),
  /** the highest level of control it shows */
  level: z.enum(LEVELS),
  /** workspace tabs in this order; the others go under More */
  tabs: z.array(z.string()).min(1),
  /** logic nodes listed first (by type) */
  nodesFirst: z.array(z.string()).default([]),
  /** engine defaults a new game of this genre starts with */
  defaults: z.strictObject({
    camera: z.enum(['explore', 'chase', 'top', 'side', 'first']),
    controls: z.enum(['walk', 'drive', 'fly', 'swim']),
    music: z.string().max(40).optional(),
  }),
  /** P26: how a game of this genre saves, until the maker picks (Game settings › Saving) */
  saving: Saving.optional(),
  /** P22: how this genre's conversations look until the maker picks (Project › Dialogue) */
  dialogue: DialogueLook.partial().optional(),
  /** the start hub's generator recipe for a new game (null: a blank project) */
  template: z.strictObject({ name: z.string().min(1).max(40), recipe: z.string().nullable() }),
  /** the tutorial track that teaches it */
  tutorial: z.string().min(1),
  /** the Help page the genre starts from */
  help: z.string().min(1),
  /** the mascot's checklist for a game of this genre */
  checklist: z.array(z.string().min(1).max(120)).max(12),
  /** when it can be picked: the phase whose systems it needs */
  readyAfter: z.string().min(1),
});
export type Genre = z.infer<typeof Genre>;
export type GenreInput = z.input<typeof Genre>;

/** Does a genre show a control with these tags? */
export function showsControl(g: Pick<Genre, 'features' | 'level'>, c: ControlTags): boolean {
  if (g.features === 'all') return true;
  if (c.level === 'advanced' && g.level === 'simple') return false;
  return c.tags.includes('core') || c.tags.some((t) => (g.features as readonly string[]).includes(t));
}
