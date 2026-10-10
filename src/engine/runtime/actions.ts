import type { Action } from '../../core/schema';

/** What actions can do to the running game. The PlaySession implements it. */
export interface ActionHost {
  /** the instance an asset interaction belongs to (setState with no target) */
  setState(state: string, target: string | undefined, self: string | undefined): void;
  teleport(spawn: string): void;
  travel(map: string, spawn: string): void;
  log(kind: 'event' | 'info', msg: string): void;
  vars: Map<string, unknown>;
  inventory: Map<string, number>;
}

type Pending = { actions: Action[]; at: number; self: string | undefined };

/**
 * runActions (plan: one Action union shared by assets, zones, screens, cinematics and logic).
 * Runs a list in order; `wait` pauses the rest of the list on the game clock. Actions whose systems
 * arrive later (screens, music, cinematics) are logged so a designer can see they fired.
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
          h.vars.set(a.var, a.value);
          h.log('info', `${a.var} = ${JSON.stringify(a.value)}`);
          break;
        case 'addVar': {
          const v = Number(h.vars.get(a.var) ?? 0) + a.value;
          h.vars.set(a.var, v);
          h.log('info', `${a.var} = ${v}`);
          break;
        }
        case 'give': {
          const n = (h.inventory.get(a.item) ?? 0) + (a.count ?? 1);
          h.inventory.set(a.item, n);
          h.log('info', `Got ${a.count ?? 1} × ${a.item} (${n} in total)`);
          break;
        }
        case 'sound':
          h.log('info', `♪ sound ${a.event} (audio arrives in Phase 5)`);
          break;
        case 'music':
          h.log('info', `♪ music ${a.music ?? 'off'} (audio arrives in Phase 5)`);
          break;
        case 'showScreen':
        case 'hideScreen':
          h.log('info', `${a.do === 'showScreen' ? 'Show' : 'Hide'} screen ${a.screen} (screens arrive in Phase 5)`);
          break;
        case 'cinematic':
          h.log('info', `Cinematic ${a.cinematic} (cinematics arrive in Phase 6)`);
          break;
        case 'spawn':
        case 'despawn':
          h.log('info', `${a.do} (arrives with Logic in Phase 4)`);
          break;
      }
    }
  }
}
