import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { CHARACTER_BUILTINS, extendCode } from '../../src/core/logic/builtins';
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
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B4): characters' built-ins (Hero, Neighbour, Damageable) and behaviours that extend them. */
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
// biome-ignore lint/suspicious/noExplicitAny: test helper
const run = (bus: CommandBus, c: any) => bus.execute(c, { source: 'user' });
const hero: Character = {
  id: 'chr_heroaaaaaa' as Character['id'],
  name: 'Rowan',
  role: 'hero',
  profile: { name: 'Rowan' },
};
const mira = { id: 'chr_villager01', name: 'Mira', role: 'npc', profile: { name: 'Mira' } } as Character;

function game(...graphs: LogicGraph[]) {
  const s = new ProjectStore(newProjectFiles({ name: 'Heroes', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const r = bus.execute(
    [
      { type: 'character.create', payload: { character: hero } },
      { type: 'project.update', payload: { hero: hero.id } },
      ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
    ],
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  // a villager near the hero
  s.put(paths.character(mira.id), mira);
  const inst = s.get<Instances>(paths.instances(map))!;
  s.put(paths.instances(map), {
    ...inst,
    npcsSaved: true,
    items: [
      ...inst.items,
      {
        id: 'ins_villager01',
        kind: 'npc',
        character: mira.id,
        legacyId: 9,
        biome: 'prairie',
        role: 'villager',
        state: { x: 1, y: 0.4, z: 1.5, heading: Math.PI },
      },
    ],
  } as Instances);
  for (const g of graphs) {
    const base = g.behaviour!.extends;
    const target = ['Hero', 'Swimmer', 'Climber'].includes(base ?? '') ? hero.id : mira.id;
    const ok = run(bus, {
      type: 'script.attach',
      payload: { target: { kind: 'character', id: target }, use: g.id },
    });
    expect(ok.ok, ok.error).toBe(true);
  }
  const p = new PlaySession(s.snapshot());
  p.placeAt([0, 0.4, 0], 0);
  p.runtime.stepOnce();
  return { s, bus, p };
}

describe('character built-ins', () => {
  it('each has fields that set and read back on a valid character, and its Extend code round-trips', () => {
    expect(CHARACTER_BUILTINS.map((b) => b.name)).toEqual([
      'Hero',
      'Neighbour',
      'Damageable',
      'Swimmer',
      'Climber',
      'Follower',
    ]);
    for (const b of CHARACTER_BUILTINS) {
      const who = b.on(hero) ? hero : mira;
      let c = { ...who, ...b.add(who) } as Character;
      for (const f of b.fields) {
        const v = f.type === 'bool' ? !f.default : (f.max ?? 2);
        c = { ...c, ...f.set(c, v) } as Character;
        expect(f.get(c), `${b.name}.${f.name}`).toEqual(v);
        const ok = CharacterSchema.safeParse(c);
        expect(ok.success ? null : `${b.name}.${f.name}: ${ok.error.message}`).toBeNull();
      }
      const code = extendCode(b, `My${b.name}`);
      const r = parseBehaviour(code);
      expect('error' in r ? r.error.message : null).toBeNull();
      if (!('error' in r)) expect(printBehaviour({ name: `My${b.name}`, ...r }).code.trim()).toBe(code);
    }
  });

  it('one that extends Hero goes only on the hero; Neighbour only on a neighbour', () => {
    const toHero = behaviour('lg_toherooaaa', 'class A extends Hero {\n}');
    const toNpc = behaviour('lg_tonpcaaaaa', 'class B extends Neighbour {\n}');
    const { bus } = game();
    bus.execute(
      [toHero, toNpc].map((g) => ({ type: 'logic.create', payload: { graph: g } })),
      { source: 'user' },
    );
    const bad = run(bus, {
      type: 'script.attach',
      payload: { target: { kind: 'character', id: mira.id }, use: toHero.id },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/not a Hero/);
    const bad2 = run(bus, {
      type: 'script.attach',
      payload: { target: { kind: 'asset', id: 'ast_whatever01' }, use: toNpc.id },
    });
    expect(bad2.ok).toBe(false);
    // a built-in field written to the character's sheet
    const ok = run(bus, {
      type: 'builtin.setField',
      payload: { character: hero.id, name: 'Hero', field: 'jump', value: 1.5 },
    });
    expect(ok.ok, ok.error).toBe(true);
    // Hero cannot be added or taken off
    expect(run(bus, { type: 'builtin.detach', payload: { character: hero.id, name: 'Hero' } }).ok).toBe(false);
  });
});

describe('extending character built-ins in Play', () => {
  it('a hero that takes no damage, gets double experience and hits twice as hard', () => {
    const tough = behaviour(
      'lg_toughheroa',
      [
        'class Tough extends Hero {',
        '  takeDamage(e) {',
        '    return 0;',
        '  }',
        '  gainXp(e) {',
        '    return (e.amount * 2);',
        '  }',
        '  hitPower(e) {',
        '    return (super.hitPower(e) * 2);',
        '  }',
        '}',
      ].join('\n'),
    );
    const plain = game();
    const { p } = game(tough);
    const hp = Number(p.logic.vars.get('hp'));
    p.hurt(1);
    expect(Number(p.logic.vars.get('hp'))).toBe(hp);
    plain.p.hurt(1);
    expect(Number(plain.p.logic.vars.get('hp'))).toBe(hp - 1);
    p.giveXp(10);
    expect(Number(p.logic.vars.get('xp'))).toBe(20);
    expect(p.combat.hitOf('light').power).toBeCloseTo(plain.p.combat.hitOf('light').power * 2);
  });

  it('a hero that cannot jump, and one twice as fast', () => {
    const grounded = behaviour(
      'lg_nojumpaaaa',
      ['class NoJump extends Hero {', '  canJump(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    const fall = (p: PlaySession) => {
      for (let i = 0; i < 90; i++) p.runtime.stepOnce();
      const y0 = p.heroState.y;
      p.input.jump = true;
      let top = y0;
      for (let i = 0; i < 30; i++) {
        p.runtime.stepOnce();
        top = Math.max(top, p.heroState.y);
      }
      return top - y0;
    };
    expect(fall(game().p)).toBeGreaterThan(0.5);
    expect(fall(game(grounded).p)).toBeLessThan(0.1);
    const fast = behaviour(
      'lg_fastaaaaaa',
      ['class Fast extends Hero {', '  moveSpeed(e) {', '    return (e.base * 2);', '  }', '}'].join('\n'),
    );
    const walk = (p: PlaySession) => {
      const x0 = p.heroState.z;
      p.input.keys.add('forward');
      for (let i = 0; i < 60; i++) p.runtime.stepOnce();
      p.input.keys.delete('forward');
      return Math.abs(p.heroState.z - x0) + Math.abs(p.heroState.x);
    };
    const a = walk(game().p);
    const b = walk(game(fast).p);
    expect(b).toBeGreaterThan(a * 1.5);
  });

  it('a neighbour that will not talk (Neighbour.canTalk)', () => {
    const shy = behaviour(
      'lg_shyaaaaaaa',
      ['class Shy extends Neighbour {', '  canTalk(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    const { p } = game(shy);
    p.talk();
    expect(p.talking).toBeNull();
    // without it, she talks
    const plain = game().p;
    plain.talk();
    expect(plain.talking).not.toBeNull();
  });

  it('the Hero course’s hero is out of breath after three quick jumps', () => {
    const code = [
      'class $NAME extends Hero {',
      '  most = field.number(3, { label: "Jumps before a rest", min: 1, max: 10 });',
      '  jumps = 0;',
      '  last = 0;',
      '',
      '  canJump(e) {',
      '    if (((time.now() - this.last) > 2)) {',
      '      this.jumps = 0;',
      '    }',
      '    this.last = time.now();',
      '    if ((this.jumps >= this.most)) {',
      '      log("Out of breath!");',
      '      return false;',
      '    }',
      '    this.jumps += 1;',
      '    return super.canJump(e);',
      '  }',
      '}',
    ]
      .join('\n')
      .replace('$NAME', 'MyHero');
    const { p } = game(behaviour('lg_breathaaaa', code));
    for (let i = 0; i < 90; i++) p.runtime.stepOnce();
    const jumped = () => {
      for (let i = 0; i < 120 && !p.heroState.grounded; i++) p.runtime.stepOnce();
      const y0 = p.heroState.y;
      p.input.jump = true;
      let top = y0;
      for (let i = 0; i < 20; i++) {
        p.runtime.stepOnce();
        top = Math.max(top, p.heroState.y);
      }
      return top - y0 > 0.3;
    };
    expect([jumped(), jumped(), jumped(), jumped()]).toEqual([true, true, true, false]);
    expect(p.events.some((e) => e.msg.includes('Out of breath'))).toBe(true);
    // two seconds' rest
    for (let i = 0; i < 150; i++) p.runtime.stepOnce();
    expect(jumped()).toBe(true);
  });

  it('a hero with short breath (Swimmer.breath), and a neighbour that follows close or far (Follower.followGap)', () => {
    const short = behaviour(
      'lg_shortbreat',
      ['class Short extends Swimmer {', '  breath(e) {', '    return 3;', '  }', '}'].join('\n'),
    );
    const { p } = game(short);
    p.runtime.stepOnce();
    expect(p.logic.vars.get('maxAir')).toBe(3);
    const far = behaviour(
      'lg_farfollowa',
      ['class Far extends Follower {', '  followGap(e) {', '    return 8;', '  }', '}'].join('\n'),
    );
    const keep = (g?: LogicGraph) => {
      const { p } = g ? game(g) : game();
      p.placeAt([20, 0.4, 0], 0);
      p.setFollow('Mira', true);
      for (let i = 0; i < 600; i++) p.runtime.stepOnce();
      const n = p.world.npcs.find((x) => x.profile.name === 'Mira')!;
      return Math.hypot(n.state.x - p.heroState.x, n.state.z - p.heroState.z);
    };
    expect(keep()).toBeLessThan(4);
    expect(keep(far)).toBeGreaterThan(6.5);
  });
});
