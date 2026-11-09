import { SND } from '../../builtin/audio';
import { FX } from '../../builtin/effects';
import { rotatedFootprint } from '../../core/assets/expand';
import { newId } from '../../core/ids';
import { LIGHT_PRESET, type LightPreset } from '../../core/lighting/light';
import {
  type EffectInstance,
  type EmitterInstance,
  type Instances,
  type LightInstance,
  type ModelInstance,
  paths,
  type UiInstance,
  type WaterInstance,
} from '../../core/schema';
import { placeCommands, resolveAsset } from '../assets';
import type { EditorState } from '../state';

/**
 * P31: placing things at a point on the ground. The 3D view's tools, the right-click menu and drag-and-drop
 * all go through these, so each way of adding something makes the same commands (and the same undo step).
 * A ground point is in brick units: x/z in studs, y in plate heights (world y = y * 0.4).
 */
export type GroundPoint = { x: number; y: number; z: number };

/** the open map's sound emitters, world UI items and (P23) effects */
export type MapItem = EmitterInstance | UiInstance | EffectInstance | LightInstance;
export function mapItems(ed: EditorState): MapItem[] {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  return (inst?.items ?? []).filter(
    (i): i is MapItem => i.kind === 'emitter' || i.kind === 'ui' || i.kind === 'effect' || i.kind === 'light',
  );
}

/** P27: a light placed over the ground at the point (a torch at head height), from a preset */
export function placeLightAt(ed: EditorState, p: GroundPoint, preset: LightPreset = 'torch'): string | null {
  const id = newId('instance');
  const n = mapItems(ed).filter((i) => i.kind === 'light').length + 1;
  const item: LightInstance = {
    id,
    kind: 'light',
    name: `${LIGHT_PRESET[preset].name} ${n}`,
    pos: [Math.round(p.x * 2) / 2, p.y * 0.4 + 2.4, Math.round(p.z * 2) / 2],
    light: { ...LIGHT_PRESET[preset].light },
    on: true,
  };
  if (!ed.exec({ type: 'item.add', payload: { map: ed.mapId.value, item } }, { label: 'Add light' }).ok) return null;
  selectOnly(ed, 'item', id);
  return id;
}

/** P23: an effect placed on the ground at the point (a stream keeps going; a burst every few seconds) */
export function placeEffectAt(ed: EditorState, p: GroundPoint, effect: string = FX.fire): string | null {
  const id = newId('instance');
  const n = mapItems(ed).filter((i) => i.kind === 'effect').length + 1;
  const item: EffectInstance = {
    id,
    kind: 'effect',
    name: `Effect ${n}`,
    effect,
    pos: [Math.round(p.x * 2) / 2, p.y * 0.4 + 0.6, Math.round(p.z * 2) / 2],
    scale: 1,
    interval: [2, 4],
    maxDistance: 40,
    playing: true,
  };
  if (!ed.exec({ type: 'item.add', payload: { map: ed.mapId.value, item } }, { label: 'Add effect' }).ok) return null;
  selectOnly(ed, 'item', id);
  return id;
}

export const selectOnly = (ed: EditorState, kind: 'spawn' | 'zone' | 'item', id: string | null) => {
  ed.selection.value = new Set();
  ed.selectedSpawn.value = kind === 'spawn' ? id : null;
  ed.selectedZone.value = kind === 'zone' ? id : null;
  ed.selectedItem.value = kind === 'item' ? id : null;
  ed.right.value = 'inspect';
};

/** Where an asset's corner goes so the asset is centred on the point. */
export function assetCorner(
  ed: EditorState,
  asset: string,
  rot: number,
  p: GroundPoint,
): [number, number, number] | null {
  const def = resolveAsset(ed, asset);
  if (!def) return null;
  const [w, d] = rotatedFootprint(def, rot);
  return [Math.round(p.x - w / 2), p.y, Math.round(p.z - d / 2)];
}

export function placeAssetAt(ed: EditorState, asset: string, rot: number, p: GroundPoint): boolean {
  const at = assetCorner(ed, asset, rot, p);
  if (!at) {
    ed.notify('That asset could not be found.', true);
    return false;
  }
  const def = resolveAsset(ed, asset);
  return ed.exec(placeCommands(ed, asset, at, rot), { label: `Place ${def?.name ?? 'asset'}` }).ok;
}

export function placeItemAt(ed: EditorState, kind: 'sound' | 'sign', p: GroundPoint): string | null {
  const id = newId('instance');
  const at: [number, number, number] = [Math.round(p.x * 2) / 2, p.y * 0.4, Math.round(p.z * 2) / 2];
  const item: EmitterInstance | UiInstance =
    kind === 'sound'
      ? {
          id,
          kind: 'emitter',
          name: `Emitter ${mapItems(ed).filter((i) => i.kind === 'emitter').length + 1}`,
          sound: SND.birds,
          pos: [at[0], at[1] + 1, at[2]],
          mode: 'loop',
          interval: [3, 6],
          maxDistance: 16,
          volume: 0,
        }
      : {
          id,
          kind: 'ui',
          widget: 'sign',
          pos: [at[0], at[1] + 2.4, at[2]],
          text: 'Welcome to {map.name}',
          maxDistance: 24,
        };
  if (!ed.exec({ type: 'item.add', payload: { map: ed.mapId.value, item } }).ok) return null;
  selectOnly(ed, 'item', id);
  return id;
}

