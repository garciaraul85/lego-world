import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs build script without types
import { buildLegacy } from '../../scripts/inline-html.mjs';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('legacy build', () => {
  const { html } = buildLegacy() as { html: string };

  it('matches the committed dist/index.html (run `npm run build:legacy` after editing src/legacy)', () => {
    expect(sha(html)).toBe(sha(readFileSync('dist/index.html', 'utf8')));
  });

  it('is byte-identical to LEGO World v68 (P0.3 guard; a later card that edits src/legacy replaces this check)', () => {
    expect(sha(html)).toBe(sha(readFileSync('tests/fixtures/legacy/index.v68.html', 'utf8')));
  });
});
