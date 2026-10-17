import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { COMBAT_CLIPS } from '../../src/builtin/clips/combat';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, type Character, Clip, paths } from '../../src/core/schema';
import { CHARGE_TIME, PARRY_WINDOW, SPIN_TIME } from '../../src/engine/runtime/combat';
import { PlaySession } from '../../src/engine/runtime/session';

/** P9b: kinds of attack, guarding (block, parry, stamina), moves and lock-on. */
const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
/** a 24 × 24 floor to fight on (a play area is as big as what stands on the ground) */
const floor: Asset = {
  ...crate,
  id: 'ast_yardfloor0' as Asset['id'],
  name: 'Yard floor',
  health: undefined,
  smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
  palette: { types: ['plate8x8'], colors: ['#5a8f3c'] },
  footprint: [24, 24],
  bricks: [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => [0, i * 8, 0, j * 8, 0, 0, 0] as Asset['bricks'][number])),
};

function game(opts: { shield?: boolean; held?: string } = {}) {
  const s = new ProjectStore(newProjectFiles({ name: 'Yard', random: () => 0.3 }));
  const bus = registerAll(new CommandBus(s));
  const map = s.manifest.entry.map;
  const hero: Character = {
    id: 'chr_heroaaaaaa' as Character['id'],
    name: 'Rowan',
    role: 'hero',
    profile: { name: 'Rowan', held: opts.held ?? 'Sword' },
    ...(opts.shield ? { gear: { offHand: 'Shield' as const } } : {}),
  };
  const r = bus.execute(
    [
      { type: 'asset.create', payload: { asset: floor } },
      { type: 'asset.place', payload: { map, asset: floor.id, pos: [-4, 0, -8] } },
      { type: 'character.create', payload: { character: hero } },
      { type: 'project.update', payload: { hero: hero.id } },
      { type: 'asset.create', payload: { asset: crate } },
      { type: 'asset.place', payload: { map, asset: crate.id, pos: [6, 1, 3] } },
    ],
    { source: 'user' },
  );
  expect(r.ok, r.error).toBe(true);
  const p = new PlaySession(s.snapshot());
  // the hero stands in front of the crate (which is at x 6..8, z 3..5), facing it (+z), the camera behind
  p.placeAt([6.5, 0.4, 1.6], 0);
  p.camYaw = Math.PI;
  return p;
}
const step = (p: PlaySession, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
};
const crateHp = (p: PlaySession) => {
  const c = p.world.instances.find((i) => i.def.name === 'Wooden crate')!;
  return p.health.peek(`i:${c.inst.id}`)?.hp ?? 2;
};

describe('combat clips', () => {
  it('every combat move is a valid clip in the Combat group', () => {
    for (const c of COMBAT_CLIPS) {
      expect(Clip.safeParse(c).success, c.name).toBe(true);
      expect(c.group).toBe('Combat');
    }
    expect(COMBAT_CLIPS.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Guard', 'Defend', 'Dodge roll', 'Side hop', 'Back flip', 'Spin attack', 'Plunge']),
    );
  });
});

describe('attacks', () => {
  it('a tap is a light attack; holding F charges (double power); holding longer spins', () => {
    const p = game({ held: 'None' });
    // light: bare hands do 1 of the crate's 2
    p.combat.press();
    p.combat.release();
    step(p, 0.8);
    expect(crateHp(p)).toBe(1);
    // charged: held past the charge time, bare hands hit for 2
    const q = game({ held: 'None' });
    q.combat.press();
    step(q, CHARGE_TIME + 0.05);
    expect(q.combat.anim.clip?.name).toBe('Charge');
    q.combat.release();
    step(q, 1);
    expect(crateHp(q)).toBe(0);
    // spin: held past the spin time, hits everything around
    const r = game({ held: 'None' });
    r.combat.press();
    step(r, SPIN_TIME + 0.05);
    r.combat.release();
    expect(r.combat.move?.kind).toBe('spin');
    step(r, 0.6);
    expect(crateHp(r)).toBe(0.5);
  });

  it('in the air: rising F is a jump attack, falling F a plunge that lands with a hit around', () => {
    const p = game();
    p.input.jump = true;
    step(p, 0.05);
    expect(p.heroState.vy).toBeGreaterThan(0);
    p.combat.press();
    expect(p.combat.move?.kind).toBe('jump');
    const q = game({ held: 'None' });
    q.input.jump = true;
    step(q, 0.5);
    expect(q.heroState.vy).toBeLessThanOrEqual(0);
    q.combat.press();
    expect(q.combat.move?.kind).toBe('plunge');
    step(q, 1);
    expect(q.combat.move).toBeNull();
    expect(crateHp(q)).toBe(0);
  });
});

