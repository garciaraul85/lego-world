/** Outliner and layer categories, derived from v68 generator group names ("house-3", "tree-oak-12"). */
export const CATEGORIES = [
  { id: 'terrain', name: 'Terrain & loose bricks', color: '#5f9e46' },
  { id: 'buildings', name: 'Buildings', color: '#c9533f' },
  { id: 'nature', name: 'Nature', color: '#2f7d3d' },
  { id: 'vehicles', name: 'Vehicles', color: '#2b63b8' },
  { id: 'other', name: 'Other groups', color: '#d8b875' },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]['id'];

const BUILDINGS = /^(skyscraper|house|tower|castle-wall|castle|shop|stall)/;
const NATURE = /^(tree|palm|flower|shrub|mushroom|fern|cactus|bush|rock)/;
const VEHICLES = /^(car|truck|bus|boat)/;

export function categoryOf(group: string | undefined): CategoryId {
  if (!group) return 'terrain';
  if (BUILDINGS.test(group)) return 'buildings';
  if (NATURE.test(group)) return 'nature';
  if (VEHICLES.test(group)) return 'vehicles';
  return 'other';
}

/** "tree-autumn-maple-12" -> "Autumn maple tree 12" style label. */
export function groupLabel(group: string): string {
  const m = /^(.*?)-(\d+)$/.exec(group);
  const base = (m ? m[1]! : group).split('-');
  const num = m ? ` ${m[2]}` : '';
  if (base[0] === 'tree' && base.length > 1) return `${cap(base.slice(1).join(' '))} tree${num}`;
  return `${cap(base.join(' '))}${num}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
