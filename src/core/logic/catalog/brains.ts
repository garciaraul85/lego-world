import { hook } from './hooks';
import type { NodeDef } from './types';
import { EXEC_OUT } from './types';

/**
 * Milestone 3b (B5a): enemy brains — the decisions of Brain, EnemyBrain and its templates (Brawler, Knight, PopUp…)
 * that a behaviour extending them can make itself. The engine asks them as the enemy thinks; not answering keeps
 * the engine's answer (super.x(e) in code, base on the card).
 */
export const BRAIN_EVENTS: NodeDef[] = [
  {
    type: 'event.onStateChange',
    kind: 'event',
    title: 'On state change',
    category: 'Events',
    doc: 'Runs when an enemy’s brain goes from one state to another (idle, chase, windup, circle, swoop, hidden, rise, spit, flee…): from and to name them. For a behaviour that extends an enemy brain, only its own enemy’s changes.',
    inputs: [],
    outputs: [EXEC_OUT, { name: 'from', type: 'string' }, { name: 'to', type: 'string' }],
    code: { name: 'stateChange', style: 'event' },
  },
];

export const BRAIN_HOOKS: NodeDef[] = [
  hook(
    'NextState',
    'Which state next? (Brain)',
    'Asked when the brain changes state: from is the state it leaves, to (and base) the one the engine chose. Return a state name to go there instead (idle, chase, windup, back, circle, swoop, climb, hidden, rise, up, spit, duck, hang, drop, ground, fadeout, faded, fadein, charge, beam, breathe, rush, counter, hop, flee).',
    [
      { name: 'from', type: 'string' },
      { name: 'to', type: 'string' },
    ],
    'string',
  ),
  hook(
    'CanSee',
    'Does it see the hero? (EnemyBrain)',
    'Asked while it looks out: distance is how far the hero is; base says whether its sight, cone and hearing caught the hero. Return true to notice the hero, false not to.',
    [{ name: 'distance', type: 'number' }],
    'bool',
  ),
  hook(
    'CanAttack',
    'Can it attack now? (EnemyBrain)',
    'Asked before each attack starts: attack is swing, counter, bite, pounce, spit, shot, beam, breath, charge, swoop or drop; distance how far the hero is. Return false and it holds back (and tries again soon).',
    [
      { name: 'attack', type: 'string' },
      { name: 'distance', type: 'number' },
    ],
    'bool',
  ),
  hook(
    'AttackPower',
    'How hard does it hit? (EnemyBrain)',
    'Asked as an attack lands (a swing, bite, pounce, beam, breath, charge, swoop or drop) or a spit or shot leaves it: attack names it, power is its power. Return the power (0: it does no harm).',
    [
      { name: 'attack', type: 'string' },
      { name: 'power', type: 'number' },
    ],
    'number',
  ),
  hook(
    'ShouldFlee',
    'Should it run away? (EnemyBrain)',
    'Asked every step while it fights: distance is how far the hero is. Return true and it runs from the hero this step (not a turret, a pop-up or a hanging spider).',
    [{ name: 'distance', type: 'number' }],
    'bool',
  ),
  hook(
    'CallsPack',
    'Does it call the others? (PackHunter, and any with Pack wits)',
    'Asked when it first sees the hero. Return false and it fights alone.',
    [],
    'bool',
  ),
  hook(
    'ShouldCounter',
    'Does it counter? (Knight)',
    'Asked when the hero swings at its shield: distance is how far the hero is. Return false and it only blocks.',
    [{ name: 'distance', type: 'number' }],
    'bool',
  ),
  hook(
    'Spits',
    'How many spits? (PopUp)',
    'Asked each time it comes up: how many shots before it ducks (1 to 10; the engine picks 1 or 2).',
    [],
    'number',
  ),
  hook(
    'ShotKind',
    'What does it shoot? (PopUp, Shooter)',
    'Asked as it shoots: rock or fireball (base: a fire enemy’s fireball, the others’ rock).',
    [],
    'string',
  ),
  hook(
    'KeepAway',
    'How far does it keep? (Shooter)',
    'Asked every step: the distance it keeps from the hero (studs).',
    [],
    'number',
  ),
  hook(
    'TrackSpeed',
    'How fast does its gaze follow? (Turret)',
    'Asked as it charges and fires its beam: how fast it turns after the hero (radians a second; you can outrun a slow one).',
    [],
    'number',
  ),
  hook(
    'ShouldCharge',
    'Does it charge? (Charger)',
    'Asked while it closes in: distance is how far the hero is; base is true when it is far enough for a run, near enough, and facing the hero.',
    [{ name: 'distance', type: 'number' }],
    'bool',
  ),
  hook(
    'CircleTime',
    'How long does it circle? (Flyer, Swarm)',
    'Asked as it starts circling over the hero: seconds before it swoops.',
    [],
    'number',
  ),
  hook(
    'ShouldDrop',
    'Does it drop? (Ambusher)',
    'Asked as it hangs on its thread: distance is how far the hero is from under it; base is true when the hero is right under it.',
    [{ name: 'distance', type: 'number' }],
    'bool',
  ),
  hook(
    'HiddenFor',
    'How long does it stay unseen? (Ghost)',
    'Asked as it fades out: seconds before it fades in behind the hero.',
    [],
    'number',
  ),
];
