import type { Cinematic } from '../../../core/schema';
import type { AudioEngine } from '../../../engine/audio/AudioEngine';
import type { AudioPort, Vec3 } from '../../../engine/audio/port';
import type { HeroState } from '../../../engine/legacy/runtime-modules';
import { PlaySession } from '../../../engine/runtime/session';
import type { EditorState } from '../../state';

/** Sends cue sounds to the editor's audio only while the Director plays (never while scrubbing). */
class PreviewAudio implements AudioPort {
  live = false;
  constructor(private readonly a: AudioEngine) {}
  play(event: string, opts?: { pos?: Vec3; volume?: number }) {
    if (this.live) this.a.play(event, { ...(opts?.volume !== undefined ? { volume: opts.volume } : {}) });
  }
  loop() {}
  stopLoop() {}
  listener() {}
  music(layer: 'cinematic' | 'screen' | 'logic' | 'zone' | 'map', id: string | null | undefined) {
    if (layer === 'cinematic' && this.live) this.a.previewMusic(id ?? null);
  }
  stinger(name: string) {
    if (this.live) this.a.stinger(name);
  }
  stopAll() {
    this.a.previewMusic(null);
  }
}

/**
 * The Director's preview (P6.3): a Play session on the scene's map that never runs the game. The
 * scene is re-loaded from the edited data on every change and shown at the playhead (seek), or
 * played in real time with sound (play).
 */
export class DirectorPreview {
  readonly session: PlaySession;
  readonly audio: PreviewAudio;
  private hero: HeroState;
  private npcs: Array<[Record<string, unknown>, Record<string, unknown>]>;
  cin: Cinematic | null = null;

  constructor(
    ed: EditorState,
    readonly map: string,
  ) {
    ed.audio.init();
    this.audio = new PreviewAudio(ed.audio);
    this.session = new PlaySession(ed.store.snapshot(), { mapId: map, audio: this.audio });
    this.session.runtime.paused = true;
    this.hero = { ...this.session.heroState };
    this.npcs = this.session.world.npcs.map((n) => [n.state as Record<string, unknown>, { ...n.state }]);
  }

  /** load (or reload after an edit) and show time t */
  load(cin: Cinematic, t: number) {
    this.cin = cin;
    this.reset();
    this.session.cine.playScene(cin, { hold: true, quiet: true });
    this.session.cine.seekTo(t);
  }

  seek(t: number) {
    this.session.cine.seekTo(t);
  }

  /** real-time playback with cues; returns the new time */
  play(dt: number): number {
    this.audio.live = true;
    this.session.cine.step(dt);
    return this.session.cine.player?.t ?? 0;
  }

  pause() {
    this.audio.live = false;
    this.audio.stopAll();
  }

  /** put everyone back where the map has them, so each reload starts from the same place */
  private reset() {
    Object.assign(this.session.heroState, this.hero);
    for (const [st, saved] of this.npcs) Object.assign(st, saved);
  }

  dispose() {
    this.pause();
    this.session.cine.stop(true);
  }
}
