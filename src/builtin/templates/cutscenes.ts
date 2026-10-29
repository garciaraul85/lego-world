import type { Cinematic } from '../../core/schema';
import { MUS, SND } from '../audio/pack';
import { SFX } from '../screen-effects';
import type { TemplateField } from './scripts';

/**
 * Step 11, 4c: the three cutscene templates of the adventure starter pack: a boss's entrance, an item found and a
 * door opening. Each makes a cinematic around a place on the open map (the boss where it stands, the door where it
 * is, the hero) and a small logic file that plays it (walking into a zone) and does what a cinematic cannot (give
 * the item, open the door).
 */
type V3 = [number, number, number];

export type CutsceneContext = {
  id: string;
  map: string;
  name: string;
  answers: Record<string, string | number>;
  /** the hero's start (the map's first spawn point) */
  hero: { pos: V3; yaw: number };
  /** the boss (its character id, where it stands) */
  boss?: { character: string; pos: V3 };
  /** the door's middle */
  door?: V3;
};

export type CutsceneTemplate = {
  id: string;
  name: string;
  about: string;
  needs?: string;
  fields: TemplateField[];
  /** the cinematic's name from the answers */
  title(a: Record<string, string | number>): string;
  make(c: CutsceneContext): Cinematic;
  /** logic code that plays it and does the rest; `cine` is the cinematic's id */
  code(a: Record<string, string | number>, cine: string): string;
};

const q = (s: unknown) => JSON.stringify(String(s));
const slug = (s: unknown) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'thing';
const tracks = (): Cinematic['tracks'] => [
  { kind: 'camera', items: [] },
  { kind: 'music', items: [] },
  { kind: 'sfx', items: [] },
  { kind: 'post', items: [] },
  { kind: 'event', items: [] },
];
const track = <K extends Cinematic['tracks'][number]['kind']>(c: Cinematic, kind: K) =>
  c.tracks.find((t) => t.kind === kind) as Extract<Cinematic['tracks'][number], { kind: K }>;

const TRIGGER: TemplateField = {
  key: 'zone',
  label: 'Plays when the hero walks into',
  kind: 'zone',
  default: '',
  help: 'A zone (once). Leave it empty to play it from your own logic (Play cinematic) instead.',
  optional: true,
};

/** a title card (the line under it only when there is one) */
const titleCard = (t: number, title: string, sub: string, dur: number): Cinematic['tracks'][number]['items'][number] =>
  (sub.trim()
    ? { t, title: title.slice(0, 80), sub: sub.slice(0, 120), dur }
    : { t, title: title.slice(0, 80), dur }) as never;

