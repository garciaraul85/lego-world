import { useEffect, useRef } from 'preact/hooks';
import { PlayRenderer } from '../../../engine/runtime/play-renderer';
import { CinematicOverlay } from '../../../engine/ui/CinematicOverlay';
import type { DirectorPreview } from './preview';

/** What the player sees: the scene through the active camera, with letterbox, fades, titles and dialogue. */
export function CameraPreview({ preview, tick }: { preview: DirectorPreview; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const prRef = useRef<PlayRenderer | null>(null);
  const dirty = useRef(true);
  useEffect(() => {
    const pr = new PlayRenderer(ref.current!, preview.session);
    pr.debug = { colliders: false, spawns: false };
    prRef.current = pr;
    let raf = 0;
    const ro = new ResizeObserver(() => (dirty.current = true));
    ro.observe(ref.current!);
    // draw only when the playhead or the scene changed
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!dirty.current) return;
      dirty.current = false;
      pr.render();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pr.dispose();
    };
  }, [preview]);
  dirty.current = true;
  void tick;
  const f = preview.session.cine.frame;
  const say = f?.say;
  return (
    <div class="viewport-wrap dr-preview">
      <canvas ref={ref} class="viewport-canvas" aria-label="Camera preview" />
      {f && <CinematicOverlay post={f.post} preview />}
      {say && (
        <div class="dr-say" role="status">
          <strong>{say.role}</strong> {say.text}
        </div>
      )}
      <span class="dr-tag">{f?.shot ? `🎥 ${f.shot}` : 'No camera yet'}</span>
    </div>
  );
}
