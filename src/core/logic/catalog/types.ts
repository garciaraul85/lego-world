/** Logic node catalog types (P4.1). Every node type is declared once: pins, args, docs, code form, executor. */

export type PinType =
  | 'exec'
  | 'bool'
  | 'number'
  | 'string'
  | 'entity'
  | 'asset'
  | 'character'
  | 'map'
  | 'screen'
  | 'cinematic'
  | 'sound'
  | 'music'
  | 'any';

export type PinDef = { name: string; type: PinType; label?: string; default?: unknown };

/** An inline constant edited on the node (variable name, asset id, zone...). */
export type ArgKind =
  | 'string'
  | 'number'
  | 'bool'
  | 'var'
  | 'asset'
  | 'zone'
  | 'spawn'
  | 'map'
  | 'state'
  | 'event'
  | 'sound'
  | 'music'
  | 'screen'
  | 'cinematic';
export type ArgDef = { name: string; kind: ArgKind; label: string; optional?: boolean; default?: unknown };

/** What a running graph may do to the game. The play session implements it. */
export interface ExecCtx {
  getVar(name: string): unknown;
  setVar(name: string, value: unknown): void;
  log(msg: string): void;
  emit(event: string): void;
  random(): number;
  setState(target: string | null, state: string): void;
  teleport(spawn: string): void;
  travel(map: string, spawn: string): void;
  give(item: string, count: number): void;
  spawn(asset: string, at: string): string | null;
  despawn(target: string): void;
  media(
    kind: 'sound' | 'music' | 'stopMusic' | 'show' | 'hide' | 'setText' | 'cinematic' | 'stopCinematic',
    id: string,
    extra?: unknown,
  ): void;
  /** entities (instance ids and 'hero') inside a zone */
  inZone(zone: string): string[];
}

export type Args = Record<string, unknown>;
export type Inputs = Record<string, unknown>;

export interface NodeDef {
  /** "event.onRebuildFinished" */
  type: string;
  kind: 'event' | 'action' | 'pure' | 'flow' | 'note';
  title: string;
  category: string;
  doc: string;
  inputs: PinDef[];
  outputs: PinDef[];
  args?: ArgDef[];
  /** how the node prints in the code view */
  code: { name: string; style: 'event' | 'call' | 'expr' | 'stmt' };
  /** actions: do the thing (flow nodes are run by the interpreter itself) */
  exec?(ctx: ExecCtx, args: Args, inputs: Inputs): void;
  /** pure nodes: compute the outputs from the inputs */
  eval?(ctx: ExecCtx, args: Args, inputs: Inputs): unknown;
}

export const EXEC_IN: PinDef = { name: 'in', type: 'exec' };
export const EXEC_OUT: PinDef = { name: 'then', type: 'exec' };

/** Wires carry exec to exec, and data to the same type or to/from `any`. */
export function canConnect(from: PinType, to: PinType): boolean {
  if (from === 'exec' || to === 'exec') return from === to;
  return from === to || from === 'any' || to === 'any' || (from === 'entity' && to === 'string');
}
