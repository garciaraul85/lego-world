import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const NAME = {
  name: 'name',
  kind: 'string' as const,
  label: 'Light',
  help: 'The name of a light placed on the map (“Torch 1”), or of an asset that gives light.',
};

/** P27 part 1: lights from logic — switch a placed light on, off or over, and how dark the map is. */
export const LIGHTS: NodeDef[] = [
  {
    type: 'light.on',
    kind: 'action',
    title: 'Light on',
    category: 'Lights',
    doc: 'Switches a light placed on the map on (by its name): it lights the bricks and characters around it again. An asset that gives light (a torch, a lamp) is switched by its name too.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [NAME],
    code: { name: 'lights.on', style: 'call' },
    exec: (c, a) => c.light?.('on', String(a.name ?? '')),
  },
  {
    type: 'light.off',
    kind: 'action',
    title: 'Light off',
    category: 'Lights',
    doc: 'Switches a light placed on the map off (by its name): the place around it goes as dark as the map.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [NAME],
    code: { name: 'lights.off', style: 'call' },
    exec: (c, a) => c.light?.('off', String(a.name ?? '')),
  },
  {
    type: 'light.toggle',
    kind: 'action',
    title: 'Switch light',
    category: 'Lights',
    doc: 'Switches a light placed on the map over: on if it was off, off if it was on (a lever that works both ways).',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [NAME],
    code: { name: 'lights.toggle', style: 'call' },
    exec: (c, a) => c.light?.('toggle', String(a.name ?? '')),
  },
  {
    type: 'light.darkness',
    kind: 'action',
    title: 'Set darkness',
    category: 'Lights',
    doc: 'How dark this map is without its lights, while the game plays: 0 lit by its sky as usual, 1 pitch black (a cave as the torch goes out). Leaving the map puts it back.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [
      { name: 'amount', kind: 'number', label: 'Darkness (0–1)', help: '0: as the sky lights it … 1: pitch black.' },
    ],
    code: { name: 'lights.darkness', style: 'call' },
    exec: (c, a) => c.light?.('darkness', '', Number(a.amount ?? 0)),
  },
];
