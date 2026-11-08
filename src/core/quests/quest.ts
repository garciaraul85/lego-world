/**
 * Milestone 3b (B7a-2): quests. A quest is a behaviour that extends Quest (or MainQuest, SideQuest), its steps
 * written in the class like a boss's phases:
 *
 *   class LostLamp extends SideQuest {
 *     steps = [
 *       { name: "Ask Mossbeard about the lamp", do: "talk", at: "Mossbeard" },
 *       { name: "Find the lamp in the old well", do: "reach", at: "Old well" },
 *       { name: "Bring back 3 glowcaps", do: "get", at: "Glowcap", count: 3 },
 *       { name: "Give the lamp back", do: "talk", at: "Mossbeard" },
 *     ];
 *   }
 *
 * Each step has a goal — where to go next — shown on both maps while the quest is tracked (on another map: the way
 * there, through the world graph's gates); it is done by itself
 * when its `do` is (reach a place, talk to a character, get items, beat foes, use an object), or by logic
 * (`do: "script"`: quest.advance()).
 */
import { z } from 'zod';

/** what finishes a step by itself */
export const QUEST_DO = ['reach', 'talk', 'get', 'beat', 'use', 'script'] as const;
export type QuestDo = (typeof QUEST_DO)[number];

export const QUEST_DO_INFO: Record<QuestDo, { label: string; at: string; about: string }> = {
  reach: { label: 'Reach', at: 'Place', about: 'the hero gets there: a zone, an object or a character, by name' },
  talk: { label: 'Talk to', at: 'Character', about: 'the hero talks to this character' },
  get: { label: 'Get', at: 'Item', about: 'the hero carries this many of the item' },
  beat: { label: 'Beat', at: 'Foe', about: 'this many of the character are beaten (from when the step starts)' },
  use: { label: 'Use', at: 'Object', about: 'the hero uses this object (its asset’s name) with the Action button' },
  script: { label: 'By logic', at: 'Goal', about: 'only logic finishes it: quest.advance()' },
};

export const STEP_KEYS = ['name', 'do', 'at', 'count', 'where', 'map'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const QuestStepDef = z.strictObject({
  /** what the quest log says: "Find the lamp in the old well" */
  name: z.string().min(1).max(60),
  /** what finishes it by itself (none: script) */
  do: z.enum(QUEST_DO).optional(),
  /** the place, character, item or object it is about, by name */
  at: z.string().max(60).optional(),
  /** how many (get, beat) */
  count: z.number().int().min(1).max(99).optional(),
  /** where the goal shows on the maps, when not where `at` is (a get: where the item is found) */
  where: z.string().max(60).optional(),
  /** v141: the map its goal is on, by name (when the same name is on several maps; else it is found on any) */
  map: z.string().max(80).optional(),
});
export type QuestStepDef = z.infer<typeof QuestStepDef>;

export const MAX_STEPS = 12;

/** a step's do (none written: by logic) */
export const doOf = (s: QuestStepDef): QuestDo => s.do ?? 'script';

/** where a step's goal is on the maps: its where, else its at (a place, a character, an object); a get: none */
export function goalNameOf(s: QuestStepDef): string {
  if (s.where?.trim()) return s.where.trim();
  const d = doOf(s);
  return d === 'get' ? '' : (s.at ?? '').trim();
}

/** a problem with a list of steps (for the parser and the Steps panel), or null */
export function stepsProblem(steps: readonly QuestStepDef[]): string | null {
  if (!steps.length) return 'A quest needs at least one step.';
  if (steps.length > MAX_STEPS) return `A quest has at most ${MAX_STEPS} steps.`;
  for (const [i, s] of steps.entries()) {
    const d = doOf(s);
    if (d !== 'script' && !s.at?.trim())
      return `Step ${i + 1} (${QUEST_DO_INFO[d].label.toLowerCase()}) needs at: the ${QUEST_DO_INFO[d].at.toLowerCase()}’s name.`;
  }
  return null;
}

/** what a step's setting takes (the parser's messages) */
export function stepHint(key: string): string {
  switch (key) {
    case 'name':
      return 'what the quest log says, in quotes (up to 60 letters).';
    case 'do':
      return `what finishes it: ${QUEST_DO.join(', ')}.`;
    case 'at':
      return 'the name of the place, character, item or object, in quotes.';
    case 'count':
      return 'how many, 1 to 99.';
    case 'where':
      return 'the name of where its goal shows on the maps, in quotes.';
    case 'map':
      return 'the name of the map its goal is on, in quotes.';
    default:
      return `use ${STEP_KEYS.join(', ')}.`;
  }
}

/** a quest in a play (and its saves) */
export const QuestStatus = z.enum(['active', 'done', 'failed']);
export type QuestStatus = z.infer<typeof QuestStatus>;
export const QuestProgress = z.strictObject({
  status: QuestStatus,
  /** the step it is on (0: its first) */
  step: z.number().int().min(0).max(MAX_STEPS),
  /** the count of what the step is about when it began (beat, talk, use: those since then count) */
  base: z.number().int().min(0).max(1_000_000).optional(),
  /** the order quests began in (the log lists them so) */
  order: z.number().int().min(0).max(1_000_000),
});
export type QuestProgress = z.infer<typeof QuestProgress>;

export const QuestLogSave = z.strictObject({
  quests: z.record(z.string().max(80), QuestProgress),
  tracked: z.string().max(80).optional(),
  /** what the hero has done that steps count: "talk:mossbeard", "beat:rattlebones", "use:old lever" */
  counts: z.record(z.string().max(80), z.number().int().min(0).max(1_000_000)).optional(),
});
export type QuestLogSave = z.infer<typeof QuestLogSave>;
