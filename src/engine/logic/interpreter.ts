import { type ExecCtx, nodeDef } from '../../core/logic/catalog';
import type { LogicGraph, Variables } from '../../core/schema';
import { compile, type Program } from './compile';

export const MAX_STEPS = 1000;

type Run = {
  id: number;
  prog: Program;
  graph: LogicGraph;
  pc: number;
  stack: number[];
  payload: Record<string, unknown>;
  waitUntil: number | null;
  iters: Map<string, { items: string[]; i: number }>;
  outputs: Map<string, Record<string, unknown>>;
  steps: number;
  /** pc of a breakpoint we stopped on, so Continue runs it instead of stopping again */
  resumeAt: number | null;
};

export type LogicProblem = { graph: string; node: string | null; message: string };
export type BreakInfo = { graph: string; node: string; values: Record<string, unknown> };

/** Event filters: which event node args must match the fired event. */
export type EventInfo = { type: string; match?: Record<string, unknown>; payload?: Record<string, unknown> };

/**
 * Event-driven logic (P4.2): every event node of every graph is a program; firing an event starts a
 * run of each matching program. `wait` suspends a run until game time passes; a run that goes over
 * 1000 instructions stops with a problem naming the node. Variables changed by a run fire
 * `onVarChanged` after it (never inside it).
 */
export class LogicRuntime {
  readonly programs: Program[] = [];
  readonly problems: LogicProblem[] = [];
  readonly vars = new Map<string, unknown>();
  private readonly graphs = new Map<string, LogicGraph>();
  private runs: Run[] = [];
  private queue: EventInfo[] = [];
  private changed = new Set<string>();
  private onceDone = new Set<string>();
  private gates = new Map<string, boolean>();
  private serial = 0;
  private timers: { prog: Program; at: number; every: number | null }[] = [];
  now = 0;
  /** breakpoints: "graphId:nodeId" */
  readonly breakpoints = new Set<string>();
  /** set when a run stopped on a breakpoint; the host pauses the game */
  paused: BreakInfo | null = null;
  onBreak: ((b: BreakInfo) => void) | null = null;
  onProblem: ((p: LogicProblem) => void) | null = null;

  private readonly ctx: ExecCtx;

  constructor(graphs: LogicGraph[], variables: Variables | undefined, host: ExecCtx) {
    // variables and custom events belong to the runtime; everything else goes to the host (the play session)
    this.ctx = {
      ...host,
      getVar: (n) => this.getVar(n),
      setVar: (n, v) => this.setVar(n, v),
      emit: (event) => {
        host.emit(event);
        this.queue.push({ type: 'event.onCustom', match: { event } });
      },
    };
    for (const [name, v] of Object.entries(variables?.vars ?? {})) this.vars.set(name, v.default);
    for (const g of graphs) {
      this.graphs.set(g.id, g);
      const c = compile(g);
      this.programs.push(...c.programs);
      for (const p of c.problems) this.problem(p);
    }
    for (const p of this.programs)
      if (p.type === 'event.onTimer') {
        const s = Math.max(0.05, Number(p.args.seconds ?? 5));
        this.timers.push({ prog: p, at: s, every: p.args.repeat ? s : null });
      }
  }

  private problem(p: LogicProblem) {
    this.problems.push(p);
    this.onProblem?.(p);
  }

  getVar = (name: string) => this.vars.get(name);
  setVar = (name: string, value: unknown) => {
    if (this.vars.get(name) === value) return;
    this.vars.set(name, value);
    this.changed.add(name);
  };

  /** Queue an event; runs start on the next step (or now, with `immediate`). */
  fire(e: EventInfo, immediate = false) {
    this.queue.push(e);
    if (immediate) this.drain();
  }

  get active() {
    return this.runs.length;
  }

  /** Advance game time: timers, finished waits, queued events. */
  step(now: number) {
    this.now = now;
    if (this.paused) return;
    for (const t of this.timers) {
      if (t.at > now) continue;
      this.start(t.prog, {});
      t.at = t.every ? t.at + t.every : Infinity;
    }
    for (const r of [...this.runs]) if (r.waitUntil !== null && r.waitUntil <= now && !this.paused) this.resume(r);
    this.drain();
  }

  /** Continue after a breakpoint. */
  continue() {
    this.paused = null;
    for (const r of [...this.runs]) if (r.waitUntil === null && !this.paused) this.resume(r);
    this.drain();
  }

  private drain() {
    let guard = 0;
    while (this.queue.length && !this.paused && guard++ < 200) {
      const e = this.queue.shift()!;
      for (const p of this.programs) if (p.type === e.type && matches(p.args, e.match)) this.start(p, e.payload ?? {});
    }
  }

  private start(prog: Program, payload: Record<string, unknown>) {
    const run: Run = {
      id: ++this.serial,
      prog,
      graph: this.graphs.get(prog.graph)!,
      pc: 0,
      stack: [],
      payload,
      waitUntil: null,
      iters: new Map(),
      outputs: new Map(),
      steps: 0,
      resumeAt: null,
    };
    this.runs.push(run);
    this.resume(run);
  }

  private finish(run: Run) {
    this.runs = this.runs.filter((r) => r !== run);
  }

  private afterRun() {
    if (!this.changed.size) return;
    const names = [...this.changed];
    this.changed.clear();
    for (const name of names)
      this.queue.push({ type: 'event.onVarChanged', match: { var: name }, payload: { value: this.vars.get(name) } });
  }

