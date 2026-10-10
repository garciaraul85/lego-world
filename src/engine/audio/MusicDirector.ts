/**
 * Which music plays (P5.4): a priority stack, highest wins:
 * cinematic > screen (title / menu music) > logic setMusic > music zone (innermost) > the map's music.
 * A layer holding `null` means "silence" and still wins; `undefined` clears the layer.
 */
export const MUSIC_LAYERS = ['cinematic', 'screen', 'logic', 'zone', 'map'] as const;
export type MusicLayer = (typeof MUSIC_LAYERS)[number];

export class MusicDirector {
  private layers = new Map<MusicLayer, string | null>();
  private playing: string | null = null;

  /** Sets one layer; returns the new music id when what should play changed, else undefined. */
  set(layer: MusicLayer, music: string | null | undefined): { from: string | null; to: string | null } | undefined {
    if (music === undefined) this.layers.delete(layer);
    else this.layers.set(layer, music);
    const next = this.resolve();
    if (next === this.playing) return undefined;
    const change = { from: this.playing, to: next };
    this.playing = next;
    return change;
  }

  get(layer: MusicLayer): string | null | undefined {
    return this.layers.get(layer);
  }

  /** The music id that should play now (null = silence). */
  resolve(): string | null {
    for (const l of MUSIC_LAYERS) if (this.layers.has(l)) return this.layers.get(l) ?? null;
    return null;
  }

  /** the layer that decides the current music */
  winner(): MusicLayer | null {
    for (const l of MUSIC_LAYERS) if (this.layers.has(l)) return l;
    return null;
  }

  get current() {
    return this.playing;
  }

  reset() {
    this.layers.clear();
    this.playing = null;
  }
}
