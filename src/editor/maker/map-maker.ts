import { ASSET_FEATURES, ASSET_KINDS, composeAsset, ROOFS } from '../../core/assets/compose';
import { creaturePlan } from '../../core/character/compose';
import { type Command, CommandBus, registerAll } from '../../core/commands';
import { cleanMapSpec, MAP_SIZES, MAX_BUILDINGS, MAX_PEOPLE, type MapSpec } from '../../core/gamegen/map-spec';
import { assetSpot, clearedSpot, reachable } from '../../core/gamegen/places';
import { newId } from '../../core/ids';
import { FOG_PRESET, FOG_PRESETS } from '../../core/lighting/atmosphere';
import { ProjectStore } from '../../core/project/store';
import { BIOMES, type Character, TIMES } from '../../core/schema';
import { legacyRuntime } from '../../engine/legacy/runtime-modules';
import { paintWithMarks } from '../character/draw-marks';
import type { EditorState } from '../state';
import { catalog } from '../workspaces/character-studio/FromPicture';
import { localCandidates } from '../workspaces/character-studio/picture-match';

/**
 * Milestone 3, 10d part 5: a map spec made into a map. It is built first on a copy of the project — the land from
 * v68's generator (the seed fixes it), each building from bricks on a flat spot the hero can walk to, each person
 * made by the character maker (body shape and drawings too) and stood where the hero can reach — and the same
 * commands are then run on the project as one step, so one Undo takes the whole map away.
 */
export async function mapCommands(
  ed: Pick<EditorState, 'store'>,
  spec: MapSpec,
  seed: number,
): Promise<{ map: string; commands: Command[]; notes: string[] }> {
  const scratch = new ProjectStore(ed.store.snapshot(), { validate: false });
  const bus = registerAll(new CommandBus(scratch));
  const commands: Command[] = [];
  const notes: string[] = [];
  const run = (cmd: Command) => {
    const r = bus.execute([cmd], { source: 'user' });
    if (r.ok) commands.push(cmd);
    return r.ok;
  };
  const map = newId('map');
  if (
    !run({
      type: 'map.create',
      payload: {
        id: map,
        name: spec.name,
        generate: {
          environments: spec.biomes,
          size: spec.size,
          seed,
          time: spec.time,
          rain: spec.rain,
          snow: spec.snow,
          snowing: spec.snow,
        },
      },
    })
  )
    throw new Error('The land could not be made.');
  if (spec.fog !== 'none') run({ type: 'map.setEnvironment', payload: { map, fog: FOG_PRESET[spec.fog].fog } });
  // the buildings, nearest the start first
  let steps = 4;
  for (const b of spec.buildings) {
    const def = composeAsset(b.spec, newId('asset'));
    if (!run({ type: 'asset.create', payload: { asset: def } })) continue;
    let placed = 0;
    for (let i = 0; i < b.count; i++) {
      const cmd = assetSpot(scratch, bus, map, def, { minSteps: steps, maxSteps: 80 });
      const cmds = cmd ? [cmd] : clearedSpot(scratch, bus, map, def, steps);
      if (cmds.length && bus.execute(cmds, { source: 'user' }).ok) {
        commands.push(...cmds);
        placed++;
        steps = Math.min(40, steps + 2);
      }
    }
    if (placed < b.count) notes.push(`${b.count - placed} × ${def.name} found no flat free spot.`);
  }
  // the people, where the hero can walk, a few steps apart
  const L = legacyRuntime();
  const cat = catalog();
  const { cells } = reachable(scratch, map);
  const free = cells.filter(([, , , d]) => d >= 3 && d <= 30);
  let at = 0;
  for (const p of spec.people) {
    const k = localCandidates(p.words, [], cat)[0];
    if (!k) continue;
    for (let i = 0; i < p.count; i++) {
      const id = newId('character');
      const name = p.count > 1 ? `${k.name} ${i + 1}`.slice(0, 32) : k.name;
      let profile: Record<string, unknown> = { name };
      try {
        const paint = k.marks?.length ? await paintWithMarks({}, k.marks) : undefined;
        profile = L.CharacterCatalog.validate({
          ...L.CharacterCatalog.defaults,
          ...(k.profile ?? {}),
          ...(paint ? { paint } : {}),
          name,
        });
      } catch {
        profile = { ...L.CharacterCatalog.defaults, name };
      }
      const cmds: Command[] = [];
      let body: Character['body'] | undefined = k.body;
      if (k.creature) {
        const plan = newId('bodyplan');
        cmds.push({ type: 'bodyplan.put', payload: { plan: creaturePlan({ ...k.creature, name }, plan) } });
        body = { plan: plan as NonNullable<Character['body']>['plan'], colors: k.creature.colors };
      }
      cmds.push({
        type: 'character.create',
        payload: { character: { id, name, role: 'npc', profile, ...(body ? { body } : {}) } },
      });
      // spread out: every few cells along the walkable ground
      const c = free[Math.min(free.length - 1, at)];
      at += Math.max(3, Math.floor(free.length / (MAX_PEOPLE * 4)));
      if (!c) {
        notes.push(`No room for ${name}.`);
        continue;
      }
      cmds.push({
        type: 'npc.place',
        payload: { map, character: id, pos: [c[0] + 0.5, c[1] * 0.4, c[2] + 0.5], heading: Math.PI },
      });
      const r = bus.execute(cmds, { source: 'user' });
      if (r.ok) commands.push(...cmds);
      else notes.push(`${name} could not be made.`);
    }
  }
  return { map, commands, notes };
}