export function placeSpawnAt(ed: EditorState, p: GroundPoint, yaw = 0): string | null {
  const before = new Set((ed.mapDoc.value?.spawns ?? []).map((s) => s.id));
  const r = ed.exec({
    type: 'map.addSpawn',
    payload: { map: ed.mapId.value, pos: [Math.round(p.x), p.y * 0.4, Math.round(p.z)], yaw },
  });
  if (!r.ok) return null;
  return (ed.mapDoc.value?.spawns ?? []).find((s) => !before.has(s.id))?.id ?? null;
}

/** A trigger zone of w×d studs, 4 units tall, starting at the point's cell. */
export function placeZoneAt(ed: EditorState, p: GroundPoint, w = 4, d = 4): string | null {
  const x0 = Math.floor(p.x - w / 2);
  const z0 = Math.floor(p.z - d / 2);
  const y = p.y * 0.4;
  const n = (ed.mapDoc.value?.zones.length ?? 0) + 1;
  const r = ed.exec(
    {
      type: 'map.addZone',
      payload: { map: ed.mapId.value, zone: { min: [x0, y, z0], max: [x0 + w, y + 4, z0 + d], tags: [`Zone ${n}`] } },
    },
    { label: 'Add trigger zone' },
  );
  if (!r.ok) return null;
  const id = ed.mapDoc.value?.zones.at(-1)?.id ?? null;
  selectOnly(ed, 'zone', id);
  return id;
}

/** What a right-click (or a keyboard menu key) is about in the 3D view. */
export type SceneTarget =
  | { kind: 'item'; id: string }
  | { kind: 'spawn'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'object'; brick: number }
  /** brick: the loose terrain brick that was clicked, if any */
  | { kind: 'ground'; at: GroundPoint; brick?: number };

/** Milestone 2b: the open map's bodies of water */
export function waterItems(ed: EditorState): WaterInstance[] {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  return (inst?.items ?? []).filter((i): i is WaterInstance => i.kind === 'water');
}

export const WATER_PRESET: Record<WaterInstance['body'], { name: string; size: [number, number, number] }> = {
  pool: { name: 'Pool', size: [8, 3, 8] },
  // deep enough to swim and dive in (a person floats with the head out in water about three quarters as deep as
  // they are tall); shallow water is waded
  river: { name: 'River', size: [48, 4.4, 8] },
  lake: { name: 'Lake', size: [24, 4, 24] },
  sea: { name: 'Sea', size: [64, 8, 64] },
};

/** Milestone 2b: water set down on the ground, centred where you clicked (its surface above the ground) */
export function placeWaterAt(ed: EditorState, p: GroundPoint, body: WaterInstance['body'] = 'pool'): string | null {
  const id = newId('instance');
  const pre = WATER_PRESET[body];
  const n = waterItems(ed).filter((w) => w.body === body).length + 1;
  const [w, h, d] = pre.size;
  const item: WaterInstance = {
    id,
    kind: 'water',
    name: `${pre.name} ${n}`,
    pos: [Math.round(p.x - w / 2), Math.round(p.y * 0.4 * 10) / 10, Math.round(p.z - d / 2)],
    size: [w, h, d],
    body,
    ...(body === 'river' ? { current: [3, 0] as [number, number] } : {}),
  };
  if (!ed.exec({ type: 'item.add', payload: { map: ed.mapId.value, item } }, { label: 'Add water' }).ok) return null;
  selectOnly(ed, 'item', id);
  return id;
}

/** Milestone 2b, 10c part 5: the open map's placed 3D models */
export function modelItems(ed: EditorState): ModelInstance[] {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  return (inst?.items ?? []).filter((i): i is ModelInstance => i.kind === 'model');
}

/** part 5: the 3D model placed last (right-clicking the ground places it again) */
export const lastModel = { ref: 'builtin:lantern-post', name: 'Lantern post' };

/** part 5: a 3D model (a built-in one, or an imported file's ref) set down on the ground where you clicked */
export function placeModelAt(ed: EditorState, p: GroundPoint, model: string, name: string): string | null {
  lastModel.ref = model;
  lastModel.name = name;
  const id = newId('instance');
  const n = modelItems(ed).filter((m) => m.model === model).length + 1;
  const item: ModelInstance = {
    id,
    kind: 'model',
    name: `${name.replace(/\.(glb|gltf)$/i, '').slice(0, 52)} ${n}`,
    model,
    pos: [Math.round(p.x * 10) / 10, Math.round(p.y * 0.4 * 10) / 10, Math.round(p.z * 10) / 10],
  };
  if (!ed.exec({ type: 'item.add', payload: { map: ed.mapId.value, item } }, { label: 'Add model' }).ok) return null;
  selectOnly(ed, 'item', id);
  return id;
}

/** Milestone 2b: the copies of loose assets on the open map, with the middle of their ground plan (studs, plates) */
export function looseCopies(ed: EditorState): { id: string; name: string; x: number; y: number; z: number }[] {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  const out: { id: string; name: string; x: number; y: number; z: number }[] = [];
  for (const i of inst?.items ?? []) {
    if (i.kind !== 'asset') continue;
    const def = resolveAsset(ed, i.asset);
    if (!def?.loose) continue;
    const [w, d] = rotatedFootprint(def, i.rot);
    out.push({ id: i.id, name: def.name, x: i.pos[0] + w / 2, y: i.pos[1], z: i.pos[2] + d / 2 });
  }
  return out;
}

/** whether a point (studs; y in world units) is inside a body of water */
export const inWater = (w: WaterInstance, x: number, y: number, z: number) =>
  x >= w.pos[0] &&
  x <= w.pos[0] + w.size[0] &&
  z >= w.pos[2] &&
  z <= w.pos[2] + w.size[2] &&
  y >= w.pos[1] - 0.5 &&
  y <= w.pos[1] + w.size[1];
