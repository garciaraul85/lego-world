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

/**
 * P32: what a value names, so the inspector can offer a list instead of a text box and flag a name that
 * matches nothing: a placed object, a state of the object named by pin `of`, an asset, a custom event.
 */
export type PickKind = { kind: 'object' } | { kind: 'state'; of: string } | { kind: 'asset' } | { kind: 'event' };

export type PinDef = {
  name: string;
  type: PinType;
  label?: string;
  default?: unknown;
  /** P32: the list the inspector offers for this value */
  pick?: PickKind;
  /** P32: what the value is and where it comes from (the inspector's “?”) */
  help?: string;
};

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
  | 'cinematic'
  /** P22: a conversation */
  | 'dialogue'
  /** P23: an effect (built-in or the game's own) */
  | 'effect'
  /** P23 part 2: a screen effect; a colour grade; what drifts across the screen */
  | 'screenEffect'
  | 'grade'
  | 'drift';
export type ArgDef = {
  name: string;
  kind: ArgKind;
  label: string;
  optional?: boolean;
  default?: unknown;
  /** P32: what the setting is and where its value comes from (the inspector's “?”) */
  help?: string;
};

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
  /** P32: an asset (by name or id) at an object's item spot (an instance id, or an asset name: the nearest copy) */
  spawnNear(item: string, near: string): string | null;
  despawn(target: string): void;
  media(
    kind: 'sound' | 'music' | 'stopMusic' | 'show' | 'hide' | 'setText' | 'cinematic' | 'stopCinematic',
    id: string,
    extra?: unknown,
  ): void;
  /** entities (instance ids and 'hero') inside a zone */
  inZone(zone: string): string[];
  /** P9a: hurt the hero, a placed object or a neighbour (a hit of this power and damage type) */
  damage(target: string, amount: number, type: string, from?: string): void;
  /** P9a: give health back (never above the maximum) */
  heal(target: string, amount: number): void;
  /** P9a: nothing hurts it while on */
  setInvulnerable(target: string, on: boolean): void;
  /** P26: save to a slot, load one (none: the newest), or set the checkpoint where the hero stands */
  saving?(op: 'save' | 'load' | 'checkpoint', slot: number | undefined): void;
  /** P26 part 2: unlock an achievement (by id), or finish the game */
  progress?(op: 'achieve' | 'finish', id: string): void;
  /** P22: start a conversation (by id) */
  talk?(conversation: string): void;
  /** P22 part 2: the hero's outfit, experience, or the next hero of the party */
  sheet?(op: 'outfit' | 'xp' | 'switch', value: string | number): void;
  /** P23: play an effect (by id) at a place (empty: the hero), or start / stop an effect placed on the map */
  effect?(op: 'play' | 'on' | 'off', a: string, at?: string): void;
  /** P23 part 2: play a screen effect (by id), set this map's mood while it plays, or clear the screen */
  screen?(op: 'play' | 'mood' | 'clear', a?: string | Record<string, unknown>): void;
  /** P27: switch a placed light (by name) on, off or over, or set this map's darkness while it plays */
  light?(op: 'on' | 'off' | 'toggle' | 'darkness', name: string, value?: number): void;
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
