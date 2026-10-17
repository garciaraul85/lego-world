import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { type Instances, paths } from '../../schema';
import type { CommandHandler } from '../types';

/**
 * P9c: neighbours placed by hand (an enemy for a training yard, a guard by a gate). A neighbour is a character
 * standing on a map; in Play it wanders near where it was put, talks, and fights if its character is an enemy.
 * Once a map has its own neighbours, v68's default neighbours no longer appear on it.
 */
const instancesOf = (store: ProjectStore, map: string): Instances =>
  store.get<Instances>(paths.instances(map)) ?? { npcsSaved: false, items: [] };

const characterExists = (store: ProjectStore, id: string) =>
  store.has(paths.character(id)) || BUILTIN_CHARACTERS.some((c) => c.id === id);

export type PlaceNpc = {
  map: string;
  character: string;
  pos: [number, number, number];
  heading?: number;
  id?: string;
};

export const placeNpc: CommandHandler<PlaceNpc> = {
  label: () => 'Place neighbour',
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (!characterExists(store, p.character)) return 'That character does not exist.';
    if (!p.pos.every(Number.isFinite)) return 'Give the neighbour a place.';
    const items = instancesOf(store, p.map).items;
    if (p.id && items.some((i) => i.id === p.id)) return 'That id is taken.';
    return items.filter((i) => i.kind === 'npc').length >= 40 ? 'A map can have 40 neighbours.' : null;
  },
  apply(store, p) {
    const cur = instancesOf(store, p.map);
    const legacyId = Math.max(0, ...cur.items.flatMap((i) => (i.kind === 'npc' ? [i.legacyId] : []))) + 1;
    store.put(paths.instances(p.map), {
      npcsSaved: true,
      items: [
        ...cur.items,
        {
          id: (p.id ?? newId('instance')) as Instances['items'][number]['id'],
          kind: 'npc',
          character: p.character as never,
          legacyId,
          biome: 'prairie',
          role: 'villager',
          state: { x: p.pos[0], y: p.pos[1], z: p.pos[2], heading: p.heading ?? 0 },
        },
      ],
    });
  },
};

export const removeNpc: CommandHandler<{ map: string; instance: string }> = {
  label: () => 'Remove neighbour',
  validate: (store, p) =>
    instancesOf(store, p.map).items.some((i) => i.id === p.instance && i.kind === 'npc')
      ? null
      : 'Neighbour not found.',
  apply(store, p) {
    const cur = instancesOf(store, p.map);
    store.put(paths.instances(p.map), { ...cur, items: cur.items.filter((i) => i.id !== p.instance) });
  },
};
