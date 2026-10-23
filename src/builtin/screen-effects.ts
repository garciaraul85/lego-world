import type { ScreenEffect, ScreenEvent } from '../core/effects/screen';

/** P23 part 2: the built-in screen effects every game can use (copy one to change it). */
const pad = (s: string) => `sce_${s.padEnd(10, '0').slice(0, 10)}` as const;
export const SFX = {
  smallShake: pad('smallshake'),
  bigShake: pad('bigshake'),
  rumble: pad('rumble'),
  whiteFlash: pad('whiteflash'),
  redFlash: pad('redflash'),
  goldFlash: pad('goldflash'),
  hitStop: pad('hitstop'),
  bigHit: pad('bighit'),
  slowMo: pad('slowmo'),
  finisher: pad('finisher'),
  fadeOut: pad('fadeout'),
  fadeIn: pad('fadein'),
  blink: pad('blink'),
  knockout: pad('knockout'),
  landing: pad('landing'),
  quake: pad('quake'),
} as const;

export const BUILTIN_SCREEN_EFFECTS: ScreenEffect[] = [
  { id: SFX.smallShake, name: 'Small shake', shake: { strength: 0.12, seconds: 0.25, rumble: false } },
  { id: SFX.bigShake, name: 'Big shake', shake: { strength: 0.45, seconds: 0.5, rumble: false } },
  { id: SFX.rumble, name: 'Rumble', shake: { strength: 0.3, seconds: 2, rumble: true } },
  { id: SFX.quake, name: 'Earthquake', shake: { strength: 0.9, seconds: 3, rumble: true } },
  { id: SFX.whiteFlash, name: 'White flash', flash: { color: '#ffffff', alpha: 0.7, seconds: 0.25 } },
  { id: SFX.redFlash, name: 'Red flash', flash: { color: '#ff2a2a', alpha: 0.45, seconds: 0.35 } },
  { id: SFX.goldFlash, name: 'Gold flash', flash: { color: '#ffd24a', alpha: 0.5, seconds: 0.6 } },
  { id: SFX.hitStop, name: 'Hit-stop', hitStop: 0.08 },
  {
    id: SFX.bigHit,
    name: 'Big hit',
    shake: { strength: 0.35, seconds: 0.3, rumble: false },
    flash: { color: '#ffffff', alpha: 0.45, seconds: 0.15 },
    hitStop: 0.09,
  },
  { id: SFX.slowMo, name: 'Slow motion', slowMo: { speed: 0.35, seconds: 1.5 } },
  {
    id: SFX.finisher,
    name: 'Finishing blow',
    shake: { strength: 0.5, seconds: 0.4, rumble: false },
    flash: { color: '#ffffff', alpha: 0.6, seconds: 0.3 },
    hitStop: 0.12,
    slowMo: { speed: 0.3, seconds: 1.2 },
  },
  { id: SFX.fadeOut, name: 'Fade to black', fade: { color: '#000000', mode: 'out', seconds: 1 } },
  { id: SFX.fadeIn, name: 'Fade from black', fade: { color: '#000000', mode: 'in', seconds: 1 } },
  { id: SFX.blink, name: 'Blink (out and in)', fade: { color: '#000000', mode: 'outIn', seconds: 0.8 } },
  {
    id: SFX.knockout,
    name: 'Knocked out',
    shake: { strength: 0.4, seconds: 0.4, rumble: false },
    flash: { color: '#ff2a2a', alpha: 0.5, seconds: 0.5 },
    slowMo: { speed: 0.4, seconds: 1 },
  },
  { id: SFX.landing, name: 'Heavy landing', shake: { strength: 0.25, seconds: 0.2, rumble: true } },
];

/** which built-in plays for each thing that happens, when the game has not picked its own */
export const DEFAULT_SCREEN_EVENTS: Record<ScreenEvent, string> = {
  hurt: SFX.redFlash,
  bigHit: SFX.bigHit,
  levelUp: SFX.goldFlash,
  defeat: SFX.smallShake,
  death: SFX.knockout,
  land: SFX.landing,
  smash: SFX.smallShake,
};
