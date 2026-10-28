import type { BodyBrick } from '../../core/character/body';
import type { LegacyRuntime } from '../legacy/runtime-modules';
import { placement } from '../render/place-character';
import type { Overlay, RenderBrick } from '../render/renderer';
import { renderBrick, scaleM } from './body-anim';

type Extra = BodyBrick & { color: string; size?: number };
type Group = { bone: string; alpha: number; glow: boolean; bricks: RenderBrick[] };
const groupsOf = new WeakMap<readonly Extra[], Group[]>();

function grouped(extras: readonly Extra[]): Group[] {
  let g = groupsOf.get(extras);
  if (!g) {
    const by = new Map<string, Group>();
    for (const b of extras) {
      const alpha = b.alpha ?? 1;
      const glow = !!b.glow;
      const k = `${b.bone}|${alpha}|${glow}`;
      let grp = by.get(k);
      if (!grp) {
        grp = { bone: b.bone, alpha, glow, bricks: [] };
        by.set(k, grp);
      }
      grp.bricks.push(renderBrick(b));
    }
    g = [...by.values()];
    groupsOf.set(extras, g);
  }
  return g;
}

/**
 * Step 11, 4a: a minifig's extra parts (a tail, a snout, ears, fins) as overlays on its joints, posed with it: they
 * follow its walk, its clips and its size, wherever it stands.
 */
export function extrasOverlays(
  L: LegacyRuntime,
  extras: readonly Extra[],
  profile: Record<string, unknown>,
  state: Record<string, unknown> & { x: number; y: number; z: number; heading: number },
  animated = true,
  alpha = 1,
): Overlay[] {
  if (!extras.length) return [];
  const M = L.CharacterModel;
  let pose: Record<string, Float32Array>;
  try {
    pose = M.jointPose(state, !animated, profile);
  } catch {
    return [];
  }
  const place = state.studioPose ? placement(L, state) : null;
  const out: Overlay[] = [];
  for (const g of grouped(extras)) {
    const m = pose[g.bone];
    if (!m) continue;
    const joint = M.mul(M.scaledMatrix(m, state, profile), scaleM(extras[0]?.size ?? 0.5));
    out.push({
      bricks: g.bricks,
      alpha: alpha * g.alpha,
      flat: g.glow,
      model: place ? M.mul(place, joint) : joint,
    });
  }
  return out.sort((a, b) => b.alpha - a.alpha);
}