  private resume(run: Run) {
    run.waitUntil = null;
    run.steps = 0;
    const code = run.prog.code;
    let cache = new Map<string, unknown>();
    const value = (node: string, pin: string, depth = 0): unknown => {
      const key = `${node}:${pin}`;
      if (cache.has(key)) return cache.get(key);
      if (depth > 64) throw new LogicError(node, 'These values feed into each other in a circle.');
      const n = run.graph.nodes.find((x) => x.id === node)!;
      const def = nodeDef(n.type)!;
      let v: unknown;
      if (def.kind === 'event') v = run.payload[pin];
      else if (n.type === 'flow.forEachInZone') {
        const it = run.iters.get(node);
        v = it ? it.items[it.i - 1] : undefined;
      } else if (def.kind === 'pure') v = def.eval!(this.ctx, n.args ?? {}, inputs(node, depth + 1));
      else v = run.outputs.get(node)?.[pin];
      cache.set(key, v);
      return v;
    };
    const inputs = (node: string, depth = 0): Record<string, unknown> => {
      const n = run.graph.nodes.find((x) => x.id === node)!;
      const def = nodeDef(n.type)!;
      const out: Record<string, unknown> = {};
      for (const p of def.inputs) {
        if (p.type === 'exec') continue;
        const e = run.graph.edges.find((x) => x[2] === node && x[3] === p.name);
        out[p.name] = e ? value(e[0], e[1], depth) : (n.args?.[p.name] ?? p.default);
      }
      return out;
    };
    try {
      while (run.pc < code.length) {
        if (++run.steps > MAX_STEPS) {
          const i = code[run.pc]!;
          this.problem({
            graph: run.prog.graph,
            node: 'node' in i ? i.node : null,
            message: `Stopped after ${MAX_STEPS} steps in one go. Is there a loop without a Wait?`,
          });
          this.finish(run);
          break;
        }
        cache = new Map();
        const i = code[run.pc]!;
        const node = 'node' in i ? i.node : null;
        if (node && this.breakpoints.has(`${run.prog.graph}:${node}`) && run.resumeAt !== run.pc) {
          run.resumeAt = run.pc;
          const values = inputs(node);
          this.paused = { graph: run.prog.graph, node, values };
          this.onBreak?.(this.paused);
          return;
        }
        run.resumeAt = null;
        switch (i.op) {
          case 'call': {
            const n = run.graph.nodes.find((x) => x.id === i.node)!;
            const def = nodeDef(n.type)!;
            const ins = inputs(i.node);
            if (n.type === 'world.spawn') {
              const entity = this.ctx.spawn(String(n.args?.asset), String(n.args?.at));
              run.outputs.set(i.node, { entity });
            } else def.exec?.(this.ctx, n.args ?? {}, ins);
            run.pc++;
            break;
          }
          case 'jumpIf':
            run.pc = inputs(i.node).cond ? run.pc + 1 : i.else;
            break;
          case 'jump':
            run.pc = i.to;
            break;
          case 'gosub':
            run.stack.push(run.pc + 1);
            run.pc = i.to;
            break;
          case 'wait': {
            const s = Math.max(0, Number(inputs(i.node).seconds ?? 0));
            run.pc++;
            run.waitUntil = this.now + s;
            this.afterRun();
            return;
          }
          case 'once': {
            const k = `${run.prog.graph}:${i.node}`;
            if (this.onceDone.has(k)) run.pc = i.skip;
            else {
              this.onceDone.add(k);
              run.pc++;
            }
            break;
          }
          case 'gate': {
            const n = run.graph.nodes.find((x) => x.id === i.node)!;
            const name = String(n.args?.name ?? 'gate');
            if (!this.gates.has(name)) this.gates.set(name, n.args?.startOpen !== false);
            run.pc = this.gates.get(name) ? run.pc + 1 : i.skip;
            break;
          }
          case 'gateSet': {
            const n = run.graph.nodes.find((x) => x.id === i.node)!;
            this.gates.set(String(n.args?.name ?? 'gate'), i.open);
            run.pc++;
            break;
          }
          case 'iterInit': {
            const n = run.graph.nodes.find((x) => x.id === i.node)!;
            run.iters.set(i.node, { items: this.ctx.inZone(String(n.args?.zone)), i: 0 });
            run.pc++;
            break;
          }
          case 'iterNext': {
            const it = run.iters.get(i.node)!;
            if (it.i >= it.items.length) run.pc = i.done;
            else {
              it.i++;
              run.pc++;
            }
            break;
          }
          case 'end': {
            const back = run.stack.pop();
            if (back === undefined) run.pc = code.length;
            else run.pc = back;
            break;
          }
        }
      }
    } catch (e) {
      this.problem({
        graph: run.prog.graph,
        node: e instanceof LogicError ? e.node : null,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    if (run.waitUntil === null) this.finish(run);
    this.afterRun();
  }
}

class LogicError extends Error {
  constructor(
    readonly node: string,
    message: string,
  ) {
    super(message);
  }
}

function matches(args: Record<string, unknown>, match: Record<string, unknown> | undefined): boolean {
  if (!match) return true;
  for (const [k, v] of Object.entries(match)) {
    const want = args[k];
    if (want === undefined || want === '' || want === null) continue; // empty = any
    if (want !== v) return false;
  }
  return true;
}
