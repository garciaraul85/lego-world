import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { BUILTIN_CLIPS } from '../../src/builtin/clips';
import { MOVE_CLIPS, MOVE_FOR } from '../../src/builtin/clips/moves';
import { clipRate, pickState, STATE_DEFAULTS, stateRule } from '../../src/core/character/states';
import { ENEMY_PRESETS } from '../../src/core/combat/enemy';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Asset, Character, Clip, type Instances, paths } from '../../src/core/schema';
import { actAmount, bodyWorld, newMotion } from '../../src/engine/character/body-anim';
import {
  addPose,
  easeAt,
  easePose,
  mirrorPose,
  movedJoints,
  movePose,
  poseAt,
  poseTimes,
  removePose,
  restOf,
  setPose,
} from '../../src/engine/character/posing';
import { StateMachine } from '../../src/engine/character/states';
import { PlaySession } from '../../src/engine/runtime/session';

/** P23 part 4: animation by posing, and the animation state machine. */
const blank = (): Clip => ({ id: 'clp_posetest01', name: 'Wave hello', length: 2, loop: true, tracks: [], events: [] });
const val = (c: Clip, key: string, t: number) => poseAt(c, t)[key] ?? restOf(key);

describe('posing', () => {
  it('a joint set in a pose gets a track that stands still at the other poses; the motion between is filled in', () => {
    let c = setPose(blank(), 0, { 'head.turn': 0 });
    c = setPose(c, 2, { 'head.turn': 0 });
    c = setPose(c, 1, { 'rightArm.z': 2.6 });
    expect(poseTimes(c)).toEqual([0, 1, 2]);
    // the arm is at rest in the first and last poses, up in the middle one, and on its way between
    expect(val(c, 'rightArm.z', 0)).toBeCloseTo(restOf('rightArm.z'));
    expect(val(c, 'rightArm.z', 1)).toBeCloseTo(2.6);
    expect(val(c, 'rightArm.z', 2)).toBeCloseTo(restOf('rightArm.z'));
    const half = val(c, 'rightArm.z', 0.5);
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(2.5);
    expect(Clip.safeParse(c).success).toBe(true);
  });
  it('a pose added between two poses keeps the in-between (nothing moves) and keys every track', () => {
    let c = setPose(blank(), 0, { 'rightArm.z': 0.06 });
    c = setPose(c, 2, { 'rightArm.z': 2 });
    const before = poseAt(c, 0.7);
    c = addPose(c, 0.7);
    expect(poseTimes(c)).toEqual([0, 0.7, 2]);
    expect(poseAt(c, 0.7)['rightArm.z']).toBeCloseTo(before['rightArm.z']!);
    // changing a joint between poses first makes a pose there
    c = setPose(c, 1.5, { 'head.turn': 0.5 });
    expect(poseTimes(c)).toEqual([0, 0.7, 1.5, 2]);
    expect(c.tracks.every((t) => t.keys.some((k) => Math.abs(k[0] - 1.5) < 1e-3))).toBe(true);
  });
  it('poses are moved, eased, mirrored and taken out as a whole', () => {
    // an empty clip: a pose keys every joint where it stands
    let c = addPose(addPose(blank(), 0), 2);
    expect(poseTimes(c)).toEqual([0, 2]);
    c = setPose(c, 1, { 'rightArm.z': 2.6, 'head.turn': 0.3, 'leftLeg.x': -0.8 });
    expect(easeAt(c, 0)).toBe('easeInOut');
    c = easePose(c, 0, 'step');
    expect(easeAt(c, 0)).toBe('step');
    // a held pose: the first pose holds until the next
    expect(val(c, 'rightArm.z', 0.9)).toBeCloseTo(restOf('rightArm.z'));
    // mirror: the right arm's raise goes to the left arm (out to the other side), the head turns the other way
    const m = mirrorPose(c, 1);
    expect(val(m, 'leftArm.z', 1)).toBeCloseTo(-2.6);
    expect(val(m, 'rightArm.z', 1)).toBeCloseTo(-restOf('leftArm.z'));
    expect(val(m, 'head.turn', 1)).toBeCloseTo(-0.3);
    expect(val(m, 'rightLeg.x', 1)).toBeCloseTo(-0.8);
    // moved onto another pose: refused; elsewhere: it goes there
    expect(movePose(c, 1, 2)).toBe(c);
    expect(poseTimes(movePose(c, 1, 1.4))).toEqual([0, 1.4, 2]);
    const gone = removePose(c, 1);
    expect(poseTimes(gone)).toEqual([0, 2]);
    expect(val(gone, 'rightArm.z', 1)).toBeCloseTo(restOf('rightArm.z'));
    // copy keeps only what differs from standing
    expect(Object.keys(movedJoints(poseAt(c, 1))).sort()).toEqual(['head.turn', 'leftLeg.x', 'rightArm.z']);
  });
  it('the built-in moves are made of whole poses and are valid clips', () => {
    expect(MOVE_CLIPS.map((c) => c.name)).toEqual(['Walk', 'Run', 'Jump', 'Swing', 'Flinch', 'Breathe']);
    for (const c of MOVE_CLIPS) {
      expect(Clip.safeParse(c).success, c.name).toBe(true);
      expect(BUILTIN_CLIPS.some((b) => b.id === c.id)).toBe(true);
      const times = poseTimes(c);
      expect(
        c.tracks.every((t) => t.keys.length === times.length),
        c.name,
      ).toBe(true);
    }
    // a walk swings each leg forward in turn
    const walk = MOVE_CLIPS[0]!;
    expect(val(walk, 'leftLeg.x', 0)).toBeLessThan(0);
    expect(val(walk, 'leftLeg.x', 0.4)).toBeGreaterThan(0);
    expect(Object.values(MOVE_FOR).every((id) => MOVE_CLIPS.some((c) => c.id === id))).toBe(true);
  });
});

