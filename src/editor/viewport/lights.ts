import { BUILTIN_EFFECTS } from '../../builtin/effects';
import type { ExpandedInstance } from '../../core/assets/instances';
import type { Effect } from '../../core/effects/schema';
import { paths } from '../../core/schema';
import { gatherLights, type LightSource } from '../../engine/lighting/lights';
import { mapItems } from '../interact/place';
import type { EditorState } from '../state';

/** P27: the lights of the open map as the Scene view shows them (as the map was made), drawn again on each change */
let cache: { rev: number; map: string; instances: readonly ExpandedInstance[]; lights: LightSource[] } | null = null;
export function editorLights(ed: EditorState, instances: readonly ExpandedInstance[]): LightSource[] {
  const rev = ed.revision.peek();
  const map = ed.mapId.peek();
  if (cache && cache.rev === rev && cache.map === map && cache.instances === instances) return cache.lights;
  const lights = gatherLights({
    items: mapItems(ed),
    assets: instances.map((e) => ({ inst: e.inst, def: e.def, state: e.inst.state })),
    effectDef: (id) => ed.store.get<Effect>(paths.effect(id)) ?? BUILTIN_EFFECTS.find((e) => e.id === id),
  });
  cache = { rev, map, instances, lights };
  return lights;
}
