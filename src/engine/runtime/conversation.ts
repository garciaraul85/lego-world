import { type CondHost, evalCondition } from '../../core/dialogue/condition';
import type { Conversation, DialogueLook, DialogueStyle, Mood, Step } from '../../core/dialogue/schema';
import type { Action } from '../../core/schema';

/**
 * P22: plays a conversation. It walks the steps of a section in order, running actions, likes and jumps
 * by itself and stopping at a line (the player reads it and presses next) or a choice (the player picks).
 * Steps whose condition fails are skipped; options whose condition fails are hidden or greyed out.
 * The runner knows nothing about screens: the session shows its view in the dialogue layer.
 */
export type TalkView = {
  conversation: string;
  /** what the conversation is called (the preview's title) */
  name: string;
  look: DialogueLook;
  /** the speaker: a character id or a name ('' for the narrator) */
  who: string;
  speakerName: string;
  nameColor: string | null;
  /** P22 part 2: the speaker's own voice (its sheet's blip and pitch) */
  voice: { pitch: number; blip: string | null } | null;
  text: string;
  mood: Mood;
  /** the options of a choice (null: a line) */
  choices: { text: string; enabled: boolean; index: number }[] | null;
  /** bumps for every new line or choice (restarts the letter-by-letter text) */
  serial: number;
  /** the speaker the conversation belongs to (the NPC talked to), for bubbles and the camera */
  talker: string | null;
};

export type TalkHost = {
  cond: CondHost;
  run(actions: Action[]): void;
  like(by: number): void;
  /** a speaker's shown name and name colour */
  speaker(who: string): { name: string; color: string | null; voice?: { pitch: number; blip: string | null } | null };
  /** interpolate {values} in text */
  text(t: string): string;
  chose?(conversation: string, option: string, index: number): void;
  ended?(conversation: string): void;
};

/** jumps and actions taken in one go before the runner gives up (a loop of jumps with no line) */
const MAX_WALK = 500;

export class ConversationRunner {
  private section = 0;
  private step = 0;
  private serial = 0;
  view: TalkView | null = null;
  done = false;

  constructor(
    readonly conv: Conversation,
    readonly look: DialogueLook,
    private readonly host: TalkHost,
    readonly talker: string | null = null,
  ) {}

  /** Starts at the first section; null when nothing in it plays (every step's condition failed). */
  start(): TalkView | null {
    this.section = 0;
    this.step = 0;
    return this.walk();
  }

  /** After a line: on to the next step. (A choice waits for choose.) */
  next(): TalkView | null {
    if (this.done || !this.view || this.view.choices) return this.view;
    this.step++;
    return this.walk();
  }

  choose(index: number): TalkView | null {
    const v = this.view;
    if (this.done || !v?.choices) return v;
    const c = v.choices.find((x) => x.index === index);
    if (!c?.enabled) return v;
    const st = this.current() as Extract<Step, { k: 'choice' }>;
    const opt = st.options[index]!;
    this.host.chose?.(this.conv.id, opt.text, index);
    if (opt.to) return this.jump(opt.to);
    this.step++;
    return this.walk();
  }

  /** Ends the conversation now (the player walked away, or Esc). */
  stop() {
    if (this.done) return;
    this.done = true;
    this.view = null;
    this.host.ended?.(this.conv.id);
  }

  private current(): Step | undefined {
    return this.conv.sections[this.section]?.steps[this.step];
  }

  private jump(to: string): TalkView | null {
    if (to === 'end') {
      this.stop();
      return null;
    }
    const i = this.conv.sections.findIndex((s) => s.label === to);
    if (i < 0) {
      this.stop();
      return null;
    }
    this.section = i;
    this.step = 0;
    return this.walk();
  }

  private walk(): TalkView | null {
    for (let n = 0; n < MAX_WALK; n++) {
      const st = this.current();
      // the end of a section ends the conversation
      if (!st) {
        this.stop();
        return null;
      }
      if (!evalCondition(st.if, this.host.cond)) {
        this.step++;
        continue;
      }
      switch (st.k) {
        case 'do':
          this.host.run(st.actions);
          this.step++;
          continue;
        case 'like':
          this.host.like(st.by);
          this.step++;
          continue;
        case 'goto': {
          if (st.to === 'end') {
            this.stop();
            return null;
          }
          const i = this.conv.sections.findIndex((s) => s.label === st.to);
          if (i < 0) {
            this.stop();
            return null;
          }
          this.section = i;
          this.step = 0;
          continue;
        }
        case 'line': {
          const sp = st.who ? this.host.speaker(st.who) : { name: '', color: null };
          this.view = {
            ...this.base(),
            who: st.who,
            speakerName: sp.name,
            nameColor: sp.color,
            voice: ('voice' in sp && sp.voice) || null,
            text: this.host.text(st.text),
            mood: st.mood ?? 'neutral',
            choices: null,
          };
          return this.view;
        }
        case 'choice': {
          const opts = st.options
            .map((o, index) => ({ o, index, ok: evalCondition(o.if, this.host.cond) }))
            .filter((x) => x.ok || x.o.failed === 'grey')
            .map((x) => ({ text: this.host.text(x.o.text), enabled: x.ok, index: x.index }));
          // nothing to pick: carry on
          if (!opts.some((o) => o.enabled)) {
            this.step++;
            continue;
          }
          // the choice shows under the last line said
          const last = this.view;
          this.view = {
            ...this.base(),
            who: last?.who ?? '',
            speakerName: last?.speakerName ?? '',
            nameColor: last?.nameColor ?? null,
            voice: last?.voice ?? null,
            text: last?.text ?? '',
            mood: last?.mood ?? 'neutral',
            choices: opts,
          };
          return this.view;
        }
      }
    }
    this.stop();
    return null;
  }

  private base() {
    return {
      conversation: this.conv.id,
      name: this.conv.name,
      look: this.look,
      serial: ++this.serial,
      talker: this.talker,
    };
  }
}

/** The style a conversation shows in when started from somewhere (a sign reads as a sign). */
export const styleFor = (
  look: DialogueLook,
  own: DialogueStyle | undefined,
  from: 'npc' | 'sign' | 'other',
): DialogueStyle => own ?? (from === 'sign' ? 'sign' : look.style);
