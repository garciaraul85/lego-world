import type { NodeDef } from './types';
import { EXEC_OUT } from './types';

const ev = (
  name: string,
  title: string,
  doc: string,
  args: NodeDef['args'] = [],
  outputs: NodeDef['outputs'] = [],
): NodeDef => ({
  type: `event.on${name}`,
  kind: 'event',
  title,
  category: 'Events',
  doc,
  inputs: [],
  outputs: [EXEC_OUT, ...outputs],
  args,
  code: { name: name.charAt(0).toLowerCase() + name.slice(1), style: 'event' },
});

export const EVENTS: NodeDef[] = [
  ev('Start', 'On start', 'Runs once when play starts.'),
  ev(
    'EnterZone',
    'On enter zone',
    'Runs when the hero walks into the zone.',
    [{ name: 'zone', kind: 'zone', label: 'Zone' }],
    [{ name: 'who', type: 'entity' }],
  ),
  ev(
    'ExitZone',
    'On exit zone',
    'Runs when the hero leaves the zone.',
    [{ name: 'zone', kind: 'zone', label: 'Zone' }],
    [{ name: 'who', type: 'entity' }],
  ),
  ev(
    'Interact',
    'On interact',
    'Runs when the hero presses E at an asset’s socket. Leave the asset empty to react to every asset.',
    [{ name: 'asset', kind: 'asset', label: 'Asset', optional: true }],
    [
      { name: 'target', type: 'entity' },
      { name: 'socket', type: 'string' },
    ],
  ),
  ev(
    'Smash',
    'On smash',
    'Runs when an object is smashed in play (an asset, or any object when the asset is empty).',
    [{ name: 'asset', kind: 'asset', label: 'Asset', optional: true }],
    [
      { name: 'target', type: 'entity' },
      { name: 'bricks', type: 'number' },
    ],
  ),
  ev(
    'RebuildFinished',
    'On rebuild finished',
    'Runs when the hero finishes rebuilding a smashed object.',
    [{ name: 'asset', kind: 'asset', label: 'Asset', optional: true }],
    [{ name: 'target', type: 'entity' }],
  ),
  ev(
    'VarChanged',
    'On variable changed',
    'Runs after a run that changed the variable.',
    [{ name: 'var', kind: 'var', label: 'Variable' }],
    [{ name: 'value', type: 'any' }],
  ),
  ev('Timer', 'On timer', 'Runs after the given seconds of play; repeats when Repeat is on.', [
    { name: 'seconds', kind: 'number', label: 'Seconds', default: 5 },
    { name: 'repeat', kind: 'bool', label: 'Repeat', default: false },
  ]),
  ev('CinematicDone', 'On cinematic done', 'Runs when the cinematic finishes.', [
    { name: 'cinematic', kind: 'cinematic', label: 'Cinematic' },
  ]),
  ev('ScreenButton', 'On screen button', 'Runs when a button on a screen is pressed.', [
    { name: 'screen', kind: 'screen', label: 'Screen' },
    { name: 'button', kind: 'string', label: 'Button' },
  ]),
  ev('Custom', 'On custom event', 'Runs when Send event (or an asset interaction) sends this event name.', [
    { name: 'event', kind: 'event', label: 'Event name' },
  ]),
];
