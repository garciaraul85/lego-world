import { rotatedFootprint } from '../../core/assets/expand';
import type { ExpandedInstance } from '../../core/assets/instances';
import type { ActionCtx } from '../actions/registry';
import { placeCommands, resolveAsset } from '../assets';
import { groupLabel } from '../categories';
import { openLogicFor } from '../workspaces/logic/createFromContext';
import { type MenuEntry, type MenuSpec, openMenu } from './menu';
import {
  type GroundPoint,
  mapItems,
  placeAssetAt,
  placeEffectAt,
  placeItemAt,
  placeSpawnAt,
  placeZoneAt,
  type SceneTarget,
} from './place';

/**
 * P31 right-click menus for the 3D view and the Outliner. Every menu lists what you can do to that thing;
 * Help is second to last and Delete is always last. Everything goes through registry actions or commands,
 * so it can be undone.
 */

const act = (id: string, label?: string): MenuEntry => ({ kind: 'action', id, ...(label ? { label } : {}) });
const item = (id: string, label: string, run: () => void, disabled = false): MenuEntry => ({
  kind: 'item',
  id,
  label,
  run,
  disabled,
});
const SEP: MenuEntry = { kind: 'sep' };

/** The asset copy the whole selection belongs to, if it is exactly one copy. */
export function selectedInstance(c: ActionCtx): ExpandedInstance | null {
  const s = c.ed.scene.value;
  const sel = [...c.ed.selection.value];
  if (!s || !sel.length) return null;
  const owner = s.ownerOf(sel[0]!);
  if (!owner) return null;
  return sel.every((id) => s.ownerOf(id)?.inst.id === owner.inst.id) ? owner : null;
}

/**
 * P32: the selected loose bricks (the ground, an old build) become an asset placed where they were, to be
 * changed brick by brick in the Assets screen.
 */
export function makeAssetOfSelection(c: ActionCtx): boolean {
  const { ed } = c;
  const sel = ed.selectedBricks.value;
  if (!sel.length || ed.selectionHasAsset.value) return false;
  const name = sel[0]?.group ? groupLabel(sel[0].group).replace(/ \d+$/, '') : 'My asset';
  const r = ed.exec({ type: 'asset.make', payload: { map: ed.mapId.value, ids: sel.map((b) => b.id), name } });
  if (!r.ok) return false;
  ed.select([]);
  ed.notify(`Made the asset “${name}”. Change it brick by brick in the Assets screen.`);
  return true;
}

/** Bricks (loose or an asset copy) that are selected. */
export function objectMenu(c: ActionCtx): MenuSpec {
  const { ed } = c;
  const map = ed.mapId.value;
  const inst = selectedInstance(c);
  const n = ed.selection.value.size;
  if (inst) {
    const { def } = inst;
    const [w] = rotatedFootprint(def, inst.inst.rot);
    return {
      title: def.name,
      help: { page: 'e/scene.asset', label: 'Help about assets' },
      entries: [
        item('asset.duplicate', 'Duplicate', () => {
          const p = inst.inst.pos;
          ed.exec(placeCommands(ed, def.id, [p[0] + w + 1, p[1], p[2]], inst.inst.rot), {
            label: `Duplicate ${def.name}`,
          });
        }),
        act('edit.rotate', 'Turn 90°'),
        act('view.frame', 'Zoom to it'),
        SEP,
        item(
          'asset.straighten',
          'Straighten',
          () =>
            ed.exec(
              { type: 'instance.transform', payload: { map, instance: inst.inst.id, tilt: [0, 0, 0] } },
              { label: 'Straighten asset' },
            ),
          !inst.inst.tilt,
        ),
        item(
          'asset.resetSize',
          'Reset size',
          () =>
            ed.exec(
              { type: 'instance.transform', payload: { map, instance: inst.inst.id, scale: [1, 1, 1] } },
              { label: 'Reset asset size' },
            ),
          !inst.inst.scale,
        ),
        item('asset.edit', 'Edit in the Assets screen…', () => c.ui.editAsset(def.id)),
        SEP,
        item('logic.interact', 'When the player uses it…', () =>
          openLogicFor(c, `${def.name} · on interact`, 'event.onInteract', { asset: def.id }),
        ),
        item('logic.smash', 'When it is smashed…', () =>
          openLogicFor(c, `${def.name} · on smash`, 'event.onSmash', { asset: def.id }),
        ),
        item('logic.rebuild', 'When it is rebuilt…', () =>
          openLogicFor(c, `${def.name} · on rebuild`, 'event.onRebuildFinished', { asset: def.id }),
        ),
        act('edit.delete'),
      ],
    };
  }
  return {
    title: n === 1 ? 'Brick' : `${n} bricks`,
    help: { page: 'e/scene.selection', label: 'Help about building' },
    entries: [
      act('edit.duplicate'),
      act('edit.rotate', 'Turn 90°'),
      act('view.frame', 'Zoom to it'),
      act('edit.selectGroup'),
      SEP,
      item('bricks.makeAsset', 'Make an asset of these bricks', () => makeAssetOfSelection(c)),
      act('edit.delete'),
    ],
  };
}