describe('the animation state machine', () => {
  const at = (o: Partial<Parameters<typeof pickState>[0]>) =>
    pickState({ speed: 0, grounded: true, attacking: false, hurtAgo: Infinity, ...o }, undefined);
  it('picks the first rule that holds: hurt, attack, jump, run, walk, idle', () => {
    expect(at({})).toBe('idle');
    expect(at({ speed: 3 })).toBe('walk');
    expect(at({ speed: 7.8 })).toBe('run');
    expect(at({ speed: 7.8, grounded: false })).toBe('jump');
    expect(at({ speed: 3, attacking: true, grounded: false })).toBe('attack');
    expect(at({ attacking: true, hurtAgo: 0.1 })).toBe('hurt');
    expect(at({ hurtAgo: 1 })).toBe('idle');
    expect(pickState({ speed: 5, grounded: true, attacking: false, hurtAgo: Infinity }, { runAt: 4 })).toBe('run');
    expect(stateRule('run', { runAt: 4 })).toMatch(/4 studs/);
  });
  it('walk and run clips play with the speed (between half and double)', () => {
    expect(clipRate('walk', 4, undefined)).toBe(1);
    expect(clipRate('walk', 2, undefined)).toBe(0.5);
    expect(clipRate('run', 30, undefined)).toBe(2);
    expect(clipRate('walk', 2, { matchSpeed: false })).toBe(1);
    expect(clipRate('idle', 0, undefined)).toBe(1);
  });
  it('each state plays its clip (attack once), crossfading; an emote plays while standing and stops on moving', () => {
    const clip = (id: string) => MOVE_CLIPS.find((c) => c.id === id);
    const sheet: Record<string, string> = { walk: MOVE_FOR.walk, attack: MOVE_FOR.attack };
    const sm = new StateMachine();
    const step = (o: Partial<Parameters<typeof pickState>[0]>, dt = 0.05) =>
      sm.step(
        { speed: 0, grounded: true, attacking: false, hurtAgo: Infinity, ...o },
        undefined,
        (s) => (sheet[s] ? clip(sheet[s]!) : undefined),
        dt,
      );
    step({});
    expect(sm.anim.clip).toBeNull();
    step({ speed: 3 });
    expect([sm.state, sm.anim.clip?.name]).toEqual(['walk', 'Walk']);
    expect(sm.playingState).toBe(true);
    step({ speed: 3, attacking: true });
    expect([sm.state, sm.anim.clip?.name]).toEqual(['attack', 'Swing']);
    // the swing plays once, then the built-in motion shows while it still attacks
    for (let i = 0; i < 14; i++) step({ attacking: true });
    expect(sm.anim.clip).toBeNull();
    step({});
    expect(sm.state).toBe('idle');
    // an emote goes on while standing, and stops when the character walks
    const wave = BUILTIN_CLIPS.find((c) => c.name === 'Wave')!;
    sm.play(wave);
    step({});
    expect(sm.anim.clip?.name).toBe('Wave');
    step({ speed: 3 });
    expect(sm.anim.clip?.name).toBe('Walk');
    // the idle clip waits until the character has stood a moment
    sheet.idle = MOVE_FOR.idle;
    const idle = (dt: number) =>
      sm.step(
        { speed: 0, grounded: true, attacking: false, hurtAgo: Infinity },
        undefined,
        (s) => (sheet[s] ? clip(sheet[s]!) : undefined),
        dt,
        1.5,
      );
    idle(0.5);
    expect(sm.anim.clip).toBeNull();
    for (let i = 0; i < 16; i++) idle(0.1);
    expect(sm.anim.clip?.name).toBe('Breathe');
  });
  it('a body plan strikes and flinches: the body lunges forward or rocks back', () => {
    const m = newMotion();
    expect(actAmount(m, 'attack')).toBe(0);
    m.act = { kind: 'attack', u: 0.3 };
    expect(actAmount(m, 'attack')).toBeCloseTo(1);
    expect(actAmount(m, 'hurt')).toBe(0);
    const body = { move: 'walk' as const, hover: 0, scale: 1 };
    const rest = bodyWorld(body, { x: 0, y: 0, z: 0, heading: 0 }, newMotion());
    const lunge = bodyWorld(body, { x: 0, y: 0, z: 0, heading: 0 }, m);
    expect(lunge[14]! - rest[14]!).toBeGreaterThan(0.3);
  });
  it('a character keeps its state numbers', () => {
    expect(STATE_DEFAULTS.runAt).toBe(6);
    const ok = Character.shape.states.safeParse({ runAt: 5, hurtFor: 0.6, matchSpeed: false });
    expect(ok.success).toBe(true);
    expect(Character.shape.states.safeParse({ runAt: 0 }).success).toBe(false);
  });
});

