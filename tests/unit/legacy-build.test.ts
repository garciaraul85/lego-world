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

  it('is LEGO World v68 but for step 12b’s arm proportions (P0.3 guard, replaced by the one card that edits src/legacy)', () => {
    // undo exactly the recorded edit: what is left must be byte-identical to v68
    const fix = JSON.parse(readFileSync('tests/fixtures/legacy/arm-proportions.json', 'utf8')) as { pairs: [string, string][] };
    let back = html;
    for (const [now, was] of fix.pairs) {
      expect(back.split(now).length - 1, now.slice(0, 80)).toBe(1);
      back = back.replace(now, () => was);
    }
    expect(sha(back)).toBe(sha(readFileSync('tests/fixtures/legacy/index.v68.html', 'utf8')));
  });
});
