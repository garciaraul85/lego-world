import { BUILTIN_ASSETS, builtinAsset } from '../../builtin/assets';
import { DEFAULT_EVENTS } from '../../builtin/audio';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { rewardScene } from '../../core/cinematic/templates';
import type { Command } from '../../core/commands';
import { assetSpot, reachable } from '../../core/gamegen/places';
import { newId } from '../../core/ids';
import { printGraph } from '../../core/logic/code/print';
import { type Instances, type LogicGraph, type MapDoc, paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import type { EditorState } from '../state';
import { activeCode } from '../workspaces/logic/CodeView';
import { toggleBreakpoint } from '../workspaces/logic/GraphView';
import { newGraph } from '../workspaces/logic/model';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COURSE = 'Coding course';
const chest = () => BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;

const run = (c: ActionCtx, cmds: Command | Command[], label: string) => {
  const r = c.ed.exec(cmds, { label, source: 'tutorial' });
  if (!r.ok) throw new Error(r.error ?? label);
};
const entryMap = (ed: EditorState) => ed.store.get<MapDoc>(paths.map(ed.store.manifest.entry.map))!;

export function courseGraph(ed: EditorState): LogicGraph | null {
  for (const p of ed.store.list('logic/lg_')) {
    const g = ed.store.get<LogicGraph>(p);
    if (g?.name === COURSE) return g;
  }
  return null;
}

/** Values the course's code snippets refer to: {{chest}}, {{zone}}, {{spawn}}… filled from the sandbox. */
export function courseTokens(ed: EditorState) {
  const m = entryMap(ed);
  const items = ed.store.get<Instances>(paths.instances(m.id))?.items ?? [];
  const chestInst = items.find((i) => i.kind === 'asset' && i.asset === chest().id);
  const cine = ed.store.list('cinematics/')[0]?.slice(11, -5);
  const sound =
    Object.keys(DEFAULT_EVENTS.events).find((k) => k.includes('coin')) ?? Object.keys(DEFAULT_EVENTS.events)[0]!;
  return {
    chest: chest().id,
    chestInstance: chestInst?.id ?? 'ins_aaaaaaaaaa',
    zone: m.zones[0]?.id ?? 'zn_aaaaaaaaaa',
    spawn: m.spawns[0]?.id ?? 'sp_aaaaaaaaaa',
    map: m.id,
    hud: 'scr_hud0000000',
    cinematic: cine ?? 'cin_aaaaaaaaaa',
    sound,
    music: 'mus_night00000',
  };
}
export const fillCode = (code: string, t: Record<string, string>) =>
  code.replace(/\{\{(\w+)\}\}/g, (_, k: string) => t[k] ?? `{{${k}}}`);

/** Opens the course's graph in the Code view (making it on first use) and waits for the editor. */
async function openCourse(c: ActionCtx, view: 'code' | 'split' = 'code') {
  const { ed, ui } = c;
  let g = courseGraph(ed);
  if (!g) {
    g = newGraph(COURSE, { type: 'event.onStart' });
    run(c, { type: 'logic.create', payload: { graph: g } }, 'New logic');
  }
  ui.workspace('Logic');
  ed.logicGraph.value = g.id;
  if (ed.logicView.value === 'graph') ed.logicView.value = view;
  for (let i = 0; i < 60 && !(activeCode.cm && activeCode.graph === g.id); i++) await wait(50);
  if (!activeCode.cm) throw new Error('The code editor did not open.');
  return activeCode.cm;
}

/** Coding course actions for “Do it for me” and the “Show me” demo. */
export const CODING_DOERS: Record<string, (c: ActionCtx, a: Record<string, unknown>) => void | Promise<void>> = {
  async courseGraph(c) {
    await openCourse(c);
  },
  /** Types code into the Code view (you watch it appear); the editor turns it into the graph. */
  async typeCode(c, a) {
    await openCourse(c);
    const target = fillCode(String(a.code), courseTokens(c.ed));
    // the live editor, looked up again for every chunk (it is recreated when the view or graph changes)
    const view = () => activeCode.cm?.view ?? null;
    const set = (from: number, insert: string) => {
      const v = view();
      if (!v) return;
      const len = v.state.doc.length;
      v.dispatch({
        changes: { from: Math.min(from, len), to: len, insert },
        selection: { anchor: Math.min(from, len) + insert.length },
      });
    };
    const cur = activeCode.cm?.getDoc() ?? '';
    let pre = 0;
    while (pre < cur.length && pre < target.length && cur[pre] === target[pre]) pre++;
    view()?.focus();
    set(pre, '');
    const rest = target.slice(pre);
    const step = Math.max(2, Math.ceil(rest.length / 45));
    for (let i = 0; i < rest.length; i += step) {
      const v = view();
      if (!v) break;
      set(v.state.doc.length, rest.slice(i, i + step));
      await wait(16);
    }
    if ((activeCode.cm?.getDoc() ?? '') !== target) set(0, target);
    await wait(800); // the Code view turns the text into the graph after a short pause
  },
  /** Places what the course's snippets talk about: a chest, a trigger zone and a reward scene. */
  setStage(c) {
    const { ed } = c;
    const m = entryMap(ed);
    ed.openMap(m.id);
    const items = ed.store.get<Instances>(paths.instances(m.id))?.items ?? [];
    if (!items.some((i) => i.kind === 'asset' && i.asset === chest().id)) {
      if (!ed.store.has(paths.asset(chest().id)))
        run(c, { type: 'asset.create', payload: { asset: builtinAsset(chest().id)! } }, 'Add chest');
      const place = assetSpot(ed.store, ed.bus, m.id, chest(), { minSteps: 3 });
      if (!place) throw new Error('No room for a chest.');
      run(c, place, 'Place chest');
    }
    if (!entryMap(ed).zones.length) {
      const cells = reachable(ed.store, m.id).cells;
      const p = cells.find(([, , , d]) => d >= 6 && d <= 10) ?? cells.at(-1)!;
      const y = p[1] * 0.4;
      run(
        c,
        {
          type: 'map.addZone',
          payload: {
            map: m.id,
            zone: { min: [p[0] - 2, y, p[2] - 2], max: [p[0] + 3, y + 4, p[2] + 3], tags: ['Pond'] },
          },
        },
        'Add zone',
      );
    }
    if (!ed.store.list('cinematics/').length) {
      const sp = entryMap(ed).spawns[0]!;
      const giver = BUILTIN_CHARACTERS.find((x) => x.name === 'Chef')?.id ?? BUILTIN_CHARACTERS[0]!.id;
      run(
        c,
        {
          type: 'cinematic.put',
          payload: {
            cinematic: rewardScene({
              id: newId('cinematic'),
              map: m.id,
              at: sp.pos as [number, number, number],
              giver,
              name: 'Well done!',
            }),
          },
        },
        'Reward scene',
      );
    }
    if (!ed.store.get<{ vars: Record<string, unknown> }>(paths.variables)?.vars.coins)
      run(
        c,
        { type: 'logic.setVariable', payload: { name: 'coins', def: { type: 'number', default: 0, scope: 'global' } } },
        'Add variable',
      );
    setTimeout(() => c.ui.fit(), 50);
  },
  /** Sets a breakpoint on the first action of the course graph (what F9 or the gutter does). */
  breakpoint(c) {
    const g = courseGraph(c.ed);
    const node = g?.nodes.find((n) => !n.type.startsWith('event.') && !n.type.startsWith('note.'));
    if (!g || !node) throw new Error('Write some code first.');
    if (![...c.ed.breakpoints.value].some((k) => k.startsWith(`${g.id}:`))) toggleBreakpoint(c.ed, g.id, node.id);
  },
  clearBreakpoints(c) {
    c.ed.breakpoints.value = new Set();
  },
  /** Waits (in Play) until logic has run a little. */
  async letItRun() {
    await wait(1500);
  },
};

/** Coding course checks: they read the editor, they never change it. */
export const CODING_TESTS: Record<string, (ed: EditorState, args: unknown) => boolean> = {
  /** the course graph's code matches a regular expression (after {{tokens}} are filled) */
  codeHas: (ed, a) => {
    const g = courseGraph(ed);
    if (!g) return false;
    try {
      const code = printGraph(g).code;
      const list = Array.isArray(a) ? a : [a];
      return list.every((re) => new RegExp(fillCode(String(re), courseTokens(ed)), 'm').test(code));
    } catch {
      return false;
    }
  },
  /** the Console shows a Logic line matching the text */
  consoleHas: (ed, a) => ed.logs.value.some((l) => l.msg.includes(String(a))),
  /** while playing, a variable has a value */
  playVar: (ed, a) => {
    const { name, value } = a as { name: string; value: unknown };
    const s = ed.session.value as unknown as { logic?: { vars: Map<string, unknown> } } | null;
    return s?.logic?.vars.get(name) === value;
  },
  breakpointSet: (ed) => {
    const g = courseGraph(ed);
    return !!g && [...ed.breakpoints.value].some((k) => k.startsWith(`${g.id}:`));
  },
  /** the Code view shows a script error */
  codeError: () => !!document.querySelector('.lg-code-status.err'),
  /** the error is gone and the code says what it should */
  codeFixed: (ed, a) => !document.querySelector('.lg-code-status.err') && CODING_TESTS.codeHas!(ed, a),
  courseReady: (ed) => {
    const t = courseTokens(ed);
    return (
      !t.chestInstance.endsWith('aaaaaaaaaa') && !t.zone.endsWith('aaaaaaaaaa') && !t.cinematic.endsWith('aaaaaaaaaa')
    );
  },
};
