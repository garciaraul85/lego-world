import type { Cinematic } from '../schema';

type V3 = [number, number, number];

/**
 * Starter scenes for the Director (P6.3) and the phase-exit example: a reward scene with a
 * title, dialogue, camera cuts and music, around a point on the map (usually a spawn).
 */
export function rewardScene(o: {
  id: string;
  map: string;
  at: V3;
  /** character id of who gives the reward (a neighbour on the map, or a built-in character) */
  giver: string;
  name?: string;
  line?: string;
}): Cinematic {
  const [x, y, z] = o.at;
  const giver = o.giver;
  return {
    id: o.id as Cinematic['id'],
    name: o.name ?? 'Reward',
    map: o.map as Cinematic['map'],
    length: 9,
    skippable: true,
    letterbox: true,
    hideHud: true,
    cast: [
      { role: 'hero', actor: '$hero', at: 'hero' },
      { role: 'mayor', actor: giver as Cinematic['cast'][number]['actor'], at: 'mayor-start' },
    ],
    marks: [
      { id: 'hero', pos: [x, y, z], yaw: 0 },
      { id: 'mayor-start', pos: [x + 6, y, z + 6], yaw: Math.PI },
      { id: 'mayor', pos: [x + 1.5, y, z + 3], yaw: Math.PI },
    ],
    tracks: [
      {
        kind: 'actor',
        role: 'mayor',
        items: [
          { t: 0.4, do: 'moveTo', mark: 'mayor', speed: 'walk' },
          { t: 2.9, do: 'face', target: 'hero' },
          { t: 3.1, do: 'say', text: o.line ?? 'You fixed every house in town. Thank you, hero!', dur: 3 },
          { t: 6.2, do: 'emote', kind: 'cheer' },
        ],
      },
      {
        kind: 'actor',
        role: 'hero',
        items: [
          { t: 2.9, do: 'face', target: 'mayor' },
          { t: 6.4, do: 'emote', kind: 'wave' },
        ],
      },
      {
        kind: 'camera',
        items: [
          { t: 0, shot: 'Wide', pos: [x - 7, y + 6, z - 7], lookAt: [x + 2, y + 1, z + 2], fov: 55, blend: 0 },
          { t: 3, shot: 'Close on mayor', follow: 'mayor', offset: [2.4, 2.1, 2.2], look: 'mayor', fov: 40, blend: 0 },
          {
            t: 6.1,
            shot: 'Two shot',
            pos: [x - 3, y + 2.5, z - 2.5],
            lookAt: [x + 0.8, y + 1.4, z + 1.5],
            fov: 50,
            blend: 1.2,
          },
        ],
      },
      {
        kind: 'music',
        items: [
          { t: 0, music: 'mus_menu000000', fade: 1 },
          { t: 8, stop: true, fade: 1 },
        ],
      },
      {
        kind: 'sfx',
        items: [
          { t: 0.3, event: 'snd_victory000' },
          { t: 6.2, event: 'snd_pickup0000', role: 'hero' },
        ],
      },
      {
        kind: 'post',
        items: [
          { t: 0, fade: 'in', dur: 0.8 },
          { t: 0.4, title: o.name ?? 'Quest complete!', sub: 'The town is whole again', dur: 2.4 },
          { t: 8.2, fade: 'out', dur: 0.8 },
        ],
      },
      {
        kind: 'event',
        items: [
          { t: 6.2, emit: 'reward-given' },
          { t: 6.2, setVar: 'rewarded', value: true },
        ],
      },
    ],
  };
}

/** An empty scene with the hero and one camera, for "+ New". */
export function blankScene(o: { id: string; map: string; at: V3; name: string }): Cinematic {
  const [x, y, z] = o.at;
  return {
    id: o.id as Cinematic['id'],
    name: o.name,
    map: o.map as Cinematic['map'],
    length: 6,
    skippable: true,
    letterbox: true,
    hideHud: true,
    cast: [{ role: 'hero', actor: '$hero' }],
    marks: [{ id: 'mark1', pos: [x + 3, y, z + 3], yaw: 0 }],
    tracks: [
      { kind: 'actor', role: 'hero', items: [] },
      {
        kind: 'camera',
        items: [{ t: 0, shot: 'Shot 1', follow: 'hero', offset: [1.5, 2.4, -5], look: 'hero', fov: 50, blend: 0 }],
      },
      { kind: 'music', items: [] },
      { kind: 'sfx', items: [] },
      { kind: 'post', items: [] },
      { kind: 'event', items: [] },
    ],
  };
}
