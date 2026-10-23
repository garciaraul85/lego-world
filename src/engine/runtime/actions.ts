import type { Action } from '../../core/schema';

export type GameOp = Extract<Action, { do: 'game' }>['op'];

/** What actions can do to the running game. The PlaySession implements it. */
export interface ActionHost {
  /** the instance an asset interaction belongs to (setState with no target) */
  setState(state: string, target: string | undefined, self: string | undefined): void;
  teleport(spawn: string): void;
  travel(map: string, spawn: string): void;
  log(kind: 'event' | 'info', msg: string): void;
  /** a custom event (the `emit` action): logic graphs react with On custom event */
  custom?(event: string): void;
  vars: Map<string, unknown>;
  /** set a variable so logic sees the change (On variable changed); falls back to vars.set */
  setVar?(name: string, value: unknown): void;
  inventory: Map<string, number>;
  /** P5: audio and screens. Hosts without them only log. */
  sound?(event: string, self: string | undefined): void;
  music?(music: string | null, fade: number | undefined): void;
  stinger?(name: string): void;
  screen?(op: 'show' | 'hide', screen: string, replace: boolean): void;
  game?(op: GameOp): void;
  /** P26: save (to a slot), load (a slot; none: the newest), a Saves-screen slot button, set the checkpoint */
  saving?(op: 'save' | 'load' | 'slot' | 'checkpoint', slot: number | undefined): void;
  /** P26 part 2: unlock an achievement, or step / set a player setting */
  progress?(op: 'achieve' | 'setting', key: string, value?: unknown): void;
  gave?(item: string, count: number): void;
  spawn?(asset: string, at: string): void;
  cinematic?(id: string, once: boolean): void;
  despawn?(target: string): void;
  /** P9c: a message in the HUD's message line */
  message?(text: string, seconds: number): void;
  /** P22: start a conversation */
  talk?(conversation: string, self: string | undefined): void;
  /** P22 part 2: an outfit, experience */
  sheet?(op: 'outfit' | 'xp', value: string | number): void;
  /** P23: play an effect at a place, or start / stop an effect placed on the map */
  effect?(op: 'play' | 'on' | 'off', a: string, at: string | undefined, self: string | undefined): void;
  /** P27: switch a placed light on, off or over (by its name, or 'this')... */
  light?(op: 'on' | 'off' | 'toggle', name: string, self: string | undefined): void;
  /** P23 part 2: play a screen effect (by id) */
  screenEffect?(id: string): void;
}

type Pending = { actions: Action[]; at: number; self: string | undefined };

/**
 * runActions (plan: one Action union shared by assets, zones, screens, cinematics and logic).
 * Runs a list in order; `wait` pauses the rest of the list on the runner's clock (the game clock, or
 * the UI clock for screen actions). Hosts without a system for an action log it instead.
 */
export class ActionRunner {
  private pending: Pending[] = [];

  constructor(private readonly host: ActionHost) {}

  run(actions: readonly Action[], now: number, self?: string) {
    this.exec([...actions], now, self);
  }

