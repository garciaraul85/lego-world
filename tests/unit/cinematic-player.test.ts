import { describe, expect, it } from 'vitest';
import { BUILTIN_CHARACTERS } from '../../src/builtin/characters';
import { BUILTIN_CLIPS } from '../../src/builtin/clips';
import { emoteClip } from '../../src/builtin/clips/emotes';
import { rewardScene } from '../../src/core/cinematic/templates';
import { Cinematic } from '../../src/core/schema';
import { CinematicPlayer } from '../../src/engine/cinematic/CinematicPlayer';
import { NavGrid } from '../../src/engine/cinematic/nav';

const chef = BUILTIN_CHARACTERS.find((c) => c.name === 'Chef')!.id;
const flat = (walls: { x: number; z: number; h: number }[] = []) =>
  new NavGrid([
    { x0: -40, x1: 40, z0: -40, z1: 40, y0: 0, y1: 0.4 },
    ...walls.map((w) => ({ x0: w.x, x1: w.x + 1, z0: w.z, z1: w.z + 1, y0: 0.4, y1: 0.4 + w.h })),
  ]);

function player(cin: Cinematic, nav = flat()) {
  return new CinematicPlayer(cin, {
    nav,
    start: (m) => ({ pos: m.actor === '$hero' ? [0, 0.4, 0] : [6, 0.4, 6], yaw: 0, held: 'None', visible: true }),
    clip: (id) => BUILTIN_CLIPS.find((c) => c.id === id),
    emote: emoteClip,
  });
}

const scene = () => rewardScene({ id: 'cin_reward0001', map: 'map_0000000001', at: [0, 0.4, 0], giver: chef });

describe('CinematicPlayer (P6.2)', () => {
  it('the reward scene is a valid cinematic', () => {
    const r = Cinematic.safeParse(scene());
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('seek(t) gives the same frame as playing to t', () => {
    const played = player(scene());
    const sought = player(scene());
    for (let i = 0; i < 9 * 60; i++) {
      played.advance(1 / 60);
      if (i % 37 !== 0) continue;
      sought.seek(played.t);
      expect(sought.frame()).toEqual(played.frame());
    }
  });

  it('plays end to end: the mayor walks to the mark, speaks, the camera cuts, cues fire once', () => {
    const p = player(scene());
    const cues: string[] = [];
    const shots: string[] = [];
    let said = '';
    while (!p.done) {
      for (const c of p.advance(1 / 60))
        cues.push(
          c.kind === 'music' ? `music ${c.music}` : `${c.kind} ${'event' in c ? c.event : 'name' in c ? c.name : ''}`,
        );
      const f = p.frame();
      if (f.shot && shots.at(-1) !== f.shot) shots.push(f.shot);
      if (f.say) said = f.say.text;
    }
    expect(shots).toEqual(['Wide', 'Close on mayor', 'Two shot']);
    expect(said).toMatch(/fixed every house/);
    expect(cues).toContain('music mus_menu000000');
    expect(cues).toContain('music null');
    expect(cues.filter((c) => c === 'emit reward-given')).toHaveLength(1);
    expect(cues.filter((c) => c.startsWith('voice')).length).toBeGreaterThan(5);
    const mayor = p.frame().actors.get('mayor')!;
    expect(mayor.pos[0]).toBeCloseTo(1.5, 5);
    expect(mayor.pos[2]).toBeCloseTo(3, 5);
  });

  it('a walk path-finds around a wall and the gait phase follows the distance', () => {
    const cin: Cinematic = {
      ...scene(),
      cast: [{ role: 'hero', actor: '$hero' }],
      marks: [{ id: 'b', pos: [0.5, 0.4, 10.5], yaw: 0 }],
      tracks: [{ kind: 'actor', role: 'hero', items: [{ t: 0, do: 'moveTo', mark: 'b', speed: 'walk' }] }],
    };
    const wall = Array.from({ length: 13 }, (_, i) => ({ x: i - 6, z: 5, h: 3 }));
    const p = player(cin, flat(wall));
    let maxX = 0;
    for (let t = 0; t < 6; t += 0.05) maxX = Math.max(maxX, Math.abs(p.frame(t).actors.get('hero')!.pos[0]));
    expect(maxX).toBeGreaterThan(6); // went round the wall
    const end = p.frame(6).actors.get('hero')!;
    expect(end.pos[2]).toBeCloseTo(10.5, 5);
    expect(end.speed).toBe(0);
    expect(p.frame(1).actors.get('hero')!.speed).toBe(4);
  });

  it('a later move cuts the one in progress; a camera blend eases between shots', () => {
    const cin: Cinematic = {
      ...scene(),
      cast: [{ role: 'hero', actor: '$hero' }],
      marks: [
        { id: 'far', pos: [0.5, 0.4, 30.5], yaw: 0 },
        { id: 'side', pos: [10.5, 0.4, 0.5], yaw: 1 },
      ],
      tracks: [
        {
          kind: 'actor',
          role: 'hero',
          items: [
            { t: 0, do: 'moveTo', mark: 'far', speed: 'walk' },
            { t: 1, do: 'moveTo', mark: 'side', speed: 'teleport' },
          ],
        },
        {
          kind: 'camera',
          items: [
            { t: 0, shot: 'A', pos: [0, 5, -10], lookAt: [0, 0, 0] },
            { t: 2, shot: 'B', pos: [10, 5, -10], lookAt: [0, 0, 0], blend: 2 },
          ],
        },
      ],
    };
    const p = player(cin);
    expect(p.frame(0.5).actors.get('hero')!.pos[2]).toBeCloseTo(2, 0);
    expect(p.frame(1.5).actors.get('hero')!.pos).toEqual([10.5, 0.4, 0.5]);
    expect(p.frame(1.5).actors.get('hero')!.yaw).toBe(1);
    expect(p.frame(3).camera!.eye[0]).toBeCloseTo(5, 5); // halfway, eased
    expect(p.frame(5).camera!.eye[0]).toBeCloseTo(10, 5);
  });

  it('skip jumps to the end and returns only the state cues still due', () => {
    const p = player(scene());
    p.advance(2);
    const rest = p.skip();
    expect(p.done).toBe(true);
    expect(rest.map((c) => c.kind)).toEqual(expect.arrayContaining(['emit', 'setVar', 'music']));
    expect(rest.some((c) => c.kind === 'sfx' || c.kind === 'voice')).toBe(false);
    expect(p.frame().post.fade).toBeCloseTo(1, 5);
  });
});