/** three maps from the words: as said, the same on other land (another seed), and a bigger one */
export function mapVariants(spec: MapSpec): { spec: MapSpec; seed: number; note: string }[] {
  const seed = () => Math.floor(Math.random() * 99_999_999);
  const bigger = cleanMapSpec({
    ...spec,
    size: spec.size === 16 ? 24 : 32,
    buildings: spec.buildings.map((b) => ({ ...b, count: Math.min(6, b.count + 1) })),
  });
  return [
    { spec, seed: seed(), note: 'as described' },
    { spec, seed: seed(), note: 'the same, on other land' },
    { spec: bigger, seed: seed(), note: 'bigger, one more of each building' },
  ];
}

/** The instructions for Claude: the settings it may choose from, and the answer's shape. */
export function mapPrompt(text: string, hasPicture: boolean, picture: string[]): string {
  return `You design a game map (a level) for a brick-built video game editor from ${hasPicture ? 'the attached picture' : 'a description'}${hasPicture && text ? ' and a description' : ''}. You do not place bricks: you only choose settings, and the editor builds the land, the buildings and the people. Make an ORIGINAL place in brick style: from a real or famous place take only its general kind of land, buildings and mood, never a copy, a logo or a name.

${text ? `Description: ${text}\n` : ''}${picture.length ? `The picture's main colours, most first: ${picture.join(', ')}\n` : ''}
"map": { "name": up to 60 letters, "biomes": 1-3 of ${BIOMES.join(' | ')} (beach has the sea; mountains snow when snow is true), "size": ${MAP_SIZES.join(' | ')} (small, medium, big), "time": ${TIMES.join(' | ')}, "rain": true/false, "snow": true/false, "fog": none | ${FOG_PRESETS.join(' | ')},
"buildings": up to ${MAX_BUILDINGS} of { "count": 1-6, "spec": { "kind": ${ASSET_KINDS.join(' | ')}, "name", "width": 2-32, "depth": 2-32, "floors": 1-12, "roof": ${ROOFS.join(' | ')}, "features": [${ASSET_FEATURES.join(', ')}], "colors": { "main", "roof", "trim", "door", "window", "accent" as "#rrggbb" } } } (trees, rocks and props count too),
"people": up to ${MAX_PEOPLE} of { "words": who they are in a few words, their look, build and any face paint or tattoo (e.g. "a blacksmith with a long beard", "a curvy pirate with a red star on her cheek"), "count": 1-4 } }.

Answer with JSON only, no other words, exactly this shape with 3 different candidates, the closest first:
{"candidates":[{"map":{...},"matched":[["part","what in the picture or words it matches"], ...]}]}
"matched" lists 3 to 6 parts (Land, Sky, Buildings, People...) and what each one matches.`;
}

/** The candidates in Claude's answer, cleaned */
export function parseMapCandidates(text: string): { spec: MapSpec; matched: [string, string][] }[] {
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
  return list
    .slice(0, 3)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !!(r as { map?: unknown }).map)
    .map((r) => ({
      spec: cleanMapSpec(r.map),
      matched: Array.isArray(r.matched)
        ? (r.matched as unknown[])
            .filter((m): m is [string, string] => Array.isArray(m) && m.length >= 2)
            .map((m) => [String(m[0]).slice(0, 30), String(m[1]).slice(0, 160)] as [string, string])
            .slice(0, 8)
        : [],
    }));
}
