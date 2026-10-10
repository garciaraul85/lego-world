import { useEffect, useState } from 'preact/hooks';

export type Rect = { x: number; y: number; w: number; h: number };

/** Where a CSS selector is on screen right now (polled, so it follows layout changes). */
export function useTargetRect(selector: string): Rect | null {
  const [r, setR] = useState<Rect | null>(null);
  useEffect(() => {
    const read = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      const b = el?.getBoundingClientRect();
      const next = b && b.width + b.height > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
      setR((cur) =>
        cur &&
        next &&
        Math.abs(cur.x - next.x) + Math.abs(cur.y - next.y) + Math.abs(cur.w - next.w) + Math.abs(cur.h - next.h) < 1
          ? cur
          : next,
      );
    };
    read();
    const h = setInterval(read, 250);
    window.addEventListener('resize', read);
    return () => {
      clearInterval(h);
      window.removeEventListener('resize', read);
    };
  }, [selector]);
  return r;
}

/** A box-shadow cutout around the target (P7.3); clicks pass through to the editor. */
export function Spotlight({ rect }: { rect: Rect | null }) {
  if (!rect) return <div class="tut-dim" />;
  const pad = 6;
  return (
    <div
      class="tut-spot"
      style={{
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.w + pad * 2}px`,
        height: `${rect.h + pad * 2}px`,
      }}
    />
  );
}

/** The demo pointer: glides to the target and “clicks”. */
export function GhostCursor({ at, clicking }: { at: { x: number; y: number } | null; clicking: boolean }) {
  if (!at) return null;
  return (
    <div
      class={`tut-ghost ${clicking ? 'click' : ''}`}
      style={{ transform: `translate(${at.x}px, ${at.y}px)` }}
      aria-hidden="true"
    >
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <path
          d="M4 2 L4 22 L9 17 L13 26 L17 24 L13 15 L21 15 Z"
          fill="#fff"
          stroke="#111"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
      <span class="tut-ripple" />
    </div>
  );
}
