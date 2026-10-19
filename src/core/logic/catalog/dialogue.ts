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

/** P22 part 2: the character sheet from logic */
export const SHEET: NodeDef[] = [
  {
    type: 'character.giveXp',
    kind: 'action',
    title: 'Give experience',
    category: 'Characters',
    doc: 'Gives the hero experience points. Reaching the next level (its sheet’s experience curve) says “Level up!”, plays its victory clip and fires On level up. Read them as the variables xp and level.',
    inputs: [
      EXEC_IN,
      { name: 'amount', type: 'number', default: 10, help: 'Points to give (negative takes some away).' },
    ],
    outputs: [EXEC_OUT],
    args: [],
    code: { name: 'hero.giveXp', style: 'call' },
    exec: (c, _a, i) => c.sheet?.('xp', Number(i.amount ?? 10)),
  },
  {
    type: 'character.setOutfit',
    kind: 'action',
    title: 'Change outfit',
    category: 'Characters',
    doc: 'The hero puts on one of the outfits on its sheet (Characters › Outfits): its look and the outfit’s stat bonuses change. Empty: its own clothes.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [
      {
        name: 'outfit',
        kind: 'string',
        label: 'Outfit name',
        optional: true,
        help: 'The outfit’s name, as on the sheet.',
      },
    ],
    code: { name: 'hero.setOutfit', style: 'call' },
    exec: (c, a) => c.sheet?.('outfit', String(a.outfit ?? '')),
  },
  {
    type: 'character.switchHero',
    kind: 'action',
    title: 'Switch hero',
    category: 'Characters',
    doc: 'Plays as the next hero of the party (Project › Party), as pressing H does.',
    inputs: [EXEC_IN],
    outputs: [EXEC_OUT],
    args: [],
    code: { name: 'hero.switch', style: 'call' },
    exec: (c) => c.sheet?.('switch', ''),
  },
];

export const SHEET_EVENTS: NodeDef[] = [
  {
    type: 'event.onLevelUp',
    kind: 'event',
    title: 'On level up',
    category: 'Events',
    doc: 'Runs when the hero reaches a new level (Give experience).',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'level', type: 'number', help: 'The level reached.' }],
    args: [],
    code: { name: 'levelUp', style: 'event' },
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
