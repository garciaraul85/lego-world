import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { trainingYard } from '../../src/core/gamegen/training-yard';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { clockText, completion, EMPTY_PROGRESS, type ProgressDoc, parsePlayer } from '../../src/core/save/progress';
import { MemorySaveStore } from '../../src/core/save/save';
import { paths } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';

/** P26 part 2: achievements, collections, best scores, new game plus and player settings. */
const DOC: ProgressDoc = {
  achievements: [
    { id: 'first-chest', name: 'Treasure hunter', description: 'Open a chest.' },
    { id: 'secret', name: 'Secret', description: 'Find the secret.', hidden: true },
  ],
  collections: [{ item: 'coin', label: 'Coins', total: 4 }],
  bests: [
    { var: 'score', label: 'Score', better: 'higher' },
    { var: 'lap', label: 'Lap time', better: 'lower' },
  ],
  newGamePlus: { enabled: true, keepItems: true, keepVars: ['level'] },
};

function game(doc: ProgressDoc = DOC) {
  const s = new ProjectStore(newProjectFiles({ name: 'Goals', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const r = bus.execute({ type: 'progress.put', payload: { progress: doc } }, { source: 'user' });
  expect(r.ok, r.error).toBe(true);
  return { s, bus };
}

describe('progress setup (game/progress.json)', () => {
  it('is put whole; ids, items and variables must be unique', () => {
    const g = game();
    expect(g.s.get(paths.progress)).toEqual(DOC);
    const dup = g.bus.execute(
      {
        type: 'progress.put',
        payload: { progress: { ...DOC, achievements: [DOC.achievements[0]!, DOC.achievements[0]!] } },
      },
      { source: 'user' },
    );
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/first-chest/);
  });

  it('completion counts collections by how much was found, and the achievements as one more part', () => {
    expect(
      completion(
        EMPTY_PROGRESS,
        () => 0,
        () => false,
      ),
    ).toBe(0);
    expect(
      completion(
        DOC,
        () => 2,
        () => false,
      ),
    ).toBe(25);
    expect(
      completion(
        DOC,
        () => 4,
        (id) => id === 'first-chest',
      ),
    ).toBe(75);
    expect(clockText(65)).toBe('1:05');
    expect(clockText(3725)).toBe('1:02:05');
  });
});

describe('in play', () => {
  it('an achievement unlocks once, stays with the player across plays, and shows on screens', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    expect(p.lookup('achievements.total')).toBe(2);
    p.actions.run([{ do: 'achieve', id: 'first-chest' }], p.clock);
    expect(p.message).toBe('🏆 Treasure hunter');
    expect(p.progress.unlock('first-chest')).toBe(false);
    expect(p.lookup('achievements.unlocked')).toBe(1);
    expect(p.lookup('achievements.list')).toEqual(['🏆 Treasure hunter — Open a chest.', '🔒 ???']);
    // a new play (even a new game) still has it
    const q = new PlaySession(g.s.snapshot(), { saves });
    expect(q.progress.unlocked('first-chest')).toBe(true);
    // an id that does not exist is reported, not crashed on
    q.actions.run([{ do: 'achieve', id: 'nope' }], q.clock);
    expect(q.events.at(-1)?.msg).toMatch(/none with that id/);
  });

  it('logic unlocks achievements and finishes the game; On achievement runs', () => {
    const g = game();
    const made = g.bus.execute(
      {
        type: 'logic.create',
        payload: {
          graph: {
            id: 'lg_goalsgoal1',
            name: 'Goals',
            scope: 'global',
            nodes: [
              { id: 'n1', type: 'event.onStart', pos: [0, 0] },
              { id: 'n2', type: 'game.unlockAchievement', pos: [200, 0], args: { achievement: 'secret' } },
              { id: 'n3', type: 'event.onAchievement', pos: [0, 200], args: { achievement: 'secret' } },
              { id: 'n4', type: 'game.finish', pos: [200, 200] },
            ],
            edges: [
              ['n1', 'then', 'n2', 'in'],
              ['n3', 'then', 'n4', 'in'],
            ],
          },
        },
      } as never,
      { source: 'user' },
    );
    expect(made.ok, made.error).toBe(true);
    const p = new PlaySession(g.s.snapshot(), { saves: new MemorySaveStore() });
    for (let i = 0; i < 5; i++) p.runtime.stepOnce();
    expect(p.progress.unlocked('secret')).toBe(true);
    // On achievement ran Finish game
    expect(p.progress.record.finished).toBe(1);
  });

  it('best scores: higher is kept as soon as it is beaten, lower when the game is finished', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    p.logic.setVar('score', 40);
    p.logic.setVar('lap', 33.5);
    for (let i = 0; i < 31; i++) p.runtime.stepOnce();
    expect(p.lookup('best.score')).toBe(40);
    expect(p.lookup('best.lap')).toBeUndefined();
    p.gameOp('finish');
    expect(p.lookup('best.lap')).toBe(33.5);
    expect(p.progress.record.finished).toBe(1);
    // a worse run does not replace them
    const q = new PlaySession(g.s.snapshot(), { saves });
    q.logic.setVar('score', 10);
    q.logic.setVar('lap', 50);
    q.gameOp('finish');
    expect(q.lookup('best.score')).toBe(40);
    expect(q.lookup('best.lap')).toBe(33.5);
    expect(q.lookup('bests.list')).toEqual(['Score: 40', 'Lap time: 33.5']);
  });

  it('new game plus: offered after finishing; keeps the items and listed variables, counts the runs', () => {
    const g = game();
    const p = new PlaySession(g.s.snapshot(), { saves: new MemorySaveStore() });
    expect(p.lookup('progress.canPlus')).toBe(false);
    p.actions.run([{ do: 'give', item: 'coin', count: 3 }], p.clock);
    p.logic.setVar('level', 5);
    p.logic.setVar('gold', 99);
    expect(p.lookup('collection.coin')).toBe('3 / 4');
    p.gameOp('finish');
    expect(p.screens.screens().some((x) => x.kind === 'title')).toBe(true);
    expect(p.lookup('progress.canPlus')).toBe(true);
    p.gameOp('newGamePlus');
    expect(p.inventory.get('coin')).toBe(3);
    expect(p.logic.vars.get('level')).toBe(5);
    expect(p.logic.vars.get('gold')).toBeUndefined();
    expect(p.logic.vars.get('newGamePlus')).toBe(1);
  });

  it('player settings step through their values, are kept, and set the damage the hero takes', () => {
    const g = game();
    const saves = new MemorySaveStore();
    const p = new PlaySession(g.s.snapshot(), { saves });
    expect(p.lookup('settings.difficulty')).toBe('Difficulty: normal');
    p.actions.run([{ do: 'setting', key: 'difficulty' }], p.clock);
    expect(p.progress.settings.difficulty).toBe('hard');
    p.actions.run([{ do: 'setting', key: 'difficulty', value: 'story' }], p.clock);
    p.actions.run([{ do: 'setting', key: 'music' }], p.clock);
    expect(p.progress.settings.music).toBe(100);
    p.actions.run([{ do: 'setting', key: 'textSize' }], p.clock);
    const hp = Number(p.logic.vars.get('hp'));
    p.hurt(1);
    expect(Number(p.logic.vars.get('hp'))).toBe(hp - 0.5);
    const q = new PlaySession(g.s.snapshot(), { saves });
    expect(q.progress.settings).toMatchObject({ difficulty: 'story', music: 100, textSize: 'large' });
    // a broken or foreign record reads as a new player
    expect(parsePlayer({ junk: true }, 'x').finished).toBe(0);
    expect(parsePlayer({ ...q.progress.record }, 'another game').achievements).toEqual({});
  });

  it('the Training yard has goals: three achievements, the medal, and the logic that unlocks them', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const y = trainingYard();
    const r = bus.execute(y.commands, { source: 'user' });
    expect(r.ok, r.error).toBe(true);
    const doc = s.get<ProgressDoc>(paths.progress)!;
    expect(doc.achievements.map((a) => a.id)).toEqual(['first-smash', 'sharp-eye', 'knight-beaten']);
    expect(doc.collections[0]?.item).toBe('medal');
    const p = new PlaySession(s.snapshot(), { mapId: y.map, saves: new MemorySaveStore() });
    p.logic.fire({ type: 'event.onCustom', match: { event: 'knight-beaten' } }, true);
    expect(p.progress.unlocked('knight-beaten')).toBe(true);
  });
});
