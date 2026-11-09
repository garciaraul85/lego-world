import type { Brick } from '../../core/bricks/codec';

/**
 * P27 / Milestone 2b, the object core: a map's placed objects kept in compact lists with indexes, so the game
 * looks things up without walking every object each step. With 100,000 objects on a map a walk costs
 * milliseconds; these answers cost microseconds:
 *
 * - by id and by name;
 * - by brick (which object a brick belongs to): a binary search over the objects' brick id ranges;
 * - near a point: a grid of 16-stud cells holding each object's centre (in typed arrays, centres too), so the
 *   systems that only matter near the hero (prompts, checkpoints, zones) look at the few objects around;
 * - by kind: objects with interactions, checkpoints.
 *
 * The index follows the world's object list: a new list (objects removed) builds it again; objects added to the
 * same list (a drop, a spawn) are added to it.
 */
export type IndexedObject = {
  inst: { id: string; name?: string; idBase: number; pos: number[] };
  def: {
    bricks: readonly unknown[];
    interactions: readonly unknown[];
    checkpoint?: unknown;
    /** step 12a: a lock or a press switch is used with Action too */
    lock?: unknown;
    switch?: { by: string } | undefined;
    /** step 12b: a mirror turns with Action */
    mirror?: { turns?: boolean | undefined } | undefined;
  };
  bricks: readonly Pick<Brick, 'x' | 'y' | 'z'>[];
};

/** studs per grid cell */
export const CELL = 16;
const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class ObjectIndex<T extends IndexedObject> {
  private list: readonly T[] = [];
  private count = 0;
  private ids = new Map<string, T>();
  private names = new Map<string, T>();
  /** brick id ranges, sorted by start: starts[i]..ends[i] belongs to ranged[i] */
  private starts = new Float64Array(0);
  private ends = new Float64Array(0);
  private ranged: T[] = [];
  private rangedSorted = true;
  /** centres (x, y, z per object, in list order) */
  private centres = new Float32Array(0);
  private cells = new Map<number, number[]>();
  readonly interactive: T[] = [];
  readonly checkpoints: T[] = [];
  /** how far the widest object with interactions reaches from its centre (studs): a search near the hero for
   *  prompts looks this much further */
  interactiveReach = 0;

  /** the index for this list (built again when the list is new, extended when it grew) */
  sync(list: readonly T[]): this {
    if (list !== this.list || list.length < this.count) this.build(list);
    else if (list.length > this.count) for (let i = this.count; i < list.length; i++) this.add(list[i]!, i);
    this.count = list.length;
    return this;
  }

  private build(list: readonly T[]) {
    this.list = list;
    this.count = 0;
    this.ids.clear();
    this.names.clear();
    this.cells.clear();
    this.interactive.length = 0;
    this.checkpoints.length = 0;
    this.interactiveReach = 0;
    this.ranged = [];
    this.centres = new Float32Array(Math.max(16, list.length * 3));
    for (let i = 0; i < list.length; i++) this.add(list[i]!, i);
    this.sortRanges();
  }

  private add(o: T, i: number) {
    this.ids.set(o.inst.id, o);
    if (o.inst.name) this.names.set(o.inst.name.toLowerCase(), o);
    const usable = o.def.interactions.length > 0 || !!o.def.lock || o.def.switch?.by === 'press';
    if (usable) this.interactive.push(o);
    if (o.def.checkpoint) this.checkpoints.push(o);
    if (o.def.bricks.length) {
      this.ranged.push(o);
      this.rangedSorted = false;
    }
    // the centre of its bricks (its corner when it has none)
    let x = o.inst.pos[0] ?? 0;
    let y = (o.inst.pos[1] ?? 0) * 0.4;
    let z = o.inst.pos[2] ?? 0;
    if (o.bricks.length) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      let sy = 0;
      for (const b of o.bricks) {
        if (b.x < x0) x0 = b.x;
        if (b.x > x1) x1 = b.x;
        if (b.z < z0) z0 = b.z;
        if (b.z > z1) z1 = b.z;
        sy += b.y;
      }
      x = (x0 + x1 + 1) / 2;
      z = (z0 + z1 + 1) / 2;
      y = (sy / o.bricks.length) * 0.4;
      if (usable) this.interactiveReach = Math.max(this.interactiveReach, Math.hypot(x1 - x0 + 2, z1 - z0 + 2) / 2);
    }
    if (i * 3 + 3 > this.centres.length) {
      const grown = new Float32Array(Math.max(this.centres.length * 2, i * 3 + 3));
      grown.set(this.centres);
      this.centres = grown;
    }
    this.centres[i * 3] = x;
    this.centres[i * 3 + 1] = y;
    this.centres[i * 3 + 2] = z;
    const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
    const cell = this.cells.get(k);
    if (cell) cell.push(i);
    else this.cells.set(k, [i]);
  }

  private sortRanges() {
    this.ranged.sort((a, b) => a.inst.idBase - b.inst.idBase);
    this.starts = new Float64Array(this.ranged.length);
    this.ends = new Float64Array(this.ranged.length);
    this.ranged.forEach((o, i) => {
      this.starts[i] = o.inst.idBase;
      this.ends[i] = o.inst.idBase + o.def.bricks.length;
    });
    this.rangedSorted = true;
  }

  byId(id: string): T | undefined {
    return this.ids.get(id);
  }

  /** by its name (any case) */
  byName(name: string): T | undefined {
    return this.names.get(name.toLowerCase());
  }

  /** the object a brick id belongs to */
  byPiece(id: number): T | null {
    if (!this.rangedSorted) this.sortRanges();
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.starts[mid]! > id) hi = mid - 1;
      else if (this.ends[mid]! <= id) lo = mid + 1;
      else return this.ranged[mid]!;
    }
    return null;
  }

  /** an object's centre (from its bricks) */
  centre(o: T): [number, number, number] | null {
    const i = this.list.indexOf(o);
    return i < 0 ? null : [this.centres[i * 3]!, this.centres[i * 3 + 1]!, this.centres[i * 3 + 2]!];
  }

  /** objects whose centre is within r studs of (x, z) on the ground plan */
  near(x: number, z: number, r: number): T[] {
    const out: T[] = [];
    this.box(x - r, z - r, x + r, z + r, (o, cx, cz) => {
      if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) out.push(o);
    });
    return out;
  }

  /** objects whose centre is inside a box on the ground plan */
  inBox(x0: number, z0: number, x1: number, z1: number): T[] {
    const out: T[] = [];
    this.box(x0, z0, x1, z1, (o, cx, cz) => {
      if (cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1) out.push(o);
    });
    return out;
  }

  /** every object's centre, height included, for exact tests (x, y, z) */
  centreOf(i: number): [number, number, number] {
    return [this.centres[i * 3]!, this.centres[i * 3 + 1]!, this.centres[i * 3 + 2]!];
  }

  private box(x0: number, z0: number, x1: number, z1: number, f: (o: T, cx: number, cz: number) => void) {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const cell = this.cells.get(key(cx, cz));
        if (!cell) continue;
        for (const i of cell) {
          const o = this.list[i];
          if (o) f(o, this.centres[i * 3]!, this.centres[i * 3 + 2]!);
        }
      }
  }
}
