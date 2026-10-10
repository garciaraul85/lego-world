import { describe, expect, it } from 'vitest';
import { describeDiff, lineDiff } from '../../src/editor/ai/diff';

describe('AI review line diff (P8.3)', () => {
  it('shows only changed lines with context and folds the rest', () => {
    const a = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const b = a.replace('line 10', 'line ten').replace('line 20', 'line 20\nline 20b');
    const d = lineDiff(a, b, 1);
    expect(d.filter((l) => l.kind === '-').map((l) => l.text)).toEqual(['line 10']);
    expect(d.filter((l) => l.kind === '+').map((l) => l.text)).toEqual(['line ten', 'line 20b']);
    expect(d.filter((l) => l.kind === '…').length).toBeGreaterThanOrEqual(2);
    expect(d.length).toBeLessThan(15);
  });
  it('added and removed files', () => {
    expect(lineDiff('', '{\n  "a": 1\n}').filter((l) => l.kind === '+').length).toBe(3);
    expect(
      describeDiff({
        path: 'maps/map_aaaaaaaaaa/chunks/0_0.json',
        kind: 'changed',
        before: { bricks: [1, 2, 3] },
        after: { bricks: [1] },
        bytes: 0,
      }),
    ).toBe('3 → 1 bricks');
  });
  it('very large changes fall back without hanging', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
    const t = performance.now();
    expect(lineDiff(a, b, 2, 1_000_000).length).toBe(6000);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
