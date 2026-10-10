import type { Clip } from '../../core/schema';

type K = [number, number, Clip['tracks'][number]['keys'][number][2]];
const tr = (bone: string, prop: string, keys: K[]) => ({ bone, prop, keys });
const E = 'easeInOut' as const;

/**
 * Built-in gestures for cinematics (P6.1 `emote {kind}`): wave, cheer, nod, bow, shrug, point.
 * Ids are readable (clp_emote + kind); the Character studio lists them under "Gestures".
 */
export const EMOTE_CLIPS: Clip[] = [
  {
    id: 'clp_emotewave0',
    name: 'Wave',
    group: 'Gestures',
    length: 1.6,
    loop: false,
    tracks: [
      tr('rightArm', 'z', [
        [0, 0.06, E],
        [0.25, 2.65, E],
        [1.35, 2.65, E],
        [1.6, 0.06, E],
      ]),
      tr('rightForearm', 'bend', [
        [0, -0.12, E],
        [0.25, -0.5, E],
        [0.45, -1.2, E],
        [0.65, -0.5, E],
        [0.85, -1.2, E],
        [1.05, -0.5, E],
        [1.25, -1.2, E],
        [1.6, -0.12, E],
      ]),
      tr('head', 'turn', [
        [0, 0, E],
        [0.3, 0.15, E],
        [1.3, 0.15, E],
        [1.6, 0, E],
      ]),
    ],
    events: [],
  },
  {
    id: 'clp_emotecheer',
    name: 'Cheer',
    group: 'Gestures',
    length: 1.4,
    loop: false,
    tracks: [
      tr('leftArm', 'z', [
        [0, -0.06, E],
        [0.2, -2.85, E],
        [1.2, -2.85, E],
        [1.4, -0.06, E],
      ]),
      tr('rightArm', 'z', [
        [0, 0.06, E],
        [0.2, 2.85, E],
        [1.2, 2.85, E],
        [1.4, 0.06, E],
      ]),
      tr('root', 'height', [
        [0, 1.78, E],
        [0.35, 2.0, E],
        [0.6, 1.78, E],
        [0.85, 2.0, E],
        [1.1, 1.78, E],
      ]),
      tr('root', 'free', [
        [0, 0, 'step'],
        [0.3, 1, 'step'],
        [1.15, 0, 'step'],
      ]),
    ],
    events: [],
  },
  {
    id: 'clp_emotenod00',
    name: 'Nod',
    group: 'Gestures',
    length: 1.0,
    loop: false,
    tracks: [
      tr('torso', 'lean', [
        [0, 0, E],
        [0.2, 0.18, E],
        [0.4, 0, E],
        [0.6, 0.18, E],
        [0.8, 0, E],
      ]),
    ],
    events: [],
  },
  {
    id: 'clp_emotebow00',
    name: 'Bow',
    group: 'Gestures',
    length: 1.8,
    loop: false,
    tracks: [
      tr('torso', 'lean', [
        [0, 0, E],
        [0.5, 0.75, E],
        [1.2, 0.75, E],
        [1.8, 0, E],
      ]),
      tr('rightArm', 'x', [
        [0, 0, E],
        [0.5, -0.5, E],
        [1.2, -0.5, E],
        [1.8, 0, E],
      ]),
    ],
    events: [],
  },
  {
    id: 'clp_emoteshrug',
    name: 'Shrug',
    group: 'Gestures',
    length: 1.2,
    loop: false,
    tracks: [
      tr('leftArm', 'z', [
        [0, -0.06, E],
        [0.3, -0.6, E],
        [0.9, -0.6, E],
        [1.2, -0.06, E],
      ]),
      tr('rightArm', 'z', [
        [0, 0.06, E],
        [0.3, 0.6, E],
        [0.9, 0.6, E],
        [1.2, 0.06, E],
      ]),
      tr('leftForearm', 'bend', [
        [0, -0.12, E],
        [0.3, -1.4, E],
        [0.9, -1.4, E],
        [1.2, -0.12, E],
      ]),
      tr('rightForearm', 'bend', [
        [0, -0.12, E],
        [0.3, -1.4, E],
        [0.9, -1.4, E],
        [1.2, -0.12, E],
      ]),
      tr('root', 'height', [
        [0, 1.78, E],
        [0.3, 1.86, E],
        [0.9, 1.86, E],
        [1.2, 1.78, E],
      ]),
    ],
    events: [],
  },
  {
    id: 'clp_emotepoint',
    name: 'Point',
    group: 'Gestures',
    length: 1.6,
    loop: false,
    tracks: [
      tr('rightArm', 'x', [
        [0, 0, E],
        [0.3, -1.5, E],
        [1.3, -1.5, E],
        [1.6, 0, E],
      ]),
      tr('rightForearm', 'bend', [
        [0, -0.12, E],
        [0.3, -0.05, E],
        [1.3, -0.05, E],
        [1.6, -0.12, E],
      ]),
    ],
    events: [],
  },
];

export const EMOTE_KINDS = ['wave', 'cheer', 'nod', 'bow', 'shrug', 'point'] as const;
export const emoteClip = (kind: string) => EMOTE_CLIPS.find((c) => c.name?.toLowerCase() === kind.toLowerCase());
