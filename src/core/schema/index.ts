import type { z } from 'zod';
import { BodyPlan } from '../character/body';
import { Conversation } from '../dialogue/schema';
import { Effect } from '../effects/schema';
import { ScreenEffect } from '../effects/screen';
import { ProgressDoc } from '../save/progress';
import { Art } from './art';
import { Asset } from './asset';
import { MediaIndex, Mixer, Music, SoundEvents } from './audio';
import { Character } from './character';
import { Chunk } from './chunk';
import { Cinematic } from './cinematic';
import { Clip } from './clip';
import { Gates } from './gates';
import { InstanceItem, Instances } from './instances';
import { LogicGraph, Variables } from './logic';
import { MapDoc } from './map';
import { Project, Settings } from './project';
import { Screen } from './screen';
import { MapState } from './state';

export * from './action';
export * from './art';
export * from './asset';
export * from './audio';
export * from './character';
export * from './chunk';
export * from './cinematic';
export * from './clip';
export * from './common';
export * from './gates';
export * from './instances';
export * from './logic';
export * from './map';
export * from './project';
export * from './screen';
export * from './state';

/** Append-only registry: one entry per file kind in the Project files layout. */
const KINDS = [
  ['project', /^project\.json$/, Project],
  ['settings', /^settings\.json$/, Settings],
  ['map', /^maps\/map_[0-9a-z]{10}\/map\.json$/, MapDoc],
  ['chunk', /^maps\/map_[0-9a-z]{10}\/chunks\/-?\d+_-?\d+\.json$/, Chunk],
  ['instances', /^maps\/map_[0-9a-z]{10}\/instances\.json$/, Instances],
  ['state', /^maps\/map_[0-9a-z]{10}\/state\.json$/, MapState],
  ['gates', /^world\/gates\.json$/, Gates],
  ['asset', /^assets\/ast_[0-9a-z]{10}\.json$/, Asset],
  ['character', /^characters\/chr_[0-9a-z]{10}\.json$/, Character],
  ['clip', /^clips\/clp_[0-9a-z]{10}\.json$/, Clip],
  ['logic', /^logic\/lg_[0-9a-z]{10}\.json$/, LogicGraph],
  ['variables', /^logic\/variables\.json$/, Variables],
  ['screen', /^screens\/scr_[0-9a-z]{10}\.json$/, Screen],
  ['cinematic', /^cinematics\/cin_[0-9a-z]{10}\.json$/, Cinematic],
  ['soundEvents', /^audio\/events\.json$/, SoundEvents],
  ['music', /^audio\/music\.json$/, Music],
  ['mixer', /^audio\/mixer\.json$/, Mixer],
  ['media', /^media\/index\.json$/, MediaIndex],
  ['art', /^art\/art_[0-9a-z]{10}\.json$/, Art],
  // P26: achievements, collections, best scores, new game plus
  ['progress', /^game\/progress\.json$/, ProgressDoc],
  // P22: conversations
  ['dialogue', /^dialogue\/dlg_[0-9a-z]{10}\.json$/, Conversation],
  // P22 part 3: skeletons of the project's own
  ['bodyplan', /^bodyplans\/bpl_[0-9a-z]{10}\.json$/, BodyPlan],
  // P23: effects of the game's own (copies of built-in ones, or new)
  ['effect', /^effects\/fx_[0-9a-z]{10}\.json$/, Effect],
  // P23 part 2: screen effects of the game's own
  ['screenEffect', /^screenfx\/sce_[0-9a-z]{10}\.json$/, ScreenEffect],
] as const satisfies ReadonlyArray<readonly [string, RegExp, z.ZodType]>;

export type FileKind = (typeof KINDS)[number][0] | 'editor';
export const FILE_KINDS: readonly FileKind[] = [...KINDS.map((k) => k[0]), 'editor'];

