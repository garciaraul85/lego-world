import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/core/commands';
import { CommandBus, registerAll } from '../../src/core/commands';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Chunk, chunkRows } from '../../src/core/schema';
import { settleMove } from '../../src/editor/viewport/settle';

/** P32: a sideways move lands where it can stand instead of being refused for floating. */
describe('settleMove', () => {
  it('drops a brick moved off a tower onto the ground next to it', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'A', random: () => 0.6 }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    const run = (c: Command) => bus.execute(c, { source: 'user' });
    // a free spot on the ground: find the ground height by placing a 2x2 low and stepping up until it fits
    let y = 0;
    const at = (yy: number) => ({
      type: 'bricks.place',
      payload: { map, bricks: [{ type: 'brick2x2', x: 40, y: yy, z: 40, rot: 0, color: '#d20c20' }] },
    });
    while (bus.check(at(y)) && y < 80) y++;
    // a tower of 4 bricks, then one more brick on top
    for (let i = 0; i < 5; i++) expect(run(at(y + i * 3)).ok, `tower ${i}`).toBe(true);
    // the top brick's id: the last placed brick is the highest id in the map
    const chunks = s.list(`maps/${map}/chunks/`).map((p) => s.get<Chunk>(p)!);
    const all = chunks.flatMap((c) => {
      const r = chunkRows(c);
      return Array.from({ length: r.length / 9 }, (_, i) => [...r.slice(i * 9, i * 9 + 9)]);
    });
    const topBrick = all.reduce((a, b) => (b[7]! > a[7]! ? b : a));
    const move: Command = { type: 'bricks.move', payload: { map, ids: [topBrick[7]], dx: 6, dy: 0, dz: 0 } };
    // straight across it would float
    expect(bus.check(move)).toBeTruthy();
    const r = settleMove(move, (c) => bus.check(c));
    expect(r.dy).toBeLessThan(0);
    expect(bus.check(r.cmd)).toBeNull();
    expect(run(r.cmd).ok).toBe(true);
    // a move that already fits is left alone
    const same: Command = { type: 'bricks.move', payload: { map, ids: [topBrick[7]], dx: 0, dy: 0, dz: 3 } };
    const kept = settleMove(same, () => null);
    expect(kept.dy).toBe(0);
  });
});