describe('guarding', () => {
  it('a shield blocks hits from the front, parries just after it is raised, and not from behind', () => {
    const p = game({ shield: true });
    expect(p.lookup('hero.gear')).toBe('Sword + Shield');
    p.input.keys.add('q');
    step(p, 1 / 60);
    expect(p.combat.guard).toBe(true);
    expect(p.combat.anim.clip?.name).toBe('Guard');
    p.damage('hero', 1, 'slash', 'Wooden crate');
    expect(p.message).toBe('Parry!');
    expect(p.logic.vars.get('hp')).toBe(3);
    step(p, PARRY_WINDOW + 0.1);
    p.damage('hero', 1, 'slash', 'Wooden crate');
    expect(p.message).toBe('Blocked');
    expect(p.logic.vars.get('hp')).toBe(3);
    expect(p.combat.stamina).toBeLessThan(100);
    // from behind: the guard does not help
    p.placeAt([6.5, 0.4, 1.6], Math.PI);
    p.heroState.heading = Math.PI;
    p.damage('hero', 1, 'slash', 'Wooden crate');
    expect(p.logic.vars.get('hp')).toBe(2);
  });

  it('blocks use stamina; at zero the guard breaks and the hero staggers', () => {
    const p = game({ shield: true });
    p.input.keys.add('q');
    step(p, PARRY_WINDOW + 0.2);
    for (let i = 0; i < 10 && p.combat.guard; i++) p.damage('hero', 1, 'slash', 'Wooden crate');
    expect(p.combat.guard).toBe(false);
    expect(p.combat.stagger).toBeGreaterThan(0);
    expect(p.message).toBe('Your guard broke!');
    // stamina comes back once the guard is down
    p.input.keys.delete('q');
    step(p, 3);
    expect(p.combat.stamina).toBeGreaterThan(50);
  });

  it('without a shield the hero defends: half the damage gets through', () => {
    const p = game();
    p.input.keys.add('q');
    step(p, PARRY_WINDOW + 0.2);
    expect(p.combat.anim.clip?.name).toBe('Defend');
    p.damage('hero', 2, 'slash', 'Wooden crate');
    expect(p.logic.vars.get('hp')).toBe(2);
  });
});

describe('moves and lock-on', () => {
  it('a dodge roll moves the hero and avoids a hit at its start', () => {
    const p = game();
    const z0 = p.heroState.z;
    p.combat.roll();
    expect(p.combat.move?.kind).toBe('roll');
    p.damage('hero', 1, 'slash', 'Wooden crate');
    expect(p.logic.vars.get('hp')).toBe(3);
    step(p, 0.5);
    expect(p.combat.move).toBeNull();
    expect(Math.abs(p.heroState.z - z0)).toBeGreaterThan(0.5);
  });

  it('Z locks on to the crate in front; the hero faces it; Space + A side-hops, Space + S back-flips', () => {
    const p = game();
    p.combat.toggleLock();
    expect(p.combat.target?.kind).toBe('inst');
    p.heroState.heading = 2;
    step(p, 1 / 60);
    expect(Math.abs(p.heroState.heading)).toBeLessThan(0.3);
    expect(p.combat.lockedJump(-1, 0)).toBe(true);
    expect(p.combat.move?.kind).toBe('hop');
    step(p, 0.6);
    expect(p.combat.lockedJump(0, -1)).toBe(true);
    expect(p.combat.move?.kind).toBe('flip');
    step(p, 0.8);
    p.combat.toggleLock();
    expect(p.combat.target).toBeNull();
  });

  it('the hero’s off hand is saved with the character and shown in Play', () => {
    const p = game({ shield: true });
    expect(p.hero.offHand).toBe('Shield');
    expect(game().hero.offHand).toBe('None');
    expect(paths.character('chr_heroaaaaaa')).toBe('characters/chr_heroaaaaaa.json');
  });
});
