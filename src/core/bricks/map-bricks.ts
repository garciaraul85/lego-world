import type { ProjectStore } from '../project/store';
import {
  BRICK_KINDS,
  BRICK_SIZES,
  BRICK_STRIDE,
  BUILD_HALF,
  BUILD_HEIGHT,
  type Chunk,
  chunkCount,
  chunkRows,
  paths,
} from '../schema';
import { type Brick, chunkKey, decodeChunk, encodeChunks } from './codec';

/** P27 part 3: was 12,000 (v68's cap, which Play in v68 still has) */
export const MAX_BRICKS_PER_MAP = 1_000_000;

/** Plates tall: brick 3, plate and tile 1 (legacy height()). */
export const brickHeight = (type: string) => (type.startsWith('brick') ? 3 : 1);

export function validBrickType(type: string): boolean {
  const m = /^(brick|plate|tile)(\d+)x(\d+)$/.exec(type);
  if (!m || !BRICK_KINDS.includes(m[1] as never)) return false;
  const r = Number(m[2]);
  const c = Number(m[3]);
  return BRICK_SIZES.some(([a, b]) => a === r && b === c);
}

/** Same bounds v68's validatePiece enforces. Returns a sentence or null. */
export function brickError(b: Omit<Brick, 'id'>): string | null {
  if (!validBrickType(b.type)) return `Unknown brick type "${b.type}".`;
  if (![b.x, b.y, b.z, b.rot].every(Number.isInteger)) return 'Brick positions must be whole studs and plates.';
  if (b.rot < 0 || b.rot > 3) return 'Rotation must be 0-3 quarter turns.';
  if (Math.abs(b.x) > BUILD_HALF || Math.abs(b.z) > BUILD_HALF || b.y < 0 || b.y + brickHeight(b.type) > BUILD_HEIGHT)
    return 'Position is outside the build area.';
  if (!/^#[0-9a-f]{6}$/i.test(b.color)) return 'Color must be #rrggbb.';
  return null;
}

/** Read access to one map's bricks, decoded from its chunk files. */
export class MapBricks {
  private readonly prefix: string;
  constructor(
    private readonly store: ProjectStore,
    readonly mapId: string,
  ) {
    this.prefix = paths.chunkDir(mapId);
  }

  chunkPaths(): string[] {
    return this.store.list(this.prefix);
  }

  all(): Brick[] {
    return this.chunkPaths().flatMap((p) => decodeChunk(this.store.get<Chunk>(p)!));
  }

  /** Bricks of one chunk key ("cx_cz"), or [] */
  inChunk(key: string): Brick[] {
    const c = this.store.get<Chunk>(`${this.prefix}${key}.json`);
    return c ? decodeChunk(c) : [];
  }

  count(): number {
    return this.chunkPaths().reduce((n, p) => n + chunkCount(this.store.get<Chunk>(p)!), 0);
  }

  maxId(): number {
    let max = 0;
    for (const p of this.chunkPaths()) {
      const rows = chunkRows(this.store.get<Chunk>(p)!);
      for (let o = 7; o < rows.length; o += BRICK_STRIDE) if (rows[o]! > max) max = rows[o]!;
    }
    return max;
  }

  /** id -> chunk key for the requested ids; missing ids are absent from the map. */
  locate(ids: Iterable<number>): Map<number, string> {
    const want = new Set(ids);
    const out = new Map<number, string>();
    for (const p of this.chunkPaths()) {
      const key = p.slice(this.prefix.length, -'.json'.length);
      const rows = chunkRows(this.store.get<Chunk>(p)!);
      for (let o = 7; o < rows.length; o += BRICK_STRIDE) if (want.has(rows[o]!)) out.set(rows[o]!, key);
    }
    return out;
  }

  /**
   * Rewrites the given chunk keys from a new brick list. Only call from command handlers.
   * `bricks` must be the complete new content of exactly those chunks (other chunks are untouched).
   */
  write(keys: Iterable<string>, bricks: Brick[]): void {
    const allowed = new Set(keys);
    const encoded = encodeChunks(bricks);
    for (const key of encoded.keys()) {
      if (!allowed.has(key)) throw new Error(`brick written to chunk ${key} outside the edited set`);
    }
    for (const key of allowed) {
      const path = `${this.prefix}${key}.json`;
      const chunk = encoded.get(key);
      if (chunk) this.store.put(path, chunk);
      else this.store.remove(path);
    }
  }
}

export { chunkKey };
