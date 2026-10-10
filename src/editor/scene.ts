import { type Brick, chunkKey, decodeChunk } from '../core/bricks/codec';
import { footprint } from '../core/bricks/inspect';
import { worldGenerator } from '../core/legacy/modules';
import type { ProjectStore } from '../core/project/store';
import { type Chunk, type MapDoc, paths } from '../core/schema';
import { toLegacyConfig } from '../core/worldgen/generate';
import type { Vec3 } from '../engine/render/math';
import { brickHeightUnits, type RenderBrick } from '../engine/render/renderer';
import { type CategoryId, categoryOf } from './categories';

export type Hit = { brick: Brick; t: number; point: Vec3; normal: Vec3 };
export type SurfaceHit = { x: number; z: number; y: number; t: number; on: Brick | null };

const kindOf = (type: string) =>
  (type.startsWith('brick') ? 'brick' : type.startsWith('plate') ? 'plate' : 'tile') as RenderBrick['kind'];

/**
 * Decoded view of one map's bricks for the editor: chunk -> bricks, id -> brick, group index.
 * Follows the store: a change to one chunk file re-decodes only that chunk.
 */
export class SceneModel {
  readonly chunks = new Map<string, Brick[]>();
  readonly byId = new Map<number, { brick: Brick; key: string }>();
  readonly groups = new Map<string, number[]>();
  private listeners = new Set<(changed: string[], full: boolean) => void>();
  private unsub: () => void;
  private pavement: ((b: Brick) => boolean) | null = null;
  map: MapDoc;
  revision = 0;

  constructor(
    private readonly store: ProjectStore,
    readonly mapId: string,
  ) {
    this.map = store.get<MapDoc>(paths.map(mapId))!;
    this.setupPavement();
    for (const p of store.list(paths.chunkDir(mapId))) this.loadChunk(p);
    this.reindexGroups();
    this.unsub = store.subscribe(`maps/${mapId}/`, (changed) => this.onStore(changed));
  }

  dispose() {
    this.unsub();
    this.listeners.clear();
  }

