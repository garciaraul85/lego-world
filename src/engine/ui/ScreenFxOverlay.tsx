import { useEffect, useRef } from 'preact/hooks';
import { type Drift, GRADE_INFO, type Mood } from '../../core/effects/screen';
import type { ScreenLayer } from '../effects/screen';

/**
 * P23 part 2: what screen effects and a map's mood lay over the game view, under its screens (the HUD is never
 * graded or flashed): the colour grade, dark edges, something drifting across, red edges while the hero is low
 * on health, and the flashes and fades playing now. It never takes clicks.
 */
export function ScreenFxOverlay({
  mood,
  layers,
  lowHealth = 0,
  clock = 0,
}: {
  mood: Mood;
  layers: ScreenLayer[];
  lowHealth?: number;
  clock?: number;
}) {
  const grade = GRADE_INFO[mood.grade]?.filter ?? 'none';
  const pulse = lowHealth ? 0.45 + 0.25 * Math.sin(clock * 5) : 0;
  const ref = useRef<HTMLDivElement>(null);
  // the colour grade is a filter on the view's own canvas (the 3D picture only: never the HUD)
  useEffect(() => {
    const canvas = ref.current?.parentElement?.querySelector<HTMLCanvasElement>('canvas.viewport-canvas');
    if (!canvas) return;
    canvas.style.filter = grade === 'none' ? '' : grade;
    return () => {
      canvas.style.filter = '';
    };
  }, [grade]);
  return (
    <div ref={ref} class="bw-screenfx" aria-hidden="true" data-grade={mood.grade} data-layers={layers.length}>
      {mood.drift !== 'none' && <DriftLayer drift={mood.drift} amount={mood.amount} />}
      {mood.vignette > 0 && (
        <div
          class="bw-vignette"
          style={{
            background: `radial-gradient(ellipse at center, transparent ${Math.round(62 - mood.vignette * 25)}%, rgba(0,0,0,${(0.35 + mood.vignette * 0.55).toFixed(2)}) 100%)`,
          }}
        />
      )}
      {lowHealth > 0 && (
        <div
          class="bw-lowhealth"
          style={{ boxShadow: `inset 0 0 ${Math.round(70 + pulse * 60)}px rgba(220,20,20,${pulse.toFixed(2)})` }}
        />
      )}
      {layers.map((l) => (
        <div class="bw-flash" style={{ background: l.color, opacity: l.alpha }} />
      ))}
    </div>
  );
}

type Flake = { x: number; y: number; s: number; v: number; w: number };
const DRIFT_LOOK: Record<Exclude<Drift, 'none'>, { n: number; color: string; speed: number; wind: number }> = {
  rain: { n: 140, color: 'rgba(190,210,255,0.55)', speed: 900, wind: 120 },
  snow: { n: 110, color: 'rgba(255,255,255,0.85)', speed: 60, wind: 25 },
  fog: { n: 8, color: 'rgba(235,240,245,0.10)', speed: 6, wind: 18 },
  dust: { n: 70, color: 'rgba(214,190,140,0.55)', speed: 18, wind: 60 },
  embers: { n: 50, color: 'rgba(255,140,40,0.85)', speed: -45, wind: 15 },
  leaves: { n: 30, color: 'rgba(200,120,40,0.9)', speed: 55, wind: 40 },
};

/** something drifting across the whole view, drawn on its own 2D canvas */
export function DriftLayer({ drift, amount }: { drift: Drift; amount: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || drift === 'none') return;
    const look = DRIFT_LOOK[drift];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const n = Math.max(1, Math.round(look.n * Math.max(0.05, amount)));
    const flakes: Flake[] = Array.from({ length: n }, () => ({
      x: rnd(),
      y: rnd(),
      s: 0.5 + rnd(),
      v: 0.6 + rnd() * 0.8,
      w: rnd() * 6.28,
    }));
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W = cv.clientWidth || 320;
      const H = cv.clientHeight || 180;
      if (cv.width !== W) cv.width = W;
      if (cv.height !== H) cv.height = H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = look.color;
      ctx.strokeStyle = look.color;
      for (const f of flakes) {
        f.w += dt;
        f.y += (look.speed * f.v * dt) / H;
        f.x += ((look.wind + Math.sin(f.w * 1.3) * look.wind * 0.5) * dt) / W;
        if (f.y > 1.05) f.y -= 1.1;
        if (f.y < -0.05) f.y += 1.1;
        if (f.x > 1.05) f.x -= 1.1;
        const x = f.x * W;
        const y = f.y * H;
        if (drift === 'rain') {
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 4 * f.s, y + 16 * f.s);
          ctx.stroke();
        } else if (drift === 'fog') {
          const r = (0.25 + f.s * 0.2) * W;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, look.color);
          g.addColorStop(1, 'rgba(235,240,245,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        } else if (drift === 'leaves') {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(f.w);
          ctx.fillRect(-4 * f.s, -2 * f.s, 8 * f.s, 4 * f.s);
          ctx.restore();
        } else {
          const r = drift === 'snow' ? 1.6 * f.s + 0.8 : 1.2 * f.s;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [drift, amount]);
  return <canvas ref={ref} class="bw-drift" data-drift={drift} />;
}
