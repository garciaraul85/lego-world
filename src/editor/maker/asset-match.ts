import {
  ASSET_FEATURES,
  ASSET_KINDS,
  type AssetSpec,
  assetSpecFromWords,
  cleanAssetSpec,
  describeSpec,
  ROOFS,
} from '../../core/assets/compose';

/**
 * Milestone 3, 10d part 4: an asset from a picture or words — three things to pick from, each an AssetSpec the
 * engine builds into bricks (a house, a castle, a ship, a fountain…), with what each part matched. Claude only
 * chooses the spec's settings; the bricks are always built by the editor, so every result is a normal asset.
 */
export type AssetCandidate = { name: string; spec: AssetSpec; matched: [string, string][] };

/** three from the words and the picture's colours: as said, colours the other way round, and a bigger one */
export function localAssetCandidates(text: string, picture: string[]): AssetCandidate[] {
  const spec = assetSpecFromWords(text || 'a house');
  const said =
    /\b(red|blue|navy|green|lime|yellow|gold|golden|orange|purple|pink|black|white|gr[ae]y|stone|silver|brown|wooden|wood|tan|sand|brick|teal|dark)\b/.test(
      text.toLowerCase(),
    );
  const colors = { ...spec.colors };
  const matched: [string, string][] = describeSpec(spec).map(([k, v]) => [k, `${v} — from the words`]);
  // the picture's main colours for the walls and the roof, when the words don't say
  if (!said && picture[0]) {
    colors.main = picture[0];
    matched.push(['Walls', 'a main colour of the picture']);
    if (picture[1]) {
      colors.roof = picture[1];
      matched.push(['Roof', 'another main colour of the picture']);
    }
  }
  const first = { ...spec, colors };
  const swapped = { ...first, colors: { ...colors, main: colors.roof, roof: colors.main } };
  const bigger = cleanAssetSpec({
    ...first,
    width: Math.round(first.width * 1.4),
    depth: Math.round(first.depth * 1.3),
    floors: first.floors + 1,
  });
  return [
    { name: first.name, spec: first, matched },
    { name: first.name, spec: swapped, matched: [...matched.slice(0, 1), ['Colours', 'the other way round']] },
    { name: first.name, spec: bigger, matched: [...matched.slice(0, 1), ['Size', 'bigger, one more floor']] },
  ];
}

/** The instructions for Claude: the settings it may choose from, and the answer's shape. */
export function assetPrompt(text: string, hasPicture: boolean, picture: string[]): string {
  return `You design an object for a brick-built video game editor from ${hasPicture ? 'the attached picture' : 'a description'}${hasPicture && text ? ' and a description' : ''}. You do not place bricks: you only choose settings, and the editor builds the bricks. Make an ORIGINAL design in brick style: from a famous building, vehicle or product take only its general kind, shape and colours, never a copy, a logo or a name.

${text ? `Description: ${text}\n` : ''}${picture.length ? `The picture's main colours, most first: ${picture.join(', ')}\n` : ''}
"asset": { "kind": ${ASSET_KINDS.join(' | ')}, "name": up to 60 letters, "width": 2-32 studs (x), "depth": 2-32 studs (z) (a car 8×4, a house 10×8, a castle 20×16), "floors": 1-12 (floors of a building, storeys of a tower, decks of a ship, trunk height of a tree), "roof": ${ROOFS.join(' | ')}, "features": [${ASSET_FEATURES.join(', ')}], "colors": { "main" (walls, body, hull, leaves), "roof", "trim" (frames, beams, trunk, wheels), "door", "window", "accent" (flags, awnings, sails, stripes, lights) as "#rrggbb" } }.

Answer with JSON only, no other words, exactly this shape with 3 different candidates, the closest first:
{"candidates":[{"name":"a short name","asset":{...},"matched":[["part","what in the picture or words it matches"], ...]}]}
"matched" lists 3 to 6 parts (Kind, Size, Roof, Walls colour, Has...) and what each one matches.`;
}

/** The candidates in Claude's answer, cleaned (the JSON may sit inside other words or a code block). */
export function parseAssetCandidates(text: string): AssetCandidate[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (data as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(list)) return [];
  const out: AssetCandidate[] = [];
  for (const raw of list.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!r.asset || typeof r.asset !== 'object') continue;
    const name = String(r.name ?? (r.asset as Record<string, unknown>).name ?? '')
      .trim()
      .slice(0, 60);
    const spec = cleanAssetSpec({ ...(r.asset as Record<string, unknown>), ...(name ? { name } : {}) });
    const matched = Array.isArray(r.matched)
      ? (r.matched as unknown[])
          .filter((m): m is [string, string] => Array.isArray(m) && m.length >= 2)
          .map((m) => [String(m[0]).slice(0, 30), String(m[1]).slice(0, 120)] as [string, string])
          .slice(0, 8)
      : describeSpec(spec);
    out.push({ name: spec.name, spec, matched });
  }
  return out;
}