  /** Resume lists that are waiting (call every fixed step). */
  step(now: number) {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= now);
    this.pending = this.pending.filter((p) => p.at > now);
    for (const p of due) this.exec(p.actions, now, p.self);
  }

  get waiting() {
    return this.pending.length;
  }

  private exec(list: Action[], now: number, self: string | undefined) {
    const h = this.host;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      switch (a.do) {
        case 'wait':
          this.pending.push({ actions: list.slice(i + 1), at: now + a.seconds, self });
          return;
        case 'emit':
          h.log('event', `Event “${a.event}”`);
          h.custom?.(a.event);
          break;
        case 'setState':
          h.setState(a.state, a.target, self);
          break;
        case 'teleport':
          h.teleport(a.spawn);
          break;
        case 'travel':
          h.travel(a.map, a.spawn);
          break;
        case 'setVar':
          if (h.setVar) h.setVar(a.var, a.value);
          else h.vars.set(a.var, a.value);
          h.log('info', `${a.var} = ${JSON.stringify(a.value)}`);
          break;
        case 'addVar': {
          const v = Number(h.vars.get(a.var) ?? 0) + a.value;
          if (h.setVar) h.setVar(a.var, v);
          else h.vars.set(a.var, v);
          h.log('info', `${a.var} = ${v}`);
          break;
        }
        case 'message':
          if (h.message) h.message(a.text, a.seconds ?? 3);
          else h.log('info', a.text);
          break;
        case 'give': {
          const n = (h.inventory.get(a.item) ?? 0) + (a.count ?? 1);
          h.inventory.set(a.item, n);
          h.log('info', `Got ${a.count ?? 1} × ${a.item} (${n} in total)`);
          h.gave?.(a.item, a.count ?? 1);
          break;
        }
        case 'sound':
          if (h.sound) h.sound(a.event, self);
          else h.log('info', `♪ sound ${a.event}`);
          break;
        case 'music':
          if (h.music) h.music(a.music, a.fade);
          else h.log('info', `♪ music ${a.music ?? 'off'}`);
          break;
        case 'stinger':
          if (h.stinger) h.stinger(a.stinger);
          else h.log('info', `♪ stinger ${a.stinger}`);
          break;
        case 'showScreen':
        case 'hideScreen':
          if (h.screen)
            h.screen(a.do === 'showScreen' ? 'show' : 'hide', a.screen, a.do === 'showScreen' && !!a.replace);
          else h.log('info', `${a.do === 'showScreen' ? 'Show' : 'Hide'} screen ${a.screen}`);
          break;
        case 'game':
          if (h.game) h.game(a.op);
          else h.log('info', `Game ${a.op}`);
          break;
        case 'save':
        case 'load':
        case 'slot':
        case 'checkpoint':
          if (h.saving) h.saving(a.do, 'slot' in a ? a.slot : undefined);
          else h.log('info', `${a.do}${'slot' in a && a.slot !== undefined ? ` slot ${a.slot}` : ''}`);
          break;
        case 'achieve':
          if (h.progress) h.progress('achieve', a.id);
          else h.log('info', `achievement ${a.id}`);
          break;
        case 'setting':
          if (h.progress) h.progress('setting', a.key, a.value);
          else h.log('info', `setting ${a.key}`);
          break;
        case 'cinematic':
          if (h.cinematic) h.cinematic(a.cinematic, !!a.once);
          else h.log('info', `Cinematic ${a.cinematic}`);
          break;
        case 'spawn':
          if (h.spawn) h.spawn(a.asset, a.at);
          else h.log('info', `spawn ${a.asset}`);
          break;
        case 'despawn':
          if (h.despawn) h.despawn(a.target);
          else h.log('info', `despawn ${a.target}`);
          break;
        case 'outfit':
        case 'xp':
          if (h.sheet) h.sheet(a.do, a.do === 'outfit' ? a.name : a.amount);
          else h.log('info', `${a.do} ${a.do === 'outfit' ? a.name : a.amount}`);
          break;
        case 'effect':
          if (h.effect) h.effect('play', a.effect, a.at, self);
          else h.log('info', `effect ${a.effect}`);
          break;
        case 'effectOn':
          if (h.effect) h.effect(a.on ? 'on' : 'off', a.name, undefined, self);
          else h.log('info', `effect ${a.name} ${a.on ? 'on' : 'off'}`);
          break;
        case 'lightOn':
          if (h.light) h.light(a.on, a.name, self);
          else h.log('info', `light ${a.name} ${a.on}`);
          break;
        case 'screenEffect':
          if (h.screenEffect) h.screenEffect(a.effect);
          else h.log('info', `screen effect ${a.effect}`);
          break;
        case 'talk':
          if (h.talk) h.talk(a.conversation, self);
          else h.log('info', `talk ${a.conversation}`);
          break;
      }
    }
  }
}
