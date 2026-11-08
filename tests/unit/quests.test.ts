import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allHooksOf, isGameClass, isMainQuestClass, isQuestClass, lineageOf } from '../../src/core/logic/builtins';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { goalNameOf, stepsProblem } from '../../src/core/quests/quest';
import { SaveGame } from '../../src/core/save/save';
import { type Instances, type LogicGraph, type MapDoc, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { QuestBook } from '../../src/engine/quests/book';
import { applySave, captureSave } from '../../src/engine/runtime/saves';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B7a-2): quests (steps in the class, the quest log, where to go next) and the maps in logic. */
function behaviour(name: string, code: string): LogicGraph {
  const r = parseBehaviour(code);
  if ('error' in r) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  const id = `lg_${name.replace(/\W/g, '').toLowerCase().padEnd(10, 'x').slice(0, 10)}`;
  return { id: id as LogicGraph['id'], name, scope: 'global', behaviour: r.behaviour, nodes: r.nodes, edges: r.edges };
}
// biome-ignore lint/suspicious/noExplicitAny: test helper
const run = (bus: CommandBus, c: any) => bus.execute(c, { source: 'user' });
// biome-ignore lint/suspicious/noExplicitAny: what a pickup does
const give = (p: PlaySession, item: string, n: number) => (p as any).give(item, n);

const LAMP = `class LostLamp extends SideQuest {
  steps = [
    { name: "Find the old well", do: "reach", at: "Old well" },
    { name: "Bring back 2 glowcaps", do: "get", at: "Glowcap", count: 2 },
    { name: "Ring the bell", do: "script", where: "hero" },
  ];
  done = 0;
  start(e) {
    quest.start("this");
  }
  questDone(e) {
    this.done = 1;
  }
}`;

