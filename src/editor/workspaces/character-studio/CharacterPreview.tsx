import { useEffect, useRef } from 'preact/hooks';
import type { Clip } from '../../../core/schema';
import { rigPose } from '../../../engine/character/animator';
import { sampleParams } from '../../../engine/character/routine';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { OrbitCamera } from '../../../engine/render/camera';
import { Renderer } from '../../../engine/render/renderer';
import { FRAGMENT } from '../../../engine/render/shaders';
import { BONE_NAMES, trackLabel } from '../../components/timeline/Timeline';

export type PreviewInput = {
  profile: Record<string, unknown>;
  clip: Clip | null;
  /** seconds into the clip */
  time: number;
  turntable: boolean;
  /** P32: the track picked in the timeline; the preview rings its body part and names it */
  part?: { bone: string; prop: string } | null;
};

const SIDE: Record<string, number> = { left: -1, right: 1 };
/**
 * Where on the posed body a track's part is, as [joint, point in that joint's frame]: the middle of a limb, the
 * hand for an elbow, the face for the head.
 */
function partPoint(
  bone: string,
  M: {
    pivots: Record<string, number[]>;
    handGrip: (side: number) => number[];
  },
): [string, number[]] | null {
  const P = M.pivots;
  const half = (a: string, b: string): number[] => P[b]!.map((v, k) => (v - P[a]![k]!) * 0.5);
  const side = /^(left|right)/.exec(bone)?.[1];
  switch (bone.replace(/^(left|right)/, '')) {
    case 'Arm':
      return [bone, half(`${side}Arm`, `${side}Forearm`)];
    case 'Forearm':
      return [bone, M.handGrip(SIDE[side!]!).map((v) => v * 0.6)];
    case 'Leg':
      return [bone, half(`${side}Leg`, `${side}Shin`)];
    case 'Shin':
      return [bone, half(`${side}Shin`, `${side}Foot`)];
  }
  if (bone === 'head') return ['head', [0, 0.55, 0.3]];
  if (bone === 'torso') return ['hips', [0, 0.75, 0.3]];
  if (bone === 'hips') return ['hips', [0, 0, 0.3]];
  if (bone === 'root') return ['hips', [0, 0, 0]];
  if (bone === 'prop') return ['rightForearm', M.handGrip(1)];
  return null;
}

/**
 * Turntable preview: v68's character model on an empty floor, posed by a data clip at `time`
 * through the v68 routine rig (StudioMotion.pose reads the sampled parameters).
 */
export function CharacterPreview({ input }: { input: { current: PreviewInput } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const L = legacyRuntime();
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch {
      return;
    }
    renderer.floor = true;
    renderer.skySample = L.SkyCycle.sample('day', 0, false, false);
    const chars = L.CharacterModel.create(renderer.gl, FRAGMENT);
    const cam = new OrbitCamera();
    cam.target = [0, 1.7, 0];
    cam.baseDistance = 7.5;
    cam.pitch = 0.22;
    cam.yaw = 0.5;
    cam.fov = 0.8;
    let heading = 0;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { profile, clip, time, turntable } = input.current;
      if (turntable) heading += dt * 0.6;
      const base = L.StudioAnimations.sample('still', 0, profile).state;
      const state = clip
        ? {
            ...base,
            heading,
            studioPose: rigPose(sampleParams(clip, time), clip),
            studioProgress: 0,
            studioFist: false,
          }
        : { ...base, heading };
      let view: ArrayLike<number> | null = null;
      try {
        renderer.render(cam.frame(), cam.target, [], [], [], (mvp, eye) => {
          view = mvp;
          chars.begin(mvp, eye, renderer.skySample);
          chars.draw(profile, state, true, !!clip);
        });
      } catch {
        /* a profile mid-edit can be invalid for one frame */
      }
      placeMark(input.current.part ?? null, profile, state, view, !!clip);
    };
    /** ring the picked part where it is drawn this frame, and say which part it is */
    const placeMark = (
      part: PreviewInput['part'],
      profile: Record<string, unknown>,
      state: Record<string, unknown>,
      mvp: ArrayLike<number> | null,
      animated: boolean,
    ) => {
      const el = mark.current;
      if (!el) return;
      const M = L.CharacterModel;
      const at = part && mvp ? partPoint(part.bone, M) : null;
      let shown = false;
      if (at && mvp) {
        try {
          const pose = M.jointPose(state, !animated, profile);
          const m = pose[at[0]];
          if (m) {
            const [x = 0, y = 0, z = 0] = M.transform(M.scaledMatrix(m, state, profile), at[1]);
            const cx = mvp[0]! * x + mvp[4]! * y + mvp[8]! * z + mvp[12]!;
            const cy = mvp[1]! * x + mvp[5]! * y + mvp[9]! * z + mvp[13]!;
            const cw = mvp[3]! * x + mvp[7]! * y + mvp[11]! * z + mvp[15]!;
            if (cw > 0) {
              const r = canvas.getBoundingClientRect();
              el.style.left = `${((cx / cw + 1) / 2) * r.width}px`;
              el.style.top = `${((1 - cy / cw) / 2) * r.height}px`;
              shown = true;
            }
          }
        } catch {
          /* no marker this frame */
        }
      }
      el.hidden = !shown;
    };
    raf = requestAnimationFrame(frame);
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      cam.orbit(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.zoomBy(Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, []);
  const part = input.current.part;
  const name = part ? (BONE_NAMES[part.bone] ?? part.bone) : '';
  return (
    <>
      <canvas ref={ref} class="viewport-canvas" aria-label="Character preview" />
      {/* P32: the body part of the track picked in the timeline */}
      <div ref={mark} class="part-mark" hidden aria-hidden="true">
        <span class="part-ring" />
        <span class="part-tag">{name}</span>
      </div>
      <div class="part-status" role="status" aria-live="polite">
        {part ? `Selected: ${trackLabel(part.bone, part.prop)} (the ${name.toLowerCase()}, ringed in the preview)` : ''}
      </div>
    </>
  );
}
