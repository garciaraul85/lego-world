import { BUILTIN_ASSETS } from '../../builtin/assets';
import { DEFAULT_EVENTS, DEFAULT_MIXER, DEFAULT_MUSIC } from '../../builtin/audio/pack';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_CLIPS } from '../../builtin/clips';
import { BUILTIN_SCREENS } from '../../builtin/screens';
import { MapBricks } from '../bricks/map-bricks';
import { printGraph } from '../logic/code/print';
import type { ProjectStore } from '../project/store';
import {
  type Asset,
  type Character,
  type Cinematic,
  type Clip,
  type Gates,
  type Instances,
  type LogicGraph,
  type MapDoc,
  type MediaIndex,
  type Mixer,
  type Music,
  paths,
  type Screen,
  type SoundEvents,
  type Variables,
} from '../schema';
import { validateWorld } from '../world/validate';

/** ~4 characters per token: good enough to keep the summary under its budget. */
export const approxTokens = (s: string) => Math.ceil(s.length / 4);
export const SUMMARY_TOKENS = 20_000;

const r1 = (n: number) => Math.round(n * 10) / 10;
const pos = (p: readonly number[]) => `[${p.map(r1).join(', ')}]`;

/** Built-in files the AI can read like project files (they are not stored in the project until edited). */
export function builtinFile(path: string): unknown | undefined {
  const m = /^builtin\/(assets|characters|clips|screens)\/([a-z]+_[0-9a-z]{10})\.json$/.exec(path);
  if (m) {
    const list: readonly { id: string }[] =
      m[1] === 'assets'
        ? BUILTIN_ASSETS
        : m[1] === 'characters'
          ? BUILTIN_CHARACTERS
          : m[1] === 'clips'
            ? BUILTIN_CLIPS
            : BUILTIN_SCREENS;
    return list.find((x) => x.id === m[2]);
  }
  if (path === 'builtin/audio/events.json') return DEFAULT_EVENTS;
  if (path === 'builtin/audio/music.json') return DEFAULT_MUSIC;
  if (path === 'builtin/audio/mixer.json') return DEFAULT_MIXER;
  return undefined;
}
export function builtinPaths(): string[] {
  return [
    ...BUILTIN_ASSETS.map((a) => `builtin/assets/${a.id}.json`),
    ...BUILTIN_CHARACTERS.map((a) => `builtin/characters/${a.id}.json`),
    ...BUILTIN_CLIPS.map((a) => `builtin/clips/${a.id}.json`),
    ...BUILTIN_SCREENS.map((a) => `builtin/screens/${a.id}.json`),
    'builtin/audio/events.json',
    'builtin/audio/music.json',
    'builtin/audio/mixer.json',
  ];
}

/** Every media ref the AI may put in a sound event: the built-in pack and media already in the project. */
export function knownMedia(store: ProjectStore): Set<string> {
  const out = new Set<string>();
  for (const e of Object.values(DEFAULT_EVENTS.events)) for (const c of e.clips) out.add(c);
  for (const s of Object.values(DEFAULT_MUSIC.states)) for (const l of s.layers) out.add(l.media);
  for (const r of Object.values(DEFAULT_MUSIC.stingers)) out.add(r);
  for (const r of Object.keys(store.get<MediaIndex>(paths.media)?.items ?? {})) out.add(r);
  out.delete('');
  return out;
}

function list<T>(items: T[], max: number, fmt: (t: T) => string, more: string): string[] {
  const out = items.slice(0, max).map(fmt);
  if (items.length > max) out.push(`  … ${items.length - max} more (${more})`);
  return out;
}

/**
 * The project summary the AI reads first (P8.1): maps, spawns, zones, placed assets, gates, assets,
 * characters, logic (as code), variables, screens, scenes, audio and current problems. Kept under
 * SUMMARY_TOKENS; details come on demand through read_file.
 */
