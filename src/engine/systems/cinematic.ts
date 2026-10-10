import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_CLIPS } from '../../builtin/clips';
import { emoteClip } from '../../builtin/clips/emotes';
import type { LegacyPiece } from '../../core/legacy/types';
import { type Character, type Cinematic, type Clip, type Instances, paths } from '../../core/schema';
import type { AudioPort } from '../audio/port';
import { rigPose } from '../character/animator';
import { sampleParams } from '../character/routine';
import { type CinematicFrame, CinematicPlayer, type Cue } from '../cinematic/CinematicPlayer';
import { type Box, NavGrid, type Vec3 } from '../cinematic/nav';
import type { ActorFrame, ActorStart } from '../cinematic/tracks/actor';
import type { HeroState, Npc } from '../legacy/runtime-modules';

type Files = { get(path: string): unknown };

/** What a running cinematic needs from the game (PlaySession implements it). */
export interface CinematicHost {
  readonly snapshot: Files;
  mapId(): string;
  pieces(): readonly LegacyPiece[];
  npcs(): readonly Npc[];
  bounds(p: LegacyPiece): Box;
  heroState(): HeroState;
  heroProfile(): Record<string, unknown>;
  validateProfile(p: Record<string, unknown>): Record<string, unknown>;
  travel(map: string): void;
  audio: AudioPort;
  emit(kind: 'event' | 'info', msg: string): void;
  logicEvent(event: string): void;
  setVar(name: string, value: unknown): void;
  /** the dialogue box (null hides it) */
  dialogue(line: { speaker: string; text: string } | null): void;
  done(id: string): void;
}

type Actor =
  | { kind: 'hero'; role: string; name: string }
  | { kind: 'npc'; role: string; name: string; npc: Npc }
  | { kind: 'extra'; role: string; name: string; profile: Record<string, unknown> };

export type DrawActor = { profile: Record<string, unknown>; state: HeroState & { hidden?: boolean } };

/**
 * Cinematics in Play (P6.2 `systems/cinematic.ts`): one scene at a time. Cast members are driven by
 * the CinematicPlayer (physics, input and neighbour AI frozen for them); the camera comes from the
 * rig; cues play sounds and music and fire logic. `once` scenes are remembered in player progress.
 */
export class CinematicSystem {
  player: CinematicPlayer | null = null;
  frame: CinematicFrame | null = null;
  private actors = new Map<string, Actor>();
  /** player progress: scenes already shown once (never written to the project) */
  readonly seen = new Set<string>();
  private lastSay = '';

  constructor(private readonly host: CinematicHost) {}

  get active() {
    return !!this.player;
  }

  /** Starts a scene; false when it is missing, already playing, or `once` and already seen. */
  play(id: string, opts: { once?: boolean } = {}): boolean {
    const h = this.host;
    if (opts.once && this.seen.has(id)) return false;
    const cin = h.snapshot.get(paths.cinematic(id)) as Cinematic | undefined;
    if (!cin) {
      h.emit('info', `Cinematic ${id} does not exist`);
      return false;
    }
    if (this.player) this.finish(false);
    if (cin.map !== h.mapId()) h.travel(cin.map);
    this.seen.add(id);
    this.actors.clear();
    const nav = new NavGrid(h.pieces().map((p) => h.bounds(p)));
    const hs = h.heroState();
    const inst = h.snapshot.get(paths.instances(cin.map)) as Instances | undefined;
    const npcOf = (chr: string) => {
      const legacy = inst?.items.find((i) => i.kind === 'npc' && i.character === chr);
      return legacy && legacy.kind === 'npc' ? h.npcs().find((n) => n.id === legacy.legacyId) : undefined;
    };
    const charOf = (chr: string) =>
      (h.snapshot.get(paths.character(chr)) as Character | undefined) ?? BUILTIN_CHARACTERS.find((c) => c.id === chr);
    const markPos = (m: string | undefined) => {
      const mk = cin.marks.find((x) => x.id === m);
      return mk ? { pos: [mk.pos[0], nav.heightAt(mk.pos[0], mk.pos[2]), mk.pos[2]] as Vec3, yaw: mk.yaw } : null;
    };
    const start = (m: Cinematic['cast'][number]): ActorStart => {
      const at = markPos(m.at);
      if (m.actor === '$hero') {
        this.actors.set(m.role, { kind: 'hero', role: m.role, name: String(h.heroProfile().name ?? 'Hero') });
        return {
          pos: at?.pos ?? [hs.x, hs.y, hs.z],
          yaw: at?.yaw ?? hs.heading,
          held: String(h.heroProfile().held ?? 'None'),
          visible: true,
        };
      }
      const npc = npcOf(m.actor);
      if (npc) {
        this.actors.set(m.role, { kind: 'npc', role: m.role, name: npc.profile.name, npc });
        return {
          pos: at?.pos ?? [npc.state.x, npc.state.y, npc.state.z],
          yaw: at?.yaw ?? npc.state.heading,
          held: String(npc.profile.held ?? 'None'),
          visible: true,
        };
      }
      const chr = charOf(m.actor);
      const profile = h.validateProfile({ ...(chr?.profile ?? {}) });
      this.actors.set(m.role, { kind: 'extra', role: m.role, name: chr?.name || m.role, profile });
      const first = at ?? markPos(cin.marks[0]?.id) ?? { pos: [hs.x + 2, hs.y, hs.z + 2] as Vec3, yaw: 0 };
      return { pos: first.pos, yaw: first.yaw, held: String(profile.held ?? 'None'), visible: true };
    };
    this.player = new CinematicPlayer(cin, {
      nav,
      start,
      clip: (cid) => (h.snapshot.get(paths.clip(cid)) as Clip | undefined) ?? BUILTIN_CLIPS.find((c) => c.id === cid),
      emote: emoteClip,
    });
    h.emit('event', `Cinematic “${cin.name}”`);
    this.step(0);
    return true;
  }

