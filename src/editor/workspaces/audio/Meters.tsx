import { useEffect, useRef } from 'preact/hooks';
import type { Bus } from '../../../engine/audio/Mixer';
import type { EditorState } from '../../state';

/** A live level meter for one bus (RMS dB, -60…0), drawn every frame without re-rendering. */
export function Meter({ ed, bus }: { ed: EditorState; bus: Bus }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = -60;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = ed.audio.mixer;
      const db = m ? m.level(bus) : -60;
      // fall back slowly like a VU meter
      shown = db > shown ? db : Math.max(db, shown - 1.2);
      const k = Math.max(0, Math.min(1, (shown + 60) / 60));
      if (bar.current) {
        bar.current.style.height = `${(k * 100).toFixed(1)}%`;
        bar.current.dataset.hot = shown > -3 ? '1' : '';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bus]);
  return (
    <div
      class="au-meter"
      role="meter"
      aria-label={`${bus} level`}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={-60}
    >
      <div ref={bar} class="au-meter-fill" />
    </div>
  );
}