describe('states in Play', () => {
  const crate = BUILTIN_ASSETS.find((a) => a.name === 'Wooden crate')!;
  const floor: Asset = {
    ...crate,
    id: 'ast_yardfloor0' as Asset['id'],
    name: 'Yard floor',
    health: undefined,
    smash: { enabled: false, rebuild: false, sound: null, studs: 0 },
    palette: { types: ['plate8x8'], colors: ['#5a8f3c'] },
    footprint: [32, 32],
    bricks: [0, 1, 2, 3].flatMap((i) =>
      [0, 1, 2, 3].map((j) => [0, i * 8, 0, j * 8, 0, 0, 0] as Asset['bricks'][number]),
    ),
  };
  function arena(withGrunt = true) {
    const s = new ProjectStore(newProjectFiles({ name: 'States', random: () => 0.3 }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const hero: Character = {
      id: 'chr_heroaaaaaa' as Character['id'],
      name: 'Rowan',
      role: 'hero',
      profile: { name: 'Rowan', held: 'Sword' },
      animations: { walk: MOVE_FOR.walk, run: MOVE_FOR.run, hurt: MOVE_FOR.hurt },
    };
    const preset = ENEMY_PRESETS.grunt!;
    const grunt: Character = {
      id: 'chr_gruntaaaaa' as Character['id'],
      name: 'Grunt',
      role: 'npc',
      profile: { name: 'Grunt' },
      harm: { canBeHarmed: true, health: preset.health },
      enemy: { ...preset.enemy, windup: 0.4, cooldown: 1 },
      animations: { attack: MOVE_FOR.attack, walk: MOVE_FOR.walk },
    };
    const r = bus.execute(
      [
        { type: 'asset.create', payload: { asset: floor } },
        { type: 'asset.place', payload: { map, asset: floor.id, pos: [-4, 0, -8] } },
        { type: 'character.create', payload: { character: hero } },
        { type: 'project.update', payload: { hero: hero.id } },
      ],
      { source: 'user' },
    );
    expect(r.ok, r.error).toBe(true);
    const inst = s.get<Instances>(paths.instances(map))!;
    s.put(paths.character(grunt.id), grunt);
    s.put(paths.instances(map), {
      ...inst,
      npcsSaved: true,
      items: [
        ...inst.items,
        ...(withGrunt
          ? [
              {
                id: 'ins_gruntaaaaa',
                kind: 'npc',
                character: grunt.id,
                legacyId: 11,
                biome: 'prairie',
                role: 'guard',
                state: { x: 2, y: 0.4, z: 12, heading: Math.PI },
              },
            ]
          : []),
      ],
    } as Instances);
    const p = new PlaySession(s.snapshot());
    p.placeAt([2, 0.4, 4], 0);
    p.camYaw = Math.PI;
    return p;
  }
  const step = (p: PlaySession, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) p.runtime.stepOnce();
  };
  it('the hero walks and runs with its sheet’s clips, and a hit shows its hurt clip', () => {
    const p = arena(false);
    step(p, 0.2);
    expect(p.animStateOf('hero')).toBe('idle');
    expect(p.heroAnim.clip).toBeNull();
    p.input.keys.add('w');
    step(p, 0.4);
    expect([p.animStateOf('hero'), p.heroAnim.clip?.name]).toEqual(['walk', 'Walk']);
    p.input.keys.add('shift');
    step(p, 0.6);
    expect([p.animStateOf('hero'), p.heroAnim.clip?.name]).toEqual(['run', 'Run']);
    p.input.keys.clear();
    step(p, 0.4);
    expect(p.animStateOf('hero')).toBe('idle');
    p.hurt(1);
    step(p, 0.05);
    expect([p.animStateOf('hero'), p.heroAnim.clip?.name]).toEqual(['hurt', 'Flinch']);
  });
  it('an enemy walks over with its walk clip and swings with its attack clip', () => {
    const p = arena();
    const g = p.world.npcs.find((n) => n.id === 11)!;
    const seen = new Set<string>();
    for (let t = 0; t < 6; t += 1 / 60) {
      p.runtime.stepOnce();
      seen.add(`${p.animStateOf(g)}:${p.npcPose(g)?.clip?.name ?? '-'}`);
    }
    expect(seen).toContain('walk:Walk');
    expect(seen).toContain('attack:Swing');
  });
});
