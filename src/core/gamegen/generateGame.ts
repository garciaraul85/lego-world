import { BUILTIN_ASSETS } from '../../builtin/assets';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_SCREENS } from '../../builtin/screens';
import { rewardScene } from '../cinematic/templates';
import { type Command, CommandBus, registerAll } from '../commands';
import { allBricks } from '../commands/handlers/assets';
import { newId } from '../ids';
import { newProjectFiles } from '../project/new-project';
import { ProjectStore } from '../project/store';
import { type Asset, type Instances, type MapDoc, paths, type Screen, type Widget } from '../schema';
import { validateWorld, type WorldIssue } from '../world/validate';
import { gameName, placeName } from './names';
import { countQuest, endingGraph, reachQuest } from './quests';
import { type GameOptions, QUEST_TEXT, type QuestKind, questSize, THEMES } from './recipes';
import { int, pick, seeded } from './rng';
import { Surface } from './surface';

export type Workspace =
  | 'Scene'
  | 'World graph'
  | 'Logic'
  | 'Characters'
  | 'Assets'
  | 'Screens'
  | 'Cinematics'
  | 'Audio';

/** One stage of building a game: what was done, why, and how you would do it yourself. */
export type BuildStage = {
  id: string;
  title: string;
  /** what this stage did, in this game's own terms */
  explain: string;
  /** where to do the same by hand */
  howTo: string;
  workspace: Workspace;
  /** what to show when the stage is replayed (a map, a graph, a screen, a scene, a sound) */
  focus?: {
    map?: string;
    logic?: string;
    screen?: string;
    cinematic?: string;
    audio?: string;
    tab?: 'project' | 'map';
  };
  commands: Command[];
};

export type GeneratedGame = {
  seed: number;
  options: GameOptions;
  name: string;
  quest: { kind: QuestKind; text: string };
  /** the empty starting project; replay `stages` on it to get the game */
  files: Map<string, unknown>;
  stages: BuildStage[];
  issues: WorldIssue[];
};

/**
 * generateGame(options, seed) (P7.1): a complete, valid game built as named stages of commands.
 * Each stage is executed on a scratch project while generating, so every command is known to
 * apply; the caller replays the stages (all at once, or one by one in the build view). A seed
 * that does not validate is retried with seed + 1, up to 3 times.
 */
