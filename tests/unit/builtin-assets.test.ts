import { describe, expect, it } from 'vitest';
import { BUILTIN_ASSETS } from '../../src/builtin/assets';
import { expandAsset } from '../../src/core/assets/expand';
import { inspectBricks } from '../../src/core/bricks/inspect';
import { brickError } from '../../src/core/bricks/map-bricks';
import { brickToPiece } from '../../src/core/bridge/legacy-bridge';

describe('built-in asset library', () => {
  it('has the v68 structures and the interactive props, with unique ids', () => {
    const names = BUILTIN_ASSETS.map((a) => a.name);
    for (const n of ['House', 'Skyscraper', 'Oak tree', 'Palm', 'Car', 'Treasure chest', 'Door', 'Lamp post'])
      expect(names).toContain(n);
    expect(new Set(BUILTIN_ASSETS.map((a) => a.id)).size).toBe(BUILTIN_ASSETS.length);
  });
  for (const a of BUILTIN_ASSETS)
    it(`${a.name}: every state is a valid v68 build in every rotation`, () => {
      for (const state of a.states)
        for (let rot = 0; rot < 4; rot++) {
          const { bricks, sockets } = expandAsset(a, { pos: [0, 0, 0], rot, idBase: 1, state });
          expect(inspectBricks(bricks)).toEqual({ ok: true });
          for (const b of bricks) {
            expect(brickError(b)).toBeNull();
            expect(() => brickToPiece(b)).not.toThrow();
          }
          expect(sockets).toHaveLength(a.sockets.length);
        }
      for (const i of a.interactions) {
        expect(a.sockets.some((s) => s.id === i.socket)).toBe(true);
        if (i.when) expect(a.states).toContain(i.when.state);
      }
    });
});
