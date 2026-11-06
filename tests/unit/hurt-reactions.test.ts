import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { HURT_REACTIONS, hurtReaction } from '../../src/core/combat/hurt';
import { CommandBus, registerAll } from '../../src/core/commands';
import { parseBehaviour } from '../../src/core/logic/code/behaviour';
import { parseCode } from '../../src/core/logic/code/parse';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { LogicGraph } from '../../src/core/schema';
import { type Instances, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { hurtPose } from '../../src/engine/character/hurt-poses';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B5b): how the hero, neighbours and enemies react to how they were hit. */
function fight(slug: string, at: [number, number] = [0, 0], graphs: LogicGraph[] = []) {
  const s = new ProjectStore(newProjectFiles({ name: 'Ouch', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  for (const g of graphs) {
    const cmds: { type: string; payload: unknown }[] = [{ type: 'logic.create', payload: { graph: g } }];
    if (g.behaviour)
      cmds.push({
        type: 'script.attach',
        payload: { target: { kind: 'character', id: STARTER_CHARACTERS.find((c) => c.slug === slug)!.id }, use: g.id },
      });
    const r = bus.execute(cmds as never, { source: 'user' });
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
        id: 'ins_foeaaaaaaa',
        kind: 'npc',
        character: STARTER_CHARACTERS.find((c) => c.slug === slug)!.id,
        legacyId: 20,
        biome: 'prairie',
        role: 'guard',
        state: { x: at[0], y: 0.4, z: at[1], heading: 0 },
      },
    ],
  } as Instances);
  const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
  p.placeAt([0, 0.4, 7], Math.PI);
  p.runtime.stepOnce();
  const foe = () => p.world.npcs.find((n) => n.id === 20)!;
  const steps = (sec: number, each?: () => void) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      p.runtime.stepOnce();
      each?.();
    }
  };
  return { p, foe, steps };
}

describe('which reaction a hit makes', () => {
  it('by the attack and its damage type', () => {
    expect(hurtReaction({ type: 'slash', power: 1, attack: 'swing' })).toBe('flinch');
    expect(hurtReaction({ type: 'slash', power: 2, attack: 'heavy' })).toBe('stagger');
    expect(hurtReaction({ type: 'blunt', power: 1, attack: 'pounce' })).toBe('stagger');
    expect(hurtReaction({ type: 'blunt', power: 1, attack: 'charge' })).toBe('knockdown');
    expect(hurtReaction({ type: 'blunt', power: 1, attack: 'drop' })).toBe('knockdown');
    expect(hurtReaction({ type: 'explosive', power: 2, knock: 6 })).toBe('knockdown');
    expect(hurtReaction({ type: 'fire', power: 1, attack: 'breath', then: 'burn' })).toBe('burn');
    expect(hurtReaction({ type: 'slash', power: 1, attack: 'swoop', then: 'freeze' })).toBe('freeze');
    expect(hurtReaction({ type: 'ice', power: 1 })).toBe('freeze');
    expect(hurtReaction({ type: 'light', power: 1, attack: 'beam' })).toBe('shock');
    expect(hurtReaction({ type: 'electric', power: 1 })).toBe('shock');
    expect(hurtReaction({ type: 'stun', power: 0 })).toBe('stun');
    expect(hurtReaction({ type: 'blunt', power: 1, attack: 'bash' })).toBe('stun');
  });

  it('each reaction poses a minifig its own way, and comes back to standing', () => {
    const mid = HURT_REACTIONS.map((h) => JSON.stringify(hurtPose(h, 0.3)));
    expect(new Set(mid).size).toBe(HURT_REACTIONS.length);
    const rest = JSON.stringify(hurtPose('flinch', 0));
    for (const h of HURT_REACTIONS) {
      const end = hurtPose(h, 99);
      expect(Math.abs(Number(end.lean) || 0), h).toBeLessThan(0.02);
    }
    // knocked down: the body is on its back, low
    const down = hurtPose('knockdown', 0.6);
    expect(Number(down.body)).toBeLessThan(-1);
    expect(Number(down.y)).toBeLessThan(1);
    void rest;
  });
});

