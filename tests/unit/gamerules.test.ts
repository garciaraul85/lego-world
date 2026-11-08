import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allHooksOf, isGameClass, isMapScriptClass, isModeClass } from '../../src/core/logic/builtins';
import { parseBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { MemorySaveStore } from '../../src/core/save/save';
import { type Instances, type LogicGraph, type MapDoc, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B7a-3): the game's rules (GameMode) and a map's own behaviour (MapScript). */
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

/** a game with two maps (Start, and Cave with a spawn "Cave mouth") and these behaviours */
function game(graphs: LogicGraph[], setup?: (s: ProjectStore, bus: CommandBus) => void) {
  const s = new ProjectStore(newProjectFiles({ name: 'Rules', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const start = s.manifest.entry.map;
  const r = run(bus, [
    { type: 'map.rename', payload: { map: start, name: 'Start' } },
    {
      type: 'map.create',
      payload: { id: 'map_caveaaaaaa', name: 'Cave', generate: { environments: ['prairie'], size: 24, seed: 3 } },
    },
    {
      type: 'map.addSpawn',
      payload: { map: 'map_caveaaaaaa', id: 'sp_cavemoutha', name: 'Cave mouth', pos: [2, 0.4, 2] },
    },
    ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
  ]);
  expect(r.ok, r.error).toBe(true);
  setup?.(s, bus);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio(), saves: new MemorySaveStore() } as never);
  p.placeAt([0, 0.4, 0], 0);
  const step = (sec: number) => {
    for (let t = 0; t < sec; t += 1 / 60) p.runtime.stepOnce();
  };
  step(0.1);
  return { s, bus, p, step, start };
}

describe('GameMode and MapScript', () => {
  it('are built-ins with their hooks; GameMode is the game’s (not attached); MapScript goes on a map', () => {
    expect(allHooksOf('GameMode').map((h) => h.method)).toEqual([
      'isGameOver',
      'hasWon',
      'respawnAt',
      'respawnHearts',
      'keepOnRespawn',
      'canSave',
      'keepOnNewGamePlus',
    ]);
    expect(isModeClass('GameMode') && isGameClass('GameMode')).toBe(true);
    expect(isMapScriptClass('MapScript') && !isGameClass('MapScript')).toBe(true);
  });

  it('a MapScript attaches to a map, not to a character; a plain behaviour may go on a map; others may not', () => {
    const ms = behaviour('Cave Rules', 'class CaveRules extends MapScript {\n}');
    const plain = behaviour('Plain', 'class Plain extends Behaviour {\n}');
    const door = behaviour('My Lock', 'class MyLock extends Lock {\n}');
    const { bus, s } = game([ms, plain, door]);
    const at = (target: unknown, use: string) => run(bus, { type: 'script.attach', payload: { target, use } });
    expect(at({ kind: 'map', id: 'map_caveaaaaaa' }, ms.id).ok).toBe(true);
    expect(s.get<MapDoc>(paths.map('map_caveaaaaaa'))?.scripts?.[0]?.use).toBe(ms.id);
    expect(at({ kind: 'map', id: 'map_caveaaaaaa' }, plain.id).ok).toBe(true);
    expect(at({ kind: 'map', id: 'map_caveaaaaaa' }, door.id).error).toMatch(/MapScript/);
    const c = STARTER_CHARACTERS.find((x) => x.slug === 'howler')!;
    s.put(paths.character(c.id), { ...c.character, id: c.id });
    expect(at({ kind: 'character', id: c.id }, ms.id).error).toMatch(/attach it to a map/);
    expect(
      run(bus, { type: 'script.detach', payload: { target: { kind: 'map', id: 'map_caveaaaaaa' }, use: ms.id } }).ok,
    ).toBe(true);
  });
});

describe('the game’s rules in Play', () => {
  it('isGameOver: a fairy saves the hero once; game.lose ends it; respawn where respawnAt says, with its hearts', () => {
    const mode = behaviour(
      'Rules',
      `class Rules extends GameMode {
  fairies = 1;
  overs = 0;
  isGameOver(e) {
    if (this.fairies > 0) {
      this.fairies -= 1;
      vars.hp = 2;
      return false;
    }
    return true;
  }
  respawnAt(e) {
    return "Cave mouth";
  }
  respawnHearts(e) {
    return 3;
  }
  keepOnRespawn(e) {
    return e.item !== "Bombs";
  }
  gameOver(e) {
    this.overs += 1;
  }
}`,
    );
    const { p, step } = game([mode]);
    p.logic.vars.set('maxHp', 6);
    p.logic.setVar('hp', 0);
    step(0.1);
    expect(p.over).toBe(false);
    expect(p.logic.vars.get('hp')).toBe(2);
    give(p, 'Bombs', 5);
    give(p, 'Glowcap', 2);
    p.gameRule('lose', '');
    step(0.1);
    expect(p.over).toBe(true);
    expect(p.logic.selfOf(mode.id, 'gamemode').overs).toBe(1);
    p.gameOp('retry');
    step(0.2);
    expect(p.over).toBe(false);
    expect(p.world.doc.name).toBe('Cave');
    expect([p.heroState.x, p.heroState.z]).toEqual([2, 2]);
    expect(p.logic.vars.get('hp')).toBe(3);
    expect(p.itemCount('Bombs')).toBe(0);
    expect(p.itemCount('Glowcap')).toBe(2);
  });

  it('hasWon finishes the game; canSave keeps it from saving; saved and loaded are heard', () => {
    const mode = behaviour(
      'Rules',
      `class Rules extends GameMode {
  saves = 0;
  hasWon(e) {
    return vars.bosses >= 2;
  }
  canSave(e) {
    return vars.inDungeon !== 1;
  }
  saved(e) {
    this.saves += 1;
  }
}`,
    );
    const { p, step } = game([mode]);
    p.logic.vars.set('inDungeon', 1);
    p.saveGame(1);
    step(0.1);
    expect(p.events.some((e) => e.msg.includes('Saved to'))).toBe(false);
    p.logic.vars.set('inDungeon', 0);
    p.saveGame(1);
    step(0.1);
    expect(p.logic.selfOf(mode.id, 'gamemode').saves).toBe(1);
    expect(p.progress.record.finished).toBe(0);
    p.logic.vars.set('bosses', 2);
    step(0.5);
    expect(p.progress.record.finished).toBe(1);
  });

  it('game.setRespawn names a spawn point on any map; respawn brings the hero there now', () => {
    const { p, step } = game([]);
    p.gameRule('setRespawn', 'cave mouth');
    expect(p.checkpoint).toMatchObject({ map: 'map_caveaaaaaa', spawn: 'sp_cavemoutha' });
    p.gameRule('respawn', '');
    step(0.2);
    expect(p.world.doc.name).toBe('Cave');
  });
});

describe('a map’s own behaviour in Play', () => {
  it('runs on its map only: mapEnter as the hero arrives, mapLeave as it goes, foesCleared when the last foe falls', () => {
    const ms = behaviour(
      'Cave Rules',
      `class CaveRules extends MapScript {
  mapEnter(e) {
    vars.entered = e.from;
    say("The cave is cold.", 2);
  }
  mapLeave(e) {
    vars.left = e.to;
  }
  foesCleared(e) {
    vars.cleared = e.map;
  }
}`,
    );
    const howler = STARTER_CHARACTERS.find((x) => x.slug === 'howler')!;
    const { p, step } = game([ms], (s, bus) => {
      run(bus, { type: 'script.attach', payload: { target: { kind: 'map', id: 'map_caveaaaaaa' }, use: ms.id } });
      s.put(paths.character(howler.id), { ...howler.character, id: howler.id });
      const inst = s.get<Instances>(paths.instances('map_caveaaaaaa'))!;
      s.put(paths.instances('map_caveaaaaaa'), {
        ...inst,
        npcsSaved: true,
        items: [
          {
            id: 'ins_cavehowlra',
            kind: 'npc',
            character: howler.id,
            legacyId: 41,
            biome: 'prairie',
            role: 'guard',
            state: { x: 6, y: 0.4, z: 6, heading: 0 },
          },
        ],
      } as Instances);
    });
    // not on its map yet: nothing ran
    expect(p.logic.vars.get('entered')).toBeUndefined();
    expect(p.foesLeft()).toBe(0);
    p.travel('map_caveaaaaaa', 'sp_cavemoutha');
    step(0.2);
    expect(p.logic.vars.get('entered')).toBe('Start');
    expect(p.logic.attachedTo(ms.id)).toEqual(['map:map_caveaaaaaa']);
    expect(p.foesLeft()).toBe(1);
    const foe = p.world.npcs.find((n) => n.id === 41)!;
    for (let i = 0; i < 20 && p.world.npcs.includes(foe); i++) p.hitNpc(foe, { power: 9, type: 'slash' });
    step(0.1);
    expect(p.logic.vars.get('cleared')).toBe('Cave');
    p.travel(p.project.entry.map, '');
    step(0.2);
    expect(p.logic.vars.get('left')).toBe('Start');
    expect(p.logic.attachedTo(ms.id)).toEqual([]);
  });
});
