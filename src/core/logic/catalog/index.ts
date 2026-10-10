import { EVENTS } from './events';
import { FLOW } from './flow';
import { COMPARE, MATH } from './math';
import { MEDIA } from './media';
import { MISC } from './misc';
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
];
const BY_TYPE = new Map(CATALOG.map((d) => [d.type, d]));

export const nodeDef = (type: string): NodeDef | null => BY_TYPE.get(type) ?? null;
export const inputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.inputs.find((p) => p.name === pin) ?? null;
export const outputPin = (type: string, pin: string): PinDef | null =>
  nodeDef(type)?.outputs.find((p) => p.name === pin) ?? null;
