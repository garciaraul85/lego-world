/**
 * Milestone 3b (B1): behaviours — logic files you attach to things, with fields (Unity's components). An asset or
 * a character lists the behaviours every copy runs; one placed copy can add its own, set its own field values, or
 * switch one of its asset's off. These helpers work out what a copy runs and with which values.
 */
import type { FieldType, LogicGraph, ScriptAttachment } from '../schema';

export type FieldValue = number | boolean | string;

/** a logic file that is a behaviour */
export const isBehaviour = (g: Pick<LogicGraph, 'behaviour'> | null | undefined): boolean => !!g?.behaviour;

/** what one copy runs: its asset's or character's attachments (unless switched off on it), then its own */
export function attachmentsOf(
  base: readonly ScriptAttachment[] | undefined,
  own: readonly ScriptAttachment[] | undefined,
): ScriptAttachment[] {
  const out: ScriptAttachment[] = [];
  const mine = new Map((own ?? []).map((a) => [a.use, a]));
  for (const a of base ?? []) {
    const o = mine.get(a.use);
    if (o?.off || a.off) continue;
    out.push({ use: a.use, fields: { ...(a.fields ?? {}), ...(o?.fields ?? {}) } });
  }
  for (const a of own ?? []) {
    if (a.off || (base ?? []).some((b) => b.use === a.use)) continue;
    out.push(a);
  }
  return out;
}

/** a copy's starting values: each field's default, then the values set where it is attached; its own variables */
export function startValues(g: Pick<LogicGraph, 'behaviour'>, set: Record<string, FieldValue> | undefined) {
  const out: Record<string, FieldValue> = {};
  for (const f of g.behaviour?.fields ?? []) out[f.name] = coerce(f.type, set?.[f.name] ?? f.default);
  for (const [k, v] of Object.entries(g.behaviour?.vars ?? {})) out[k] = v;
  return out;
}

/** a value typed into a field box, as the field's type */
export function coerce(type: FieldType, v: unknown): FieldValue {
  if (type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (type === 'bool') return v === true || v === 'true';
  return String(v ?? '');
}

/** the default for a new field of a type */
export const DEFAULT_OF: Record<FieldType, FieldValue> = {
  number: 0,
  bool: false,
  string: '',
  asset: '',
  character: '',
  item: '',
  sound: '',
  effect: '',
  zone: '',
  object: '',
  event: '',
};

/** what each field type holds, for the Fields list and the Inspector */
export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'number', label: 'Number' },
  { type: 'bool', label: 'Yes / no' },
  { type: 'string', label: 'Text' },
  { type: 'item', label: 'Item' },
  { type: 'object', label: 'Placed object' },
  { type: 'asset', label: 'Asset' },
  { type: 'character', label: 'Character' },
  { type: 'sound', label: 'Sound' },
  { type: 'effect', label: 'Effect' },
  { type: 'zone', label: 'Zone' },
  { type: 'event', label: 'Custom event' },
];

/** names a behaviour's cards and code can use with this.: its fields and its own variables */
export const selfNames = (g: Pick<LogicGraph, 'behaviour'> | null | undefined): string[] => [
  ...(g?.behaviour?.fields ?? []).map((f) => f.name),
  ...Object.keys(g?.behaviour?.vars ?? {}),
];