export function projectSummary(store: ProjectStore, opts: { budget?: number; currentMap?: string } = {}): string {
  const budget = opts.budget ?? SUMMARY_TOKENS;
  const L: string[] = [];
  const man = store.manifest;
  const gates = store.get<Gates>(paths.gates) ?? { gates: [], mapOrder: [] };
  L.push(`# Project "${man.name}" (${man.id})`);
  L.push(
    `start: map ${man.entry.map}${man.entry.spawn ? ` spawn ${man.entry.spawn}` : ''} · hero: ${man.hero ?? 'none'} · first screen: ${man.entry.screen ?? 'none (straight into the game)'}`,
  );
  if (opts.currentMap) L.push(`the user is looking at map ${opts.currentMap}`);

  L.push('', '## Maps');
  const assetName = new Map<string, string>();
  for (const a of BUILTIN_ASSETS) assetName.set(a.id, a.name);
  const projectAssets = store
    .list('assets/')
    .map((p) => store.get<Asset>(p)!)
    .filter(Boolean);
  for (const a of projectAssets) assetName.set(a.id, a.name);
  for (const mapId of gates.mapOrder) {
    const m = store.get<MapDoc>(paths.map(mapId));
    if (!m) continue;
    const bricks = new MapBricks(store, mapId).all().length;
    const inst = store.get<Instances>(paths.instances(mapId))?.items ?? [];
    L.push(
      `### ${m.name} (${m.id})${m.id === man.entry.map ? ' — start map' : ''}`,
      `size ${m.size ? `${m.size.w}×${m.size.d} studs` : 'free build'} · ${m.generator ? `generated: ${m.generator.environments.join('+')} size ${m.generator.size} seed ${m.generator.seed}` : 'not generated'} · ${m.sky.time}${m.weather.rain ? ', rain' : ''}${m.weather.snow ? ', snow' : ''} · ${bricks} loose bricks · music ${m.music ?? 'none'} · ambience ${m.ambience ?? 'none'}`,
      'spawns:',
      ...list(m.spawns, 12, (s) => `  ${s.id} "${s.name}" at ${pos(s.pos)}`, 'read_file the map'),
    );
    if (m.zones.length)
      L.push(
        'zones:',
        ...list(
          m.zones,
          10,
          (z) =>
            `  ${z.id} ${pos(z.min)}–${pos(z.max)}${z.onEnter?.length ? ` onEnter ${JSON.stringify(z.onEnter)}` : ''}${z.onExit?.length ? ` onExit ${JSON.stringify(z.onExit)}` : ''}${z.music ? ` music ${z.music}` : ''}`,
          'read_file the map',
        ),
      );
    const placed = inst.filter((i) => i.kind === 'asset') as Extract<Instances['items'][number], { kind: 'asset' }>[];
    if (placed.length) {
      const byAsset = new Map<string, typeof placed>();
      for (const p of placed) byAsset.set(p.asset, [...(byAsset.get(p.asset) ?? []), p]);
      const info = new Map<string, Asset>();
      for (const a of [...BUILTIN_ASSETS, ...projectAssets]) info.set(a.id, a);
      // interactive and hand-made props first; generated scenery last
      const rank = (a: string) => (info.get(a)?.interactions.length ? 0 : info.get(a)?.origin === 'generated' ? 2 : 1);
      L.push(`placed assets (${placed.length}; interactive and hand-placed first):`);
      L.push(
        ...list(
          [...byAsset].sort((x, y) => rank(x[0]) - rank(y[0]) || y[1].length - x[1].length),
          14,
          ([a, ps]) =>
            `  ${assetName.get(a) ?? a} (${a}) ×${ps.length}: ${ps
              .slice(0, 4)
              .map((p) => `${p.id}@${pos(p.pos)}${p.state ? ` ${p.state}` : ''}`)
              .join(', ')}${ps.length > 4 ? ' …' : ''}`,
          `read_file maps/${mapId}/instances.json`,
        ),
      );
    }
    const items = inst.filter((i) => i.kind === 'emitter' || i.kind === 'ui');
    if (items.length)
      L.push(
        'emitters and signs:',
        ...list(
          items,
          8,
          (i) =>
            i.kind === 'emitter'
              ? `  ${i.id} emitter ${i.sound} ${i.mode} at ${pos(i.pos)}`
              : `  ${i.id} ${i.widget} "${i.text}" at ${pos(i.pos)}`,
          'read_file instances',
        ),
      );
  }
  if (gates.gates.length)
    L.push(
      '',
      '## Gates',
      ...gates.gates.map(
        (g) =>
          `${g.id}: ${g.from.map}/${g.from.spawn} ${g.twoWay ? '↔' : '→'} ${g.to.map}/${g.to.spawn}${g.onArrive?.length ? ` onArrive ${JSON.stringify(g.onArrive)}` : ''}`,
      ),
    );

  L.push('', '## Assets');
  L.push(
    'project:',
    ...list(
      projectAssets,
      30,
      (a) =>
        `  ${a.id} "${a.name}" ${a.category} states [${a.states.join(', ')}]${a.interactions.length ? ` · ${a.interactions.length} interaction(s)` : ''}`,
      'list_files assets/',
    ),
  );
  L.push(
    'built-in (place by id; read builtin/assets/<id>.json):',
    `  ${BUILTIN_ASSETS.filter((a) => !projectAssets.some((p) => p.id === a.id))
      .map((a) => `${a.id} ${a.name}`)
      .join(' · ')}`,
  );

  L.push('', '## Characters');
  const chars = store
    .list('characters/')
    .map((p) => store.get<Character>(p)!)
    .filter(Boolean);
  L.push(...list(chars, 20, (c) => `  ${c.id} "${c.name}" ${c.role}`, 'list_files characters/'));
  L.push(`built-in: ${BUILTIN_CHARACTERS.map((c) => `${c.id} ${c.name}`).join(' · ')}`);
  const clips = store
    .list('clips/')
    .map((p) => store.get<Clip>(p)!)
    .filter(Boolean);
  L.push(`clips: ${[...clips, ...BUILTIN_CLIPS].map((c) => `${c.id} ${c.name}`).join(' · ')}`);

  L.push('', '## Logic');
  const vars = store.get<Variables>(paths.variables)?.vars ?? {};
  L.push(
    `variables: ${
      Object.entries(vars)
        .map(([n, v]) => `${n}:${v.type}=${JSON.stringify(v.default)}`)
        .join(', ') || 'none'
    } (built-in values for screens: hp, maxHp, map.name, inventory.<item>)`,
  );
  for (const p of store.list('logic/')) {
    if (p === paths.variables) continue;
    const g = store.get<LogicGraph>(p);
    if (!g) continue;
    let code: string;
    try {
      code = printGraph(g).code;
    } catch {
      code = '// (graph cannot print as code)';
    }
    L.push(
      `### ${g.name} (${g.id}, scope ${g.scope}, ${g.nodes.length} nodes)`,
      '```js',
      code.trim().slice(0, 3000),
      '```',
    );
  }

  L.push('', '## Screens');
  const screens = store
    .list('screens/')
    .map((p) => store.get<Screen>(p)!)
    .filter(Boolean);
  L.push(...screens.map((s) => `  ${s.id} "${s.name}" ${s.kind} (project copy)`));
  L.push(
    `built-in: ${BUILTIN_SCREENS.filter((b) => !screens.some((s) => s.id === b.id))
      .map((s) => `${s.id} ${s.kind}`)
      .join(' · ')} (read builtin/screens/<id>.json; screen.put stores a project copy)`,
  );

  L.push('', '## Cinematics');
  const cines = store
    .list('cinematics/')
    .map((p) => store.get<Cinematic>(p)!)
    .filter(Boolean);
  L.push(
    ...(cines.length
      ? cines.map(
          (c) => `  ${c.id} "${c.name}" on ${c.map}, ${c.length}s, cast ${c.cast.map((m) => m.role).join(', ')}`,
        )
      : ['  none']),
  );

  L.push('', '## Audio');
  const ev = { ...DEFAULT_EVENTS.events, ...(store.get<SoundEvents>(paths.soundEvents)?.events ?? {}) };
  const mu = { ...DEFAULT_MUSIC.states, ...(store.get<Music>(paths.music)?.states ?? {}) };
  const mx = store.get<Mixer>(paths.mixer) ?? DEFAULT_MIXER;
  L.push(`sound events: ${Object.keys(ev).join(', ')}`);
  L.push(`music states: ${Object.keys(mu).join(', ')}`);
  L.push(
    `mixer buses: ${Object.entries(mx.buses)
      .map(([b, v]) => `${b} ${v} dB`)
      .join(', ')}`,
  );

  const issues = validateWorld(store);
  if (issues.length) L.push('', '## Problems now', ...issues.slice(0, 10).map((i) => `- ${i.message}`));

  let text = L.join('\n');
  const max = budget * 4;
  if (text.length > max)
    text = `${text.slice(0, max - 200)}\n… (summary cut to fit; use list_files / read_file / search for the rest)`;
  return text;
}