export const CUTSCENE_TEMPLATES: CutsceneTemplate[] = [
  {
    id: 'boss-entrance',
    name: 'Boss entrance',
    about: 'The camera turns to the boss, it roars, its name comes up and the boss music starts',
    needs: 'the boss on the open map',
    fields: [
      { key: 'boss', label: 'Boss', kind: 'character', default: 'Gloomweaver', help: 'The boss (on this map).' },
      {
        key: 'sub',
        label: 'Under its name',
        kind: 'text',
        default: 'Queen of the deep web',
        help: 'A line under the name.',
      },
      TRIGGER,
    ],
    title: (a) => `${a.boss} appears`,
    make: (c) => {
      const b = c.boss!;
      const cine: Cinematic = {
        id: c.id as Cinematic['id'],
        name: c.name,
        map: c.map as Cinematic['map'],
        length: 5.5,
        skippable: true,
        letterbox: true,
        hideHud: true,
        cast: [
          { role: 'hero', actor: '$hero' },
          { role: 'boss', actor: b.character as Cinematic['cast'][number]['actor'] },
        ],
        marks: [{ id: 'boss', pos: b.pos, yaw: 0 }],
        tracks: [
          { kind: 'actor', role: 'hero', items: [{ t: 0, do: 'face', target: 'boss' }] },
          { kind: 'actor', role: 'boss', items: [{ t: 0.2, do: 'face', target: 'hero' }] },
          ...tracks(),
        ],
      };
      track(cine, 'camera').items.push(
        { t: 0, shot: 'Over the shoulder', follow: 'hero', offset: [1.4, 2.4, -4.5], look: 'boss', fov: 50, blend: 0 },
        { t: 1.2, shot: 'The boss', follow: 'boss', offset: [0.8, 2.8, 7], look: 'boss', fov: 40, blend: 0.9 },
        {
          t: 2.2,
          shot: 'The roar',
          follow: 'boss',
          offset: [0.8, 2.8, 7],
          look: 'boss',
          fov: 44,
          blend: 0,
          shake: 0.5,
        },
      );
      track(cine, 'music').items.push({ t: 0, music: MUS.boss, fade: 0.6 });
      track(cine, 'sfx').items.push({ t: 2.2, event: SND.bossroar, role: 'boss' });
      track(cine, 'post').items.push(
        { t: 2.2, screen: SFX.bigShake },
        titleCard(2.6, String(c.answers.boss), String(c.answers.sub ?? ''), 2.4) as never,
      );
      track(cine, 'event').items.push({ t: 5, emit: `${slug(c.answers.boss)}-awake` });
      return cine;
    },
    code: (a, cine) =>
      String(a.zone ?? '').trim()
        ? `// ${a.boss} appears when the hero walks into ${a.zone}
on("enterZone", { zone: ${q(a.zone)} }, (e) => {
  cinematic.play(${q(cine)}, true);
});
`
        : '',
  },
  {
    id: 'item-found',
    name: 'Item found',
    about: 'The hero holds up a new item with a golden flash and a jingle; then it is in the inventory',
    fields: [
      { key: 'item', label: 'Item', kind: 'item', default: 'Boomerang', help: 'What the hero finds (it is given).' },
      {
        key: 'sub',
        label: 'Line under it',
        kind: 'text',
        default: 'Throw it at faraway switches and bats!',
        help: 'A hint about what it does.',
      },
      TRIGGER,
    ],
    title: (a) => `Found the ${a.item}`,
    make: (c) => {
      const cine: Cinematic = {
        id: c.id as Cinematic['id'],
        name: c.name,
        map: c.map as Cinematic['map'],
        length: 3.8,
        skippable: true,
        letterbox: true,
        hideHud: true,
        cast: [{ role: 'hero', actor: '$hero' }],
        marks: [],
        tracks: [
          {
            kind: 'actor',
            role: 'hero',
            items: [
              { t: 0.4, do: 'emote', kind: 'cheer' },
              { t: 0.4, do: 'mood', mood: 'happy', dur: 3 },
            ],
          },
          ...tracks(),
        ],
      };
      track(cine, 'camera').items.push(
        { t: 0, shot: 'Close on the hero', follow: 'hero', offset: [0.9, 2.6, 6.2], look: 'hero', fov: 46, blend: 0 },
        { t: 2.6, shot: 'Pull back', follow: 'hero', offset: [1.8, 3.2, 8.5], look: 'hero', fov: 48, blend: 1 },
      );
      track(cine, 'sfx').items.push({ t: 0.4, event: SND.itemget, role: 'hero' });
      track(cine, 'post').items.push(
        { t: 0.4, screen: SFX.goldFlash },
        titleCard(0.6, `You got the ${String(c.answers.item)}!`, String(c.answers.sub ?? ''), 2.8) as never,
      );
      track(cine, 'event').items.push({ t: 3.4, emit: `found-${slug(c.answers.item)}` });
      return cine;
    },
    code: (a, cine) => `// the ${a.item} is the hero's when the scene ends
on("cinematicDone", { cinematic: ${q(cine)} }, (e) => {
  world.give(${q(a.item)}, 1);
});
${
  String(a.zone ?? '').trim()
    ? `
on("enterZone", { zone: ${q(a.zone)} }, (e) => {
  cinematic.play(${q(cine)}, true);
});
`
    : ''
}`,
  },
  {
    id: 'door-opens',
    name: 'Door opens',
    about: 'The camera cuts to a door or gate as it opens, with the gate and secret-found sounds',
    needs: 'the door or gate on the open map',
    fields: [
      { key: 'door', label: 'Door', kind: 'asset', default: 'Barred gate', help: 'The door or gate (on this map).' },
      { key: 'open', label: 'Open state', kind: 'state', default: 'open', help: 'Its state when open.' },
      TRIGGER,
    ],
    title: (a) => `${a.door} opens`,
    make: (c) => {
      const d = c.door!;
      // the camera stands between the door and the start, up a little, looking at the door
      const dx = c.hero.pos[0] - d[0];
      const dz = c.hero.pos[2] - d[2];
      const len = Math.hypot(dx, dz) || 1;
      const eye: V3 = [d[0] + (dx / len) * 9, d[1] + 3.5, d[2] + (dz / len) * 9];
      const cine: Cinematic = {
        id: c.id as Cinematic['id'],
        name: c.name,
        map: c.map as Cinematic['map'],
        length: 3.4,
        skippable: true,
        letterbox: true,
        hideHud: true,
        cast: [{ role: 'hero', actor: '$hero' }],
        marks: [{ id: 'door', pos: d, yaw: 0 }],
        tracks: [{ kind: 'actor', role: 'hero', items: [] }, ...tracks()],
      };
      track(cine, 'camera').items.push(
        { t: 0, shot: 'The door', pos: eye, lookAt: [d[0], d[1] + 1.2, d[2]], fov: 45, blend: 0 },
        {
          t: 1,
          shot: 'Closer',
          pos: [eye[0] - (dx / len) * 2, eye[1] - 0.6, eye[2] - (dz / len) * 2],
          lookAt: [d[0], d[1] + 1.2, d[2]],
          fov: 42,
          blend: 2,
        },
      );
      track(cine, 'sfx').items.push({ t: 0.8, event: SND.gate, pos: d }, { t: 1.8, event: SND.secret });
      track(cine, 'event').items.push({ t: 0.8, emit: `open-${slug(c.answers.door)}` });
      return cine;
    },
    code: (a, cine) => `// the ${a.door} opens during the scene
on("custom", { event: ${q(`open-${slug(a.door)}`)} }, (e) => {
  world.setState(${q(a.door)}, ${q(a.open)});
});
${
  String(a.zone ?? '').trim()
    ? `
on("enterZone", { zone: ${q(a.zone)} }, (e) => {
  cinematic.play(${q(cine)}, true);
});
`
    : ''
}`,
  },
];

export const cutsceneTemplate = (id: string) => CUTSCENE_TEMPLATES.find((t) => t.id === id) ?? null;