export function spawnMenu(c: ActionCtx, id: string): MenuSpec {
  const { ed } = c;
  const sp = ed.mapDoc.value?.spawns.find((s) => s.id === id);
  const isStart = ed.store.manifest.entry.spawn === id && ed.store.manifest.entry.map === ed.mapId.value;
  return {
    title: sp?.name ?? 'Spawn point',
    help: { page: 'e/scene.spawn', label: 'Help about spawn points' },
    entries: [
      act('play.here', 'Play from here'),
      item(
        'spawn.start',
        isStart ? 'Game starts here' : 'Start the game here',
        () =>
          ed.exec(
            { type: 'project.update', payload: { entryMap: ed.mapId.value, entrySpawn: id } },
            { label: 'Set start spawn' },
          ),
        isStart,
      ),
      act('view.frame', 'Zoom to it'),
      act('edit.delete'),
    ],
  };
}

export function zoneMenu(c: ActionCtx, id: string): MenuSpec {
  const { ed } = c;
  const z = ed.mapDoc.value?.zones.find((x) => x.id === id);
  const name = z?.tags[0] ?? 'Trigger zone';
  return {
    title: name,
    help: { page: 'e/scene.zone', label: 'Help about trigger zones' },
    entries: [
      item('logic.enter', 'When someone walks in…', () =>
        openLogicFor(c, `${name} · enter`, 'event.onEnterZone', { zone: id }),
      ),
      item('logic.exit', 'When someone walks out…', () =>
        openLogicFor(c, `${name} · exit`, 'event.onExitZone', { zone: id }),
      ),
      SEP,
      act('view.frame', 'Zoom to it'),
      act('edit.delete'),
    ],
  };
}

export function itemMenu(c: ActionCtx, id: string): MenuSpec {
  const { ed } = c;
  const it = mapItems(ed).find((x) => x.id === id);
  const sound = it?.kind === 'emitter';
  return {
    title: sound ? (it.name ?? 'Sound') : 'Sign',
    help: sound ? { page: 'audio', label: 'Help about sounds' } : { page: 'screens', label: 'Help about signs' },
    entries: [
      item('item.edit', sound ? 'Pick the sound…' : 'Edit the text…', () => (ed.right.value = 'inspect')),
      act('view.frame', 'Zoom to it'),
      act('edit.delete'),
    ],
  };
}

/** Empty ground: add things right where you clicked. */
export function groundMenu(c: ActionCtx, at: GroundPoint, brick?: number): MenuSpec {
  const { ed } = c;
  const brush = ed.assetBrush.value;
  const def = brush.asset ? resolveAsset(ed, brush.asset) : null;
  return {
    title: 'Ground',
    help: { page: 'guide/scene', label: 'Help about the scene' },
    entries: [
      item(
        'ground.asset',
        def ? `Place ${def.name} here` : 'Place an asset here (pick one in the dock first)',
        () => def && placeAssetAt(ed, def.id, brush.rot, at),
        !def,
      ),
      item('ground.zone', 'Add a trigger zone here', () => placeZoneAt(ed, at)),
      item('ground.spawn', 'Add a spawn point here', () => placeSpawnAt(ed, at)),
      item('ground.sound', 'Add a sound here', () => placeItemAt(ed, 'sound', at)),
      item('ground.sign', 'Add a sign here', () => placeItemAt(ed, 'sign', at)),
      // P23
      item('ground.effect', 'Add an effect here', () => placeEffectAt(ed, at)),
      // P28: test from any spot
      item('ground.playHere', 'Play from here (test)', () =>
        c.ui.play('engine', { map: ed.mapId.value, at: [at.x, at.y * 0.4, at.z] }),
      ),
      SEP,
      ...(brick !== undefined ? [item('ground.select', 'Select this ground brick', () => ed.select([brick]))] : []),
      act('tool.asset', 'Place assets'),
      act('view.fit', 'Show the whole map'),
    ],
  };
}

export function sceneMenuFor(c: ActionCtx, t: SceneTarget): MenuSpec {
  switch (t.kind) {
    case 'object':
      return objectMenu(c);
    case 'spawn':
      return spawnMenu(c, t.id);
    case 'zone':
      return zoneMenu(c, t.id);
    case 'item':
      return itemMenu(c, t.id);
    case 'ground':
      return groundMenu(c, t.at, t.brick);
  }
}

export function openSceneMenu(c: ActionCtx, t: SceneTarget, x: number, y: number) {
  return openMenu(c, sceneMenuFor(c, t), x, y);
}

/** What is selected now, as a menu target (Shift+F10 and the menu key; the Outliner). */
export function selectionTarget(c: ActionCtx): SceneTarget | null {
  const { ed } = c;
  if (ed.selectedItem.value) return { kind: 'item', id: ed.selectedItem.value };
  if (ed.selectedSpawn.value) return { kind: 'spawn', id: ed.selectedSpawn.value };
  if (ed.selectedZone.value) return { kind: 'zone', id: ed.selectedZone.value };
  const first = ed.selection.value.values().next().value;
  if (first !== undefined) return { kind: 'object', brick: first };
  const cur = ed.cursor.value;
  return cur ? { kind: 'ground', at: { x: cur.x, y: cur.y, z: cur.z } } : null;
}

/** Opens the menu for whatever is selected (Outliner right-click, Shift+F10). Returns false if nothing fits. */
export function openSelectionMenu(c: ActionCtx, x: number, y: number): boolean {
  const t = selectionTarget(c);
  if (!t) return false;
  openSceneMenu(c, t, x, y);
  return true;
}