  onChange(fn: (changedChunks: string[], full: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setupPavement() {
    const g = this.map.generator;
    if (!g) {
      this.pavement = null;
      return;
    }
    const gen = worldGenerator();
    const cfg = toLegacyConfig({
      environments: g.environments,
      size: g.size,
      seed: g.seed,
      mountainShape: g.mountainShape,
      mountainScale: g.mountainScale,
    });
    const legacy = (b: Brick) => {
      const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(b.type)!;
      return {
        id: b.id,
        kind: m[1] as 'brick',
        rows: Number(m[2]),
        cols: Number(m[3]),
        turn: b.rot,
        x: b.x,
        y: b.y,
        z: b.z,
        color: 0,
        ...(b.group ? { group: b.group } : {}),
      };
    };
    this.pavement = (b) => {
      try {
        return gen.isPavement(legacy(b), cfg, g.version);
      } catch {
        return false;
      }
    };
  }

  private keyOf(path: string) {
    return path.slice(paths.chunkDir(this.mapId).length, -'.json'.length);
  }

  private loadChunk(path: string) {
    const key = this.keyOf(path);
    for (const b of this.chunks.get(key) ?? []) this.byId.delete(b.id);
    const c = this.store.get<Chunk>(path);
    if (!c) {
      this.chunks.delete(key);
      return key;
    }
    const bricks = decodeChunk(c);
    this.chunks.set(key, bricks);
    for (const b of bricks) this.byId.set(b.id, { brick: b, key });
    return key;
  }

  private reindexGroups() {
    this.groups.clear();
    for (const { brick } of this.byId.values()) {
      if (!brick.group) continue;
      const list = this.groups.get(brick.group) ?? [];
      if (!this.groups.has(brick.group)) this.groups.set(brick.group, list);
      list.push(brick.id);
    }
  }

  private onStore(changed: string[]) {
    let full = false;
    const keys: string[] = [];
    for (const p of changed) {
      if (p === paths.map(this.mapId)) {
        const before = this.map;
        this.map = this.store.get<MapDoc>(p) ?? this.map;
        if (JSON.stringify(before.generator) !== JSON.stringify(this.map.generator)) {
          this.setupPavement();
          full = true;
        }
      } else if (p.startsWith(paths.chunkDir(this.mapId))) keys.push(this.loadChunk(p));
    }
    if (keys.length || full) {
      this.reindexGroups();
      this.revision++;
    }
    for (const fn of this.listeners) fn(full ? [...this.chunks.keys()] : keys, full);
  }

  get count(): number {
    return this.byId.size;
  }

  get(id: number): Brick | undefined {
    return this.byId.get(id)?.brick;
  }

  all(): Brick[] {
    return [...this.chunks.values()].flat();
  }

  category(b: Brick): CategoryId {
    return categoryOf(b.group);
  }

  toRender(b: Brick): RenderBrick {
    const [w, d] = footprint(b);
    return {
      id: b.id,
      w,
      d,
      kind: kindOf(b.type),
      x: b.x,
      y: b.y,
      z: b.z,
      color: b.color,
      paved: this.pavement?.(b) ?? false,
    };
  }

  bounds(): { min: Vec3; max: Vec3 } | null {
    if (!this.byId.size) return null;
    const min: Vec3 = [Infinity, 0, Infinity];
    const max: Vec3 = [-Infinity, 0, -Infinity];
    for (const { brick: b } of this.byId.values()) {
      const [w, d] = footprint(b);
      min[0] = Math.min(min[0], b.x);
      min[2] = Math.min(min[2], b.z);
      max[0] = Math.max(max[0], b.x + w);
      max[1] = Math.max(max[1], b.y * 0.4 + brickHeightUnits(kindOf(b.type)) + 0.225);
      max[2] = Math.max(max[2], b.z + d);
    }
    return { min, max };
  }

  /** Nearest brick hit by a ray (v68 boxHit over all bricks, pruned by chunk). */
  pick(r: { o: Vec3; d: Vec3 }, skip?: (b: Brick) => boolean): Hit | null {
    let best: Hit | null = null;
    for (const [key, list] of this.chunks) {
      const [cx, cz] = key.split('_').map(Number) as [number, number];
      if (rayBox(r, [cx * 32 - 8, 0, cz * 32 - 8], [cx * 32 + 40, 130, cz * 32 + 40]) === null) continue;
      for (const b of list) {
        if (skip?.(b)) continue;
        const [w, d] = footprint(b);
        const top = b.y * 0.4 + brickHeightUnits(kindOf(b.type)) + (b.type.startsWith('tile') ? 0 : 0.225);
        const t = rayBox(r, [b.x, b.y * 0.4, b.z], [b.x + w, top, b.z + d]);
        if (t !== null && (!best || t < best.t)) {
          const point: Vec3 = [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t, r.o[2] + r.d[2] * t];
          best = { brick: b, t, point, normal: faceNormal(point, [b.x, b.y * 0.4, b.z], [b.x + w, top, b.z + d]) };
        }
      }
    }
    return best;
  }

  /** Where a new brick would sit under the pointer: top of a brick, or the ground (v68 positionAt). */
  surface(r: { o: Vec3; d: Vec3 }, skip?: (b: Brick) => boolean): SurfaceHit | null {
    let best: SurfaceHit | null = null;
    if (Math.abs(r.d[1]) > 1e-8)
      for (const list of this.chunks.values())
        for (const b of list) {
          if (skip?.(b)) continue;
          const h = b.type.startsWith('brick') ? 3 : 1;
          const level = (b.y + h) * 0.4;
          const t = (level - r.o[1]) / r.d[1];
          if (t < 0) continue;
          const x = r.o[0] + r.d[0] * t;
          const z = r.o[2] + r.d[2] * t;
          const [w, d] = footprint(b);
          if (x >= b.x && x <= b.x + w && z >= b.z && z <= b.z + d && (!best || t < best.t))
            best = { x, z, y: b.y + h, t, on: b };
        }
    if (!best && Math.abs(r.d[1]) > 1e-8) {
      const t = -r.o[1] / r.d[1];
      if (t > 0) best = { x: r.o[0] + r.d[0] * t, z: r.o[2] + r.d[2] * t, y: 0, t, on: null };
    }
    return best;
  }

  chunkOfPoint(x: number, z: number) {
    return chunkKey(x, z);
  }
}

export function rayBox(r: { o: Vec3; d: Vec3 }, mins: Vec3, maxs: Vec3): number | null {
  let near = 0;
  let far = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(r.d[i]!) < 1e-8) {
      if (r.o[i]! < mins[i]! || r.o[i]! > maxs[i]!) return null;
      continue;
    }
    let a = (mins[i]! - r.o[i]!) / r.d[i]!;
    let b = (maxs[i]! - r.o[i]!) / r.d[i]!;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return far >= 0 ? near : null;
}

function faceNormal(p: Vec3, min: Vec3, max: Vec3): Vec3 {
  const d = [p[0] - min[0], max[0] - p[0], p[1] - min[1], max[1] - p[1], p[2] - min[2], max[2] - p[2]];
  const i = d.indexOf(Math.min(...d));
  return (
    [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 0],
      [0, 1, 0],
      [0, 0, -1],
      [0, 0, 1],
    ] as Vec3[]
  )[i]!;
}
