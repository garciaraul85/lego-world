import { lookOf } from '../../core/dialogue/checks';
import { type CondHost, evalCondition } from '../../core/dialogue/condition';
import type { Conversation, DialogueLook, DialogueStyle } from '../../core/dialogue/schema';
import type { Genre } from '../../core/genres/types';
import { type Action, type Character, paths } from '../../core/schema';
import { ConversationRunner, type TalkView } from './conversation';

/**
 * P22: conversations in Play. Picks which conversation a character uses (the first of its Talk list whose
 * condition holds), plays it with a ConversationRunner, counts how often the hero has talked to each
 * character (talks.<id>) and how much each likes the hero (likes.<id>, −100…100) — both ordinary game
 * variables, so saves keep them — and says barks when the hero walks past.
 */
export type TalkSystemHost = {
  get(path: string): unknown;
  project: { dialogue?: Partial<DialogueLook> } | null;
  genre: Pick<Genre, 'dialogue'> | null;
  vars: Map<string, unknown>;
  setVar(name: string, value: unknown): void;
  inventory: Map<string, number>;
  run(actions: Action[]): void;
  /** {values} in text */
  text(t: string): string;
  /** day or night */
  timeOfDay(): string;
  /** a placed object's state, by its name on the map */
  objectState(name: string): string | undefined;
  fire(type: 'event.onChoice' | 'event.onConversationEnd', match: Record<string, string>): void;
  log(msg: string): void;
  say(text: string, seconds: number): void;
  /** seconds (real time: letters keep appearing while the world is paused) */
  now(): number;
};

export type TalkFrom = 'npc' | 'sign' | 'other';

export class TalkSystem {
  runner: ConversationRunner | null = null;
  from: TalkFrom = 'other';
  /** the highlighted option while a choice is up (arrow keys) */
  focus = 0;
  private barked = new Map<string, number>();
  /** when the shown line started appearing, and whether the player skipped to its end */
  private lineAt = 0;
  private lineSerial = -1;
  private skipped = false;

  constructor(private readonly h: TalkSystemHost) {}

  get active() {
    return !!this.runner && !this.runner.done;
  }
  get view(): TalkView | null {
    return this.active ? this.runner!.view : null;
  }

  cond(talker: string | null): CondHost {
    const h = this.h;
    return {
      value: (name) => {
        if (name === 'talks') return talker ? (h.vars.get(`talks.${talker}`) ?? 0) : 0;
        if (name === 'likes') return talker ? (h.vars.get(`likes.${talker}`) ?? 0) : 0;
        if (name === 'time') return h.timeOfDay();
        if (h.vars.has(name)) return h.vars.get(name);
        if (name.endsWith('.state')) return h.objectState(name.slice(0, -6));
        if (name.startsWith('inventory.')) return h.inventory.get(name.slice(10)) ?? 0;
        return undefined;
      },
      count: (item) => h.inventory.get(item) ?? 0,
      random: Math.random,
    };
  }

  /** The conversation a character uses now (null: it has none, or none of their conditions hold). */
  pick(chr: Pick<Character, 'id' | 'talk'>): string | null {
    const c = this.cond(chr.id);
    for (const t of chr.talk ?? []) {
      if (!this.h.get(paths.dialogue(t.conversation))) continue;
      if (evalCondition(t.if, c)) return t.conversation;
    }
    return null;
  }

