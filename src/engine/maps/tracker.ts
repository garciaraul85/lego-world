/**
 * Milestone 3b (B7a-1): what the maps remember in a play (and its saves): where the hero has been on each map
 * (floor by floor), the bosses beaten and where, maps revealed whole (a lookout, a script), and the pins and stamps
 * the player put down on the pause map.
 */
import type { MapNotes, MapPin } from '../../core/maps/notes';
import { floorOf, seenKey } from './model';

export type { MapNotes, MapPin };

type Notes = {
  seen: Set<string>;
  pins: MapPin[];
  beaten: { name: string; x: number; z: number; y: number }[];
  revealed: boolean;
};

/** how many pins a map can hold */
export const MAX_PINS = 60;

export class MapTracker {
  private maps = new Map<string, Notes>();

  private of(map: string): Notes {
    let n = this.maps.get(map);
    if (!n) {
      n = { seen: new Set(), pins: [], beaten: [], revealed: false };
      this.maps.set(map, n);
    }
    return n;
  }

  /** the hero is here: this cell (and those next to it, what it can see round it) of this floor has been seen */
  visit(map: string, x: number, y: number, z: number, dungeon: boolean) {
    const n = this.of(map);
    const f = dungeon ? floorOf(y) : 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        // a dungeon: only the room it is in (its walls hide the rest); outside: the cells round it too
        if (dungeon && (dx || dz)) continue;
        n.seen.add(seenKey(x + dx * 6, z + dz * 6, f));
      }
  }

  seen(map: string): ReadonlySet<string> {
    return this.of(map).seen;
  }
  revealed(map: string): boolean {
    return this.of(map).revealed;
  }
  reveal(map: string, on = true) {
    this.of(map).revealed = on;
  }

  /** a boss beaten here (its mark on the map is crossed out) */
  beat(map: string, name: string, x: number, y: number, z: number) {
    const n = this.of(map);
    if (!n.beaten.some((b) => b.name === name)) n.beaten.push({ name, x, y, z });
  }
  beaten(map: string) {
    return this.of(map).beaten;
  }

  pins(map: string): readonly MapPin[] {
    return this.of(map).pins;
  }
  /** a pin put down (false: the map has as many as it holds) */
  pin(map: string, p: MapPin): boolean {
    const n = this.of(map);
    if (n.pins.length >= MAX_PINS) return false;
    n.pins.push(p);
    return true;
  }
  /** the pin nearest a spot (within r studs) taken up */
  unpin(map: string, x: number, z: number, r: number): MapPin | null {
    const n = this.of(map);
    let best = -1;
    let bd = r;
    n.pins.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best < 0 ? null : (n.pins.splice(best, 1)[0] ?? null);
  }

  /** Milestone 3b (B7a-2): the pins with this note taken up (a script's mark moved or taken off) */
  unpinLabel(map: string, label: string): number {
    const n = this.of(map);
    const k = label.trim().toLowerCase();
    if (!k) return 0;
    const before = n.pins.length;
    n.pins = n.pins.filter((p) => (p.label ?? '').trim().toLowerCase() !== k);
    return before - n.pins.length;
  }

  reset() {
    this.maps.clear();
  }

  capture(): Record<string, MapNotes> {
    const out: Record<string, MapNotes> = {};
    for (const [id, n] of this.maps) {
      const o: MapNotes = {};
      if (n.seen.size) o.seen = [...n.seen].slice(0, 40000);
      if (n.pins.length) o.pins = n.pins.slice(0, MAX_PINS);
      if (n.beaten.length) o.beaten = n.beaten.slice(0, 20);
      if (n.revealed) o.revealed = true;
      if (Object.keys(o).length) out[id] = o;
    }
    return out;
  }

  restore(d: Record<string, MapNotes> | undefined) {
    this.maps.clear();
    for (const [id, o] of Object.entries(d ?? {}))
      this.maps.set(id, {
        seen: new Set(o.seen ?? []),
        pins: [...(o.pins ?? [])],
        beaten: [...(o.beaten ?? [])],
        revealed: !!o.revealed,
      });
  }
}