/** The kind of a project path, or null if the path is not part of the layout. `.editor/*` is per-device UI state. */
export function fileKindOf(path: string): FileKind | null {
  if (/^\.editor\/[a-z0-9-]+\.json$/.test(path)) return 'editor';
  for (const [kind, re] of KINDS) if (re.test(path)) return kind;
  return null;
}

export function schemaFor(kind: FileKind): z.ZodType | null {
  return KINDS.find((k) => k[0] === kind)?.[2] ?? null;
}

export type ValidationIssue = { path: string; at: string; message: string };

/** Validates one file's parsed JSON against its kind. Returns [] when valid. */
/** P27 part 3b: placed things already found valid (files never change in place, so they stay valid) */
const validItems = new WeakSet<object>();

/** instances.json: each placed thing is checked once, so a change to one of 10,000 does not re-check them all */
function validateInstances(path: string, value: unknown): ValidationIssue[] {
  const v = value as { items?: unknown } | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.items)) {
    const r = Instances.safeParse(value);
    return r.success ? [] : r.error.issues.map((i) => ({ path, at: i.path.join('.'), message: i.message }));
  }
  const issues: ValidationIssue[] = [];
  const { items: _items, ...rest } = v as Record<string, unknown>;
  const head = Instances.omit({ items: true }).safeParse(rest);
  if (!head.success) issues.push(...head.error.issues.map((i) => ({ path, at: i.path.join('.'), message: i.message })));
  v.items.forEach((item, n) => {
    if (item && typeof item === 'object' && validItems.has(item)) return;
    const r = InstanceItem.safeParse(item);
    if (r.success) {
      if (item && typeof item === 'object' && Object.isFrozen(item)) validItems.add(item);
    } else
      issues.push(...r.error.issues.map((i) => ({ path, at: ['items', n, ...i.path].join('.'), message: i.message })));
  });
  return issues;
}

export function validateFile(path: string, value: unknown): ValidationIssue[] {
  const kind = fileKindOf(path);
  if (!kind) return [{ path, at: '', message: 'path is not part of the project layout' }];
  if (kind === 'instances') return validateInstances(path, value);
  const schema = schemaFor(kind);
  if (!schema) return [];
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => ({ path, at: i.path.join('.'), message: i.message }));
}

/** Path helpers so no code builds layout paths by hand. */
export const paths = {
  project: 'project.json',
  settings: 'settings.json',
  gates: 'world/gates.json',
  variables: 'logic/variables.json',
  map: (mapId: string) => `maps/${mapId}/map.json`,
  chunk: (mapId: string, cx: number, cz: number) => `maps/${mapId}/chunks/${cx}_${cz}.json`,
  chunkDir: (mapId: string) => `maps/${mapId}/chunks/`,
  instances: (mapId: string) => `maps/${mapId}/instances.json`,
  state: (mapId: string) => `maps/${mapId}/state.json`,
  character: (id: string) => `characters/${id}.json`,
  asset: (id: string) => `assets/${id}.json`,
  clip: (id: string) => `clips/${id}.json`,
  logic: (id: string) => `logic/${id}.json`,
  screen: (id: string) => `screens/${id}.json`,
  cinematic: (id: string) => `cinematics/${id}.json`,
  soundEvents: 'audio/events.json',
  music: 'audio/music.json',
  mixer: 'audio/mixer.json',
  media: 'media/index.json',
  art: (id: string) => `art/${id}.json`,
  artDir: 'art/',
  progress: 'game/progress.json',
  dialogue: (id: string) => `dialogue/${id}.json`,
  dialogueDir: 'dialogue/',
  bodyplan: (id: string) => `bodyplans/${id}.json`,
  bodyplanDir: 'bodyplans/',
  effect: (id: string) => `effects/${id}.json`,
  effectDir: 'effects/',
  screenEffect: (id: string) => `screenfx/${id}.json`,
  screenEffectDir: 'screenfx/',
} as const;
