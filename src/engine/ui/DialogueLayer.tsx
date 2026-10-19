import { useEffect, useRef } from 'preact/hooks';
import type { DialogueStyle, Mood } from '../../core/dialogue/schema';
import type { TalkView } from '../runtime/conversation';

/**
 * P22: a conversation on screen, in one of eight styles: Adventure (a box at the bottom, letter by letter
 * with voice blips), Classic RPG (a framed window with a portrait), Visual novel (big portraits), Speech
 * bubbles (above the speaker), Cinematic (subtitles under letterbox bars), Chat (a phone), Sign (a
 * plaque) and Narrator (a caption). Clicking moves on; options are buttons (also 1–6, arrows and Enter).
 */
export type DialogueLayerProps = {
  view: TalkView;
  /** letters of the line showing now */
  shown: number;
  /** the highlighted option */
  focus: number;
  /** where the speaker is on screen (0..1), for bubbles; null: off screen */
  anchor: { x: number; y: number } | null;
  onNext(): void;
  onChoose(position: number): void;
  /** a voice blip (a sound event) at a pitch */
  blip?(event: string, pitch: number): void;
  /** the editor's preview: no click to advance outside the box */
  preview?: boolean;
};

const FACE: Record<Mood, { eyes: string; mouth: string }> = {
  neutral: { eyes: 'M12 15h3M25 15h3', mouth: 'M14 25h12' },
  happy: { eyes: 'M11 15q2-3 4 0M25 15q2-3 4 0', mouth: 'M13 23q7 7 14 0' },
  angry: { eyes: 'M11 13l4 2M29 13l-4 2', mouth: 'M14 27q6-5 12 0' },
  sad: { eyes: 'M11 16q2 2 4 0M25 16q2 2 4 0', mouth: 'M14 28q6-5 12 0' },
  scared: {
    eyes: 'M13 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M27 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    mouth: 'M17 25h6v3h-6z',
  },
  surprised: {
    eyes: 'M13 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M27 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    mouth: 'M20 26m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  },
};

/** A brick-head portrait showing the speaker's mood (faces get their own art in P23). */
export function Portrait({ mood, color, size = 72 }: { mood: Mood; color: string | null; size?: number }) {
  const f = FACE[mood];
  return (
    <svg class="bw-portrait" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="15" y="1" width="10" height="5" rx="1.5" fill="#f2c94c" stroke="#5a4300" />
      <rect x="5" y="5" width="30" height="30" rx="8" fill="#f7d34a" stroke="#5a4300" stroke-width="1.2" />
      <rect x="8" y="36" width="24" height="4" rx="1" fill={color ?? '#4a7bd0'} />
      <path d={f.eyes} stroke="#1d1500" stroke-width="2" fill="none" stroke-linecap="round" />
      <path d={f.mouth} stroke="#1d1500" stroke-width="2" fill="none" stroke-linecap="round" />
    </svg>
  );
}

