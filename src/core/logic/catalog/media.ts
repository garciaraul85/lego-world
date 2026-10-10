import type { ExecCtx, NodeDef } from './types';
import { EXEC_IN, EXEC_OUT } from './types';

const act = (
  type: string,
  title: string,
  category: string,
  doc: string,
  args: NodeDef['args'],
  run: (c: ExecCtx, a: Record<string, unknown>, i: Record<string, unknown>) => void,
  inputs: NodeDef['inputs'] = [],
): NodeDef => ({
  type,
  kind: 'action',
  title,
  category,
  doc,
  inputs: [EXEC_IN, ...inputs],
  outputs: [EXEC_OUT],
  args,
  code: { name: type, style: 'call' },
  exec: run,
});

/** Audio and screens (P5); cinematics are wired now and play when Phase 6 lands. */
export const MEDIA: NodeDef[] = [
  act(
    'audio.playSound',
    'Play sound',
    'Audio',
    'Plays a sound event.',
    [{ name: 'sound', kind: 'sound', label: 'Sound' }],
    (c, a) => c.media('sound', String(a.sound)),
  ),
  act(
    'audio.setMusic',
    'Set music',
    'Audio',
    'Changes the music.',
    [{ name: 'music', kind: 'music', label: 'Music' }],
    (c, a) => c.media('music', String(a.music)),
  ),
  act('audio.stopMusic', 'Stop music', 'Audio', 'Fades the music out.', [], (c) => c.media('stopMusic', '')),
  act(
    'screen.show',
    'Show screen',
    'Screens',
    'Shows a UI screen.',
    [{ name: 'screen', kind: 'screen', label: 'Screen' }],
    (c, a) => c.media('show', String(a.screen)),
  ),
  act(
    'screen.hide',
    'Hide screen',
    'Screens',
    'Hides a UI screen.',
    [{ name: 'screen', kind: 'screen', label: 'Screen' }],
    (c, a) => c.media('hide', String(a.screen)),
  ),
  act(
    'screen.setText',
    'Set screen text',
    'Screens',
    'Changes a text on a screen (a score, a hint).',
    [
      { name: 'screen', kind: 'screen', label: 'Screen' },
      { name: 'element', kind: 'string', label: 'Text element' },
    ],
    (c, a, i) => c.media('setText', String(a.screen), { element: a.element, text: i.text }),
    [{ name: 'text', type: 'any', default: '' }],
  ),
  act(
    'cinematic.play',
    'Play cinematic',
    'Cinematics',
    'Plays a cinematic. With Once, it plays only the first time.',
    [
      { name: 'cinematic', kind: 'cinematic', label: 'Cinematic' },
      { name: 'once', kind: 'bool', label: 'Once', optional: true, default: false },
    ],
    (c, a) => c.media('cinematic', String(a.cinematic), { once: !!a.once }),
  ),
  act('cinematic.stop', 'Stop cinematic', 'Cinematics', 'Stops the cinematic that is playing.', [], (c) =>
    c.media('stopCinematic', ''),
  ),
];
