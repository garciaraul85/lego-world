import { BUILTIN_MEDIA, RECIPES, renderRecipe } from '../../builtin/audio';
import type { SoundEvent } from '../../core/schema';
import { Ducker } from './Ducker';
import type { AudioData } from './data';
import { dbToGain, Mixer } from './Mixer';
import { MusicDirector, type MusicLayer } from './MusicDirector';
import type { AudioPort, Vec3 } from './port';
import { SoundEventPicker } from './SoundEvents';
import { audioUnlock } from './unlock';
import { BUS_PRIORITY, VoicePool } from './VoicePool';

type Voice = {
  event: string;
  priority: number;
  started: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
  pos?: Vec3 | undefined;
  maxDistance: number;
  volume: number;
  bus: string;
  stopped: boolean;
};

export type AudioEngineOptions = {
  /** the project's audio (events, music, mixer) merged over the built-ins; read on every play */
  data: () => AudioData;
  /** blob of an imported media file */
  loadMedia: (ref: string) => Promise<Blob | null>;
  createContext?: () => AudioContext | null;
  log?: (msg: string) => void;
};

const DEFAULT_RANGE = 40;

/**
 * The editor/player audio engine (P5.1-5.4): buses and ducking (Mixer, Ducker), 32 voices
 * (VoicePool), named sound events (SoundEventPicker), and music with crossfades (MusicDirector).
 * Every method is safe to call before `init()` or without WebAudio (it then only counts).
 */
export class AudioEngine implements AudioPort {
  ctx: AudioContext | null = null;
  mixer: Mixer | null = null;
  readonly pool = new VoicePool<Voice>(32);
  readonly picker = new SoundEventPicker();
  readonly director = new MusicDirector();
  readonly ducker: Ducker;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private loops = new Map<string, Voice>();
  private pendingLoops = new Set<string>();
  private musicNow: { id: string | null; gain: GainNode | null; srcs: AudioBufferSourceNode[] } = {
    id: null,
    gain: null,
    srcs: [],
  };
  private ear = { pos: [0, 0, 0] as Vec3, yaw: 0 };
  private unlockOff: (() => void) | null = null;
  /** counters for the Audio workspace and tests */
  readonly stats = { played: 0, skipped: 0, lastEvent: '', music: null as string | null };

  constructor(private readonly o: AudioEngineOptions) {
    this.ducker = new Ducker(o.data().mixer.duck);
  }

  /** Creates the AudioContext (once). Returns false where WebAudio is missing. */
  init(): boolean {
    if (this.ctx) return true;
    const make =
      this.o.createContext ??
      (() => {
        const C = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
        return C ? new C({ latencyHint: 'interactive' }) : null;
      });
    try {
      this.ctx = make();
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) return false;
    this.mixer = new Mixer(this.ctx);
    this.applyMixer();
    if (typeof window !== 'undefined') this.unlockOff = audioUnlock(this.ctx, window);
    return true;
  }

  /** Re-read audio/mixer.json (faders and duck rules); called when the project's audio files change. */
  applyMixer() {
    const d = this.o.data();
    this.ducker.setRules(d.mixer.duck);
    this.mixer?.apply(d.mixer);
  }

  // ---------- buffers ----------

  buffer(ref: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(ref);
    if (cached) return cached;
    const p = this.decode(ref);
    this.buffers.set(ref, p);
    return p;
  }

  private async decode(ref: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const name = BUILTIN_MEDIA.get(ref as `sha256:${string}`);
    if (name) {
      const samples = renderRecipe(RECIPES[name]!, ctx.sampleRate);
      const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      b.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      return b;
    }
    const blob = await this.o.loadMedia(ref);
    if (!blob) {
      this.o.log?.(`Missing media ${ref.slice(0, 15)}…`);
      return null;
    }
    try {
      return await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      this.o.log?.(`Could not decode media ${ref.slice(0, 15)}…`);
      return null;
    }
  }

  // ---------- sound events ----------

  play(event: string, opts: { pos?: Vec3; volume?: number } = {}) {
    const ev = this.o.data().events[event];
    if (!ev) {
      this.stats.skipped++;
      this.o.log?.(`Unknown sound event ${event}`);
      return;
    }
    const now = this.ctx?.currentTime ?? performance.now() / 1000;
    const plan = this.picker.pick(event, ev, now);
    if (!plan) {
      this.stats.skipped++;
      return;
    }
    this.stats.played++;
    this.stats.lastEvent = event;
    if (!this.ctx) return;
    void this.buffer(plan.clip).then((buf) => {
      if (!buf) return;
      this.startVoice(event, ev, buf, { rate: plan.rate, volume: plan.gainDb + (opts.volume ?? 0), pos: opts.pos });
    });
  }

