import type { PostItem } from '../../../core/schema';

export type PostFrame = {
  /** 0 = clear, 1 = fully covered by `color` */
  fade: number;
  color: string;
  letterbox: boolean;
  title: { title: string; sub: string; alpha: number } | null;
  /** time scale of the world outside the cast (1 = normal) */
  slowmo: number;
};

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Full-screen post effects at time t (P6.1 post track). */
export function postAt(items: readonly PostItem[], t: number, letterbox: boolean): PostFrame {
  const out: PostFrame = { fade: 0, color: '#000000', letterbox, title: null, slowmo: 1 };
  const list = [...items].sort((a, b) => a.t - b.t);
  for (const it of list) {
    if (it.t > t) break;
    if ('fade' in it) {
      const k = it.dur <= 0 ? 1 : clamp((t - it.t) / it.dur);
      out.fade = it.fade === 'out' ? k : 1 - k;
      out.color = it.color ?? '#000000';
    } else if ('letterbox' in it) out.letterbox = it.letterbox;
    else if ('title' in it) {
      const local = t - it.t;
      if (local < it.dur) {
        const alpha = Math.min(clamp(local / 0.4), clamp((it.dur - local) / 0.4));
        out.title = { title: it.title, sub: it.sub ?? '', alpha };
      }
    } else if ('slowmo' in it) {
      if (t - it.t < it.dur) out.slowmo = it.slowmo;
    }
  }
  return out;
}