  /** One fixed step of scene time (dt already scaled by the game speed). */
  step(dt: number) {
    const p = this.player;
    if (!p) return;
    this.applyCues(p.advance(dt));
    this.apply(p.frame());
    if (p.done) this.finish(false);
  }

  /** Esc / B / the Skip button: jump to the end, keeping the end state. */
  skip(): boolean {
    const p = this.player;
    if (!p || !p.cin.skippable) return false;
    this.applyCues(p.skip());
    this.apply(p.frame());
    this.host.emit('info', `Skipped “${p.cin.name}”`);
    this.finish(true);
    return true;
  }

  /** logic's Stop cinematic: ends now without the remaining cues */
  stop() {
    if (this.player) this.finish(true);
  }

  private applyCues(cues: Cue[]) {
    const h = this.host;
    for (const c of cues) {
      switch (c.kind) {
        case 'music':
          h.audio.music('cinematic', c.music, c.fade);
          break;
        case 'sfx': {
          const a = c.role ? this.frame?.actors.get(c.role) : null;
          h.audio.play(c.event, { ...(c.pos ? { pos: c.pos } : a ? { pos: a.pos } : {}) });
          break;
        }
        case 'voice':
          h.audio.play(c.event);
          break;
        case 'emit':
          h.emit('event', `Event “${c.event}” · cinematic`);
          h.logicEvent(c.event);
          break;
        case 'setVar':
          h.setVar(c.name, c.value);
          break;
      }
    }
  }

  private apply(f: CinematicFrame) {
    this.frame = f;
    for (const [role, a] of this.actors) {
      const af = f.actors.get(role);
      if (!af) continue;
      if (a.kind === 'hero') Object.assign(this.host.heroState(), this.motion(af));
      else if (a.kind === 'npc') Object.assign(a.npc.state, this.motion(af));
    }
    const line = f.say ? `${f.say.role}\u0000${f.say.text}` : '';
    if (line !== this.lastSay) {
      this.lastSay = line;
      this.host.dialogue(f.say ? { speaker: this.actors.get(f.say.role)?.name ?? f.say.role, text: f.say.text } : null);
    }
  }

  private motion(af: ActorFrame): HeroState {
    return {
      x: af.pos[0],
      y: af.pos[1],
      z: af.pos[2],
      heading: af.yaw,
      speed: af.speed,
      running: af.running,
      phase: af.phase,
      gaitSpeed: af.speed,
      moveBlend: af.speed > 0 ? 1 : 0,
      runBlend: af.running ? 1 : 0,
      grounded: true,
      vy: 0,
      attack: 0,
      building: false,
    };
  }

  private finish(skipped: boolean) {
    const p = this.player;
    if (!p) return;
    this.player = null;
    this.host.audio.music('cinematic', undefined);
    if (this.lastSay) this.host.dialogue(null);
    this.lastSay = '';
    // neighbours go back to their routine where the scene left them
    for (const a of this.actors.values())
      if (a.kind === 'npc') Object.assign(a.npc.state, { speed: 0, moveBlend: 0, runBlend: 0 });
    this.actors.clear();
    this.frame = null;
    this.host.emit('info', `Cinematic “${p.cin.name}” ${skipped ? 'skipped' : 'finished'}`);
    this.host.done(p.cin.id);
  }

  // ---------- what the renderer and the HUD read ----------

  /** whether a neighbour is in the cast (its AI is frozen) */
  isCast(npc: Npc) {
    for (const a of this.actors.values()) if (a.kind === 'npc' && a.npc === npc) return true;
    return false;
  }

  heroInCast() {
    for (const a of this.actors.values()) if (a.kind === 'hero') return true;
    return false;
  }

  /** draw state for a cast member (visibility, held item, clip pose), or null when not cast */
  drawFor(kind: 'hero' | Npc, profile: Record<string, unknown>, state: HeroState): DrawActor | null {
    const f = this.frame;
    if (!f) return null;
    for (const a of this.actors.values()) {
      if (kind === 'hero' ? a.kind !== 'hero' : a.kind !== 'npc' || a.npc !== kind) continue;
      const af = f.actors.get(a.role);
      if (!af) return null;
      if (!af.visible) return { profile, state: { ...state, hidden: true } };
      return this.withPose(af, { ...profile, held: af.held }, state);
    }
    return null;
  }

  /** actors that exist only for the scene (cast characters not on the map) */
  extras(): DrawActor[] {
    const f = this.frame;
    if (!f) return [];
    const out: DrawActor[] = [];
    for (const a of this.actors.values()) {
      if (a.kind !== 'extra') continue;
      const af = f.actors.get(a.role);
      if (!af?.visible) continue;
      out.push(this.withPose(af, { ...a.profile, held: af.held }, this.motion(af)));
    }
    return out;
  }

  private withPose(af: ActorFrame, profile: Record<string, unknown>, state: HeroState): DrawActor {
    if (!af.clip) return { profile, state };
    const params = sampleParams(af.clip.clip, af.clip.time);
    return {
      profile,
      state: { ...state, studioPose: rigPose(params, af.clip.clip), studioProgress: 0, studioFist: false },
    };
  }
}
