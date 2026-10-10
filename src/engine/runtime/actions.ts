import type { Action } from '../../core/schema';

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
  game?(op: 'start' | 'resume' | 'pause' | 'retry' | 'quit'): void;
  gave?(item: string, count: number): void;
  spawn?(asset: string, at: string): void;
  despawn?(target: string): void;
}

type Pending = { actions: Action[]; at: number; self: string | undefined };

/**
 * runActions (plan: one Action union shared by assets, zones, screens, cinematics and logic).
 * Runs a list in order; `wait` pauses the rest of the list on the runner's clock (the game clock, or
 * the UI clock for screen actions). Cinematics (Phase 6) are logged so a designer can see they fired.
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
        case 'cinematic':
          h.log('info', `Cinematic ${a.cinematic} (cinematics arrive in Phase 6)`);
          break;
        case 'spawn':
          if (h.spawn) h.spawn(a.asset, a.at);
          else h.log('info', `spawn ${a.asset}`);
          break;
        case 'despawn':
          if (h.despawn) h.despawn(a.target);
          else h.log('info', `despawn ${a.target}`);
          break;
      }
    }
  }
}
