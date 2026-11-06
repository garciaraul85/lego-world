import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { type BossPlan, bossEnemy, bossPhaseAt, Enemy, planOfPhases } from '../../src/core/combat/enemy';
import { partsOf } from '../../src/core/combat/parts';
import { CommandBus, registerAll } from '../../src/core/commands';
import { bossHowOf, enemyOfCharacter } from '../../src/core/logic/boss';
import { allHooksOf, CHARACTER_BUILTINS, lineageOf, templateOfEnemy } from '../../src/core/logic/builtins';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import {
  type Character,
  Character as CharacterSchema,
  type Instances,
  type LogicGraph,
  paths,
} from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/**
 * Milestone 3b (B5c, 14a-2): bosses — phases by health, each built from the templates and parts, and weak moments;
 * made in Logic: the phases are written in the class.
 */
function behaviour(id: string, code: string): LogicGraph {
  const r = parseBehaviour(code);
  if ('error' in r) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  return {
    id: id as LogicGraph['id'],
    name: id,
    scope: 'global',
    behaviour: r.behaviour,
    nodes: r.nodes,
    edges: r.edges,
  };
}
const cast = (slug: string) => STARTER_CHARACTERS.find((c) => c.slug === slug)!;
const PLAN: BossPlan = { first: 'pack', phases: [{ at: 0.5, style: 'shooter', speedK: 1.5, name: 'Enraged' }] };
/** the same phases as a class writes them (Logic) */
const PHASES = `  phases = [
    { from: 100, fights: "pack" },
    { from: 50, fights: "shooter", speed: 1.5, name: "Enraged" },
  ];
`;

