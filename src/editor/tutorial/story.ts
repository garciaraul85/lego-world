import { BUILTIN_ASSETS, builtinAsset } from '../../builtin/assets';
import { localToWorld } from '../../core/assets/expand';
import type { Command } from '../../core/commands';
import { assetSpot, surfaceOf } from '../../core/gamegen/places';
import {
  type AssetInstance,
  type Cinematic,
  type Instances,
  type LogicGraph,
  type MapDoc,
  paths,
} from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import type { EditorState } from '../state';
import { openCode, typeInto } from './coding';

/**
 * P32: the treasure-chest story the Characters, Logic and Cinematics chapters build together — the hero walks
 * up to a chest, opens it, a sword rises out of it with a fanfare, and the hero holds it up. These helpers are
 * the parts of “Do it for me” a click cannot express (a spot on the map, a wire between two pins).
 */
type V3 = [number, number, number];
const chestDef = () => BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;

const run = (c: ActionCtx, cmds: Command | Command[], label: string) => {
  const r = c.ed.exec(cmds, { label, source: 'tutorial' });
  if (!r.ok) throw new Error(r.error ?? label);
};
const entry = (ed: EditorState) => ed.store.manifest.entry.map;

/** The first treasure chest placed on the start map. */
export function chestOnMap(ed: EditorState): AssetInstance | null {
  const items = ed.store.get<Instances>(paths.instances(entry(ed)))?.items ?? [];
  const ids = new Set([
    chestDef().id,
    ...ed.store
      .list('assets/')
      .filter((p) => ed.store.get<{ name: string }>(p)?.name === 'Treasure chest')
      .map((p) => p.slice(7, -5)),
  ]);
  return (items.find((i) => i.kind === 'asset' && ids.has(i.asset)) as AssetInstance | undefined) ?? null;
}

/**
 * Where the hero stands to open the chest (in front of its lid, facing it), and the trigger zone a little
 * further out that starts the scene.
 */
export function chestFront(ed: EditorState): { pos: V3; yaw: number; zone: { min: V3; max: V3 } } | null {
  const inst = chestOnMap(ed);
  if (!inst) return null;
  const def = chestDef();
  const at = (p: V3) => localToWorld(def, inst, p);
  const front = at([2, 0, 3.6]);
  const middle = at([2, 0, 1]);
  const out = at([2, 0, 5.4]);
  const yaw = Math.atan2(middle[0] - front[0], middle[2] - front[2]);
  const y = inst.pos[1] * 0.4;
  return {
    pos: [front[0], y, front[2]],
    yaw,
    zone: { min: [out[0] - 2, y, out[2] - 2], max: [out[0] + 2, y + 4, out[2] + 2] },
  };
}

/** a bare map (nothing built yet): a spot on the ground a few steps from the start */
function openGroundSpot(c: ActionCtx, map: string, asset: string): Command | null {
  const sp = c.ed.store.get<MapDoc>(paths.map(map))?.spawns[0]?.pos ?? [0, 0, 0];
  const s = surfaceOf(c.ed.store, map);
  for (const [dx, dz] of [
    [-2, 4],
    [3, 3],
    [-7, 3],
    [-2, -9],
    [5, -6],
    [-9, -6],
  ] as const) {
    const x = Math.floor(sp[0]) + dx;
    const z = Math.floor(sp[2]) + dz;
    const y = s.topAt(x, z) ?? 0;
    const cmd: Command = { type: 'asset.place', payload: { map, asset, pos: [x, y, z], rot: 0 } };
    if (c.ed.bus.dryRun([cmd]).ok) return cmd;
  }
  return null;
}

const openCine = (ed: EditorState) => {
  const id = ed.cinematicId.value ?? ed.store.list('cinematics/')[0]?.slice(11, -5);
  return id ? ed.store.get<Cinematic>(paths.cinematic(id)) : undefined;
};

