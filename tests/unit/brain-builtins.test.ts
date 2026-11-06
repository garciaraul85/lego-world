import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allHooksOf, CHARACTER_BUILTINS, extendCode, lineageOf, templateOfEnemy } from '../../src/core/logic/builtins';
import { parseBehaviour, printBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, type LogicGraph, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B5a): enemy brains as built-ins (Brain › EnemyBrain › 11 templates) and behaviours that extend them. */
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

/** one starter enemy at (0, 0) facing +z, the hero 7 studs in front of it; behaviours attached to its character */
function fight(slug: string, ...graphs: LogicGraph[]) {
  const s = new ProjectStore(newProjectFiles({ name: 'Brains', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  for (const g of graphs) {
    const r = bus.execute(
      [
        { type: 'logic.create', payload: { graph: g } },
        { type: 'script.attach', payload: { target: { kind: 'character', id: cast(slug).id }, use: g.id } },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
  }
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items.filter((i) => i.kind !== 'npc'),
      {
        id: 'ins_foeaaaaaaa',
        kind: 'npc',
        character: cast(slug).id,
        legacyId: 20,
        biome: 'prairie',
        role: 'guard',
        state: { x: 0, y: 0.4, z: 0, heading: 0 },
      },
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 7], Math.PI);
  const steps = (sec: number, each?: () => void) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      p.runtime.stepOnce();
      each?.();
    }
  };
  const brain = () => (p.enemies as unknown as { brains: Map<number, { phase: string }> }).brains.get(20);
  return { p, steps, brain };
}

describe('the brain classes', () => {
  it('PopUp extends EnemyBrain extends Brain, and answers its line’s hooks', () => {
    expect(lineageOf('PopUp').map((b) => b.name)).toEqual(['PopUp', 'EnemyBrain', 'Brain']);
    const hooks = allHooksOf('PopUp').map((h) => h.method);
    for (const m of ['spits', 'shotKind', 'shouldFlee', 'takeDamage', 'hurtReaction', 'nextState'])
      expect(hooks).toContain(m);
    const brains = CHARACTER_BUILTINS.filter((b) => b.parent === 'EnemyBrain').map((b) => b.name);
    expect(brains).toEqual([
      'Brawler',
      'Charger',
      'Knight',
      'Turret',
      'Shooter',
      'PopUp',
      'Flyer',
      'Swarm',
      'Ambusher',
      'Ghost',
      'PackHunter',
    ]);
  });

  it('every enemy of the cast runs on its template', () => {
    const want: Record<string, string> = {
      pebblespout: 'PopUp',
      rattlebones: 'Knight',
      finspitter: 'PopUp',
      'watcher-eye': 'Turret',
      cinderjaw: 'Charger',
      flitterwing: 'Swarm',
      threadback: 'Ambusher',
      lanternwisp: 'Ghost',
      howler: 'PackHunter',
    };
    for (const [slug, t] of Object.entries(want)) {
      const c = cast(slug);
      expect(c, slug).toBeDefined();
      expect(templateOfEnemy(c.character.enemy), slug).toBe(t);
      expect(CHARACTER_BUILTINS.find((b) => b.name === t)!.on({ ...c.character, id: c.id } as never), slug).toBe(true);
    }
  });

  it('Extend code round-trips for every brain', () => {
    for (const b of CHARACTER_BUILTINS.filter((x) => x.parent || x.name === 'Brain')) {
      const code = extendCode(b, `My${b.name}`);
      const r = parseBehaviour(code);
      expect('error' in r ? `${b.name}: ${r.error.message}` : null).toBeNull();
      if (!('error' in r)) expect(printBehaviour({ name: `My${b.name}`, ...r }).code.trim()).toBe(code);
    }
  });

  it('one that extends PopUp goes only on a pop-up', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Brains', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const g = behaviour('lg_popupaaaaa', 'class A extends PopUp {\n}');
    bus.execute({ type: 'logic.create', payload: { graph: g } }, { source: 'user' });
    const bad = bus.execute(
      { type: 'script.attach', payload: { target: { kind: 'character', id: cast('rattlebones').id }, use: g.id } },
      { source: 'user' },
    );
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/not a PopUp/);
  });
});

