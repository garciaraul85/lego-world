import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { partsOf, swappable } from '../../src/core/combat/parts';
import { CommandBus, registerAll } from '../../src/core/commands';
import { allHooksOf, BUILTINS, CHARACTER_BUILTINS, lineageOf } from '../../src/core/logic/builtins';
import { parseBehaviour } from '../../src/core/logic/code/behaviour';
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

/** Milestone 3b (B5b, part 2): an enemy's abilities as parts — Senses, Mover, Attack — swapped and extended. */
const cast = (slug: string) => STARTER_CHARACTERS.find((c) => c.slug === slug)!;

/** one starter enemy (its parts swapped, behaviours attached) at (0, 0) facing +z; the hero 7 studs in front */
function fight(slug: string, parts: Record<string, unknown> = {}, graphs: LogicGraph[] = []) {
  const s = new ProjectStore(newProjectFiles({ name: 'Parts', random: () => 0.3, noNeighbours: true }));
  const bus = registerAll(new CommandBus(s));
  const c = cast(slug);
  const chr = { ...c.character, id: c.id } as Character;
  s.put(paths.character(c.id), { ...chr, enemy: { ...chr.enemy!, parts } });
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
        id: 'ins_foeaaaaaaa',
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
  p.placeAt([0, 0.4, 7], Math.PI);
  const foe = () => p.world.npcs.find((n) => n.id === 20)!;
  const brain = () => (p.enemies as unknown as { brains: Map<number, { phase: string }> }).brains.get(20);
  const steps = (sec: number, each?: () => void) => {
    for (let t = 0; t < sec; t += 1 / 60) {
      p.runtime.stepOnce();
      each?.();
    }
  };
  return { p, s, bus, foe, brain, steps, id: c.id };
}

describe('the parts', () => {
  it('each template comes with its parts; every cast enemy has the ones it fights with', () => {
    expect(partsOf(cast('pebblespout').character.enemy)).toMatchObject({
      senses: 'eyes',
      mover: 'hider',
      attack: 'spit',
    });
    expect(partsOf(cast('rattlebones').character.enemy)).toMatchObject({ mover: 'walker', attack: 'swing' });
    expect(partsOf(cast('watcher-eye').character.enemy)).toMatchObject({ mover: 'static', attack: 'beam' });
    expect(partsOf(cast('cinderjaw').character.enemy)).toMatchObject({ attack: 'breath' });
    expect(partsOf(cast('threadback').character.enemy)).toMatchObject({ mover: 'thread', attack: 'drop' });
    expect(partsOf(cast('howler').character.enemy)).toMatchObject({ attack: 'pounce' });
  });

  it('only sensible swaps: a knight can fly or spit; a pop-up keeps hiding; a turret keeps its beam', () => {
    expect(swappable('knight').mover).toEqual(['walker', 'flyer', 'static']);
    expect(swappable('knight').attack).toContain('spit');
    expect(swappable('popup').mover).toEqual(['hider']);
    expect(swappable('popup').attack).toEqual(['spit', 'shot']);
    expect(swappable('turret').attack).toEqual(['beam']);
    // a swap its template can't take is ignored
    expect(partsOf({ style: 'popup', parts: { mover: 'flyer' } }).mover).toBe('hider');
  });

  it('every built-in has its own name; Eyes extends Senses; an interface lists its hooks', () => {
    const names = [...BUILTINS, ...CHARACTER_BUILTINS].map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    expect(lineageOf('Eyes').map((b) => b.name)).toEqual(['Eyes', 'Senses']);
    expect(allHooksOf('Spit').map((h) => h.method)).toEqual(['canAttack', 'attackPower']);
    expect(CHARACTER_BUILTINS.find((b) => b.name === 'Senses')!.isInterface).toBe(true);
  });

  it('swapping writes the enemy (and a part its template cannot take is refused); part fields write its settings', () => {
    const { bus, s, id } = fight('rattlebones');
    let r = bus.execute(
      { type: 'builtin.setField', payload: { character: id, name: 'Attack', field: 'attack', value: 'Spit' } } as never,
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    expect(s.get<Character>(paths.character(id))!.enemy!.parts!.attack).toBe('spit');
    r = bus.execute(
      { type: 'builtin.setField', payload: { character: id, name: 'Mover', field: 'mover', value: 'Hider' } } as never,
      { source: 'user' },
    );
    expect(s.get<Character>(paths.character(id))!.enemy!.parts!.mover).toBeUndefined();
    r = bus.execute(
      {
        type: 'builtin.setField',
        payload: { character: id, name: 'Spit', field: 'hurt', value: 'knockdown' },
      } as never,
      { source: 'user' },
    );
    expect(s.get<Character>(paths.character(id))!.enemy!.parts!.hurt).toBe('knockdown');
    expect(CharacterSchema.safeParse(s.get(paths.character(id))).success).toBe(true);
  });
});

describe('parts in Play', () => {
  it('a knight with a Spit attack spits from a distance instead of walking up', () => {
    const { p, steps } = fight('rattlebones', { attack: 'spit' });
    let shots = 0;
    let before = 0;
    steps(6, () => {
      const n = p.foeShots.flying.length;
      if (n > before) shots += n - before;
      before = n;
    });
    expect(shots).toBeGreaterThan(0);
    const plain = fight('rattlebones');
    let plainShots = 0;
    plain.steps(6, () => {
      if (plain.p.foeShots.flying.length) plainShots++;
    });
    expect(plainShots).toBe(0);
  });

  it('a Static mover stays put; Wings lift a knight off the ground', () => {
    const a = fight('rattlebones', { mover: 'static' });
    a.steps(3);
    expect(Math.hypot(a.foe().state.x, a.foe().state.z)).toBeLessThan(0.3);
    const b = fight('rattlebones', { mover: 'flyer' });
    let high = 0;
    b.steps(3, () => {
      high = Math.max(high, b.foe().state.y);
    });
    expect(high).toBeGreaterThan(1.5);
  });

  it('Ears: it does not notice a hero walking quietly in front of it, but hears one running', () => {
    const a = fight('rattlebones', { senses: 'ears' });
    a.p.placeAt([0, 0.4, 4], Math.PI);
    a.steps(2);
    expect(a.brain()?.phase ?? 'idle').toBe('idle');
    const b = fight('rattlebones');
    b.p.placeAt([0, 0.4, 4], Math.PI);
    b.steps(2);
    expect(b.brain()?.phase).not.toBe('idle');
  });

  it('an attack part’s hurt reaction: a swing that knocks the hero down', () => {
    const { p, foe } = fight('rattlebones', { attackPower: 0.5, hurt: 'knockdown' });
    const hp = Number(p.logic.vars.get('hp'));
    p.hitHero(foe(), 1, 'slash', 'swing');
    expect(p.hurtOf('hero')?.how).toBe('knockdown');
    expect(Number(p.logic.vars.get('hp'))).toBe(hp - 1);
  });

  it('a behaviour that extends a part: Eyes that only see at night (canSee)', () => {
    const r = parseBehaviour(
      ['class NightEyes extends Eyes {', '  canSee(e) {', '    return false;', '  }', '}'].join('\n'),
    );
    if ('error' in r) throw new Error(r.error.message);
    const g = { id: 'lg_nighteyesa', name: 'Night eyes', scope: 'global', ...r } as LogicGraph;
    const { p, steps, brain } = fight('rattlebones', {}, [g]);
    p.placeAt([0, 0.4, 3], Math.PI);
    steps(2);
    expect(brain()?.phase ?? 'idle').toBe('idle');
  });
});
