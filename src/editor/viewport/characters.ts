import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { type ResolvedBody, resolveBody } from '../../core/character/resolve';
import { type Character, type Instances, paths } from '../../core/schema';
import { bodyOverlays, bodyPose, bodyWorld } from '../../engine/character/body-anim';
import { legacyRuntime } from '../../engine/legacy/runtime-modules';
import type { Marker, Overlay } from '../../engine/render/renderer';
import { Renderer } from '../../engine/render/renderer';
import type { SceneRenderer } from '../../engine/render/scene-renderer';
import { V68_FRAGMENT } from '../../engine/render/shaders';
import type { EditorState } from '../state';

/**
 * Step 11, 4c: the characters placed on the open map, drawn in the Scene view where they stand: a creature from
 * its bricks, a minifig with v68's own model. Before this they were only in Play, so a placed enemy seemed to
 * vanish from the editor.
 */
type Placed = {
  id: string;
  name: string;
  at: { x: number; y: number; z: number; heading: number };
  profile: Record<string, unknown>;
  body: ResolvedBody | null;
};

const cache = new WeakMap<Instances, Placed[]>();

export function placedCharacters(ed: EditorState): Placed[] {
  const inst = ed.store.get<Instances>(paths.instances(ed.mapId.value));
  if (!inst) return [];
  const hit = cache.get(inst);
  if (hit) return hit;
  const get = (p: string) => ed.store.get(p);
  const out: Placed[] = [];
  for (const i of inst.items) {
    if (i.kind !== 'npc') continue;
    const chr =
      ed.store.get<Character>(paths.character(i.character)) ?? BUILTIN_CHARACTERS.find((c) => c.id === i.character);
    if (!chr) continue;
    const s = i.state as { x?: unknown; y?: unknown; z?: unknown; heading?: unknown };
    let body: ResolvedBody | null = null;
    try {
      body = resolveBody(chr.body, get);
    } catch {
      body = null;
    }
    out.push({
      id: i.id,
      name: chr.name,
      at: { x: Number(s.x) || 0, y: Number(s.y) || 0, z: Number(s.z) || 0, heading: Number(s.heading) || 0 },
      profile: chr.profile,
      body,
    });
  }
  cache.set(inst, out);
  return out;
}

type Chars = { begin(...a: unknown[]): void; draw(...a: unknown[]): void };
const drawers = new WeakMap<Renderer, Chars | null>();

/**
 * What the frame needs to show them: overlays (creatures), markers (minifigs where v68's model cannot draw: the
 * WebGPU view) and the extra drawing for minifigs on WebGL.
 */
export function characterLayer(
  renderer: SceneRenderer,
  list: readonly Placed[],
): { overlays: Overlay[]; markers: Marker[]; extra?: (mvp: Float32Array, eye: [number, number, number]) => void } {
  const overlays: Overlay[] = [];
  const markers: Marker[] = [];
  const figs: Placed[] = [];
  for (const p of list) {
    if (p.body) overlays.push(...bodyOverlays(p.body, bodyPose(p.body, null), bodyWorld(p.body, p.at, null)));
    else figs.push(p);
  }
  if (!figs.length) return { overlays, markers };
  if (!(renderer instanceof Renderer)) {
    for (const f of figs)
      markers.push({ pos: [f.at.x, f.at.y + 1.6, f.at.z], size: [1, 3.2, 0.8], color: [0.95, 0.75, 0.3], alpha: 0.85 });
    return { overlays, markers };
  }
  const extra = (mvp: Float32Array, eye: [number, number, number]) => {
    let chars = drawers.get(renderer);
    if (chars === undefined) {
      try {
        chars = legacyRuntime().CharacterModel.create(renderer.gl, V68_FRAGMENT) as Chars;
      } catch {
        chars = null;
      }
      drawers.set(renderer, chars);
    }
    if (!chars) return;
    const L = legacyRuntime();
    chars.begin(mvp, eye, renderer.skySample);
    for (const f of figs) {
      const still = L.StudioAnimations.sample('still', 0, f.profile).state;
      chars.draw(f.profile, { ...still, x: f.at.x, y: f.at.y, z: f.at.z, heading: f.at.heading }, true, false);
    }
  };
  return { overlays, markers, extra };
}
