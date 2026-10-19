import { useEffect, useRef } from 'preact/hooks';
import type { Effect } from '../../../core/effects/schema';
import { ParticleSystem } from '../../../engine/effects/particles';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { OrbitCamera } from '../../../engine/render/camera';
import { Renderer } from '../../../engine/render/renderer';

/**
 * P23 part 1: the effect's live preview — it plays on a floor of studs, over and over (a burst again a moment
 * after its last particle is gone; a stream for as long as it runs). Drag to turn, wheel to zoom.
 */
export function EffectPreview({ effect, replay }: { effect: { current: Effect | null }; replay: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const kick = useRef(replay);
  kick.current = replay;
  useEffect(() => {
    const canvas = ref.current!;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch {
      return;
    }
    const L = legacyRuntime();
    renderer.floor = true;
    renderer.skySample = L.SkyCycle.sample('day', 0, false, false);
    const cam = new OrbitCamera();
    cam.target = [0, 1.5, 0];
    cam.baseDistance = 11;
    cam.pitch = 0.3;
    cam.yaw = 0.6;
    cam.fov = 0.8;
    const fx = new ParticleSystem(2000);
    let shown: Effect | null = null;
    let seenKick = kick.current;
    let next = 0;
    let stream: ReturnType<ParticleSystem['start']> | null = null;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const e = effect.current;
      // a changed effect (or Play again) starts over
      if (e !== shown || kick.current !== seenKick) {
        shown = e;
        seenKick = kick.current;
        fx.clear();
        stream = null;
        next = 0;
      }
      const t = now / 1000;
      if (e) {
        const at: [number, number, number] = [0, e.direction === 'down' ? 4 : 1.2, 0];
        if (e.mode === 'stream') {
          if (!fx.running(stream)) {
            if (!next) next = t + (stream ? 0.6 : 0);
            if (t >= next) {
              stream = fx.start(e, at, { forward: [1, 0, 0] });
              next = 0;
            }
          }
        } else if (t >= next) {
          fx.play(e, at, { forward: [1, 0, 0] });
          next = t + e.life[1] + 0.5;
        }
      }
      fx.step(dt, (_x, y) => y < 0);
      renderer.particles = fx.batches();
      try {
        renderer.render(cam.frame(), cam.target, [], [], []);
      } catch {
        /* an effect mid-edit */
      }
      canvas.dataset.particles = String(fx.count);
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
  return <canvas ref={ref} class="viewport-canvas" aria-label="Effect preview" />;
}
