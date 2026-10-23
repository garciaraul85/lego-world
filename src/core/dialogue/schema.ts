import { z } from 'zod';
import { Action } from '../schema/action';
import { id } from '../schema/common';

/**
 * P22 dialogue: conversations (dialogue/dlg_<id>.json). A conversation is a few named sections; each is a
 * list of steps played in order: a line someone says, a choice the player makes, actions (set a variable,
 * give an item, play a cinematic…), a change in how much the speaker likes the hero, or a jump to another
 * section. Any step can have a condition (`if`), written in the small condition language of condition.ts.
 * The same conversation is shown as a list, a graph and a script (script.ts); all three edit this data.
 */

/** a condition such as `gems >= 50 and talks > 0` (empty: always) */
export const Cond = z.string().max(200);

export const MOODS = ['neutral', 'happy', 'angry', 'sad', 'scared', 'surprised'] as const;
export type Mood = (typeof MOODS)[number];

/** a section name: lower case letters, digits, - and _ (“start”, “buy”, “after-quest”) */
export const Label = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/, 'a section name is lower case letters, digits, - or _');
/** where a choice or a jump goes: a section, or `end` */
export const Target = z.union([Label, z.literal('end')]);

export const Line = z.strictObject({
  k: z.literal('line'),
  /** who says it: a character id, a name, or empty for the narrator */
  who: z.string().max(60),
  text: z.string().min(1).max(400),
  mood: z.enum(MOODS).optional(),
  if: Cond.optional(),
});
export const ChoiceOption = z.strictObject({
  text: z.string().min(1).max(120),
  /** a section, `end`, or none: carry on with the step after the choice */
  to: Target.optional(),
  if: Cond.optional(),
  /** when the condition fails: hide the option (default) or show it greyed out */
  failed: z.enum(['hide', 'grey']).optional(),
});
export const Choice = z.strictObject({
  k: z.literal('choice'),
  options: z.array(ChoiceOption).min(1).max(6),
  if: Cond.optional(),
});
export const Do = z.strictObject({
  k: z.literal('do'),
  actions: z.array(Action).min(1).max(8),
  if: Cond.optional(),
});
/** how much the speaker likes the hero goes up or down (−100…100 in all) */
export const Like = z.strictObject({
  k: z.literal('like'),
  by: z.number().int().min(-100).max(100),
  if: Cond.optional(),
});
export const Goto = z.strictObject({ k: z.literal('goto'), to: Target, if: Cond.optional() });

export const Step = z.discriminatedUnion('k', [Line, Choice, Do, Like, Goto]);
export type Step = z.infer<typeof Step>;
export type Line = z.infer<typeof Line>;
export type Choice = z.infer<typeof Choice>;
export type ChoiceOption = z.infer<typeof ChoiceOption>;

export const Section = z.strictObject({ label: Label, steps: z.array(Step).max(200) });
export type Section = z.infer<typeof Section>;

export const DIALOGUE_STYLES = [
  'adventure',
  'rpg',
  'novel',
  'bubble',
  'cinematic',
  'chat',
  'sign',
  'narrator',
] as const;
export type DialogueStyle = (typeof DIALOGUE_STYLES)[number];

export const STYLE_INFO: Record<DialogueStyle, { name: string; looks: string }> = {
  adventure: {
    name: 'Adventure',
    looks: 'A box at the bottom, a name tag, text appearing letter by letter with voice blips, a ▼ next arrow',
  },
  rpg: { name: 'Classic RPG', looks: 'A framed window with a portrait beside the text' },
  novel: { name: 'Visual novel', looks: 'Large portraits left and right, the text below, choices in the centre' },
  bubble: { name: 'Speech bubbles', looks: 'Comic bubbles above the speaker’s head, in the world' },
  cinematic: { name: 'Cinematic', looks: 'Subtitles under letterbox bars' },
  chat: { name: 'Chat', looks: 'Text-message bubbles on a phone screen' },
  sign: { name: 'Sign', looks: 'A plaque or scroll, for signs and books' },
  narrator: { name: 'Narrator', looks: 'A caption with no speaker' },
};

/** how conversations look and feel: the game's default (Project › Dialogue), a conversation can pick its own style */
export const DialogueLook = z.strictObject({
  style: z.enum(DIALOGUE_STYLES),
  /** letters per second (0: the whole line at once) */
  textSpeed: z.number().int().min(0).max(200),
  /** the voice blip played as letters appear (a sound event; null: silent) */
  blip: z.string().nullable(),
  /** blip pitch, 0.5 (low) to 2 (high) */
  pitch: z.number().min(0.5).max(2),
  /** lines move on by themselves after this many seconds (0: wait for the player) */
  autoAdvance: z.number().min(0).max(30),
  portrait: z.boolean(),
  /** box and text colours */
  bg: z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  nameColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** how choices are laid out */
  choices: z.enum(['list', 'buttons']),
});
export type DialogueLook = z.infer<typeof DialogueLook>;

export const DEFAULT_LOOK: DialogueLook = {
  style: 'adventure',
  textSpeed: 40,
  blip: 'snd_talk000000',
  pitch: 1,
  autoAdvance: 0,
  portrait: true,
  bg: '#0b1020f2',
  color: '#ffffff',
  nameColor: '#ffd277',
  choices: 'list',
};

export const Conversation = z.strictObject({
  id: id('dialogue'),
  name: z.string().min(1).max(60),
  /** its own style (none: the game's) */
  style: z.enum(DIALOGUE_STYLES).optional(),
  sections: z.array(Section).min(1).max(40),
});
export type Conversation = z.infer<typeof Conversation>;

/** Which conversation a character uses: the first entry whose condition holds (an empty condition always does). */
export const TalkEntry = z.strictObject({
  conversation: id('dialogue'),
  if: Cond.optional(),
  /** a note for the maker (“first meeting”, “after the quest”) */
  note: z.string().max(60).optional(),
});
export type TalkEntry = z.infer<typeof TalkEntry>;

/** a short line said when the hero walks past (no conversation) */
export const Bark = z.strictObject({
  text: z.string().min(1).max(120),
  if: Cond.optional(),
});
export type Bark = z.infer<typeof Bark>;

export const MAX_CONVERSATIONS = 200;

/** a new conversation with one section and one line */
export function blankConversation(id: string, name: string, who = ''): Conversation {
  return { id, name, sections: [{ label: 'start', steps: [{ k: 'line', who, text: 'Hello there!' }] }] };
}
