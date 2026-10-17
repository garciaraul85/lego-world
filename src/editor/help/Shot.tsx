import { useState } from 'preact/hooks';
import SHOTS from '../../../docs/help/shots/index.json';
import { GUIDES, helpEntry } from './entries';

/**
 * P32: annotated screenshots from the real editor (captured by `npm run help:shots`). A screen guide shows
 * the whole screen with its areas numbered; an entry shows the part of the screen around its control,
 * outlined. Pictures live next to the editor (help-shots/); without them Help shows text only.
 */
type Rect = [number, number, number, number];
export type ShotIndex = {
  base: string;
  w: number;
  h: number;
  states: Record<string, string>;
  entries: Record<string, { s: string; r: Rect[] }>;
  guides: Record<string, { s: string; areas: Record<string, Rect> }>;
};
const INDEX = SHOTS as unknown as ShotIndex;

export const hasShot = (focus: string) =>
  focus.startsWith('guide:') ? !!INDEX.guides[focus.slice(6)] : !!INDEX.entries[focus];

export function Shot({ focus }: { focus: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  if (focus.startsWith('guide:')) {
    const screen = focus.slice(6);
    const g = INDEX.guides[screen];
    const guide = GUIDES.find((x) => x.screen === screen);
    if (!g || !guide) return null;
    const boxes = guide.areas.map((id, i) => ({ n: i + 1, r: g.areas[id], name: helpEntry(id)?.name ?? id }));
    return (
      <Figure
        src={`${INDEX.base}${INDEX.states[g.s]}`}
        view={[0, 0, INDEX.w, INDEX.h]}
        boxes={boxes.filter((b) => b.r).map((b) => ({ ...b, r: b.r! }))}
        caption={`The ${screen} screen, with its areas numbered as in the list below.`}
        onError={() => setFailed(true)}
      />
    );
  }
  const e = INDEX.entries[focus];
  if (!e) return null;
  const rects = e.r.slice(0, 8);
  // the part of the screen around the control(s), with room to see where it is
  const x0 = Math.min(...rects.map((r) => r[0]));
  const y0 = Math.min(...rects.map((r) => r[1]));
  const x1 = Math.max(...rects.map((r) => r[0] + r[2]));
  const y1 = Math.max(...rects.map((r) => r[1] + r[3]));
  // at least the width Help shows it at, so the picture is never blown up
  const w = Math.min(INDEX.w, Math.max(760, x1 - x0 + 240));
  const h = Math.min(INDEX.h, Math.max(340, y1 - y0 + 160));
  const vx = Math.max(0, Math.min(INDEX.w - w, (x0 + x1) / 2 - w / 2));
  const vy = Math.max(0, Math.min(INDEX.h - h, (y0 + y1) / 2 - h / 2));
  return (
    <Figure
      src={`${INDEX.base}${INDEX.states[e.s]}`}
      view={[vx, vy, w, h]}
      boxes={rects.map((r, i) => ({ n: rects.length > 1 ? i + 1 : 1, r, name: helpEntry(focus)?.name ?? focus }))}
      caption={`Where to find it${rects.length > 1 ? ` (${rects.length} places)` : ''}.`}
      onError={() => setFailed(true)}
    />
  );
}

function Figure({
  src,
  view,
  boxes,
  caption,
  onError,
}: {
  src: string;
  view: Rect;
  boxes: { n: number; r: Rect; name: string }[];
  caption: string;
  onError: () => void;
}) {
  const [vx, vy, vw, vh] = view;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <figure class="help-shot">
      <div class="help-shot-frame" style={{ aspectRatio: `${vw} / ${vh}` }}>
        <img
          src={src}
          alt=""
          onError={onError}
          style={{
            width: pct(INDEX.w, vw),
            left: pct(-vx, vw),
            top: pct(-vy, vh),
          }}
        />
        {boxes.map((b) => (
          <span
            class="help-callout"
            title={b.name}
            style={{
              left: pct(b.r[0] - vx, vw),
              top: pct(b.r[1] - vy, vh),
              width: pct(b.r[2], vw),
              height: pct(b.r[3], vh),
            }}
          >
            <span class="help-callout-n">{b.n}</span>
          </span>
        ))}
      </div>
      <figcaption class="small muted">{caption}</figcaption>
    </figure>
  );
}
