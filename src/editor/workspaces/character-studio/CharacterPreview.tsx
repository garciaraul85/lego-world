import { useEffect, useRef } from 'preact/hooks';
import type { BodyPlan } from '../../../core/character/body';
import type { ResolvedBody } from '../../../core/character/resolve';
import type { Clip } from '../../../core/schema';
import { rigPose } from '../../../engine/character/animator';
import {
  ACT_LENGTH,
  advance,
  bodyBounds,
  bodyOverlays,
  bodyPose,
  bodyWorld,
  boneLines,
  newMotion,
} from '../../../engine/character/body-anim';
import { sampleParams } from '../../../engine/character/routine';
import { type CharacterRenderer, legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { OrbitCamera } from '../../../engine/render/camera';
import { drawCharacter, placement } from '../../../engine/render/place-character';
import { Renderer } from '../../../engine/render/renderer';
import { V68_FRAGMENT } from '../../../engine/render/shaders';
import { BONE_NAMES, trackLabel } from '../../components/timeline/Timeline';
import { type BrickHit, brickAgainst, brickHeight, mul4, pickBrick, type SculptTool } from './sculpt';

export type PreviewInput = {
  profile: Record<string, unknown>;
  clip: Clip | null;
  /** seconds into the clip */
  time: number;
  turntable: boolean;
  /** P32: the track picked in the timeline; the preview rings its body part and names it */
  part?: { bone: string; prop: string } | null;
  /** P22 part 3: a body plan to draw instead of the minifig */
  body?: ResolvedBody | null;
  /** show the skeleton (the picked bone is drawn brighter) */
  bones?: { selected: string | null } | null;
  /** P22 part 4: a close-up of the head (the Face tab) */
  closeUp?: boolean;
  /** walk on the spot, to see the generated movement */
  walking?: boolean;
  /** P23 part 4: a body plan's strike or flinch, from when it started (performance.now) */
  act?: { kind: import('../../../core/character/moves').BodyMove; at: number } | null;
  /** painting bricks onto a bone: a click on a brick calls this with its index in the asset */
  paint?: ((brick: number) => void) | null;
  /** Milestone 3, 10d: the Draw tab's part and side: the preview stops turning and looks at that side */
  draw?: { part: string; side: number } | null;
  /** 10d part 3: painting and brick-sculpting a body plan: the brick under the pointer is outlined, a click is a hit */
  sculpt?: { tool: SculptTool; plan: BodyPlan; onHit(hit: BrickHit): void } | null;
};

/** Milestone 3, 10d: the open preview's figure renderer, which the Draw tab draws through (live paint, a part's own look) */
export const previewArt: { current: CharacterRenderer | null } = { current: null };

/** where to look from for each side drawn on: [yaw, pitch] (yaw 0 looks at the front) */
const SIDE_VIEW: [number, number][] = [
  [0, 0.1],
  [Math.PI, 0.1],
  [-Math.PI / 2, 0.1],
  [Math.PI / 2, 0.1],
  [0, 1.45],
  [0, -1.25],
];
/** what to look at for a part: [target height, distance] */
const partFrame = (part: string): [number, number] =>
  /^(head|hair|hat|glasses)$/.test(part)
    ? [3.75, 4.8]
    : /Leg$|Foot$/.test(part)
      ? [0.9, 5.5]
      : /Hand$|Arm$/.test(part)
        ? [2.2, 5.5]
        : [1.7, 7.5];

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
    const chars = L.CharacterModel.create(renderer.gl, V68_FRAGMENT);
    previewArt.current = chars;
    const cam = new OrbitCamera();
    cam.target = [0, 1.7, 0];
    cam.baseDistance = 7.5;
    cam.pitch = 0.22;
    cam.yaw = 0.5;
    cam.fov = 0.8;
    let heading = 0;
    let wasClose = false;
    let wasDraw = '';
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { profile, clip, time, turntable } = input.current;
      // the Face tab looks at the head; leaving it goes back to the whole figure
      const close = !!input.current.closeUp && !input.current.body;
      // Milestone 3, 10d: drawing, the figure faces front and the camera turns to the part and side drawn on
      const draw = input.current.body ? null : (input.current.draw ?? null);
      const drawKey = draw ? `${draw.part}/${draw.side}` : '';
      if (close !== wasClose || drawKey !== wasDraw) {
        wasClose = close;
        const [h, d] = draw ? partFrame(draw.part) : close ? [3.75, 4.8] : [1.7, 7.5];
        cam.target = [0, h, 0];
        cam.baseDistance = d;
        if (draw) [cam.yaw, cam.pitch] = SIDE_VIEW[draw.side] ?? [0, 0.1];
        else if (wasDraw) [cam.yaw, cam.pitch] = [0.5, 0.22];
        wasDraw = drawKey;
      }
      renderer.floor = draw?.side !== 5;
      if (draw) heading = 0;
      else if (turntable) heading += dt * 0.6;
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
      const body = input.current.body;
      if (body) {
        drawBody(body, dt, heading);
        placeMark(null, profile, state, null, false);
        return;
      }
      try {
        renderer.render(cam.frame(), cam.target, [], [], [], (mvp, eye) => {
          view = mvp;
          chars.begin(mvp, eye, renderer.skySample);
          // a clip pose turns with the turntable too
          drawCharacter(
            L,
            chars,
            { mvp, eye: eye as number[], light: renderer.skySample },
            profile,
            state as never,
            true,
            !!clip,
          );
        });
      } catch {
        /* a profile mid-edit can be invalid for one frame */
      }
      placeMark(input.current.part ?? null, profile, state, view, !!clip);
    };
    // P22 part 3: a body plan, its motion and skeleton
    const motion = newMotion();
    let framed: ResolvedBody | null = null;
    let lastPicks: { src: number; x: number; y: number }[] = [];
    // 10d part 3: the last frame's camera and pose, for finding the brick under the pointer
    let lastFrame: { mvp: Float32Array; world: Float32Array; pose: Map<string, Float32Array> } | null = null;
    let hover: BrickHit | null = null;
    const hitAt = (e: { clientX: number; clientY: number }): BrickHit | null => {
      const sc = input.current.sculpt;
      if (!sc || !lastFrame) return null;
      const r = canvas.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = 1 - ((e.clientY - r.top) / r.height) * 2;
      return pickBrick(nx, ny, lastFrame.mvp, lastFrame.world, lastFrame.pose, sc.plan.bricks);
    };
    const drawBody = (body: ResolvedBody, dt: number, heading: number) => {
      if (framed !== body) {
        // frame the camera on the body when it changes size or family
        const { min, max } = bodyBounds(body);
        const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        cam.target = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
        if (!framed || Math.abs(cam.baseDistance - Math.max(5, size * 1.8)) > 2)
          cam.baseDistance = Math.max(5, size * 1.8);
        framed = body;
      }
      advance(motion, body, input.current.walking ? body.stride * body.scale * 0.9 * dt : 0, dt);
      const act = input.current.act;
      motion.act = act ? { kind: act.kind, u: (performance.now() - act.at) / 1000 / ACT_LENGTH[act.kind] } : null;
      const pose = bodyPose(body, motion);
      const world = bodyWorld(body, { x: 0, y: 0, z: 0, heading }, motion);
      const overlays = bodyOverlays(body, pose, world);
      const lines: { lines: number[]; color: [number, number, number]; onTop?: boolean }[] = [];
      const bones = input.current.bones;
      if (bones) {
        const { lines: all, joint } = boneLines(body, pose, world);
        lines.push({ lines: all, color: [1, 0.85, 0.2], onTop: true });
        const sel = bones.selected;
        const b = sel ? body.bones.find((x) => x.name === sel) : undefined;
        if (b) {
          const j = joint.get(b.name)!;
          const r = 0.25;
          const cross = [
            j[0] - r,
            j[1],
            j[2],
            j[0] + r,
            j[1],
            j[2],
            j[0],
            j[1] - r,
            j[2],
            j[0],
            j[1] + r,
            j[2],
            j[0],
            j[1],
            j[2] - r,
            j[0],
            j[1],
            j[2] + r,
          ];
          const to: number[] = [];
          if (b.parent) to.push(...joint.get(b.parent)!, ...j);
          lines.push({ lines: [...cross, ...to], color: [0.2, 1, 1], onTop: true });
        }
      }
      // 10d part 3: outline the brick under the pointer (Add: where the new brick goes)
      const sc = input.current.sculpt;
      if (sc && hover && sc.plan.bricks[hover.index]) {
        const of = sc.plan.bricks[hover.index]!;
        const k = sc.tool.mode === 'add' ? brickAgainst(of, hover, sc.tool) : of;
        const bm = pose.get(k.bone);
        if (bm) {
          const m = mul4(world, bm);
          const h = brickHeight(k.kind);
          const c = (x: number, y: number, z: number) =>
            [0, 1, 2].map((i) => m[i]! * x + m[4 + i]! * y + m[8 + i]! * z + m[12 + i]!);
          const x0 = k.x;
          const x1 = k.x + k.w;
          const y0 = k.y * 0.4;
          const y1 = y0 + h;
          const z0 = k.z;
          const z1 = k.z + k.d;
          const corners = [
            [x0, y0, z0],
            [x1, y0, z0],
            [x1, y0, z1],
            [x0, y0, z1],
            [x0, y1, z0],
            [x1, y1, z0],
            [x1, y1, z1],
            [x0, y1, z1],
          ].map(([x, y, z]) => c(x!, y!, z!));
          const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
          const seg: number[] = [];
          for (const i of edges) seg.push(...corners[i]!);
          lines.push({
            lines: seg,
            color: sc.tool.mode === 'remove' ? [1, 0.3, 0.3] : sc.tool.mode === 'add' ? [0.3, 1, 0.4] : [1, 1, 1],
            onTop: true,
          });
        }
      }
      let mvp: Float32Array | null = null;
      try {
        renderer.render(cam.frame(), cam.target, overlays, lines, [], (m) => {
          mvp = m;
        });
      } catch {
        /* a body mid-edit can be invalid for one frame */
      }
      lastFrame = mvp ? { mvp: mvp as Float32Array, world, pose } : null;
      // where each brick of a worn build is on screen, for painting
      lastPicks = [];
      if (input.current.paint && mvp) {
        const m = mvp as Float32Array;
        const r = canvas.getBoundingClientRect();
        for (const k of body.bricks) {
          if (k.src === undefined) continue;
          const bm = pose.get(k.bone);
          if (!bm) continue;
          const h = k.kind === 'brick' ? 1.2 : 0.4;
          const lp = [k.x + k.w / 2, k.y * 0.4 + h / 2, k.z + k.d / 2];
          const wm = [0, 1, 2].map((i) => bm[i]! * lp[0]! + bm[4 + i]! * lp[1]! + bm[8 + i]! * lp[2]! + bm[12 + i]!);
          const p = [0, 1, 2].map(
            (i) => world[i]! * wm[0]! + world[4 + i]! * wm[1]! + world[8 + i]! * wm[2]! + world[12 + i]!,
          );
          const cx = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!;
          const cy = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!;
          const cw = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
          if (cw > 0)
            lastPicks.push({ src: k.src, x: ((cx / cw + 1) / 2) * r.width, y: ((1 - cy / cw) / 2) * r.height });
        }
      }
    };
    /** a click (not a drag) while painting: the brick nearest the pointer goes to the painted bone */
    const pick = (e: PointerEvent) => {
      const sc = input.current.sculpt;
      if (sc) {
        const hit = hitAt(e);
        if (hit) sc.onHit(hit);
        hover = null;
        return;
      }
      const paint = input.current.paint;
      if (!paint || !lastPicks.length) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let best: { src: number; d: number } | null = null;
      for (const p of lastPicks) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (!best || d < best.d) best = { src: p.src, d };
      }
      if (best && best.d < 40) paint(best.src);
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
            let pt = M.transform(M.scaledMatrix(m, state, profile), at[1]);
            // a clip pose is built at the origin; it is drawn where the character stands (turntable)
            if (state.studioPose) pt = M.transform(placement(L, state as never), pt);
            const [x = 0, y = 0, z = 0] = pt;
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
    let pressed: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      pressed = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) {
        hover = hitAt(e);
        return;
      }
      cam.orbit(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      drag = null;
      if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 5) pick(e);
      pressed = null;
    };
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
      if (previewArt.current === chars) previewArt.current = null;
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
