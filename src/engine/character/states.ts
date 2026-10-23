import {
  type AnimState,
  clipRate,
  ONCE,
  pickState,
  type StateInput,
  type StateSettings,
} from '../../core/character/states';
import type { Clip } from '../../core/schema';
import { Animator, type ClipEvent } from './animator';

/**
 * P23 part 4: one character's animation state machine at play. Each step it picks the state from what the
 * character is doing and plays that state's clip on its animator (crossfading from the last), once for hurt,
 * attack and jump and over and over for the others. A clip played from outside (an emote, a victory, a clip
 * with a marker) keeps playing while the character stands, and stops when it moves.
 */
export class StateMachine {
  state: AnimState = 'idle';
  /** seconds in this state */
  since = 0;
  /** the clip the state machine last started (another clip playing was started from outside: an emote) */
  private mine: string | null = null;
  /** a once-only state's clip has been started since the state began */
  private started = false;
  /** how fast the state's clip plays now */
  rate = 1;

  constructor(readonly anim = new Animator()) {}

  /**
   * Picks the state and moves the clips on by dt. `clipFor` gives the clip a state plays (none: the built-in
   * motion); `idleAfter` is how long it stands before its idle clip starts.
   */
  step(
    input: StateInput,
    settings: StateSettings | undefined,
    clipFor: (s: AnimState) => Clip | undefined,
    dt: number,
    idleAfter = 0,
  ): ClipEvent[] {
    const next = pickState(input, settings);
    if (next !== this.state) {
      this.state = next;
      this.since = 0;
      this.started = false;
    } else this.since += dt;
    const a = this.anim;
    // something else plays (an emote, a victory): it goes on while standing, and stops for anything else
    if (a.clip && a.clip.id !== this.mine) {
      if (this.state === 'idle') return a.step(dt);
      a.stop();
    }
    const clip = this.state === 'idle' && this.since < idleAfter ? undefined : clipFor(this.state);
    this.rate = clipRate(this.state, input.speed, settings);
    if (clip) {
      const once = ONCE.includes(this.state);
      if (once ? !this.started : a.clip?.id !== clip.id) {
        a.play(clip);
        this.mine = clip.id;
        this.started = true;
      }
    } else if (a.clip && a.clip.id === this.mine) {
      a.stop();
      this.mine = null;
    }
    return a.step(dt * this.rate);
  }

  /** a clip from outside (an emote, a victory): it is not the state machine's to stop while standing */
  play(clip: Clip) {
    if (this.anim.clip?.id === clip.id) this.anim.stop();
    this.anim.play(clip);
    this.mine = null;
  }

  /** stops any clip (the built-in motion shows) */
  stop() {
    this.anim.stop();
    this.mine = null;
  }

  /** a clip the state machine itself is playing */
  get playingState(): boolean {
    return !!this.anim.clip && this.anim.clip.id === this.mine;
  }
}
