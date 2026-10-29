import { surfaceOf } from '../../core/gamegen/places';
import { type Instances, paths } from '../../core/schema';
import type { EditorState } from '../state';

type V3 = [number, number, number];

/**
 * Step 11, 4c: where a character placed near a point can really stand: the nearest cell of open ground (studs
 * or a tile with head room, its neighbours open too) about level with the point, not on another character.
 * Without this a character placed on a bush or a bump was moved by the game to a far corner when Play began.
 */
export function standingSpot(ed: EditorState, at: V3): V3 {
  const map = ed.mapId.value;
  const s = surfaceOf(ed.store, map);
  const others = (ed.store.get<Instances>(paths.instances(map))?.items ?? []).flatMap((i) => {
    if (i.kind !== 'npc') return [];
    const st = i.state as { x?: unknown; z?: unknown };
    return [[Number(st.x) || 0, Number(st.z) || 0] as [number, number]];
  });
  const roomy = (x: number, z: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!s.open(x + dx, z + dz)) return false;
    return !others.some(([ox, oz]) => Math.hypot(ox - (x + 0.5), oz - (z + 0.5)) < 1.6);
  };
  const near = (level: number) =>
    s.nearestOpen(
      Math.floor(at[0]),
      Math.floor(at[2]),
      (x, z, top) => Math.abs(top * 0.4 - at[1]) <= level && roomy(x, z),
    );
  const p = near(2.4) ?? near(40);
  return p ? [p[0] + 0.5, p[1] * 0.4, p[2] + 0.5] : at;
}
