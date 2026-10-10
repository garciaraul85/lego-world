import { useEffect, useRef } from 'preact/hooks';
import type { Clip } from '../../../core/schema';
import { rigPose } from '../../../engine/character/animator';
import { sampleParams } from '../../../engine/character/routine';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { OrbitCamera } from '../../../engine/render/camera';
import { Renderer } from '../../../engine/render/renderer';
import { FRAGMENT } from '../../../engine/render/shaders';

export type PreviewInput = {
  profile: Record<string, unknown>;
  clip: Clip | null;
  /** seconds into the clip */
  time: number;
  turntable: boolean;
};

/**
 * Turntable preview: v68's character model on an empty floor, posed by a data clip at `time`
 * through the v68 routine rig (StudioMotion.pose reads the sampled parameters).
 */
export function CharacterPreview({ input }: { input: { current: PreviewInput } }) {
  const ref = useRef<HTMLCanvasElement>(null);
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
      try {
        renderer.render(cam.frame(), cam.target, [], [], [], (mvp, eye) => {
          chars.begin(mvp, eye, renderer.skySample);
          chars.draw(profile, state, true, !!clip);
        });
      } catch {
        /* a profile mid-edit can be invalid for one frame */
      }
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
  return <canvas ref={ref} class="viewport-canvas" aria-label="Character preview" />;
}
