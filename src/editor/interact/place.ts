import { SND } from '../../builtin/audio';
import { FX } from '../../builtin/effects';
import { rotatedFootprint } from '../../core/assets/expand';
import { newId } from '../../core/ids';
import { type EffectInstance, type EmitterInstance, type Instances, paths, type UiInstance } from '../../core/schema';
import { placeCommands, resolveAsset } from '../assets';
import type { EditorState } from '../state';

/**
 * P31: placing things at a point on the ground. The 3D view's tools, the right-click menu and drag-and-drop
 * all go through these, so each way of adding something makes the same commands (and the same undo step).
 * A ground point is in brick units: x/z in studs, y in plate heights (world y = y * 0.4).
 */
export type GroundPoint = { x: number; y: number; z: number };

/** the open map's sound emitters, world UI items and (P23) effects */
export function mapItems(ed: EditorState): Array<EmitterInstance | UiInstance | EffectInstance> {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  return (inst?.items ?? []).filter(
    (i): i is EmitterInstance | UiInstance | EffectInstance =>
      i.kind === 'emitter' || i.kind === 'ui' || i.kind === 'effect',
  );
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
