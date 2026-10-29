import { describe, expect, it } from 'vitest';
import { BUILTIN_BODY_PLANS, builtinBodyPlan } from '../../src/builtin/bodyplans';
import { BUILTIN_CHARACTERS, STARTER_CHARACTERS } from '../../src/builtin/characters';
import { checkPlan } from '../../src/core/character/body';
import { minifigExtras, resolveBody } from '../../src/core/character/resolve';
import { parseScript } from '../../src/core/dialogue/script';
import { Character } from '../../src/core/schema';

/** step 11, 4a: the adventure starter pack's cast */
describe('the starter cast', () => {
  it('a hero, ten neighbours and ten kinds of enemy, all valid built-in characters', () => {
    const by = (g: string) => STARTER_CHARACTERS.filter((c) => c.group === g);
    expect(by('hero')).toHaveLength(1);
    expect(by('npc')).toHaveLength(10);
    // ten kinds (the bat comes plain, fire and ice)
    expect(new Set(by('enemy').map((c) => c.slug.split('-')[0])).size).toBe(10);
    for (const c of STARTER_CHARACTERS) {
      expect(() => Character.parse({ ...c.character, id: c.id })).not.toThrow();
      expect(BUILTIN_CHARACTERS.some((b) => b.id === c.id)).toBe(true);
    }
  });
  it('every enemy can be harmed, fights, and has a weakness', () => {
    for (const c of STARTER_CHARACTERS.filter((x) => x.group === 'enemy')) {
      const h = c.character.harm!;
      expect(h.canBeHarmed, c.slug).toBe(true);
      expect(c.character.enemy, c.slug).toBeTruthy();
      const weak =
        Object.values(h.health.resist ?? {}).some((v) => v > 1) ||
        Object.values(h.health.sides ?? {}).some((v) => v > 1) ||
        (h.health.stunBy?.length ?? 0) > 0 ||
        h.health.hp <= 2;
      expect(weak, `${c.slug} has a weakness`).toBe(true);
    }
  });
  it('the creature bodies are valid built-in body plans and resolve without the project', () => {
    expect(BUILTIN_BODY_PLANS.length).toBeGreaterThanOrEqual(8);
    for (const p of BUILTIN_BODY_PLANS) expect(checkPlan(p), p.name).toEqual([]);
    for (const c of STARTER_CHARACTERS.filter((x) => x.character.body?.plan)) {
      expect(builtinBodyPlan(c.character.body!.plan!), c.slug).toBeTruthy();
      const body = resolveBody(c.character.body, () => undefined);
      expect(body?.bricks.length, c.slug).toBeGreaterThan(3);
    }
    // the ghost is see-through, the turret's eye glows
    const ghost = resolveBody(
      STARTER_CHARACTERS.find((c) => c.slug === 'lanternwisp')!.character.body,
      () => undefined,
    )!;
    expect(ghost.bricks.some((b) => (b.alpha ?? 1) < 1)).toBe(true);
    const eye = resolveBody(STARTER_CHARACTERS.find((c) => c.slug === 'watcher-eye')!.character.body, () => undefined)!;
    expect(eye.bricks.some((b) => b.glow)).toBe(true);
  });
  it('the wolf-man and the fish-folk are minifigs with extra parts', () => {
    for (const slug of ['howler', 'finspitter']) {
      const c = STARTER_CHARACTERS.find((x) => x.slug === slug)!;
      expect(resolveBody(c.character.body, () => undefined)).toBeNull();
      expect(minifigExtras(c.character.body).length).toBeGreaterThan(2);
    }
  });
  it('every neighbour has a sample conversation that reads without mistakes', () => {
    for (const c of STARTER_CHARACTERS.filter((x) => x.group === 'npc')) {
      expect(c.script, c.slug).toBeTruthy();
      const { errors } = parseScript(c.script!, { id: 'dlg_0000000000', name: c.character.name });
      expect(errors, c.slug).toEqual([]);
    }
  });
});

import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Instances, paths } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { PlaySession } from '../../src/engine/runtime/session';

describe('the starter cast in Play', () => {
  function withFoe(slug: string) {
    const s = new ProjectStore(newProjectFiles({ name: 'Shrine', random: () => 0.3 }));
    registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const foe = STARTER_CHARACTERS.find((c) => c.slug === slug)!;
    const inst = s.get<Instances>(paths.instances(map))!;
    s.put(paths.instances(map), {
      ...inst,
      npcsSaved: true,
      items: [
        ...inst.items,
        {
          id: 'ins_foeaaaaaaa',
          kind: 'npc',
          character: foe.id,
          legacyId: 9,
          biome: 'prairie',
          role: 'guard',
          state: { x: 2, y: 0.4, z: 2, heading: 0 },
        },
      ],
    } as Instances);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    return { p, name: foe.character.name };
  }
  it('Rattlebones blocks most of a hit from the front and takes double from behind', () => {
    const { p, name } = withFoe('rattlebones');
    const n = p.world.npcs.find((x) => x.id === 9)!;
    expect(n, 'a built-in character stands in the play').toBeTruthy();
    // in front of it (it faces +z)
    p.placeAt([2, 0.4, 5], Math.PI);
    n.state.heading = 0;
    p.damage(name, 2, 'slash');
    expect(p.health.peek('n:9')?.hp).toBe(5.5);
    // behind it
    p.placeAt([2, 0.4, -1], 0);
    n.state.heading = 0;
    p.damage(name, 2, 'slash');
    expect(p.health.peek('n:9')?.hp).toBe(1.5);
  });
  it('the Watcher Eye shrugs off a sword, and a bomb does double', () => {
    const { p, name } = withFoe('watcher-eye');
    p.placeAt([2, 0.4, -1], 0);
    p.damage(name, 2, 'slash');
    expect(p.health.peek('n:9')?.hp ?? 3).toBe(3);
    p.damage(name, 1, 'explosive');
    expect(p.health.peek('n:9')?.hp).toBe(1);
  });
});