export function generateGame(options: GameOptions, seed: number, opts: { now?: string } = {}): GeneratedGame {
  const why: string[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const g = buildGame(options, seed + i, opts.now);
      if (!g.issues.some((x) => x.level === 'warn')) return g;
      why.push(`seed ${seed + i}: ${g.issues.map((x) => x.message).join('; ')}`);
    } catch (e) {
      why.push(`seed ${seed + i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`Could not build a valid game (${why.join(' · ')})`);
}

/** One attempt with exactly this seed (throws when a stage cannot be built). */
export function buildGame(options: GameOptions, seed: number, now?: string): GeneratedGame {
  const r = seeded(seed);
  const cfg = THEMES[options.theme];
  const nMaps = Math.max(1, Math.min(5, Math.round(options.maps)));
  const size = options.length === 'short' ? 24 : 32;
  const { count, hearts } = questSize(options);
  const files = newProjectFiles({ name: 'New game', random: r, ...(now ? { now } : {}) });
  const store = new ProjectStore(files);
  const bus = registerAll(new CommandBus(store));
  const stages: BuildStage[] = [];
  let stage: BuildStage;
  const begin = (s: Omit<BuildStage, 'commands'>) => {
    stage = { ...s, commands: [] };
    stages.push(stage);
  };
  const run = (cmd: Command) => {
    const res = bus.execute(cmd, { source: 'generator' });
    if (!res.ok) throw new Error(`${stage.title}: ${res.error}`);
    stage.commands.push(cmd);
  };
  const entry = store.manifest.entry.map;
  const used = new Set<string>();
  const uniqueName = () => {
    for (let i = 0; i < 20; i++) {
      const n = placeName(r, options.theme);
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
    return `Land ${used.size + 1}`;
  };
  const mapNames = Array.from({ length: nMaps }, uniqueName);
  const doc = (m: string) => store.get<MapDoc>(paths.map(m))!;
  /** put a map's arrival spawn on open ground near the middle */
  const settleArrival = (map: string) => {
    const s = new Surface(allBricks(store, map));
    const region = s.largestRegion();
    if (!region || region.size < 60) throw new Error(`${doc(map).name} has too little open ground`);
    const spot = s.nearestOpen(0, 0, (x, z) => region.has(`${x},${z}`));
    if (!spot) throw new Error(`${doc(map).name} has no open ground for the arrival`);
    const sp = doc(map).spawns[0]!;
    run({
      type: 'map.updateSpawn',
      payload: { map, spawn: sp.id, pos: [spot[0] + 0.5, spot[1] * 0.4, spot[2] + 0.5] },
    });
  };
  /** reachable open cells of a map, as [x, top, z, steps] from its arrival */
  const reachableCells = (map: string) => {
    const s = new Surface(allBricks(store, map));
    const a = doc(map).spawns[0]!.pos;
    const reach = s.reach(Math.floor(a[0]), Math.floor(a[2]));
    return {
      s,
      cells: [...reach].map(([k, d]) => {
        const [x, z] = k.split(',').map(Number) as [number, number];
        return [x, s.topAt(x, z)!, z, d] as [number, number, number, number];
      }),
    };
  };

  // 1 ---------- name ----------
  const mapsPlanned = mapNames[0]!;
  let questKind: QuestKind = options.quest ?? pick(r, cfg.quests);
  begin({
    id: 'name',
    title: 'Name the game',
    explain: '',
    howTo:
      'Inspector › Project tab › Title. The first map is renamed in Map tab or by double-clicking it in the World graph.',
    workspace: 'Scene',
    focus: { tab: 'project' },
  });
  run({ type: 'map.rename', payload: { map: entry, name: mapsPlanned } });

  // 2 ---------- terrain ----------
  const time = cfg.time;
  begin({
    id: 'terrain',
    title: 'Generate the first map',
    explain: `${mapsPlanned} is generated from ${cfg.first.join(' + ')} environments (${size}×${size} chunks, seed fixed so it is the same every time). Houses, trees and cars become asset instances; the arrival spawn is moved onto open ground.`,
    howTo:
      'Inspector › Map tab › pick environments › Generate (or New seed). Spawn tool (P) adds spawn points; drag them to move.',
    workspace: 'Scene',
    focus: { map: entry, tab: 'map' },
  });
  run({
    type: 'map.generate',
    payload: { map: entry, config: { environments: cfg.first, size, seed: int(r, 1, 99_999_999), time } },
  });
  settleArrival(entry);

  // 3 ---------- more maps ----------
  const maps = [entry];
  if (nMaps > 1) {
    begin({
      id: 'maps',
      title: `Add ${nMaps - 1} more map${nMaps > 2 ? 's' : ''}`,
      explain: `${mapNames.slice(1).join(', ')} ${nMaps > 2 ? 'are' : 'is'} generated the same way, each from its own environments.`,
      howTo: 'World menu › Add map (or + Add map in the World graph), then Generate in its Map tab.',
      workspace: 'World graph',
    });
    for (let i = 1; i < nMaps; i++) {
      const id = newId('map', r);
      const envs = cfg.extra[(i - 1) % cfg.extra.length]!;
      run({
        type: 'map.create',
        payload: {
          id,
          name: mapNames[i]!,
          spawnId: newId('spawn', r),
          generate: { environments: envs, size, seed: int(r, 1, 99_999_999), time },
        },
      });
      settleArrival(id);
      maps.push(id);
    }
  }

  // 4 ---------- gates ----------
  if (nMaps > 1) {
    begin({
      id: 'gates',
      title: 'Connect the maps with gates',
      explain: `Each map gets a gate spot near its arrival, and two-way gates link them in a chain: ${mapNames.join(' ⇄ ')}. Walking onto a gate spot in Play travels to the other end.`,
      howTo:
        'World graph: drag from one spawn’s port to another’s. Click a gate to make it one-way, reverse it, or give it on-arrive actions.',
      workspace: 'World graph',
    });
    for (let i = 0; i + 1 < nMaps; i++) {
      const a = maps[i]!;
      const b = maps[i + 1]!;
      const spot = (map: string, label: string) => {
        const { cells } = reachableCells(map);
        const ok = cells.filter(([, , , d]) => d >= 7 && d <= 14);
        const c = ok.length ? pick(r, ok) : cells.at(-1);
        if (!c) throw new Error(`no room for a gate on ${doc(map).name}`);
        const id = newId('spawn', r);
        run({
          type: 'map.addSpawn',
          payload: { map, id, name: label, pos: [c[0] + 0.5, c[1] * 0.4, c[2] + 0.5], yaw: 0 },
        });
        return id;
      };
      const from = spot(a, `Road to ${doc(b).name}`);
      const to = spot(b, `Road to ${doc(a).name}`);
      run({
        type: 'gate.connect',
        payload: { id: newId('gate', r), from: { map: a, spawn: from }, to: { map: b, spawn: to }, twoWay: true },
      });
    }
  }

  // decide the quest now that the world exists
  const buildings = maps.flatMap((m) => {
    const inst = store.get<Instances>(paths.instances(m));
    return (inst?.items ?? []).filter((i) => {
      if (i.kind !== 'asset') return false;
      const a = store.get<Asset>(paths.asset(i.asset));
      return !!a && a.category === 'building' && a.smash.enabled && a.smash.rebuild;
    });
  });
  if (questKind === 'repair' && buildings.length < count) questKind = 'collect';
  const where = doc(maps.at(-1)!).name;
  const text = QUEST_TEXT[questKind](count, where);
  const name = options.name?.trim() || gameName(r, questKind, mapsPlanned);
  stages[0]!.explain = `The game is called “${name}”. Its first map is ${mapsPlanned}. Quest: ${text.quest}.`;
  stages[0]!.commands.unshift({ type: 'project.update', payload: { name } });
  bus.execute({ type: 'project.update', payload: { name } }, { source: 'generator' });

  // 5 ---------- hero ----------
  const preset = BUILTIN_CHARACTERS.find((c) => c.name === pick(r, cfg.heroes)) ?? BUILTIN_CHARACTERS[0]!;
  const heroId = newId('character', r);
  begin({
    id: 'hero',
    title: 'Choose a hero',
    explain: `The hero is a copy of the “${preset.name}” preset. Neighbours are added by the game itself when a map is first played.`,
    howTo: 'Characters workspace: + New (or duplicate a preset), dress it up, then Project tab › Hero.',
    workspace: 'Characters',
  });
  run({ type: 'character.create', payload: { character: { ...preset, id: heroId, role: 'hero', name: preset.name } } });
  run({ type: 'project.update', payload: { hero: heroId } });

  // 6 ---------- quest props ----------
  const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
  const beaconDef = BUILTIN_ASSETS.find((a) => a.name === 'Lamp post')!;
  const placeOn = (
    map: string,
    def: Asset,
    choose: (cells: [number, number, number, number][]) => [number, number, number, number][],
  ) => {
    const { s, cells } = reachableCells(map);
    // keep spawn points (arrival, gate spots) clear
    const spawns = doc(map).spawns.map((x) => x.pos);
    const free = cells.filter(([x, , z]) => spawns.every((p) => Math.hypot(p[0] - (x + 1), p[2] - (z + 1)) > 3));
    const pool = choose(free);
    for (let tries = 0; tries < 80 && pool.length; tries++) {
      const c = pool.splice(Math.floor(r() * pool.length), 1)[0]!;
      const [w, d] = def.footprint;
      const rect = s.rect(c[0], c[2], w, d);
      if (!rect?.flat) continue;
      const id = newId('instance', r);
      const cmd: Command = {
        type: 'asset.place',
        payload: { map, asset: def.id, pos: [c[0], rect.top, c[2]], rot: int(r, 0, 3), id },
      };
      if (!bus.dryRun([cmd]).ok) continue;
      run(cmd);
      return { id, pos: [c[0], rect.top, c[2]] as [number, number, number] };
    }
    return null;
  };
  let summit: { map: string; pos: [number, number, number] } | null = null;
  if (questKind === 'collect') {
    begin({
      id: 'props',
      title: `Hide ${count} treasure chests`,
      explain: `${count} chests are placed on open ground the hero can walk to, spread over ${nMaps > 1 ? 'the maps' : mapsPlanned}. Opening one plays its sound, swaps the lid (state “open”) and sends the “chest-opened” event.`,
      howTo:
        'Dock › Assets › pick the Treasure chest, then the Place asset tool (A) and click the map. Edit what it does in the Asset studio › Interactions.',
      workspace: 'Scene',
      focus: { map: maps.at(-1)! },
    });
    run({ type: 'asset.create', payload: { asset: chest } });
    for (let i = 0; i < count; i++) {
      const map = maps[i % maps.length]!;
      const placed = placeOn(map, chest, (cells) => cells.filter(([, , , d]) => d >= 5 && d <= 30));
      if (!placed) throw new Error(`no room for chest ${i + 1}`);
    }
  } else if (questKind === 'summit') {
    const map = maps.at(-1)!;
    begin({
      id: 'props',
      title: 'Light a beacon on the summit',
      explain: `The highest point the hero can walk to on ${doc(map).name} gets a beacon (a lamp post) and, in the logic stage, a trigger zone around it.`,
      howTo: 'Place asset tool (A) with the Lamp post; then the Trigger zone tool (Z) to draw a zone around it.',
      workspace: 'Scene',
      focus: { map },
    });
    run({ type: 'asset.create', payload: { asset: beaconDef } });
    const highest = (slack: number) => (cells: [number, number, number, number][]) => {
      const far = cells.filter(([, , , d]) => d >= 8);
      const top = Math.max(...far.map((c) => c[1]));
      return far.filter((c) => c[1] >= top - slack);
    };
    const placed =
      placeOn(map, beaconDef, highest(1)) ??
      placeOn(map, beaconDef, highest(6)) ??
      placeOn(map, beaconDef, highest(99));
    if (!placed) throw new Error('no summit spot');
    summit = { map, pos: placed.pos };
  } else {
    begin({
      id: 'props',
      title: `Pick ${count} buildings to repair`,
      explain: `The generated maps already have ${buildings.length} houses and towers that can be smashed (F) and rebuilt (hold E). Every rebuild counts.`,
      howTo: 'Asset studio › Smash: “Can be smashed” and “Can be rebuilt” decide which assets count.',
      workspace: 'Assets',
    });
  }

  // 7 ---------- logic ----------
  const cinId = newId('cinematic', r);
  const questGraph = newId('logic', r);
  const counter = questKind === 'collect' ? 'found' : 'repaired';
  begin({
    id: 'logic',
    title: 'Write the quest logic',
    explain:
      questKind === 'summit'
        ? `A trigger zone surrounds the beacon. Logic: On enter zone → Once → Play cinematic (reward) → Give medal.`
        : `Variables “${counter}”, “quest”, “hp” (${hearts} hearts) and “questDone”. Logic: ${questKind === 'collect' ? 'On custom event “chest-opened”' : 'On rebuild finished'} → add 1 to ${counter} → if ${counter} ≥ ${count} → Once → Play cinematic (reward) → Give medal. A second graph sets questDone when the scene ends.`,
    howTo:
      'Logic workspace: + New graph, drag nodes from the palette and wire them (or switch to Code). Variables panel: + Variable.',
    workspace: 'Logic',
    focus: { logic: questGraph },
  });
  const v = (name: string, type: 'number' | 'bool' | 'string', def: number | boolean | string) =>
    run({ type: 'logic.setVariable', payload: { name, def: { type, default: def, scope: 'global' } } });
  v('quest', 'string', text.quest);
  v('maxHp', 'number', hearts);
  v('hp', 'number', hearts);
  v('questDone', 'bool', false);
  if (questKind !== 'summit') v(counter, 'number', 0);
  if (questKind === 'summit') {
    const [x, y, z] = summit!.pos;
    const zone = newId('zone', r);
    run({
      type: 'map.addZone',
      payload: {
        map: summit!.map,
        zone: { id: zone, min: [x - 2, y * 0.4 - 1, z - 2], max: [x + 3, y * 0.4 + 5, z + 3], tags: ['Summit'] },
      },
    });
    run({
      type: 'logic.create',
      payload: { graph: reachQuest({ id: questGraph, name: 'Quest: summit', zone, cinematic: cinId }) },
    });
  } else {
    run({
      type: 'logic.create',
      payload: {
        graph: countQuest({
          id: questGraph,
          name: questKind === 'collect' ? 'Quest: chests' : 'Quest: repairs',
          event: questKind === 'collect' ? ['event.onCustom', { event: 'chest-opened' }] : ['event.onRebuildFinished'],
          counter,
          target: count,
          cinematic: cinId,
        }),
      },
    });
  }
  run({
    type: 'logic.create',
    payload: { graph: endingGraph({ id: newId('logic', r), cinematic: cinId, text: 'Quest complete!' }) },
  });

  // 8 ---------- screens ----------
  const hud = BUILTIN_SCREENS.find((s) => s.kind === 'hud')!;
  const questLine: Widget = {
    type: 'panel',
    id: 'questbox',
    anchor: [0, 0],
    offset: [24, 76],
    style: { layout: 'column', gap: 2, bg: '#0b1020b0', pad: 10, radius: 12 },
    children: [
      { type: 'text', id: 'quest', text: '{quest}', style: { fontSize: 16, weight: 'bold', color: '#f7c900' } },
      { type: 'text', id: 'progress', text: text.progress, style: { fontSize: 15, color: '#e8ecf4' } },
    ],
  };
  begin({
    id: 'screens',
    title: 'Design the HUD and menus',
    explain: `The HUD gets a quest box bound to {quest} and “${text.progress}”. The game boots through the built-in splash and title screens, with pause and game over ready.`,
    howTo:
      'Screens workspace: pick HUD, + text in the widget tree, write {variable} to show a value. Project tab › First screen picks the splash.',
    workspace: 'Screens',
    focus: { screen: hud.id },
  });
  run({
    type: 'screen.put',
    payload: {
      screen: { ...hud, root: { ...hud.root, children: [...(hud.root.children ?? []), questLine] } } satisfies Screen,
    },
  });
  run({ type: 'project.update', payload: { entryScreen: 'scr_splash0000' } });

  // 9 ---------- reward cinematic ----------
  const arrival = doc(entry).spawns[0]!;
  const lines: Record<QuestKind, string> = {
    collect: `You found every chest in ${mapsPlanned}! The treasure is yours.`,
    repair: `${mapsPlanned} is whole again. Thank you for rebuilding it!`,
    summit: `You reached the top! What a view over ${where}.`,
  };
  begin({
    id: 'cinematic',
    title: 'Direct the reward cinematic',
    explain: `“Quest complete!” plays on ${mapsPlanned} when the quest is done: a fade in, a title card, a character walks up to the hero and speaks, three camera shots, music, a cheer, then logic hears “On cinematic done”.`,
    howTo:
      'Cinematics workspace: + Reward (or + New), cast roles, Record walks on the stage, Camera from view, add lines and music on the timeline.',
    workspace: 'Cinematics',
    focus: { cinematic: cinId },
  });
  run({
    type: 'cinematic.put',
    payload: {
      cinematic: rewardScene({
        id: cinId,
        map: entry,
        at: arrival.pos as [number, number, number],
        giver: BUILTIN_CHARACTERS.find((c) => c.name === 'Chef')!.id,
        name: 'Quest complete!',
        line: lines[questKind],
      }),
    },
  });

  // 10 ---------- audio ----------
  const musics = [cfg.music, 'mus_explore000', 'mus_night00000', 'mus_castle0000'];
  begin({
    id: 'audio',
    title: 'Add music and ambience',
    explain: `Each map gets music and an ambience loop; a sound emitter near the arrival on ${mapsPlanned} plays now and then. Chests, footsteps, smashing and menus already use the built-in sound events.`,
    howTo:
      'Map tab › Music and Ambience; Sound emitter tool (S) in the Scene; the Audio workspace edits events, music and the mixer.',
    workspace: 'Audio',
    focus: { audio: cfg.music },
  });
  for (const [i, m] of maps.entries())
    run({ type: 'map.setAudio', payload: { map: m, music: musics[i % musics.length], ambience: cfg.ambience } });
  {
    const { cells } = reachableCells(entry);
    const near = cells.filter(([, , , d]) => d >= 3 && d <= 8);
    const c = near.length ? pick(r, near) : cells[0]!;
    run({
      type: 'item.add',
      payload: {
        map: entry,
        item: {
          id: newId('instance', r),
          kind: 'emitter',
          name: 'Birdsong',
          sound: 'snd_birds00000',
          pos: [c[0] + 0.5, c[1] * 0.4 + 2, c[2] + 0.5],
          mode: 'interval',
          interval: [4, 9],
          maxDistance: 18,
          volume: -4,
        },
      },
    });
  }

  // 11 ---------- world UI ----------
  begin({
    id: 'worldui',
    title: 'Put up a welcome sign',
    explain: 'A sign above the arrival shows the quest with live values while playing.',
    howTo: 'World UI tool (U): click the map, then type the text in the Inspector; {variables} show live values.',
    workspace: 'Scene',
    focus: { map: entry },
  });
  {
    const [x, y, z] = arrival.pos;
    run({
      type: 'item.add',
      payload: {
        map: entry,
        item: {
          id: newId('instance', r),
          kind: 'ui',
          widget: 'sign',
          pos: [x + 1.5, y + 3.2, z + 1.5],
          text: `Welcome to {map.name}! ${text.quest}.`,
          maxDistance: 26,
        },
      },
    });
  }

  // 12 ---------- check ----------
  const issues = validateWorld(store);
  begin({
    id: 'check',
    title: 'Check and play',
    explain: issues.length
      ? `Route check: ${issues.map((i) => i.message).join('; ')}.`
      : 'Every map is reachable from the start, every spawn is on open ground, and every file passed its schema. Press Play.',
    howTo:
      'World menu › Validate routes; the Problems tab lists issues. F5 plays, Ctrl F5 plays from the splash screen.',
    workspace: 'World graph',
  });
  return {
    seed,
    options: { ...options, maps: nMaps },
    name,
    quest: { kind: questKind, text: text.quest },
    files,
    stages,
    issues,
  };
}

/** every command of a generated game in order (for a one-step build) */
export const allCommands = (g: GeneratedGame) => g.stages.flatMap((s) => s.commands);