  private startVoice(
    event: string,
    ev: SoundEvent,
    buf: AudioBuffer,
    o: { rate: number; volume: number; pos?: Vec3 | undefined; loop?: boolean; maxDistance?: number },
  ): Voice | null {
    const ctx = this.ctx!;
    const priority = BUS_PRIORITY[ev.bus] ?? 2;
    const admit = this.pool.admit(event, o.loop ? 32 : ev.maxVoices, priority);
    if (!admit.ok) return null;
    if (admit.steal) this.stopVoice(admit.steal, 0.03);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate;
    src.loop = !!o.loop;
    const gain = ctx.createGain();
    const pan = ev.spatial && o.pos ? ctx.createStereoPanner() : null;
    const v: Voice = {
      event,
      priority,
      started: ctx.currentTime,
      src,
      gain,
      pan,
      pos: ev.spatial ? o.pos : undefined,
      maxDistance: o.maxDistance ?? DEFAULT_RANGE,
      volume: o.volume,
      bus: ev.bus,
      stopped: false,
    };
    const [g, p] = this.spatial(v);
    // short fade-in avoids clicks on stolen/started voices
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(g, ctx.currentTime + 0.008);
    if (pan) {
      pan.pan.value = p;
      src.connect(gain).connect(pan).connect(this.mixer!.input(ev.bus));
    } else src.connect(gain).connect(this.mixer!.input(ev.bus));
    if (ev.bus === 'voice') this.duck(this.ducker.begin('voice'));
    src.onended = () => this.release(v);
    src.start();
    this.pool.add(v);
    return v;
  }

  private spatial(v: Voice): [number, number] {
    const base = dbToGain(v.volume);
    if (!v.pos) return [base, 0];
    const [ex, , ez] = this.ear.pos;
    const dx = v.pos[0] - ex;
    const dz = v.pos[2] - ez;
    const d = Math.hypot(dx, dz, v.pos[1] - this.ear.pos[1]);
    const k = Math.max(0, 1 - d / v.maxDistance);
    // play camera: eye at target + (sin yaw, ·, cos yaw), so screen-right is (cos yaw, 0, -sin yaw)
    const h = Math.hypot(dx, dz);
    const pan = h < 0.5 ? 0 : (dx * Math.cos(this.ear.yaw) - dz * Math.sin(this.ear.yaw)) / h;
    return [base * k * k, Math.max(-0.85, Math.min(0.85, pan))];
  }

  private release(v: Voice) {
    if (!this.pool.active.includes(v)) return;
    this.pool.remove(v);
    if (v.bus === 'voice') this.duck(this.ducker.end('voice'));
  }