describe('extending brains in Play', () => {
  it('a three-shot spitter (PopUp.spits) that spits fire (PopUp.shotKind)', () => {
    const spitter = behaviour(
      'lg_threeshota',
      [
        'class ThreeShot extends PopUp {',
        '  spits(e) {',
        '    return 3;',
        '  }',
        '  shotKind(e) {',
        '    return "fireball";',
        '  }',
        '}',
      ].join('\n'),
    );
    const count = (g?: LogicGraph) => {
      const { p, steps } = g ? fight('pebblespout', g) : fight('pebblespout');
      let shots = 0;
      const kinds = new Set<string>();
      let before = 0;
      steps(6, () => {
        const f = p.foeShots.flying;
        if (f.length > before) {
          shots += f.length - before;
          for (const x of f) kinds.add((x as { kind: string }).kind);
        }
        before = f.length;
      });
      return { shots, kinds: [...kinds] };
    };
    const plain = count();
    const three = count(spitter);
    expect(three.shots).toBeGreaterThan(plain.shots);
    expect(three.shots).toBeGreaterThanOrEqual(3);
    expect(three.kinds).toEqual(['fireball']);
    expect(plain.kinds).toEqual(['rock']);
  });

  it('an enemy that never sees the hero (canSee), one that never attacks (canAttack)', () => {
    const blind = behaviour(
      'lg_blindaaaaa',
      ['class Blind extends EnemyBrain {', '  canSee(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    const a = fight('rattlebones', blind);
    a.steps(3);
    expect(a.brain()?.phase).toBe('idle');
    const calm = behaviour(
      'lg_calmaaaaaa',
      ['class Calm extends Knight {', '  canAttack(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    const b = fight('rattlebones', calm);
    const hp = Number(b.p.logic.vars.get('hp'));
    b.p.placeAt([0, 0.4, 1.6], Math.PI);
    b.steps(6);
    expect(Number(b.p.logic.vars.get('hp'))).toBe(hp);
    expect(b.brain()?.phase).not.toBe('idle');
  });

  it('a coward that runs (shouldFlee), its change of state heard (On state change), and a chosen state (nextState)', () => {
    const coward = behaviour(
      'lg_cowardaaaa',
      [
        'class Coward extends Knight {',
        '  shouldFlee(e) {',
        '    return (e.distance < 4);',
        '  }',
        '  stateChange(e) {',
        '    log(text.join("now ", e.to));',
        '  }',
        '}',
      ].join('\n'),
    );
    const { p, steps, brain } = fight('rattlebones', coward);
    p.placeAt([0, 0.4, 2.5], Math.PI);
    let fled = false;
    steps(1, () => {
      if (brain()?.phase === 'flee') fled = true;
    });
    expect(fled).toBe(true);
    expect(p.events.some((e) => e.msg.includes('now flee'))).toBe(true);
    const f = p.world.npcs.find((n) => n.id === 20)!;
    expect(Math.hypot(f.state.x - p.heroState.x, f.state.z - p.heroState.z)).toBeGreaterThan(3);
    // a pop-up told to stay up (it never ducks: hit it any time)
    const stays = behaviour(
      'lg_staysupaaa',
      [
        'class StaysUp extends PopUp {',
        '  nextState(e) {',
        '    if ((e.to === "duck")) {',
        '      return "up";',
        '    }',
        '    return super.nextState(e);',
        '  }',
        '}',
      ].join('\n'),
    );
    const b = fight('pebblespout', stays);
    let ducked = false;
    b.steps(8, () => {
      if (b.brain()?.phase === 'duck') ducked = true;
    });
    expect(ducked).toBe(false);
  });

  it('a spider that never drops (Ambusher.shouldDrop)', () => {
    const shy = behaviour(
      'lg_nodropaaaa',
      ['class Shy extends Ambusher {', '  shouldDrop(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    const { p, steps, brain } = fight('threadback', shy);
    p.placeAt([0, 0.4, 0.3], Math.PI);
    steps(3);
    expect(brain()?.phase).toBe('hang');
  });
});
