import type { ArgKind, NodeDef, PinType } from './catalog/types';

/**
 * P32: what each setting and value of a logic node is, and where its value comes from — shown by the “?”
 * next to the field in the Node inspector, in the node's Help entry, and read by the AI. One sentence on
 * what it is, then where the value is defined (so a name typed here matches the place it comes from).
 */
const BY_ARG: Partial<Record<ArgKind, string>> = {
  var: 'A variable from Logic › Variables (left). Add one there first.',
  asset: 'An asset from the Asset library.',
  zone: 'A trigger zone drawn on a map (Scene › Zone tool, Z).',
  spawn: 'A spawn point placed on a map (Scene › Spawn tool).',
  map: 'One of the project’s maps.',
  state: 'One of the asset’s states (Assets › the asset › States).',
  event: 'A custom event name: any name, spelled exactly as where it is sent or listened to.',
  sound: 'A sound event from the Audio workspace.',
  music: 'A music state from the Audio workspace.',
  screen: 'A screen from the Screens workspace.',
  cinematic: 'A scene from the Cinematics workspace.',
  number: 'A number.',
  bool: 'On or off.',
  string: 'A text.',
};

const BY_PIN: Partial<Record<PinType, string>> = {
  entity:
    'A placed object: pick one, type an asset’s name (in Play the copy nearest the hero), or wire one in from another node.',
  string: 'A text, typed here or wired in (for example from Get variable).',
  number: 'A number, typed here or wired in.',
  bool: 'True or false, ticked here or wired in.',
  any: 'Any value, typed here or wired in.',
};

/**
 * The explanation of one node field (a setting or an input): the node's own text (its `help` in the catalog,
 * which names where the value comes from), else what that kind of value is.
 */
export function fieldHelp(def: NodeDef, field: string): string {
  const arg = def.args?.find((a) => a.name === field);
  const pin = def.inputs.find((p) => p.name === field);
  return arg?.help ?? pin?.help ?? (arg ? BY_ARG[arg.kind] : undefined) ?? (pin ? BY_PIN[pin.type] : undefined) ?? '';
}