  private stopVoice(v: Voice, fade = 0.05) {
    if (v.stopped) return;
    v.stopped = true;
    const t = this.ctx!.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      v.src.stop(t + fade + 0.01);
    } catch {
      /* already stopped */
    }
    this.release(v);
  }

  private duck(ramps: { target: string; db: number; timeConstant: number }[]) {
    for (const r of ramps) this.mixer?.duck(r.target, r.db, r.timeConstant);
  }

  // ---------- loops (emitters, ambience) ----------

  loop(key: string, event: string, opts: { pos?: Vec3; volume?: number; maxDistance?: number } = {}) {
    const cur = this.loops.get(key);
    if (cur) {
      if (cur.event === event) {
        cur.pos = opts.pos ?? cur.pos;
        cur.volume = (this.o.data().events[event]?.volume ?? 0) + (opts.volume ?? 0);
        cur.maxDistance = opts.maxDistance ?? cur.maxDistance;
        this.respatialize(cur);
        return;
      }
      this.stopLoop(key);
    }
    if (this.pendingLoops.has(key)) return;
    const ev = this.o.data().events[event];
    if (!ev || !this.ctx) return;
    this.pendingLoops.add(key);
    void this.buffer(ev.clips[0]!).then((buf) => {
      if (!this.pendingLoops.delete(key) || !buf) return;
      const v = this.startVoice(event, ev, buf, {
        rate: 1,
        volume: ev.volume + (opts.volume ?? 0),
        pos: opts.pos,
        loop: true,
        maxDistance: opts.maxDistance ?? DEFAULT_RANGE,
      });
      if (v) this.loops.set(key, v);
    });
  }

  stopLoop(key: string) {
    this.pendingLoops.delete(key);
    const v = this.loops.get(key);
    if (!v) return;
    this.loops.delete(key);
    this.stopVoice(v, 0.4);
  }

  get loopKeys() {
    return [...this.loops.keys(), ...this.pendingLoops];
  }

  private respatialize(v: Voice) {
    if (!this.ctx) return;
    const [g, p] = this.spatial(v);
    v.gain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(p, this.ctx.currentTime, 0.05);
  }

  listener(pos: Vec3, yaw: number) {
    this.ear = { pos, yaw };
    for (const v of this.pool.active) if (v.pos && !v.stopped) this.respatialize(v);
  }

  // ---------- music ----------

  music(layer: MusicLayer, id: string | null | undefined, fade?: number) {
    const change = this.director.set(layer, id);
    if (change) this.crossfade(change.to, fade);
  }

  private crossfade(to: string | null, fade?: number) {
    const data = this.o.data().music;
    const seconds = fade ?? data.crossfade;
    this.stats.music = to;
    this.o.log?.(`Music → ${to ? (data.states[to]?.name ?? to) : 'silence'}`);
    const old = this.musicNow;
    this.musicNow = { id: to, gain: null, srcs: [] };
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (old.gain) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.05, seconds));
      for (const s of old.srcs) {
        try {
          s.stop(t + Math.max(0.05, seconds) + 0.05);
        } catch {
          /* stopped */
        }
      }
    }
    const state = to ? data.states[to] : undefined;
    if (!state) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.mixer!.input('music'));
    const slot = this.musicNow;
    slot.gain = gain;
    void Promise.all(state.layers.map((l) => this.buffer(l.media))).then((bufs) => {
      if (this.musicNow !== slot) return;
      const start = ctx.currentTime + 0.02;
      state.layers.forEach((l, i) => {
        const b = bufs[i];
        if (!b) return;
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.loop = state.loop;
        const lg = ctx.createGain();
        lg.gain.value = dbToGain(l.volume);
        src.connect(lg).connect(gain);
        src.start(start);
        slot.srcs.push(src);
      });
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + Math.max(0.05, seconds));
    });
  }

  stinger(name: string) {
    const ref = this.o.data().music.stingers[name];
    this.o.log?.(`Stinger ${name}`);
    if (!ref || !this.ctx) return;
    void this.buffer(ref).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.mixer!.input('ui'));
      this.duck(this.ducker.begin('stinger'));
      src.onended = () => this.duck(this.ducker.end('stinger'));
      src.start();
    });
  }

  // ---------- editor previews ----------

  /** Plays one media file on the ui bus (Audio workspace ▶). */
  previewMedia(ref: string, volume = 0) {
    if (!this.init()) return;
    void this.ctx!.resume().catch(() => {});
    void this.buffer(ref).then((buf) => {
      if (!buf || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = dbToGain(volume);
      src.buffer = buf;
      src.connect(g).connect(this.mixer!.input('ui'));
      src.start();
    });
  }

  previewEvent(event: string) {
    if (!this.init()) return;
    void this.ctx!.resume().catch(() => {});
    this.picker.reset();
    this.play(event);
  }

  /** Audition a music state (or null to stop the audition). */
  previewMusic(id: string | null) {
    if (!this.init()) return;
    void this.ctx!.resume().catch(() => {});
    this.music('cinematic', id ?? undefined, 0.3);
  }

  /** Throw away decoded buffers of media that changed (re-import) — built-ins are kept. */
  forget(ref: string) {
    this.buffers.delete(ref);
  }

  stopAll() {
    for (const v of [...this.pool.active]) this.stopVoice(v, 0.15);
    this.loops.clear();
    this.pendingLoops.clear();
    this.director.reset();
    this.crossfade(null, 0.4);
    this.ducker.reset();
    this.picker.reset();
    const d = this.o.data().mixer;
    if (this.mixer) for (const b of Object.keys(d.buses)) this.mixer.duck(b, 0, 0.05);
  }

  dispose() {
    this.stopAll();
    this.unlockOff?.();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.mixer = null;
    this.buffers.clear();
  }
}
