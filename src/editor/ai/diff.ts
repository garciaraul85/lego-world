import type { FileDiff } from '../../core/ai/patch';

export type DiffLine = { kind: ' ' | '+' | '-' | '…'; text: string };

/**
 * A line diff of two texts for the AI review (P8.3): common prefix and suffix trimmed, LCS on the
 * middle, unchanged runs folded to `context` lines around each change. Large middles fall back to
 * "replaced" so the panel never stalls.
 */
export function lineDiff(a: string, b: string, context = 2, maxCells = 2_000_000): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const am = A.slice(pre, A.length - suf);
  const bm = B.slice(pre, B.length - suf);
  const mid: DiffLine[] = [];
  if ((am.length + 1) * (bm.length + 1) > maxCells) {
    for (const t of am) mid.push({ kind: '-', text: t });
    for (const t of bm) mid.push({ kind: '+', text: t });
  } else {
    const n = am.length;
    const m = bm.length;
    const L = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i * (m + 1) + j] =
          am[i] === bm[j]
            ? L[(i + 1) * (m + 1) + j + 1]! + 1
            : Math.max(L[(i + 1) * (m + 1) + j]!, L[i * (m + 1) + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) {
        mid.push({ kind: ' ', text: am[i]! });
        i++;
        j++;
      } else if (L[(i + 1) * (m + 1) + j]! >= L[i * (m + 1) + j + 1]!) mid.push({ kind: '-', text: am[i++]! });
      else mid.push({ kind: '+', text: bm[j++]! });
    }
    while (i < n) mid.push({ kind: '-', text: am[i++]! });
    while (j < m) mid.push({ kind: '+', text: bm[j++]! });
  }
  const all: DiffLine[] = [
    ...A.slice(0, pre).map((t) => ({ kind: ' ' as const, text: t })),
    ...mid,
    ...A.slice(A.length - suf).map((t) => ({ kind: ' ' as const, text: t })),
  ];
  // fold unchanged runs
  const keep = new Array<boolean>(all.length).fill(false);
  all.forEach((l, k) => {
    if (l.kind === ' ') return;
    for (let x = Math.max(0, k - context); x <= Math.min(all.length - 1, k + context); x++) keep[x] = true;
  });
  const out: DiffLine[] = [];
  let folded = 0;
  all.forEach((l, k) => {
    if (keep[k]) {
      if (folded) out.push({ kind: '…', text: `${folded} unchanged line${folded === 1 ? '' : 's'}` });
      folded = 0;
      out.push(l);
    } else folded++;
  });
  if (folded) out.push({ kind: '…', text: `${folded} unchanged line${folded === 1 ? '' : 's'}` });
  return out;
}

const pretty = (v: unknown) => (v === undefined ? '' : JSON.stringify(v, null, 2));

/** A one-line description of a file change (chunk files are summarized by brick counts). */
export function describeDiff(d: FileDiff): string {
  if (/\/chunks\//.test(d.path)) {
    const n = (v: unknown) => (v as { bricks?: unknown[] } | undefined)?.bricks?.length ?? 0;
    return `${n(d.before)} → ${n(d.after)} bricks`;
  }
  return d.kind === 'added' ? 'new file' : d.kind === 'removed' ? 'deleted' : 'changed';
}

export function fileDiffLines(d: FileDiff): DiffLine[] | null {
  if (/\/chunks\//.test(d.path)) return null;
  return lineDiff(pretty(d.before), pretty(d.after));
}

/** Groups paths for the review: "Maps", "Logic"… */
export function groupOf(path: string): string {
  const top = path.split('/')[0]!;
  return (
    (
      {
        maps: 'Maps',
        world: 'World',
        assets: 'Assets',
        characters: 'Characters',
        clips: 'Clips',
        logic: 'Logic',
        screens: 'Screens',
        cinematics: 'Cinematics',
        audio: 'Audio',
        'project.json': 'Project',
      } as Record<string, string>
    )[top] ?? 'Other'
  );
}