export const STORY_DOERS: Record<string, (c: ActionCtx, a: Record<string, unknown>) => void | Promise<void>> = {
  /** a treasure chest a few steps from the start, with open ground in front of it and a trigger zone there */
  chestStage(c) {
    const { ed } = c;
    const map = entry(ed);
    if (!chestOnMap(ed)) {
      const def = chestDef();
      const cmds: Command[] = [];
      if (!ed.store.has(paths.asset(def.id)))
        cmds.push({ type: 'asset.create', payload: { asset: builtinAsset(def.id)! } });
      if (cmds.length) run(c, cmds, 'Add the chest');
      // room for the chest and four studs of flat ground in front of it
      const spot =
        assetSpot(ed.store, ed.bus, map, { id: def.id, footprint: [4, 7] }, { minSteps: 4, maxSteps: 14 }) ??
        openGroundSpot(c, map, def.id);
      if (!spot) throw new Error('No flat ground for a chest near the start.');
      run(c, spot, 'Place the chest');
    }
    const f = chestFront(ed)!;
    const m = ed.store.get<MapDoc>(paths.map(map))!;
    const inside = (z: MapDoc['zones'][number], p: V3) =>
      p[0] >= z.min[0] && p[0] <= z.max[0] && p[2] >= z.min[2] && p[2] <= z.max[2];
    const mid: V3 = [(f.zone.min[0] + f.zone.max[0]) / 2, f.zone.min[1], (f.zone.min[2] + f.zone.max[2]) / 2];
    if (!m.zones.some((z) => inside(z, mid)))
      run(c, { type: 'map.addZone', payload: { map, zone: { ...f.zone, tags: ['Chest'] } } }, 'Add the chest zone');
    ed.openMap(map);
  },
  /** the scene's first mark moves in front of the chest, facing it */
  markAtChest(c) {
    const cin = openCine(c.ed);
    const f = chestFront(c.ed);
    if (!cin || !f) throw new Error('Make the scene first (Scenes › + New), with a chest on the map.');
    const marks = cin.marks.length ? cin.marks : [{ id: 'mark1', pos: f.pos, yaw: f.yaw }];
    const next = { ...cin, marks: marks.map((m, i) => (i === 0 ? { ...m, pos: f.pos, yaw: f.yaw } : m)) };
    run(c, { type: 'cinematic.put', payload: { cinematic: next } }, 'Mark in front of the chest');
  },
  /** what clicking the Director's timeline does: the playhead goes to `t` seconds */
  seekScene(c, a) {
    c.ed.cineSeek.value = { t: Number(a.t ?? 0) };
  },
  /** three shots: wide on the walk, close on the chest as it opens, on the hero holding the sword up */
  chestCameras(c) {
    const cin = openCine(c.ed);
    const inst = chestOnMap(c.ed);
    const f = chestFront(c.ed);
    if (!cin || !inst || !f) throw new Error('Make the scene first, with a chest on the map.');
    const def = chestDef();
    const at = (p: V3) => localToWorld(def, inst, p);
    const chest = at([2, 1.2, 1]);
    // world positions around the chest (local frame: x along the chest, z out of its front, the hero at z 3.6)
    const shots = [
      { t: 0, shot: 'Wide', pos: at([-6, 7, 13]), lookAt: chest, fov: 55, blend: 0 },
      { t: 2, shot: 'Close on the chest', pos: at([-6.5, 5, 7.5]), lookAt: at([2.5, 2, 2.8]), fov: 50, blend: 0 },
      // from the chest's left, a little in front of the hero's face (the open lid blocks the view from behind)
      { t: 4, shot: 'Hold it up', pos: at([-7.5, 5.6, 1.6]), lookAt: at([2, 3.8, 3.6]), fov: 48, blend: 0.6 },
    ];
    const tracks = cin.tracks.some((t) => t.kind === 'camera')
      ? cin.tracks.map((t) => (t.kind === 'camera' ? { kind: 'camera' as const, items: shots } : t))
      : [...cin.tracks, { kind: 'camera' as const, items: shots }];
    run(c, { type: 'cinematic.put', payload: { cinematic: { ...cin, tracks } } }, 'Camera shots');
  },
  /** the zone in front of the chest plays the open scene, once */
  chestZonePlays(c) {
    const { ed } = c;
    const cin = openCine(ed);
    const f = chestFront(ed);
    if (!cin || !f) throw new Error('Make the scene first, with a chest on the map.');
    const map = entry(ed);
    const m = ed.store.get<MapDoc>(paths.map(map))!;
    const mid: V3 = [(f.zone.min[0] + f.zone.max[0]) / 2, f.zone.min[1], (f.zone.min[2] + f.zone.max[2]) / 2];
    const z = m.zones.find((x) => mid[0] >= x.min[0] && mid[0] <= x.max[0] && mid[2] >= x.min[2] && mid[2] <= x.max[2]);
    if (!z) throw new Error('No zone in front of the chest.');
    if (z.onEnter?.some((x) => x.do === 'cinematic' && x.cinematic === cin.id)) return;
    ed.openMap(map);
    run(
      c,
      {
        type: 'map.updateZone',
        payload: {
          map,
          zone: z.id,
          patch: { onEnter: [...(z.onEnter ?? []), { do: 'cinematic', cinematic: cin.id, once: true }] },
        },
      },
      'The zone plays the scene',
    );
    ed.selectedZone.value = z.id;
    ed.right.value = 'inspect';
  },
  /** waits while the game plays the scene (a person watches it) */
  async waitScene(_c, a) {
    await new Promise((r) => setTimeout(r, Number(a.seconds ?? 8) * 1000));
  },
  /** what dragging from one pin to another does in the graph */
  wireNodes(c, a) {
    const { ed } = c;
    const id = ed.logicGraph.value;
    const g = id ? ed.store.get<LogicGraph>(paths.logic(id)) : undefined;
    if (!g) throw new Error('Open a graph first.');
    const want = a as {
      from: { type: string; args?: Record<string, unknown> };
      out: string;
      to: { type: string; args?: Record<string, unknown> };
      into: string;
    };
    const find = (w: typeof want.from) =>
      [...g.nodes]
        .reverse()
        .find(
          (n) =>
            n.type === w.type &&
            Object.entries(w.args ?? {}).every(([k, v]) => (n.args as Record<string, unknown> | undefined)?.[k] === v),
        );
    const from = find(want.from);
    const to = find(want.to);
    if (!from || !to) throw new Error('Add both nodes first.');
    if (g.edges.some((e) => e[0] === from.id && e[1] === want.out && e[2] === to.id && e[3] === want.into)) return;
    run(c, { type: 'logic.connect', payload: { graph: g.id, edge: [from.id, want.out, to.id, want.into] } }, 'Connect');
  },
  /** types the code into the open graph's code editor (Split view), keeping what already matches */
  async typeHere(c, a) {
    const id = c.ed.logicGraph.value ?? c.ed.store.list('logic/lg_')[0]?.slice(6, -5);
    if (!id) throw new Error('Make a graph first.');
    await openCode(c, id, 'split');
    await typeInto(c, String(a.code));
  },
};
