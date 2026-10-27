/**
 * Step 11 (P24 part 3): sample files for the Your own media course's "Do it for me" — a big poster picture and a
 * short video, made here in the browser (nothing is downloaded).
 */
function poster(c: HTMLCanvasElement, t: number) {
  const g = c.getContext('2d')!;
  const { width: w, height: h } = c;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2b5cff');
  sky.addColorStop(1, '#9fd3ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // a row of bricks along the bottom
  const bw = w / 12;
  const bh = h / 8;
  const colors = ['#d20c20', '#f7c900', '#00852b', '#0057a6'];
  for (let i = 0; i < 12; i++) {
    g.fillStyle = colors[i % 4]!;
    const y = h - bh - Math.abs(Math.sin(t * 3 + i)) * bh * 0.3;
    g.fillRect(i * bw + 2, y, bw - 4, bh);
    g.fillStyle = '#ffffff40';
    g.beginPath();
    g.arc(i * bw + bw * 0.3, y - bh * 0.08, bh * 0.14, 0, Math.PI * 2);
    g.arc(i * bw + bw * 0.7, y - bh * 0.08, bh * 0.14, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.font = `bold ${Math.round(h / 7)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText('My brick game', w / 2, h * 0.42);
}

/** a 2400×1200 PNG poster: big enough in pixels to be worth shrinking */
export async function samplePoster(): Promise<{ name: string; bytes: Uint8Array }> {
  const c = document.createElement('canvas');
  c.width = 2400;
  c.height = 1200;
  poster(c, 0);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  return { name: 'poster.png', bytes: new Uint8Array(await blob!.arrayBuffer()) };
}

/** a 2-second video of the poster's bricks bouncing (WebM, or MP4 where that is what the browser records) */
export async function sampleClip(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 240;
  const stream = (c as HTMLCanvasElement & { captureStream?(fps: number): MediaStream }).captureStream?.(15);
  if (!stream || typeof MediaRecorder === 'undefined') return null;
  const type = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 400_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((ok) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      poster(c, t);
      if (t < 2) requestAnimationFrame(frame);
      else ok();
    };
    frame();
  });
  rec.stop();
  await done;
  for (const tr of stream.getTracks()) tr.stop();
  const blob = new Blob(parts, { type: type.split(';')[0] });
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { name: `intro.${ext}`, bytes: new Uint8Array(await blob.arrayBuffer()) };
}
