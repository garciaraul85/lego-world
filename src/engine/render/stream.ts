import { LOD_DISTANCE, type RenderBrick, type Renderer } from './renderer';

/** chunk edge in studs (same as the map's chunk files) */
const CHUNK = 32;

/** P27 part 3: maps with up to this many chunks load every chunk at once (no streaming, no edge fade) */
export const STREAM_FROM_CHUNKS = 64;
/** the default view distance in studs (a map can set its own) */
export const DEFAULT_VIEW_DISTANCE = 256;
/** studs drawn this close on a streamed map (further: plain boxes) */
const STREAM_LOD = 64;
/** chunks built per frame while streaming (the nearest first) */
const PER_FRAME = 6;

/**
 * P27 part 3: streams a map's chunks into the renderer around a point. Small maps load at once, as before;
 * on a big map only chunks within the view distance are built, the nearest first and a few per frame, and
 * chunks that fall further than the view distance (plus one chunk) are dropped from the GPU.
 */
export class ChunkStream {
  /** every chunk key the map has */
  private keys = new Set<string>();
  /** chunk keys built in the renderer */
  private shown = new Set<string>();
  private centre = '';
  viewDistance = DEFAULT_VIEW_DISTANCE;

  constructor(
    private readonly renderer: Renderer,
    /** a chunk's bricks to draw now */
    private readonly source: (key: string) => readonly RenderBrick[],
  ) {}

  /** streaming on (a big map) */
  get streaming(): boolean {
    return this.keys.size > STREAM_FROM_CHUNKS;
  }

  /** chunks built / chunks the map has */
  get counts(): { shown: number; total: number } {
    return { shown: this.shown.size, total: this.keys.size };
  }

  /** the whole map changed (another map, or every chunk): forget what was built */
  reset(keys: Iterable<string>) {
    this.renderer.clearChunks();
    this.shown.clear();
    this.keys = new Set(keys);
    this.centre = '';
    // a big map draws studs only close by, with simpler studs (owners set the usual detail before a reset)
    this.renderer.lodDistance = this.streaming ? STREAM_LOD : LOD_DISTANCE;
    if (this.streaming) this.renderer.setSegments(12);
    if (!this.streaming) for (const k of this.keys) this.build(k);
  }

  /** chunks whose bricks changed (added, edited or emptied) */
  changed(keys: Iterable<string>, exists: (key: string) => boolean) {
    for (const k of keys) {
      if (exists(k)) this.keys.add(k);
      else this.keys.delete(k);
      if (!exists(k)) {
        this.renderer.dropChunk(k);
        this.shown.delete(k);
      } else if (!this.streaming || this.shown.has(k)) this.build(k);
    }
  }

  /**
   * Builds the nearest missing chunks around (x, z) and drops far ones. Returns true while chunks are still
   * missing (call again next frame).
   */
  update(x: number, z: number): boolean {
    if (!this.streaming) {
      this.renderer.viewDistance = Number.POSITIVE_INFINITY;
      return false;
    }
    this.renderer.viewDistance = this.viewDistance;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const r = Math.ceil(this.viewDistance / CHUNK);
    const centre = `${cx}_${cz}`;
    if (centre !== this.centre) {
      this.centre = centre;
      for (const k of [...this.shown]) {
        const [kx, kz] = k.split('_').map(Number) as [number, number];
        if (Math.max(Math.abs(kx - cx), Math.abs(kz - cz)) > r + 1) {
          this.renderer.dropChunk(k);
          this.shown.delete(k);
        }
      }
    }
    const missing: { k: string; d: number }[] = [];
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const k = `${cx + dx}_${cz + dz}`;
        if (this.keys.has(k) && !this.shown.has(k)) missing.push({ k, d: dx * dx + dz * dz });
      }
    if (!missing.length) return false;
    missing.sort((a, b) => a.d - b.d);
    for (const m of missing.slice(0, PER_FRAME)) this.build(m.k);
    return missing.length > PER_FRAME;
  }

  private build(k: string) {
    this.renderer.setChunk(k, this.source(k));
    this.shown.add(k);
  }
}
