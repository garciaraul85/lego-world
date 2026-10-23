import { z } from 'zod';

/**
 * P23 part 4: the animation state machine. Every character is in one state at a time, picked each frame from
 * what it is doing — hurt just now, attacking, in the air, moving fast, moving, or standing — and each state
 * plays the clip the character sheet sets for it (or the built-in motion when none is set). The rules are fixed
 * and checked in order, so the first one that holds wins; a character only tunes the numbers.
 */
export const ANIM_STATES = ['hurt', 'attack', 'jump', 'run', 'walk', 'idle'] as const;
export type AnimState = (typeof ANIM_STATES)[number];

export const StateSettings = z.strictObject({
  /** studs a second from which moving is running (the hero walks at 4 and runs at 7.8) */
  runAt: z.number().min(0.5).max(30).optional(),
  /** seconds the hurt state lasts after a hit */
  hurtFor: z.number().min(0.1).max(2).optional(),
  /** walk and run clips play faster or slower with the speed, so the feet keep up with the ground */
  matchSpeed: z.boolean().optional(),
});
export type StateSettings = z.infer<typeof StateSettings>;

export const STATE_DEFAULTS: Required<StateSettings> = { runAt: 6, hurtFor: 0.45, matchSpeed: true };
export const settingsOf = (s: StateSettings | undefined): Required<StateSettings> => ({ ...STATE_DEFAULTS, ...s });

/** below this a character stands (studs a second) */
export const MOVING_AT = 0.4;
/** the speeds a walk and a run clip are made for: at these they play at their own speed */
export const WALK_REF = 4;
export const RUN_REF = 7.8;

export type StateInput = {
  /** studs a second over the ground */
  speed: number;
  grounded: boolean;
  attacking: boolean;
  /** seconds since it was last hurt (Infinity: never) */
  hurtAgo: number;
};

/** The state the rules pick (the first that holds, in the order of ANIM_STATES). */
export function pickState(i: StateInput, s: StateSettings | undefined): AnimState {
  const o = settingsOf(s);
  if (i.hurtAgo >= 0 && i.hurtAgo < o.hurtFor) return 'hurt';
  if (i.attacking) return 'attack';
  if (!i.grounded) return 'jump';
  if (i.speed >= o.runAt) return 'run';
  if (i.speed > MOVING_AT) return 'walk';
  return 'idle';
}

/** how fast a state's clip plays (1: its own speed) */
export function clipRate(state: AnimState, speed: number, s: StateSettings | undefined): number {
  const o = settingsOf(s);
  if (!o.matchSpeed) return 1;
  const ref = state === 'walk' ? WALK_REF : state === 'run' ? RUN_REF : 0;
  if (!ref) return 1;
  return Math.max(0.5, Math.min(2, speed / ref));
}

/** states whose clip plays once each time the state starts (the others loop) */
export const ONCE: readonly AnimState[] = ['hurt', 'attack', 'jump'];

export const STATE_LABEL: Record<AnimState, string> = {
  hurt: 'Hurt',
  attack: 'Attack',
  jump: 'Jump',
  run: 'Run',
  walk: 'Walk',
  idle: 'Idle',
};

/** each rule in words, for the diagram on the character sheet */
export function stateRule(state: AnimState, s: StateSettings | undefined): string {
  const o = settingsOf(s);
  switch (state) {
    case 'hurt':
      return `for ${o.hurtFor} s after a hit`;
    case 'attack':
      return 'while it swings or strikes';
    case 'jump':
      return 'while its feet are off the ground';
    case 'run':
      return `when it moves at ${o.runAt} studs a second or faster`;
    case 'walk':
      return 'when it moves slower than that';
    case 'idle':
      return 'when it stands still';
  }
}