/** the Howler made a boss (8 health, no soft sides) at (0, 0); the hero 3 studs in front */
function boss(plan: BossPlan | undefined = PLAN, graphs: LogicGraph[] = []) {
  const s = new ProjectStore(newProjectFiles({ name: 'Boss', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const c = cast('howler');
  const chr = { ...c.character, id: c.id } as Character;
  s.put(paths.character(c.id), {
    ...chr,
    harm: { ...chr.harm!, health: { ...chr.harm!.health, hp: 8, sides: undefined } },
    enemy: plan ? { ...chr.enemy!, style: 'boss', boss: plan } : chr.enemy!,
  });
  for (const g of graphs) {
    const r = bus.execute(
      [
        { type: 'logic.create', payload: { graph: g } },
        { type: 'script.attach', payload: { target: { kind: 'character', id: c.id }, use: g.id } },
      ] as never,
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
  }
  const map = s.manifest.entry.map;
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items.filter((i) => i.kind !== 'npc'),
      {
        id: 'ins_bossaaaaaa',
        kind: 'npc',
        character: c.id,
        legacyId: 20,
        biome: 'prairie',
        role: 'guard',
        state: { x: 0, y: 0.4, z: 0, heading: 0 },
      },
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 3], Math.PI);
  const foe = () => p.world.npcs.find((n) => n.id === 20)!;
  const hp = () => p.health.peek('n:20')?.hp ?? 8;
  const hit = (power = 1, type: 'slash' | 'stun' = 'slash') => p.hitNpc(foe(), { power, type });
  return { p, s, bus, foe, hp, hit, id: c.id };
}

describe('boss phases', () => {
  it('its phase by its health: each mark it falls to adds one', () => {
    const plan: BossPlan = { phases: [{ at: 0.3 }, { at: 0.7 }] };
    expect(bossPhaseAt(plan, 1)).toBe(1);
    expect(bossPhaseAt(plan, 0.7)).toBe(2);
    expect(bossPhaseAt(plan, 0.5)).toBe(2);
    expect(bossPhaseAt(plan, 0.2)).toBe(3);
    expect(bossPhaseAt(undefined, 0.1)).toBe(1);
  });

  it('fights as its phase’s kind: its first, then the next with its parts, faster and harder', () => {
    const e = Enemy.parse({ ...cast('howler').character.enemy, style: 'boss', boss: PLAN });
    expect(bossEnemy(e, 1).style).toBe('pack');
    const two = bossEnemy(e, 2);
    expect(two.style).toBe('shooter');
    expect(two.speed).toBeCloseTo(Math.min(3, e.speed * 1.5));
    expect(partsOf(two).attack).toBe('shot');
    // a phase that only swaps a part keeps the kind before it
    const e2 = Enemy.parse({ ...e, boss: { first: 'knight', phases: [{ at: 0.5, parts: { attack: 'spit' } }] } });
    expect(bossEnemy(e2, 2)).toMatchObject({ style: 'knight', parts: { attack: 'spit' } });
    // not a boss: as it is
    const plain = Enemy.parse(cast('howler').character.enemy);
    expect(bossEnemy(plain, 2)).toBe(plain);
  });

  it('in Play: half its health gone, it roars into phase 2 and fights as a shooter; On phase fires', () => {
    const g = behaviour(
      'lg_bossphase1',
      `class BossPhases extends PhasedBoss {\n${PHASES}\n  phase(e) {\n    log(text.join("Phase ", e.phase));\n  }\n}\n`,
    );
    // (the character's own settings say nothing of phases: its class does)
    const { p, hit, foe } = boss(undefined, [g]);
    expect(p.enemyOf(foe())!.style).toBe('pack');
    hit(3);
    expect(p.bossPhaseOf(foe())).toBe(1);
    hit(1);
    expect(p.bossPhaseOf(foe())).toBe(2);
    expect(p.enemyOf(foe())!.style).toBe('shooter');
    for (let t = 0; t < 0.3; t += 1 / 60) p.runtime.stepOnce();
    expect(p.events.some((e) => e.msg.includes('Phase 2'))).toBe(true);
    // and in phase 2 it keeps away and shoots
    p.placeAt([0, 0.4, 7], Math.PI);
    let shots = 0;
    let before = p.foeShots.flying.length;
    for (let t = 0; t < 6; t += 1 / 60) {
      p.runtime.stepOnce();
      const n = p.foeShots.flying.length;
      if (n > before) shots += n - before;
      before = n;
    }
    expect(shots).toBeGreaterThan(0);
  });

  it('phaseFor may choose its phase', () => {
    const g = behaviour(
      'lg_bossphase2',
      `class EarlyRage extends PhasedBoss {\n${PHASES}\n  phaseFor(e) {\n    if ((e.hp < e.max)) {\n      return 2;\n    }\n    return 1;\n  }\n}\n`,
    );
    const { p, hit, foe } = boss(undefined, [g]);
    hit(1);
    expect(p.bossPhaseOf(foe())).toBe(2);
  });
});

describe('weak moments', () => {
  it('a PuzzleBoss shrugs off hits until stunned; then it is hurt', () => {
    const { p, hit, hp, foe } = boss({ ...PLAN, vulnerable: 'stunned' });
    hit(2);
    expect(hp()).toBe(8);
    p.combat.stunNpc(foe(), 2);
    hit(2);
    expect(hp()).toBe(6);
  });

  it('a stun hit stuns a PuzzleBoss (the opening) without hurting it', () => {
    const { p, hit, hp, foe } = boss({ ...PLAN, vulnerable: 'stunned' });
    hit(1, 'stun');
    expect(hp()).toBe(8);
    expect(p.isStunned(foe())).toBe(true);
    hit(2);
    expect(hp()).toBe(6);
  });

  it('a WeakPointBoss is guarded but for a moment just after it attacks', () => {
    const { p, hit, hp, foe } = boss({ ...PLAN, vulnerable: 'afterAttack' });
    hit(2);
    expect(hp()).toBe(8);
    // wait until its attack lands, then strike
    let opened = false;
    for (let t = 0; t < 8 && !opened; t += 1 / 60) {
      p.runtime.stepOnce();
      if (p.enemies.justAttacked(foe(), 0.5)) opened = true;
    }
    expect(opened).toBe(true);
    hit(2);
    expect(hp()).toBe(6);
  });

  it('isVulnerable may open it', () => {
    const g = behaviour(
      'lg_bossopen01',
      'class Open extends PuzzleBoss {\n  isVulnerable(e) {\n    return true;\n  }\n}\n',
    );
    const { hit, hp } = boss(undefined, [g]);
    hit(2);
    expect(hp()).toBe(6);
  });
});

describe('the boss built-ins', () => {
  it('BossBrain extends EnemyBrain; its templates by when it can be hurt', () => {
    expect(lineageOf('PuzzleBoss').map((b) => b.name)).toEqual(['PuzzleBoss', 'BossBrain', 'EnemyBrain', 'Brain']);
    expect(allHooksOf('PhasedBoss').map((h) => h.method)).toEqual(
      expect.arrayContaining(['phaseFor', 'isVulnerable', 'nextState', 'takeDamage']),
    );
    const e = (v?: BossPlan['vulnerable']) =>
      Enemy.parse({ ...cast('howler').character.enemy, style: 'boss', boss: { phases: [], vulnerable: v } });
    expect(templateOfEnemy(e())).toBe('PhasedBoss');
    expect(templateOfEnemy(e('afterAttack'))).toBe('WeakPointBoss');
    expect(templateOfEnemy(e('stunned'))).toBe('PuzzleBoss');
    expect(CHARACTER_BUILTINS.find((b) => b.name === 'BossBrain')!.events).toContain('event.onPhase');
  });

  it('a boss is made in Logic: a behaviour extending a boss template, its phases written in the class', () => {
    const g = behaviour('lg_bossmade01', `class Rage extends WeakPointBoss {\n${PHASES}}\n`);
    expect(g.behaviour!.phases).toEqual([
      { from: 100, fights: 'pack' },
      { from: 50, fights: 'shooter', speed: 1.5, name: 'Enraged' },
    ]);
    // it prints back as written
    expect(printBehaviour({ ...g, name: 'Rage' }).code).toContain(PHASES);
    expect(bossHowOf('WeakPointBoss')).toBe('afterAttack');
    expect(bossHowOf('PuzzleBoss')).toBe('stunned');
    expect(bossHowOf('PhasedBoss')).toBe('always');
    expect(bossHowOf('Brawler')).toBeNull();
    // attached, it makes a plain Howler a boss
    const howler = cast('howler').character;
    const e = enemyOfCharacter({ ...howler, scripts: [{ use: g.id }] }, (id) => (id === g.id ? g : undefined))!;
    expect(e).toMatchObject({ style: 'boss', boss: { ...PLAN, vulnerable: 'afterAttack' } });
    expect(templateOfEnemy(e)).toBe('WeakPointBoss');
    // switched off on a placed copy: not a boss there
    expect(enemyOfCharacter({ ...howler, scripts: [{ use: g.id }] }, () => g, [{ use: g.id, off: true }])!.style).toBe(
      howler.enemy!.style,
    );
    // its phases as the engine runs them
    expect(
      planOfPhases(
        [
          { from: 100, fights: 'knight', attack: 'spit' },
          { from: 40, mover: 'flyer' },
        ],
        'stunned',
      ),
    ).toEqual({
      first: 'knight',
      firstParts: { attack: 'spit' },
      phases: [{ at: 0.4, parts: { mover: 'flyer' } }],
      vulnerable: 'stunned',
    });
  });

  it('a phase written wrong says what it takes', () => {
    const err = (code: string) => {
      const r = parseBehaviour(`class X extends PhasedBoss {\n  phases = [${code}];\n}\n`);
      return 'error' in r ? r.error.message : '';
    };
    expect(err('{ from: 50, fights: "dragon" }')).toMatch(/fights: a kind of fighter: melee/);
    expect(err('{ from: 150 }')).toMatch(/from: the health it starts at/);
    expect(err('{ from: 50, colour: "red" }')).toMatch(/no “colour”/);
    expect(err('{ from: 50 }, { from: 50 }')).toMatch(/same health/);
  });
});