/** a game with these behaviours (quests, maps' ones: none attached), a zone "Old well" 20 studs north */
function game(...graphs: LogicGraph[]) {
  const s = new ProjectStore(newProjectFiles({ name: 'Quests', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const r = run(
    bus,
    graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
  );
  expect(r.ok, r.error).toBe(true);
  const map = s.manifest.entry.map;
  const doc = s.get<MapDoc>(paths.map(map))!;
  s.put(paths.map(map), {
    ...doc,
    zones: [
      ...doc.zones,
      { id: 'zn_oldwellaaa', shape: 'box', min: [-2, 0, -14], max: [2, 4, -10], tags: ['Old well'] },
      { id: 'zn_mossaaaaaa', shape: 'box', min: [6, 0, -4], max: [14, 4, 4], tags: ['Mossy Glade', 'region'] },
    ],
  } as MapDoc);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 0], 0);
  const step = (sec: number) => {
    for (let t = 0; t < sec; t += 1 / 60) p.runtime.stepOnce();
  };
  step(0.1);
  const said = (t: string) => p.events.some((e) => e.msg.includes(t));
  return { s, bus, p, step, said, map };
}

describe('quests in the class', () => {
  it('steps = [...] prints and parses back; a step without its at says so', () => {
    const g = behaviour('Lost Lamp', LAMP);
    expect(g.behaviour?.extends).toBe('SideQuest');
    expect(g.behaviour?.steps).toHaveLength(3);
    expect(g.behaviour?.steps?.[1]).toEqual({ name: 'Bring back 2 glowcaps', do: 'get', at: 'Glowcap', count: 2 });
    const code = printBehaviour(g).code;
    expect(code).toContain('steps = [');
    expect(code).toContain('{ name: "Find the old well", do: "reach", at: "Old well" },');
    const back = parseBehaviour(code);
    expect('error' in back ? back.error : back.behaviour.steps).toEqual(g.behaviour?.steps);
    const bad = parseBehaviour('class Q extends Quest {\n  steps = [{ name: "Talk", do: "talk" }];\n}');
    expect('error' in bad && bad.error.message).toMatch(/needs at/);
    const odd = parseBehaviour('class Q extends Quest {\n  steps = [{ name: "Go", go: "north" }];\n}');
    expect('error' in odd && odd.error.message).toMatch(/no “go”/);
    const kind = parseBehaviour('class Q extends Quest {\n  steps = [{ name: "Go", do: "fly", at: "x" }];\n}');
    expect('error' in kind && kind.error.message).toMatch(/reach, talk, get/);
    expect(stepsProblem([])).toMatch(/at least one/);
    expect(goalNameOf({ name: 'x', do: 'get', at: 'Glowcap' })).toBe('');
    expect(goalNameOf({ name: 'x', do: 'talk', at: 'Mossbeard' })).toBe('Mossbeard');
  });

  it('MainQuest and SideQuest extend Quest; GameMap decides about the maps; both are in the game as written', () => {
    expect(lineageOf('MainQuest').map((b) => b.name)).toEqual(['MainQuest', 'Quest']);
    expect(allHooksOf('SideQuest').map((h) => h.method)).toEqual(['canStartQuest', 'stepDone', 'goalOf']);
    expect(allHooksOf('GameMap').map((h) => h.method)).toEqual(['canOpenMap', 'showMarker', 'markerLabel']);
    expect(isQuestClass('SideQuest')).toBe(true);
    expect(isMainQuestClass('SideQuest')).toBe(false);
    expect(isGameClass('GameMap')).toBe(true);
    expect(isGameClass('Bow')).toBe(false);
  });

  it('a quest class cannot be attached to a character (it is in the game as written)', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Q', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const g = behaviour('Lost Lamp', LAMP);
    expect(run(bus, { type: 'logic.create', payload: { graph: g } }).ok).toBe(true);
    const c = STARTER_CHARACTERS.find((x) => x.slug === 'howler')!;
    s.put(paths.character(c.id), { ...c.character, id: c.id });
    const r = run(bus, { type: 'script.attach', payload: { target: { kind: 'character', id: c.id }, use: g.id } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/quest/);
  });
});

describe('the quest log', () => {
  const defs = [
    { id: 'a', name: 'Side Errand', main: false, steps: [{ name: 'Go', do: 'script' as const }] },
    {
      id: 'b',
      name: 'The Story',
      main: true,
      steps: [
        { name: 'Beat 2 Howlers', do: 'beat' as const, at: 'Howler', count: 2 },
        { name: 'Home', do: 'script' as const },
      ],
    },
  ];
  it('starts once; main quests are tracked first; steps count from when they began; done tracks the next', () => {
    const b = new QuestBook(defs);
    b.note('beat', 'Howler');
    expect(b.start(b.find('side errand')!)).toBe(true);
    expect(b.start(b.find('Side Errand')!)).toBe(false);
    expect(b.tracked).toBe('Side Errand');
    b.start(b.find('The Story')!);
    expect(b.tracked).toBe('The Story');
    expect(b.going().map((d) => d.name)).toEqual(['The Story', 'Side Errand']);
    const story = b.find('The Story')!;
    // the howler beaten before the step began does not count
    expect(b.haveOf(story, () => 0)).toBe(0);
    b.note('beat', 'howler');
    b.note('beat', 'Howler');
    expect(b.haveOf(story, () => 0)).toBe(2);
    expect(b.advance(story)).toBe('step');
    expect(b.advance(story)).toBe('done');
    expect(b.tracked).toBe('Side Errand');
    expect(b.begun().map((d) => b.statusOf(d))).toEqual(['active', 'done']);
    const back = new QuestBook(defs);
    back.restore(JSON.parse(JSON.stringify(b.capture())));
    expect(back.statusOf(back.find('The Story')!)).toBe('done');
    expect(back.tracked).toBe('Side Errand');
    expect(back.countOf('beat', 'HOWLER')).toBe(3);
  });
});

describe('quests in Play', () => {
  it('starts from its own On start; reach, get and script steps; its own questDone; banners', () => {
    const lamp = behaviour('Lost Lamp', LAMP);
    const { p, step, said } = game(lamp);
    expect(p.quests.statusOf(p.quests.find('Lost Lamp')!)).toBe('active');
    expect(said('New quest: Lost Lamp')).toBe(true);
    // where to go next: the well, on both maps
    expect(p.mapModel().markers.find((m) => m.kind === 'goal')).toMatchObject({ label: 'Find the old well', z: -12 });
    p.placeAt([0, 0.4, -12], 0);
    step(0.5);
    expect(p.questRead('step', 'Lost Lamp')).toBe(2);
    expect(said('Lost Lamp: Bring back 2 glowcaps')).toBe(true);
    give(p, 'Glowcap', 1);
    step(0.5);
    expect(p.questRead('step', 'Lost Lamp')).toBe(2);
    give(p, 'Glowcap', 1);
    step(0.5);
    expect(p.questRead('step', 'Lost Lamp')).toBe(3);
    // a script step: only logic moves it on; its goal is where it says (the hero)
    step(1);
    expect(p.questRead('step', 'Lost Lamp')).toBe(3);
    expect(p.mapModel().markers.find((m) => m.kind === 'goal')).toMatchObject({ x: 0, z: -12 });
    p.questOp('advance', 'Lost Lamp');
    step(0.2);
    expect(p.questRead('status', 'Lost Lamp')).toBe('done');
    expect(said('Quest complete: Lost Lamp')).toBe(true);
    expect(p.logic.selfOf(lamp.id, `quest:${lamp.id}`).done).toBe(1);
    expect(p.mapModel().markers.some((m) => m.kind === 'goal')).toBe(false);
  });

  it('hooks: canStartQuest, stepDone and goalOf answer for the quest; others hear its events by name', () => {
    const q = behaviour(
      'Gate Keys',
      `class GateKeys extends MainQuest {
  steps = [
    { name: "Open the gate", do: "script" },
    { name: "Meet at the well", do: "script", where: "Old well" },
  ];
  canStartQuest(e) {
    return vars.ready === 1;
  }
  stepDone(e) {
    return e.step === 1 && vars.open === 1;
  }
  goalOf(e) {
    if (e.step === 1) {
      return "Mossy Glade";
    }
    return e.base;
  }
}`,
    );
    const s = new ProjectStore(newProjectFiles({ name: 'Q', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    expect(run(bus, { type: 'logic.create', payload: { graph: q } }).ok).toBe(true);
    // a plain logic file hears the quest's events, by its name
    const file = run(bus, {
      type: 'logic.create',
      payload: {
        graph: {
          id: 'lg_watchaaaaa',
          name: 'Watch',
          scope: 'global',
          nodes: [
            { id: 'n1', type: 'event.onQuestStep', pos: [0, 0], args: { quest: 'gate keys' } },
            { id: 'n2', type: 'var.set', pos: [200, 0], args: { var: 'heard' } },
          ],
          edges: [
            ['n1', 'then', 'n2', 'in'],
            ['n1', 'step', 'n2', 'value'],
          ],
        },
      },
    });
    expect(file.ok, file.error).toBe(true);
    const map = s.manifest.entry.map;
    const doc = s.get<MapDoc>(paths.map(map))!;
    s.put(paths.map(map), {
      ...doc,
      zones: [
        { id: 'zn_oldwellaaa', shape: 'box', min: [-2, 0, -14], max: [2, 4, -10], tags: ['Old well'] },
        { id: 'zn_mossaaaaaa', shape: 'box', min: [6, 0, -4], max: [14, 4, 4], tags: ['Mossy Glade', 'region'] },
      ],
    } as MapDoc);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p.placeAt([0, 0.4, 0], 0);
    const step = (sec: number) => {
      for (let t = 0; t < sec; t += 1 / 60) p.runtime.stepOnce();
    };
    step(0.1);
    p.questOp('start', 'Gate Keys');
    expect(p.questRead('status', 'Gate Keys')).toBe('');
    p.logic.vars.set('ready', 1);
    p.questOp('start', 'Gate Keys');
    expect(p.questRead('isActive', 'Gate Keys')).toBe(true);
    step(0.1);
    expect(p.mapModel().markers.find((m) => m.kind === 'goal')).toMatchObject({ x: 10, z: 0 });
    step(0.5);
    expect(p.questRead('step', 'Gate Keys')).toBe(1);
    p.logic.vars.set('open', 1);
    step(0.5);
    expect(p.questRead('step', 'Gate Keys')).toBe(2);
    expect(p.logic.vars.get('heard')).toBe(2);
    step(0.3);
    expect(p.mapModel().markers.find((m) => m.kind === 'goal')).toMatchObject({ x: 0, z: -12 });
    // the region, first seen
    expect(p.quests.countOf('region', 'Mossy Glade')).toBe(0);
    p.placeAt([10, 0.4, 0], 0);
    step(0.5);
    expect(p.quests.countOf('region', 'Mossy Glade')).toBe(1);
  });

  it('a beat step counts what is beaten once it is going', () => {
    const q = behaviour(
      'Hunt',
      `class Hunt extends SideQuest {
  steps = [
    { name: "Beat the Howler", do: "beat", at: "Howler" },
  ];
}`,
    );
    const { p, step } = game(q);
    p.questOp('start', 'Hunt');
    p.quests.note('beat', 'Howler');
    step(0.5);
    expect(p.questRead('status', 'Hunt')).toBe('done');
  });

  it('the quest log goes into a save and comes back', () => {
    const lamp = behaviour('Lost Lamp', LAMP);
    const { p, step } = game(lamp);
    p.placeAt([0, 0.4, -12], 0);
    step(0.5);
    // biome-ignore lint/suspicious/noExplicitAny: the session is its own save host
    const save = captureSave(p as any, 1);
    expect(SaveGame.safeParse(save).success).toBe(true);
    expect(save.quests?.quests['Lost Lamp']).toMatchObject({ status: 'active', step: 1 });
    p.questOp('fail', 'Lost Lamp');
    expect(p.questRead('status', 'Lost Lamp')).toBe('failed');
    // biome-ignore lint/suspicious/noExplicitAny: the session is its own save host
    applySave(p as any, save);
    expect(p.questRead('step', 'Lost Lamp')).toBe(2);
    expect(p.quests.tracked).toBe('Lost Lamp');
  });

  it('pause screen bindings: quests.any, the tracked quest and its step; the quest log holds the game', () => {
    const { p } = game(behaviour('Lost Lamp', LAMP));
    p.gameOp('quests');
    expect(p.questsOpen).toBe(true);
    expect(p.screenPaused).toBe(true);
    p.back();
    expect(p.questsOpen).toBe(false);
  });
});

describe('the maps in logic', () => {
  it('map.mark, unmark, reveal, setLook and map.open from a script', () => {
    const g = behaviour(
      'Cartographer',
      `class Cartographer extends GameMap {
  start(e) {
    map.mark("Old well", "skull", "Danger");
    map.mark("hero", "flag", "Camp");
    map.setLook("chart", "round");
    map.reveal(true);
  }
}`,
    );
    const { p } = game(g);
    // its On start ran (a GameMap behaviour is in the game as written): two marks, a chart, a round map, all shown
    expect(p.mapModel().markers.filter((m) => m.kind === 'pin')).toHaveLength(2);
    expect(p.mapLooks()).toMatchObject({ pause: { type: 'chart' }, mini: { type: 'round' } });
    expect(p.mapModel().shows(200, 200)).toBe(true);
    p.mapOp('hide');
    p.mapOp('look', 'default', 'default');
    p.mapOp('mark', 'hero', 'flag', 'Camp');
    p.mapOp('mark', 'Old well', 'heart', 'Danger');
    const pins = p.mapModel().markers.filter((m) => m.kind === 'pin');
    expect(pins).toHaveLength(2);
    expect(pins.find((m) => m.label === 'Danger')).toMatchObject({ stamp: 'heart', z: -12 });
    p.mapOp('unmark', 'camp');
    expect(p.mapModel().markers.filter((m) => m.kind === 'pin')).toHaveLength(1);
    expect(p.mapModel().shows(200, 200)).toBe(false);
    p.mapOp('reveal');
    expect(p.mapModel().shows(200, 200)).toBe(true);
    p.mapOp('look', 'chart', 'round');
    expect(p.mapLooks()).toMatchObject({ pause: { type: 'chart' }, mini: { type: 'round' } });
    p.mapOp('look', 'default', '');
    expect(p.mapLooks().pause.type).toBe('parchment');
    p.mapOp('open');
    expect(p.mapOpen).toBe(true);
    p.mapOp('close');
    expect(p.mapOpen).toBe(false);
  });

  it('a GameMap behaviour keeps the map shut, hides markers and renames them; hears it open and pins', () => {
    const gm = behaviour(
      'My Map',
      `class MyMap extends GameMap {
  opened = 0;
  pinned = "";
  canOpenMap(e) {
    return vars.hasMap === 1;
  }
  showMarker(e) {
    return e.kind !== "exit";
  }
  markerLabel(e) {
    if (e.kind === "pin") {
      return "Note";
    }
    return e.base;
  }
  mapOpen(e) {
    this.opened += 1;
  }
  mapPin(e) {
    this.pinned = e.stamp;
  }
}`,
    );
    const { p, step } = game(gm);
    p.openMap(true);
    expect(p.mapOpen).toBe(false);
    p.logic.vars.set('hasMap', 1);
    p.openMap(true);
    expect(p.mapOpen).toBe(true);
    step(0.05);
    p.openMap(false);
    p.pinMap(3, 3, 'eye', 'Cave');
    step(0.05);
    expect(p.logic.selfOf(gm.id, 'gamemap')).toMatchObject({ opened: 1, pinned: 'eye' });
    expect(p.mapModel().markers.find((m) => m.kind === 'pin')?.label).toBe('Note');
  });

  it('a kind showMarker hides is gone from the maps', () => {
    const gm = behaviour(
      'No Names',
      `class NoNames extends GameMap {
  showMarker(e) {
    return e.kind !== "boss";
  }
}`,
    );
    const { s, map } = game(gm);
    const c = STARTER_CHARACTERS.find((x) => x.slug === 'howler')!;
    s.put(paths.character(c.id), { ...c.character, id: c.id, enemy: { ...c.character.enemy!, style: 'boss' } });
    const inst = s.get<Instances>(paths.instances(map))!;
    s.put(paths.instances(map), {
      ...inst,
      npcsSaved: true,
      items: [
        {
          id: 'ins_bossmapaaa',
          kind: 'npc',
          character: c.id,
          legacyId: 31,
          biome: 'prairie',
          role: 'guard',
          state: { x: 3, y: 0.4, z: 3, heading: 0 },
        },
      ],
    } as Instances);
    const p2 = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p2.placeAt([0, 0.4, 0], 0);
    p2.runtime.stepOnce();
    expect(p2.mapModel().markers.some((m) => m.kind === 'boss')).toBe(false);
  });
});
