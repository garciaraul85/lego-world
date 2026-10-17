import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { BREAKABLE_PRESETS, damageOf, heldAttack } from '../../src/core/combat/damage';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, type Character, type Instances, paths } from '../../src/core/schema';
import { PlaySession } from '../../src/engine/runtime/session';
import { graph } from './logic-helpers';

/** P9a: health on anything, hits that break things over time, damage types and resistances. */
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
const castle = BUILTIN_ASSETS.find((a) => a.name === 'Castle wall')!;

describe('damage', () => {
  it('power × resistance − armour, never below zero; invulnerable takes nothing', () => {
    expect(damageOf({ power: 2, type: 'slash' }, {})).toBe(2);
    expect(damageOf({ power: 2, type: 'slash' }, { armor: 1 })).toBe(1);
    expect(damageOf({ power: 1, type: 'blunt' }, { armor: 2 })).toBe(0);
    expect(damageOf({ power: 1, type: 'fire' }, { resist: { fire: 2 } })).toBe(2);
    expect(damageOf({ power: 3, type: 'blunt' }, BREAKABLE_PRESETS.stone!.health)).toBe(0);
    expect(damageOf({ power: 3, type: 'explosive' }, BREAKABLE_PRESETS.stone!.health)).toBe(3);
    expect(damageOf({ power: 5, type: 'slash' }, { invulnerable: true })).toBe(0);
  });

  it('the hero hits with what it holds (a sword slashes for 2, bare hands 1)', () => {
    expect(heldAttack('Sword')).toEqual({ power: 2, type: 'slash' });
    expect(heldAttack('None')).toEqual({ power: 1, type: 'blunt' });
    expect(heldAttack('Guitar')).toEqual({ power: 1, type: 'blunt' });
  });
});

function game(extra: { assets?: Asset[]; graphs?: ReturnType<typeof graph>[] } = {}) {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const r = bus.execute(
    [
      { type: 'asset.create', payload: { asset: crate } },
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [-2, 0, 3] } },
      ...(extra.assets ?? []).flatMap((a, i) => [
        { type: 'asset.create', payload: { asset: a } },
        { type: 'asset.place', payload: { map, asset: a.id, pos: [8 + i * 6, 0, 8] } },
      ]),
      ...(extra.graphs ?? []).map((g) => ({ type: 'logic.create', payload: { graph: g } })),
    ],
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  return { s, map, play: () => new PlaySession(s.snapshot()) };
}
const named = (play: PlaySession, n: string) => play.world.instances.find((i) => i.def.name === n)!;

