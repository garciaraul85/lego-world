import { isId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { type EmitterInstance, Instances, type MapDoc, paths, type UiInstance } from '../../schema';
import type { CommandHandler } from '../types';

type Item = EmitterInstance | UiInstance;
export const MAX_ITEMS_PER_MAP = 256;

const inst = (store: ProjectStore, map: string) =>
  store.get<Instances>(paths.instances(map)) ?? { npcsSaved: false, items: [] };
const check = (v: Instances) => {
  const r = Instances.safeParse(v);
  return r.success ? null : `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`;
};

/** item.add: a sound emitter (P5.5) or a world UI element (P5.9) on a map. */
export const addItem: CommandHandler<{ map: string; item: Item }> = {
  label: (p) => (p.item.kind === 'emitter' ? 'Add sound emitter' : `Add world ${p.item.widget}`),
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (!isId('instance', p.item.id)) return 'Item ids look like ins_ and 10 letters or digits.';
    const cur = inst(store, p.map);
    if (cur.items.some((i) => i.id === p.item.id)) return 'That item already exists.';
    if (cur.items.filter((i) => i.kind === p.item.kind).length >= MAX_ITEMS_PER_MAP)
      return `A map holds at most ${MAX_ITEMS_PER_MAP} of these.`;
    return check({ ...cur, items: [...cur.items, p.item] });
  },
  apply(store, p) {
    const cur = inst(store, p.map);
    store.put(paths.instances(p.map), { ...cur, items: [...cur.items, p.item] });
  },
};

export const updateItem: CommandHandler<{ map: string; id: string; patch: Partial<Item> }> = {
  label: () => 'Edit map item',
  validate(store, p) {
    const cur = inst(store, p.map);
    const it = cur.items.find((i) => i.id === p.id);
    if (!it || (it.kind !== 'emitter' && it.kind !== 'ui')) return 'That item is not on this map.';
    return check({
      ...cur,
      items: cur.items.map((i) => (i.id === p.id ? ({ ...i, ...p.patch, id: i.id, kind: i.kind } as Item) : i)),
    });
  },
  apply(store, p) {
    const cur = inst(store, p.map);
    store.put(paths.instances(p.map), {
      ...cur,
      items: cur.items.map((i) => (i.id === p.id ? ({ ...i, ...p.patch, id: i.id, kind: i.kind } as Item) : i)),
    });
  },
};

export const removeItem: CommandHandler<{ map: string; id: string }> = {
  label: () => 'Remove map item',
  validate: (store, p) =>
    inst(store, p.map).items.some((i) => i.id === p.id && (i.kind === 'emitter' || i.kind === 'ui'))
      ? null
      : 'That item is not on this map.',
  apply(store, p) {
    const cur = inst(store, p.map);
    store.put(paths.instances(p.map), { ...cur, items: cur.items.filter((i) => i.id !== p.id) });
  },
};

/** map.setAudio: the map's music state and ambience event (null = none). */
export const setMapAudio: CommandHandler<{ map: string; music?: string | null; ambience?: string | null }> = {
  label: () => 'Change map music',
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (p.music && !isId('music', p.music)) return 'Pick a music state.';
    if (p.ambience && !isId('sound', p.ambience)) return 'Pick a sound event.';
    return null;
  },
  apply(store, p) {
    const m = store.get<MapDoc>(paths.map(p.map))!;
    store.put(paths.map(p.map), {
      ...m,
      ...(p.music !== undefined ? { music: p.music as MapDoc['music'] } : {}),
      ...(p.ambience !== undefined ? { ambience: p.ambience as MapDoc['ambience'] } : {}),
    });
  },
};