  /** Starts a conversation. False when it does not exist or nothing in it plays. */
  start(id: string, o: { talker?: string | null; from?: TalkFrom } = {}): boolean {
    const conv = this.h.get(paths.dialogue(id)) as Conversation | undefined;
    if (!conv) {
      this.h.log(`No conversation ${id}`);
      return false;
    }
    if (this.active) this.stop();
    const talker = o.talker ?? null;
    const from = o.from ?? 'other';
    const base = lookOf(this.h.project, this.h.genre);
    const style: DialogueStyle = conv.style ?? (from === 'sign' ? 'sign' : base.style);
    const look = { ...base, style };
    this.from = from;
    this.focus = 0;
    const h = this.h;
    this.runner = new ConversationRunner(
      conv,
      look,
      {
        cond: this.cond(talker),
        run: (a) => h.run(a),
        like: (by) => {
          if (!talker) return;
          const k = `likes.${talker}`;
          h.setVar(k, Math.max(-100, Math.min(100, Number(h.vars.get(k) ?? 0) + by)));
        },
        speaker: (who) => {
          if (who.startsWith('chr_')) {
            const c = h.get(paths.character(who)) as Character | undefined;
            return {
              name: c?.name ?? who,
              color: c?.nameColor ?? null,
              voice: c?.voice ? { pitch: c.voice.pitch, blip: c.voice.blip ?? null } : null,
            };
          }
          return { name: who, color: null };
        },
        text: (t) => h.text(t),
        chose: (conversation, option) => {
          this.focus = 0;
          h.fire('event.onChoice', { conversation, option });
        },
        ended: (conversation) => h.fire('event.onConversationEnd', { conversation }),
      },
      talker,
    );
    // talks counts this conversation from now on (conditions in it already see the earlier count)
    const view = this.runner.start();
    if (talker) h.setVar(`talks.${talker}`, Number(h.vars.get(`talks.${talker}`) ?? 0) + 1);
    if (!view) {
      this.runner = null;
      return false;
    }
    h.log(`Conversation “${conv.name}”`);
    return true;
  }

  /** How many letters of the line show now (letter by letter at the style's speed). */
  revealed(): number {
    const v = this.view;
    if (!v) return 0;
    if (v.serial !== this.lineSerial) {
      this.lineSerial = v.serial;
      this.lineAt = this.h.now();
      this.skipped = !!v.choices;
    }
    const speed = v.look.textSpeed;
    if (this.skipped || speed <= 0) return v.text.length;
    return Math.min(v.text.length, Math.floor((this.h.now() - this.lineAt) * speed));
  }

  /** The whole line is showing (pressing next moves on rather than finishing the line). */
  get complete(): boolean {
    const v = this.view;
    return !v || this.revealed() >= v.text.length;
  }

  /** Lines move on by themselves when the style says so (call every frame). */
  tick() {
    const v = this.view;
    if (!v || v.choices || v.look.autoAdvance <= 0 || !this.complete) return;
    const full = this.lineAt + (this.skipped ? 0 : v.text.length / Math.max(1, v.look.textSpeed));
    if (this.h.now() - full >= v.look.autoAdvance) this.next();
  }

  /** Next line (or, at a choice, pick the highlighted option). A line still appearing shows whole first. */
  next() {
    const r = this.runner;
    if (!r || r.done) return;
    if (!this.complete) {
      this.skipped = true;
      return;
    }
    const v = r.view;
    if (v?.choices) {
      const opt = v.choices[this.focus];
      if (opt) r.choose(opt.index);
    } else r.next();
    if (r.done) this.runner = null;
  }

  /** Picks the option at this position on screen. */
  choose(position: number) {
    const r = this.runner;
    const opt = r?.view?.choices?.[position];
    if (!r || !opt?.enabled) return;
    r.choose(opt.index);
    if (r.done) this.runner = null;
  }

  move(by: number) {
    const ch = this.view?.choices;
    if (!ch?.length) return;
    let f = this.focus;
    for (let i = 0; i < ch.length; i++) {
      f = (f + by + ch.length) % ch.length;
      if (ch[f]!.enabled) break;
    }
    this.focus = f;
  }

  stop() {
    this.runner?.stop();
    this.runner = null;
  }

  /** P22 barks: a character near the hero says one of its short lines, at most every 8 seconds each. */
  bark(chr: Pick<Character, 'id' | 'name' | 'barks'> | null, now: number): string | null {
    if (!chr?.barks?.length || this.active) return null;
    const last = this.barked.get(chr.id) ?? -Infinity;
    if (now - last < 8) return null;
    const c = this.cond(chr.id);
    const ok = chr.barks.filter((b) => evalCondition(b.if, c));
    if (!ok.length) return null;
    this.barked.set(chr.id, now);
    const b = ok[Math.floor(Math.random() * ok.length)]!;
    return `${chr.name}: ${this.h.text(b.text)}`;
  }
}
