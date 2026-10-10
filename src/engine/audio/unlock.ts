/**
 * Browsers (and iOS/Android webviews) start audio suspended until a user gesture. The platform calls
 * this once; the first pointer/key event resumes the context (plan: platform.audioUnlock).
 */
export function audioUnlock(ctx: AudioContext, target: EventTarget = globalThis): () => void {
  const events = ['pointerdown', 'keydown', 'touchend'];
  const resume = () => {
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    if (ctx.state === 'running') off();
  };
  const off = () => {
    for (const e of events) target.removeEventListener(e, resume, true);
  };
  for (const e of events) target.addEventListener(e, resume, true);
  resume();
  return off;
}
