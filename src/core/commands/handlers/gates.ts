import { type Id, newId } from '../../ids';
import type { ProjectStore } from '../../project/store';
import { type Action, ActionList, type Gates, type MapDoc, paths } from '../../schema';
import type { CommandHandler } from '../types';

export const MAX_GATES = 256;

const gatesOf = (store: ProjectStore): Gates => store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
const spawnOn = (store: ProjectStore, map: string, spawn: string) =>
  !!store.get<MapDoc>(paths.map(map))?.spawns.some((s) => s.id === spawn);

export type GateEnd = { map: string; spawn: string };
export type ConnectGate = { id?: string; from: GateEnd; to: GateEnd; twoWay?: boolean };

/** Same rule as v68 connect: one link per pair of spawn points, never a spawn to itself. */
export const connectGate: CommandHandler<ConnectGate> = {
  label: () => 'Connect gate',
  validate(store, p) {
    if (!spawnOn(store, p.from.map, p.from.spawn) || !spawnOn(store, p.to.map, p.to.spawn))
      return 'Both ends must be spawn points of existing maps.';
    if (p.from.spawn === p.to.spawn) return 'A gate needs two different spawn points.';
    const g = gatesOf(store);
    if (g.gates.length >= MAX_GATES) return `A project can have ${MAX_GATES} gate connections.`;
    if (
      g.gates.some(
        (x) =>
          (x.from.spawn === p.from.spawn && x.to.spawn === p.to.spawn) ||
          (x.from.spawn === p.to.spawn && x.to.spawn === p.from.spawn),
      )
    )
      return 'These spawn points are already connected.';
    return null;
  },
  apply(store, p) {
    const g = gatesOf(store);
    store.put(paths.gates, {
      ...g,
      gates: [
        ...g.gates,
        {
          id: (p.id ?? newId('gate')) as Id<'gate'>,
          from: { map: p.from.map as Id<'map'>, spawn: p.from.spawn as Id<'spawn'> },
          to: { map: p.to.map as Id<'map'>, spawn: p.to.spawn as Id<'spawn'> },
          twoWay: p.twoWay ?? true,
        },
      ],
    });
  },
};

export const updateGate: CommandHandler<{
  gate: string;
  twoWay?: boolean;
  reverse?: boolean;
  /** P6.4: actions when the hero arrives through this gate ([] clears) */
  onArrive?: Action[];
}> = {
  label: (p) => (p.reverse ? 'Reverse gate' : 'Edit gate'),
  validate: (store, p) => {
    if (!gatesOf(store).gates.some((g) => g.id === p.gate)) return 'Gate not found.';
    if (p.onArrive && !ActionList.safeParse(p.onArrive).success) return 'Those actions are not valid.';
    return null;
  },
  apply(store, p) {
    const g = gatesOf(store);
    store.put(paths.gates, {
      ...g,
      gates: g.gates.map((x) =>
        x.id !== p.gate
          ? x
          : {
              ...x,
              ...(p.twoWay !== undefined ? { twoWay: p.twoWay } : {}),
              ...(p.reverse ? { from: x.to, to: x.from } : {}),
              ...(p.onArrive !== undefined ? { onArrive: p.onArrive.length ? p.onArrive : undefined } : {}),
            },
      ),
    });
  },
};

export const deleteGate: CommandHandler<{ gate: string }> = {
  label: () => 'Remove gate',
  validate: (store, p) => (gatesOf(store).gates.some((g) => g.id === p.gate) ? null : 'Gate not found.'),
  apply(store, p) {
    const g = gatesOf(store);
    store.put(paths.gates, { ...g, gates: g.gates.filter((x) => x.id !== p.gate) });
  },
};

/** Removes a map, its files, its NPC characters and every gate that touches it. */
export const deleteMap: CommandHandler<{ map: string }> = {
  label: () => 'Delete map',
  validate(store, p) {
    const g = gatesOf(store);
    if (!g.mapOrder.includes(p.map as Id<'map'>)) return 'Map not found.';
    if (g.mapOrder.length === 1) return 'A project needs at least one map.';
    if (store.manifest.entry.map === p.map)
      return 'This is the start map. Choose another start map first (Project tab).';
    return null;
  },
  apply(store, p) {
    for (const path of store.list(`maps/${p.map}/`)) {
      if (path === paths.instances(p.map)) {
        const inst = store.get<{ items: { kind: string; character?: string }[] }>(path);
        for (const i of inst?.items ?? [])
          if (i.kind === 'npc' && i.character) store.remove(paths.character(i.character));
      }
      store.remove(path);
    }
    const g = gatesOf(store);
    store.put(paths.gates, {
      mapOrder: g.mapOrder.filter((m) => m !== p.map),
      gates: g.gates.filter((x) => x.from.map !== p.map && x.to.map !== p.map),
    });
  },
};