describe('health in play', () => {
  it('the crate takes two hits: the first leaves 1 of 2, the second breaks it and it is defeated', () => {
    const { play } = game({
      graphs: [
        graph(
          [
            ['event.onDamaged', {}],
            ['misc.log', { value: 'hurt' }],
            ['event.onDefeated', {}],
            ['misc.log', { value: 'down' }],
          ],
          [
            [1, 'then', 2, 'in'],
            [3, 'then', 4, 'in'],
          ],
        ),
      ],
    });
    const p = play();
    const c = named(p, 'Wooden crate');
    const bricks = p.world.pieces.length;
    p.hitInstance(c, heldAttack('Hammer'));
    p.runtime.stepOnce();
    expect(p.health.peek(`i:${c.inst.id}`)?.hp).toBe(1);
    expect(p.world.pieces.length).toBe(bricks);
    p.hitInstance(c, heldAttack('Hammer'));
    p.runtime.stepOnce();
    expect(p.health.peek(`i:${c.inst.id}`)?.hp).toBe(0);
    expect(p.world.pieces.length).toBeLessThan(bricks);
    const logs = p.events.map((e) => e.msg).join('\n');
    expect(logs).toMatch(/Logic: hurt/);
    expect(logs).toMatch(/Logic: down/);
    // a sword (power 2) breaks a fresh crate in one hit
    const p2 = play();
    p2.hitInstance(named(p2, 'Wooden crate'), heldAttack('Sword'));
    expect(p2.world.pieces.length).toBeLessThan(bricks);
  });

  it('a stone wall only breaks to explosive damage; the message says what hurts it', () => {
    const wall: Asset = {
      ...castle,
      id: 'ast_stonewall0' as Asset['id'],
      name: 'Stone wall',
      health: BREAKABLE_PRESETS.stone!.health,
    };
    const p = game({ assets: [wall] }).play();
    const w = named(p, 'Stone wall');
    p.hitInstance(w, heldAttack('Sledgehammer'));
    expect(p.health.peek(`i:${w.inst.id}`)?.hp).toBe(3);
    expect(p.message).toMatch(/only explosive hurts it/);
    p.damage('Stone wall', 3, 'explosive');
    expect(p.health.peek(`i:${w.inst.id}`)?.hp).toBe(0);
  });

  it('logic damages, heals and protects the hero (its hearts) and objects', () => {
    const p = game({
      graphs: [
        graph(
          [
            ['event.onStart', {}],
            ['health.damage', { target: 'hero', amount: 1, type: 'blunt' }],
          ],
          [[1, 'then', 2, 'in']],
        ),
      ],
    }).play();
    p.runtime.stepOnce();
    expect(p.logic.vars.get('hp')).toBe(2);
    p.heal('hero', 5);
    expect(p.logic.vars.get('hp')).toBe(3);
    p.setInvulnerable('hero', true);
    p.damage('hero', 2, 'slash');
    expect(p.logic.vars.get('hp')).toBe(3);
    p.setInvulnerable('Wooden crate', true);
    p.damage('Wooden crate', 5, 'slash');
    expect(p.health.peek(`i:${named(p, 'Wooden crate').inst.id}`)?.hp).toBe(2);
  });

  it('at zero an object leaves its item and sends its event', () => {
    const loot: Asset = {
      ...crate,
      id: 'ast_lootcrate0' as Asset['id'],
      name: 'Loot crate',
      health: { hp: 1, atZero: { break: true, drop: { item: 'coin', count: 3 }, emit: 'crate-broken' } },
    };
    const p = game({
      assets: [loot],
      graphs: [
        graph(
          [
            ['event.onCustom', { event: 'crate-broken' }],
            ['misc.log', { value: 'sent' }],
          ],
          [[1, 'then', 2, 'in']],
        ),
      ],
    }).play();
    p.damage('Loot crate', 1, 'blunt');
    p.runtime.stepOnce();
    expect(p.inventory.get('coin')).toBe(3);
    expect(p.events.some((e) => /Logic: sent/.test(e.msg))).toBe(true);
  });

  it('neighbours: hits do nothing unless “Can be harmed” is on; at zero they leave the play', () => {
    const { s, map, play } = game();
    const chr: Character = {
      id: 'chr_guardaaaaa' as Character['id'],
      name: 'Guard',
      role: 'npc',
      profile: { name: 'Guard' },
      harm: { canBeHarmed: true, health: { hp: 2, atZero: { break: false, drop: { item: 'key', count: 1 } } } },
    };
    const inst = s.get<Instances>(paths.instances(map))!;
    s.put(paths.character(chr.id), chr);
    s.put(paths.instances(map), {
      ...inst,
      npcsSaved: true,
      items: [
        ...inst.items,
        {
          id: 'ins_guardaaaaa',
          kind: 'npc',
          character: chr.id,
          legacyId: 7,
          biome: 'prairie',
          role: 'guard',
          state: { x: 2, y: 0.4, z: 2, heading: 0 },
        },
      ],
    } as Instances);
    const p = play();
    const guard = p.world.npcs.find((n) => n.id === 7);
    expect(guard, 'the neighbour is in the play').toBeTruthy();
    p.damage('Guard', 1, 'slash');
    expect(p.health.peek('n:7')?.hp).toBe(1);
    p.damage('Guard', 1, 'slash');
    expect(p.world.npcs.some((n) => n.id === 7)).toBe(false);
    expect(p.inventory.get('key')).toBe(1);
    // a villager (no “Can be harmed”) shrugs it off
    s.put(paths.character(chr.id), { ...chr, harm: { ...chr.harm!, canBeHarmed: false } });
    const p2 = play();
    p2.damage('Guard', 5, 'slash');
    expect(p2.world.npcs.some((n) => n.id === 7)).toBe(true);
    expect(p2.message).toMatch(/can’t be harmed/);
  });
});

describe('health in code', () => {
  it('on("damaged") and health.damage / heal / setInvulnerable parse and print back', async () => {
    const { parseCode } = await import('../../src/core/logic/code/parse');
    const { printGraph } = await import('../../src/core/logic/code/print');
    const code =
      'on("damaged", { asset: "Wooden crate" }, (e) => {\n  health.heal("hero", 1);\n});\n\non("defeated", {}, (e) => {\n  health.damage("hero", 2, "fire");\n  health.setInvulnerable("hero", true);\n});\n';
    const r = parseCode(code);
    if ('error' in r) throw new Error(JSON.stringify(r.error));
    const g = r;
    expect(g.nodes.map((n) => n.type)).toEqual(
      expect.arrayContaining([
        'event.onDamaged',
        'event.onDefeated',
        'health.heal',
        'health.damage',
        'health.setInvulnerable',
      ]),
    );
    expect(printGraph(g as never).code).toContain('health.damage("hero", 2, "fire")');
  });
});
