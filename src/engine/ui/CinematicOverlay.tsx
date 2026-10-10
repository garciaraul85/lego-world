import type { PostFrame } from '../cinematic/tracks/post';

/**
 * Cinematic post effects over the game view (P6.1 post track): letterbox bars, fades, title cards,
 * and the Skip button. Shared by Play and the Director's camera preview.
 */
export function CinematicOverlay({
  post,
  skippable,
  onSkip,
  preview,
}: {
  post: PostFrame;
  skippable?: boolean;
  onSkip?: () => void;
  preview?: boolean;
}) {
  return (
    <div class={`bw-cine ${preview ? 'preview' : ''}`} aria-hidden={preview ? 'true' : undefined}>
      <div class={`bw-lb top ${post.letterbox ? 'on' : ''}`} />
      <div class={`bw-lb bottom ${post.letterbox ? 'on' : ''}`} />
      {post.fade > 0 && <div class="bw-fade" style={{ background: post.color, opacity: post.fade }} />}
      {post.title && (
        <div class="bw-title" style={{ opacity: post.title.alpha }}>
          <div class="bw-title-main">{post.title.title}</div>
          {post.title.sub && <div class="bw-title-sub">{post.title.sub}</div>}
        </div>
      )}
      {skippable && onSkip && (
        <button type="button" class="bw-skip" onClick={onSkip}>
          Skip ▸▸ <span class="muted">Esc</span>
        </button>
      )}
    </div>
  );
}
