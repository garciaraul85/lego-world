import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { bossEnemy, Enemy } from '../../src/core/combat/enemy';
import { partsOf } from '../../src/core/combat/parts';
import { CommandBus, registerAll } from '../../src/core/commands';
import { templateOfEnemy } from '../../src/core/logic/builtins';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { Character as CharacterSchema, type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { packCharacterCommands } from '../../src/editor/pack/pack';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (14a-2): Gloomweaver built from the brains — three phases, a weak moment, a behaviour that calls its brood. */
const item = () => {
  const c = STARTER_CHARACTERS.find((x) => x.slug === 'gloomweaver')!;
  return { ...c, id: c.id };
};

/** a project with Gloomweaver brought in from the pack (its behaviour made and attached) and placed 6 studs ahead */
function arena() {
  const s = new ProjectStore(newProjectFiles({ name: 'Lair', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const it = item();
  const cmds = packCharacterCommands({ store: s } as never, it as never);
  const r = bus.execute(cmds as never, { source: 'user' });
  expect(r.ok, r.error).toBe(true);
  const map = s.manifest.entry.map;
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items.filter((i) => i.kind !== 'npc'),
      {
        id: 'ins_gloomaaaaa',
        kind: 'npc',
        character: it.id,
        legacyId: 30,
        biome: 'prairie',
        role: 'guard',
        state: { x: 0, y: 0.4, z: 0, heading: 0 },
      },
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 6], Math.PI);
  const foe = () => p.world.npcs.find((n) => n.id === 30)!;
  const hp = () => p.health.peek('n:30')?.hp ?? 16;
  return { p, s, it, foe, hp };
}

describe('Gloomweaver', () => {
  it('is a WeakPointBoss: it bites, then hangs on a thread and drops, then spits sticky webs', () => {
    const e = Enemy.parse(item().character.enemy);
    expect(templateOfEnemy(e)).toBe('WeakPointBoss');
    expect(partsOf(bossEnemy(e, 1))).toMatchObject({ mover: 'walker', attack: 'bite' });
    expect(partsOf(bossEnemy(e, 2))).toMatchObject({ mover: 'thread', attack: 'drop' });
    expect(partsOf(bossEnemy(e, 3))).toMatchObject({ attack: 'spit', hurt: 'stun' });
    expect(bossEnemy(e, 3).speed).toBeGreaterThan(e.speed);
  });

  it('brought in from the pack, its behaviour comes with it: class Gloomweaver extends WeakPointBoss', () => {
    const { s, it } = arena();
    const chr = s.get(paths.character(it.id)) as { scripts?: { use: string }[] };
    expect(CharacterSchema.safeParse(chr).success).toBe(true);
    const g = s.get<LogicGraph>(`logic/${chr.scripts![0]!.use}.json`)!;
    expect(g.name).toBe('Gloomweaver');
    expect(g.behaviour!.extends).toBe('WeakPointBoss');
    // brought in again: no second copy
    const again = packCharacterCommands({ store: s } as never, it as never);
    expect(again).toEqual([]);
  });

  it('its eye is dull and it shrugs off hits; just after it strikes the eye glows and a hit lands', () => {
    const { p, foe, hp } = arena();
    expect(p.bossGuarded(foe())).toBe(true);
    p.hitNpc(foe(), { power: 4, type: 'slash' });
    expect(hp()).toBe(16);
    let open = false;
    for (let t = 0; t < 10 && !open; t += 1 / 60) {
      p.runtime.stepOnce();
      if (!p.bossGuarded(foe())) open = true;
    }
    expect(open).toBe(true);
    p.hitNpc(foe(), { power: 4, type: 'slash' });
    expect(hp()).toBeLessThan(16);
  });

  it('stunned by light it opens too', () => {
    const { p, foe, hp } = arena();
    p.hitNpc(foe(), { power: 1, type: 'light' });
    expect(p.isStunned(foe())).toBe(true);
    expect(p.bossGuarded(foe())).toBe(false);
    p.hitNpc(foe(), { power: 4, type: 'slash' });
    expect(hp()).toBeLessThan(16);
  });

  it('two-thirds down it climbs into the dark; one-third down it calls its brood round itself', () => {
    const { p, foe, hp } = arena();
    const strike = () => {
      p.combat.stunNpc(foe(), 2);
      p.hitNpc(foe(), { power: 6, type: 'slash' });
      for (let t = 0; t < 0.2; t += 1 / 60) p.runtime.stepOnce();
    };
    while (hp() > 16 * 0.66) strike();
    expect(p.bossPhaseOf(foe())).toBe(2);
    expect(p.enemyOf(foe())!.style).toBe('ambusher');
    const before = p.world.npcs.length;
    while (hp() > 16 * 0.33) strike();
    expect(p.bossPhaseOf(foe())).toBe(3);
    expect(p.world.npcs.length).toBe(before + 2);
    const brood = p.world.npcs.filter((n) => n.profile.name === 'Threadback');
    expect(brood).toHaveLength(2);
    for (const n of brood) expect(Math.hypot(n.state.x - foe().state.x, n.state.z - foe().state.z)).toBeLessThan(4);
  });
});
