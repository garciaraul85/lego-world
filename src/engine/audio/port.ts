/** What the game runtime asks of audio (P5.3/5.4). The editor's AudioEngine implements it; tests record calls. */
export type Vec3 = [number, number, number];
export interface AudioPort {
  /** a named sound event; `pos` makes spatial events quieter with distance */
  play(event: string, opts?: { pos?: Vec3; volume?: number }): void;
  /** start (or move) a looping sound under `key`; same key again only updates position/volume */
  loop(key: string, event: string, opts?: { pos?: Vec3; volume?: number; maxDistance?: number }): void;
  stopLoop(key: string): void;
  /** where the ears are: hero position and camera yaw */
  listener(pos: Vec3, yaw: number): void;
  /** music layer: cinematic > screen > logic > zone > map; null = silence, undefined = clear the layer */
  music(layer: 'cinematic' | 'screen' | 'logic' | 'zone' | 'map', id: string | null | undefined, fade?: number): void;
  stinger(name: string): void;
  /** stop every voice and the music (Play stopped) */
  stopAll(): void;
}

/** Records calls; used when no AudioContext exists (tests, Node) and by unit tests. */
export class RecordingAudio implements AudioPort {
  readonly calls: Array<[string, ...unknown[]]> = [];
  readonly loops = new Map<string, string>();
  musicNow: string | null = null;
  private layers = new Map<string, string | null>();
  play(event: string, opts?: { pos?: Vec3 }) {
    this.calls.push(['play', event, opts?.pos]);
  }
  loop(key: string, event: string) {
    if (!this.loops.has(key)) this.calls.push(['loop', key, event]);
    this.loops.set(key, event);
  }
  stopLoop(key: string) {
    if (this.loops.delete(key)) this.calls.push(['stopLoop', key]);
  }
  listener() {}
  music(layer: string, id: string | null | undefined) {
    if (id === undefined) this.layers.delete(layer);
    else this.layers.set(layer, id);
    const order = ['cinematic', 'screen', 'logic', 'zone', 'map'];
    let next: string | null = null;
    for (const l of order)
      if (this.layers.has(l)) {
        next = this.layers.get(l) ?? null;
        break;
      }
    if (next !== this.musicNow) this.calls.push(['music', next]);
    this.musicNow = next;
  }
  stinger(name: string) {
    this.calls.push(['stinger', name]);
  }
  stopAll() {
    this.calls.push(['stopAll']);
    this.loops.clear();
  }
  played(event: string) {
    return this.calls.filter((c) => c[0] === 'play' && c[1] === event).length;
  }
}
