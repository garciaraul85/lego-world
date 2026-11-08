import { ADVENTURE } from './adventure';
import { API, API_EVENTS, API_MATH } from './api';
import { BRAIN_EVENTS, BRAIN_HOOKS } from './brains';
import { BUTTON_EVENTS, BUTTONS } from './buttons';
import { DIALOGUE, DIALOGUE_EVENTS, MOVES, SHEET, SHEET_EVENTS } from './dialogue';
import { EFFECTS } from './effects';
import { EVENTS } from './events';
import { FLOW } from './flow';
import { GAME, GAME_EVENTS, GAME_HOOKS } from './game';
import { HEALTH, HEALTH_EVENTS } from './health';
import { HOOKS, RETURN } from './hooks';
import { ITEM_EVENTS, ITEM_HOOKS } from './items';
import { LIGHTS } from './lights';
import { COMPARE, MATH } from './math';
import { MEDIA } from './media';
import { MISC } from './misc';
import { PUZZLE_EVENTS } from './puzzles';
import { MAP_EVENTS, MAP_HOOKS, MAPS, QUEST_EVENTS, QUEST_HOOKS, QUESTS } from './quests';
import { PROGRESS_EVENTS, SAVE } from './save';
import { SELF, SELF_EVENTS } from './self';
import type { NodeDef, PinDef } from './types';
import { VARS } from './vars';
import { WORLD } from './world';

export * from './types';

/** Every logic node type (P4.1). Append-only: saved graphs refer to these type names. */
export const CATALOG: readonly NodeDef[] = [
  ...EVENTS,
  ...FLOW,
  ...VARS,
  ...MATH,
  ...COMPARE,
  ...WORLD,
  ...MEDIA,
  ...MISC,
  // P9a (append-only: saved graphs name these types)
  ...HEALTH_EVENTS,
  ...HEALTH,
  // P26
  ...SAVE,
  // P26 part 2
  ...PROGRESS_EVENTS,
  // P22
  ...DIALOGUE,
  ...DIALOGUE_EVENTS,
  // P22 part 2
  ...SHEET,
  ...MOVES,
  ...SHEET_EVENTS,
  ...EFFECTS,
  ...LIGHTS,
  // step 11b part 1
  ...BUTTON_EVENTS,
  ...BUTTONS,
  // step 11, 4c
  ...ADVENTURE,
  // step 12a
  ...PUZZLE_EVENTS,
  // Milestone 3b (B1): behaviours
  ...SELF_EVENTS,
  ...SELF,
  // Milestone 3b (B2): the engine API
  ...API_MATH,
  ...API_EVENTS,
  ...API,
  // Milestone 3b (B3): hooks of the built-in behaviours, and their answer
  ...HOOKS,
  ...BRAIN_HOOKS,
  ...BRAIN_EVENTS,
  ...ITEM_HOOKS,
  ...ITEM_EVENTS,
  ...RETURN,
  // Milestone 3b (B7a-2): quests and the maps
  ...QUEST_HOOKS,
  ...QUEST_EVENTS,
  ...QUESTS,
  ...MAP_HOOKS,
  ...MAP_EVENTS,
  ...MAPS,
  // Milestone 3b (B7a-3): the game's rules and a map's own behaviour
  ...GAME_HOOKS,
  ...GAME_EVENTS,
  ...GAME,
];
const BY_TYPE = new Map(CATALOG.map((d) => [d.type, d]));

export const nodeDef = (type: string): NodeDef | null => BY_TYPE.get(type) ?? null;
export const inputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.inputs.find((p) => p.name === pin) ?? null;
export const outputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.outputs.find((p) => p.name === pin) ?? null;
