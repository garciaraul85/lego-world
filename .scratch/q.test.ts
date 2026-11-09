import { it } from 'vitest';
import { helpPages } from '../src/editor/help/pages';
import { HelpIndex } from '../src/editor/help/search';
it('q', () => {
  const idx = new HelpIndex(helpPages());
  console.log(JSON.stringify(idx.search('where does the hero start', 6).map((h) => [h.page, Math.round(h.score * 100) / 100])));
});