describe('the hero reacts to how it was hit', () => {
  it('a charge knocks it down (it cannot move a moment); a breath of fire sets it burning; a beam jolts it', () => {
    const { p, foe } = fight('cinderjaw');
    p.hitHero(foe(), 1, 'blunt', 'charge');
    expect(p.hurtOf('hero')?.how).toBe('knockdown');
    expect(p.combat.stagger).toBeGreaterThan(1);
    const b = fight('cinderjaw');
    b.p.harmHero(b.foe(), 1, 'fire', [0, 0], 'burn', 'breath');
    expect(b.p.hurtOf('hero')?.how).toBe('burn');
    const c = fight('watcher-eye');
    c.p.harmHero(c.foe(), 1, 'light', [0, 0], undefined, 'beam');
    expect(c.p.hurtOf('hero')?.how).toBe('shock');
    const d = fight('rattlebones');
    d.p.hitHero(d.foe(), 1, 'slash', 'swing');
    expect(d.p.hurtOf('hero')?.how).toBe('flinch');
    expect(d.p.combat.stagger).toBe(0);
  });

  it('Watcher Eye’s beam in Play jolts the hero', () => {
    const { p, steps } = fight('watcher-eye', [0, 0]);
    p.placeAt([0, 0.4, 5], Math.PI);
    let how: string | undefined;
    steps(6, () => {
      how ??= p.hurtOf('hero')?.how;
    });
    expect(how).toBe('shock');
  });

  it('the reaction ends, and the hero can move again', () => {
    const { p, foe, steps } = fight('cinderjaw');
    p.hitHero(foe(), 1, 'blunt', 'charge');
    steps(2);
    expect(p.hurtOf('hero')).toBeNull();
    expect(p.combat.stagger).toBe(0);
  });
});

describe('enemies and neighbours react to how they were hit', () => {
  it('a bomb knocks one down, ice freezes it, a stun leaves it dizzy, a heavy swing staggers it', () => {
    const a = fight('rattlebones');
    a.p.hitNpc(a.foe(), { power: 1, type: 'explosive' }, { knock: 6, stun: 0.6 });
    expect(a.p.hurtOf(a.foe())?.how).toBe('knockdown');
    expect(a.p.combat.isStunned(a.foe())).toBe(true);
    const b = fight('rattlebones');
    b.p.hitNpc(b.foe(), { power: 1, type: 'ice' }, { knock: 0, stun: 1 });
    expect(b.p.hurtOf(b.foe())?.how).toBe('freeze');
    const c = fight('howler');
    c.p.hitNpc(c.foe(), { power: 2, type: 'slash', attack: 'heavy' }, { knock: 2, stun: 0.3 });
    expect(c.p.hurtOf(c.foe())?.how).toBe('stagger');
    const d = fight('howler');
    d.p.hitNpc(d.foe(), { power: 1, type: 'fire' }, { knock: 2, stun: 0.3 });
    expect(d.p.hurtOf(d.foe())?.how).toBe('burn');
  });

  it('the hero’s swings name themselves: a heavy one staggers, a shield bash stuns', () => {
    const { p } = fight('rattlebones');
    expect(p.combat.hitOf('heavy').attack).toBe('heavy');
    expect(hurtReaction({ ...p.combat.hitOf('heavy'), power: 2 })).toBe('stagger');
    expect(hurtReaction(p.combat.hitOf('bash'))).toBe('stun');
  });
});

describe('changing a reaction', () => {
  it('a howler a heavy hit knocks flat (PackHunter.hurtReaction)', () => {
    const r = parseBehaviour(
      [
        'class GlassJaw extends PackHunter {',
        '  hurtReaction(e) {',
        '    if ((e.how === "stagger")) {',
        '      log("Down it goes!");',
        '      return "knockdown";',
        '    }',
        '    return super.hurtReaction(e);',
        '  }',
        '}',
      ].join('\n'),
    );
    if ('error' in r) throw new Error(r.error.message);
    const g = { id: 'lg_glassjawaa', name: 'Glass jaw', scope: 'global', ...r } as LogicGraph;
    const { p, foe } = fight('howler', [0, 0], [g]);
    p.hitNpc(foe(), { power: 2, type: 'slash', attack: 'heavy' }, { knock: 2, stun: 0.3 });
    expect(p.hurtOf(foe())?.how).toBe('knockdown');
    expect(p.events.some((e) => e.msg.includes('Down it goes'))).toBe(true);
    // a light hit still flinches
    const b = fight('howler', [0, 0], [g]);
    b.p.hitNpc(b.foe(), { power: 1, type: 'slash', attack: 'light' }, { knock: 1, stun: 0.2 });
    expect(b.p.hurtOf(b.foe())?.how).toBe('flinch');
  });

  it('the React to a hit card: a cutscene knocks the hero over', () => {
    const r = parseCode('on("start", (e) => {\n  react("hero", "knockdown");\n});');
    if ('error' in r) throw new Error(r.error.message);
    const g = {
      id: 'lg_reactcarda',
      name: 'Knock over',
      scope: 'global',
      nodes: r.nodes,
      edges: r.edges,
    } as LogicGraph;
    const { p, steps } = fight('howler', [30, 30], [g]);
    steps(0.2);
    expect(p.hurtOf('hero')?.how).toBe('knockdown');
    expect(p.combat.stagger).toBeGreaterThan(0.5);
  });
});
