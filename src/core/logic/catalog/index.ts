import { DIALOGUE, DIALOGUE_EVENTS, SHEET, SHEET_EVENTS } from './dialogue';
import { EFFECTS } from './effects';
import { EVENTS } from './events';
import { FLOW } from './flow';
import { HEALTH, HEALTH_EVENTS } from './health';
import { LIGHTS } from './lights';
import { COMPARE, MATH } from './math';
import { MEDIA } from './media';
import { MISC } from './misc';
import { PROGRESS_EVENTS, SAVE } from './save';
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
  ...SHEET_EVENTS,
  ...EFFECTS,
  ...LIGHTS,
];
const BY_TYPE = new Map(CATALOG.map((d) => [d.type, d]));

export const nodeDef = (type: string): NodeDef | null => BY_TYPE.get(type) ?? null;
export const inputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.inputs.find((p) => p.name === pin) ?? null;
export const outputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.outputs.find((p) => p.name === pin) ?? null;