export function DialogueLayer(p: DialogueLayerProps) {
  const { view: v, shown } = p;
  const look = v.look;
  const style: DialogueStyle = look.style;
  const text = v.text.slice(0, shown);
  const done = shown >= v.text.length;
  // voice blips: one every couple of letters while the line appears
  const last = useRef({ serial: -1, n: 0 });
  useEffect(() => {
    const l = last.current;
    if (l.serial !== v.serial) {
      l.serial = v.serial;
      l.n = 0;
    }
    const blip = v.voice?.blip ?? look.blip;
    if (!blip || !p.blip || done || v.choices) {
      l.n = shown;
      return;
    }
    if (shown - l.n >= 2 && /\S/.test(v.text[shown - 1] ?? '')) {
      l.n = shown;
      p.blip(blip, v.voice?.pitch ?? look.pitch);
    }
  });
  const name = v.speakerName;
  const nameStyle = { color: v.nameColor ?? look.nameColor };
  const box = { background: look.bg, color: look.color };
  const choices = v.choices && (
    <div class={`bw-dlg-choices ${look.choices}`} role="group" aria-label="Choices">
      {v.choices.map((c, i) => (
        <button
          type="button"
          class={`bw-dlg-choice ${i === p.focus ? 'focus' : ''}`}
          disabled={!c.enabled}
          aria-current={i === p.focus ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation();
            p.onChoose(i);
          }}
        >
          <span class="n">{i + 1}</span>
          {c.text}
        </button>
      ))}
    </div>
  );
  const more = !v.choices && <span class={`bw-dlg-more ${done ? '' : 'wait'}`}>{done ? '▼' : ''}</span>;
  const advance = (e: MouseEvent) => {
    if (v.choices) return;
    e.stopPropagation();
    p.onNext();
  };
  // Play's own keys move a conversation on; inside the editor's preview, Enter on the box does too
  const onKey = (e: KeyboardEvent) => {
    if (v.choices || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    p.onNext();
  };
  const portrait = look.portrait && v.who !== '' && <Portrait mood={v.mood} color={v.nameColor} />;
  const say = (
    <div class="bw-dlg-text" aria-live="polite">
      {text}
      <span class="bw-dlg-rest" aria-hidden="true">
        {v.text.slice(shown)}
      </span>
    </div>
  );
  const label = `Conversation · ${v.name}`;

  switch (style) {
    case 'bubble': {
      const a = p.anchor ?? { x: 0.5, y: 0.35 };
      return (
        <section class="bw-dlg bw-dlg-bubble" aria-label={label} data-style={style} onClick={advance} onKeyDown={onKey}>
          <div class="bwd-bubble" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, ...box }}>
            {name && (
              <div class="bw-dlg-name" style={nameStyle}>
                {name}
              </div>
            )}
            {say}
            {more}
          </div>
          {choices}
        </section>
      );
    }
    case 'cinematic':
      return (
        <section
          class="bw-dlg bw-dlg-cinematic"
          aria-label={label}
          data-style={style}
          onClick={advance}
          onKeyDown={onKey}
        >
          <div class="bwd-bar bwd-top" />
          <div class="bwd-bar bottom">
            <div class="bwd-sub">
              {name && (
                <span class="bw-dlg-name" style={nameStyle}>
                  {name}:{' '}
                </span>
              )}
              {say}
            </div>
            {choices}
          </div>
        </section>
      );
    case 'chat':
      return (
        <section class="bw-dlg bw-dlg-chat" aria-label={label} data-style={style} onClick={advance} onKeyDown={onKey}>
          <div class="bwd-phone">
            <div class="bwd-top">{name || 'Message'}</div>
            <div class={`bwd-msg ${v.who ? 'them' : 'note'}`} style={box}>
              {say}
            </div>
            {choices}
          </div>
        </section>
      );
    case 'sign':
      return (
        <section class="bw-dlg bw-dlg-sign" aria-label={label} data-style={style} onClick={advance} onKeyDown={onKey}>
          <div class="bwd-plaque">
            {name && (
              <div class="bw-dlg-name" style={nameStyle}>
                {name}
              </div>
            )}
            {say}
            {more}
            {choices}
          </div>
        </section>
      );
    case 'narrator':
      return (
        <section
          class="bw-dlg bw-dlg-narrator"
          aria-label={label}
          data-style={style}
          onClick={advance}
          onKeyDown={onKey}
        >
          <div class="bwd-caption">
            {say}
            {more}
          </div>
          {choices}
        </section>
      );
    case 'novel':
      return (
        <section class="bw-dlg bw-dlg-novel" aria-label={label} data-style={style} onClick={advance} onKeyDown={onKey}>
          {v.who && (
            <div class="bwd-stage">
              <div class="bwd-left">
                <Portrait mood={v.mood} color={v.nameColor} size={190} />
              </div>
            </div>
          )}
          {choices && <div class="bwd-center">{choices}</div>}
          <div class="bwd-box" style={box}>
            {name && (
              <div class="bw-dlg-name" style={nameStyle}>
                {name}
              </div>
            )}
            {say}
            {more}
          </div>
        </section>
      );
    case 'rpg':
      return (
        <section class="bw-dlg bw-dlg-rpg" aria-label={label} data-style={style} onClick={advance} onKeyDown={onKey}>
          <div class="bwd-window" style={box}>
            {portrait}
            <div class="bwd-body">
              {name && (
                <div class="bw-dlg-name" style={nameStyle}>
                  {name}
                </div>
              )}
              {say}
              {choices}
            </div>
            {more}
          </div>
        </section>
      );
    default:
      return (
        <section
          class="bw-dlg bw-dlg-adventure"
          aria-label={label}
          data-style={style}
          onClick={advance}
          onKeyDown={onKey}
        >
          {choices}
          <div class="bwd-box" style={box}>
            {name && (
              <div class="bwd-tag" style={{ ...nameStyle, background: look.bg }}>
                {name}
              </div>
            )}
            {say}
            {more}
          </div>
        </section>
      );
  }
}
