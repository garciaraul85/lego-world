import type { CharacterRenderer, HeroState, LegacyRuntime } from '../legacy/runtime-modules';

/**
 * P32: v68's clip poses (StudioMotion) put the figure at the origin, facing +z — they were made for the
 * Character studio. Wherever a character plays a clip somewhere else (a cinematic, an emote in Play, the
 * studio's turntable), its world placement — position and heading — is applied here, around the draw.
 */
export function placement(L: LegacyRuntime, state: { x: number; y: number; z: number; heading: number }) {
  return L.CharacterModel.matrix(state.x, state.y, state.z, state.heading);
}

/** Draws one character; a clip pose is moved to where the character stands. */
export function drawCharacter(
  L: LegacyRuntime,
  chars: CharacterRenderer,
  frame: { mvp: Float32Array; eye: number[]; light: unknown },
  profile: Record<string, unknown>,
  state: HeroState & { studioPose?: unknown },
  preview = false,
  animated = false,
) {
  if (!state.studioPose || (!state.x && !state.y && !state.z && !state.heading)) {
    chars.draw(profile, state, preview, animated);
    return;
  }
  const m = placement(L, state);
  // the eye in the figure's own frame, so its lighting stays right
  const d = [frame.eye[0]! - m[12]!, frame.eye[1]! - m[13]!, frame.eye[2]! - m[14]!];
  const eye = [0, 1, 2].map((c) => d[0]! * m[c * 4]! + d[1]! * m[c * 4 + 1]! + d[2]! * m[c * 4 + 2]!);
  chars.begin(L.CharacterModel.mul(frame.mvp, m), eye, frame.light);
  chars.draw(profile, { ...state, x: 0, y: 0, z: 0, heading: 0 }, preview, animated);
  chars.begin(frame.mvp, frame.eye, frame.light);
}
