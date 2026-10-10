import type { Brick } from '../bricks/codec';
import { footprint } from '../bricks/inspect';
import { MapBricks } from '../bricks/map-bricks';
import type { ProjectStore } from '../project/store';
import { type Gates, type MapDoc, paths } from '../schema';

export type WorldIssue = {
  level: 'warn' | 'info';
  code: 'unreachable' | 'noReturn' | 'blockedSpawn' | 'noSpawn' | 'outside';
  message: string;
  map: string;
  spawn?: string;
};

/** Maps reachable from `start` following gates (two-way gates both ways). */
export function reachable(gates: Gates, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const g of gates.gates) {
      const next = g.from.map === cur ? g.to.map : g.twoWay && g.to.map === cur ? g.from.map : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** True when a character standing at the spawn would be inside bricks (v68 arrival check, simplified to the body column). */
export function spawnBlocked(bricks: readonly Brick[], pos: readonly number[]): boolean {
  const [x, y, z] = pos as [number, number, number];
  const yPlate = Math.round(y / 0.4);
  for (const b of bricks) {
    const [w, d] = footprint(b);
    const h = b.type.startsWith('brick') ? 3 : 1;
    if (
      x + 0.4 > b.x &&
      x - 0.4 < b.x + w &&
      z + 0.4 > b.z &&
      z - 0.4 < b.z + d &&
      b.y < yPlate + 9 &&
      b.y + h > yPlate
    )
      return true;
  }
  return false;
}

/** World graph checks (P2.5 Validate routes). */
export function validateWorld(store: ProjectStore): WorldIssue[] {
  const gates = store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
  const maps = gates.mapOrder.map((id) => store.get<MapDoc>(paths.map(id))!).filter(Boolean);
  const out: WorldIssue[] = [];
  const entry = store.manifest.entry.map;
  const fromStart = reachable(gates, entry);
  for (const m of maps) {
    if (!m.spawns.length)
      out.push({ level: 'warn', code: 'noSpawn', message: `${m.name} has no spawn point`, map: m.id });
    if (maps.length > 1 && !fromStart.has(m.id))
      out.push({
        level: 'warn',
        code: 'unreachable',
        message: `${m.name} can’t be reached from the start map`,
        map: m.id,
      });
    else if (m.id !== entry && !reachable(gates, m.id).has(entry))
      out.push({ level: 'info', code: 'noReturn', message: `${m.name} has no route back to the start map`, map: m.id });
    const bricks = new MapBricks(store, m.id).all();
    for (const s of m.spawns) {
      if (spawnBlocked(bricks, s.pos))
        out.push({
          level: 'warn',
          code: 'blockedSpawn',
          message: `Spawn “${s.name}” on ${m.name} is inside bricks`,
          map: m.id,
          spawn: s.id,
        });
      if (m.size && (Math.abs(s.pos[0]) > m.size.w / 2 || Math.abs(s.pos[2]) > m.size.d / 2))
        out.push({
          level: 'warn',
          code: 'outside',
          message: `Spawn “${s.name}” is outside ${m.name}’s generated world`,
          map: m.id,
          spawn: s.id,
        });
    }
  }
  return out;
}
