import type { NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const CONV = {
  name: 'conversation',
  kind: 'dialogue' as const,
  label: 'Conversation',
  help: 'A conversation of this game (Characters › Dialogue). Code names it by its name.',
};

/** P22: start a conversation from logic, and react when the player picks an option or a conversation ends. */
export const DIALOGUE: NodeDef[] = [
  {
    type: 'dialogue.start',
    kind: 'action',
    title: 'Start conversation',
    category: 'Dialogue',
    doc: 'Starts a conversation, as if the hero had talked to someone: its lines, choices and actions play in the game’s dialogue style. The hero stands still until it ends.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [CONV],
    code: { name: 'dialogue.start', style: 'call' },
    exec: (c, a) => c.talk?.(String(a.conversation ?? '')),
  },
];

export const DIALOGUE_EVENTS: NodeDef[] = [
  {
    type: 'event.onChoice',
    kind: 'event',
    title: 'On choice made',
    category: 'Events',
    doc: 'Runs when the player picks an option in a conversation (empty: any conversation; option: only when the option has this text).',
    inputs: [],
    outputs: [EXEC_OUT],
    args: [
      { ...CONV, optional: true },
      {
        name: 'option',
        kind: 'string',
        label: 'Option text',
        optional: true,
        help: 'The option’s text, as written (empty: any option).',
      },
    ],
    code: { name: 'choice', style: 'event' },
  },
  {
    type: 'event.onConversationEnd',
    kind: 'event',
    title: 'On conversation end',
    category: 'Events',
    doc: 'Runs when a conversation ends (empty: any conversation): the last line was read, a choice led to the end, or the hero walked away.',
    inputs: [],
    outputs: [EXEC_OUT],
    args: [{ ...CONV, optional: true }],
    code: { name: 'conversationEnd', style: 'event' },
  },
];
