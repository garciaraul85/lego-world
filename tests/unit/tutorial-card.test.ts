import { describe, expect, it } from 'vitest';
import { cardPos } from '../../src/editor/tutorial/TutorialRunner';

/** P32: the tutorial card never covers what the step points at. */
describe('tutorial card placement', () => {
  const box = (p: Record<string, string>, h: number) => {
    const x = Number.parseFloat(p.left!);
    const y = Number.parseFloat(p.top!);
    return { x, y, w: Number.parseFloat(p.width!), h };
  };
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('keeps clear of a small target on its preferred side, or another side', () => {
    const t = { x: 600, y: 60, w: 80, h: 30 };
    for (const placement of ['top', 'bottom', 'left', 'right', 'center'] as const)
      expect(overlaps(box(cardPos(t, { placement }, false, 300, 1280, 800), 300), t), placement).toBe(false);
  });

  it('a target nearly as big as the screen (step 15, the World graph) gets the corner that hides least of it', () => {
    const t = { x: 260, y: 120, w: 760, h: 560 };
    const p = box(cardPos(t, { placement: 'top' }, false, 320, 1280, 800), 320);
    const cover =
      Math.max(0, Math.min(p.x + p.w, t.x + t.w) - Math.max(p.x, t.x)) *
      Math.max(0, Math.min(p.y + p.h, t.y + t.h) - Math.max(p.y, t.y));
    expect(cover / (t.w * t.h)).toBeLessThan(0.15);
    const huge = { x: 0, y: 0, w: 1200, h: 800 };
    const q = box(cardPos(huge, { placement: 'top' }, false, 320, 1280, 800), 320);
    expect(q.x).toBeGreaterThan(800); // the strip on the right is the least covered
  });
});

describe('the card keeps off the build plate (P32)', () => {
  const box = (p: Record<string, string>, h: number) => ({
    x: Number.parseFloat(p.left!),
    y: Number.parseFloat(p.top!),
    w: Number.parseFloat(p.width!),
    h,
  });
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  it('sits beside the plate when the target is a toolbar above it', () => {
    const tools = { x: 290, y: 150, w: 630, h: 80 };
    const plate = { x: 286, y: 260, w: 638, h: 480 };
    const p = box(cardPos(tools, { placement: 'bottom' }, false, 320, 1280, 800, [plate]), 320);
    expect(overlaps(p, tools)).toBe(false);
    // at most a sliver of the plate (the panels beside it are narrower than the card)
    const covered = Math.max(0, Math.min(p.x + p.w, plate.x + plate.w) - Math.max(p.x, plate.x));
    expect(covered).toBeLessThan(40);
  });
});
