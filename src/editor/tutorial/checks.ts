import { BUILTIN_EFFECTS } from '../../builtin/effects';
import { BUILTIN_SCREEN_EFFECTS } from '../../builtin/screen-effects';
import type { Command } from '../../core/commands';
import type { Conversation } from '../../core/dialogue/schema';
import type { Effect } from '../../core/effects/schema';
import type { ScreenEffect } from '../../core/effects/screen';
import { wiresOf } from '../../core/logic/wiring';
import { allSaves } from '../../core/save/save';
import {
  type Asset,
  type Character,
  type Cinematic,
  type Clip,
  type Instances,
  type LightInstance,
  type LogicGraph,
  type MapDoc,
  paths,
  type Screen,
  type Variables,
} from '../../core/schema';
import { easeAt, poseAt, poseTimes } from '../../engine/character/posing';
import { BrowserSaveStore } from '../../platform/saves';
import { assetLibrary } from '../assets';
import { savingOf } from '../panels/SavingSection';
import type { EditorState } from '../state';
import { CODING_TESTS } from './coding';
import { MARK_FACING, MARK_RADIUS, markTarget } from './story';

const effectNamed = (ed: EditorState, id: string | null | undefined): Effect | undefined =>
  id ? (ed.store.get<Effect>(paths.effect(id)) ?? BUILTIN_EFFECTS.find((e) => e.id === id)) : undefined;

const screenEffectNamed = (ed: EditorState, id: string | null | undefined): ScreenEffect | undefined =>
  id
    ? (ed.store.get<ScreenEffect>(paths.screenEffect(id)) ?? BUILTIN_SCREEN_EFFECTS.find((e) => e.id === id))
    : undefined;

/** Named tests for `state` checks (P7.3). They read the editor; none of them changes anything. */
export const STATE_TESTS: Record<string, (ed: EditorState, args: unknown) => boolean> = {
  menuOpen: (ed, a) => ed.menu.value === a,
  paletteOpen: (ed) => ed.palette.value,
  rightTab: (ed, a) => ed.right.value === a,
  dockTab: (ed, a) => ed.dock.value === a,
  workspace: (ed, a) => ed.workspace.value === a,
  hasSelection: (ed) => ed.selection.value.size > 0,
  canRedo: (ed) => ed.bus.canRedo(),
  logicView: (ed, a) => ed.logicView.value === a,
  exported: (ed) => ed.exports.value > 0,
  assetBrush: (ed, a) => {
    const id = ed.assetBrush.value.asset;
    return !!id && assetLibrary(ed).some((x) => x.asset.id === id && x.asset.name === a);
  },
  hudShows: (ed, a) => {
    for (const p of ed.store.list('screens/')) {
      const s = ed.store.get<Screen>(p)!;
      if (s.kind === 'hud' && JSON.stringify(s.root).includes(String(a))) return true;
    }
    return false;
  },
  cinematicShots: (ed, a) =>
    ed.store
      .list('cinematics/')
      .some(
        (p) => (ed.store.get<Cinematic>(p)!.tracks.find((t) => t.kind === 'camera')?.items.length ?? 0) >= Number(a),
      ),
  projectHas: (ed, a) => ed.store.has(paths.cinematic(String(a))),
  // P32: the Character studio's clip, one click at a time
  clipOpen: (ed) => !!openClip(ed),
  clipTrack: (ed, a) => !!clipTrack(ed, a as TrackArg),
  clipTime: (ed, a) => {
    const { t, within = 0.2 } = a as { t: number; within?: number };
    return Math.abs(ed.clipTime.value - t) <= within;
  },
  clipKey: (ed, a) => {
    const {
      t,
      within = 0.2,
      atLeast,
      atMost,
    } = a as TrackArg & { t: number; within?: number; atLeast?: number; atMost?: number };
    return !!clipTrack(ed, a as TrackArg)?.keys.some(
      (k) =>
        Math.abs(k[0] - t) <= within &&
        (atLeast === undefined || k[1] >= atLeast) &&
        (atMost === undefined || k[1] <= atMost),
    );
  },
  clipNamed: (ed, a) => openClip(ed)?.name === a,
  clipLoop: (ed, a) => !!openClip(ed) && openClip(ed)!.loop === a,
  clipLength: (ed, a) => Math.abs((openClip(ed)?.length ?? -1) - Number(a)) < 0.01,
  clipPlaying: (ed) => ed.clipPlaying.value && !!openClip(ed),
  studioAssetIs: (ed, a) => {
    const id = ed.studioAsset.value;
    return (
      !!id &&
      (ed.store.get<Asset>(paths.asset(id))?.name ?? assetLibrary(ed).find((x) => x.asset.id === id)?.asset.name) === a
    );
  },
  // P32: the Character studio's open character
  characterNamed: (ed, a) => studioCharacter(ed)?.name === a,
  characterWears: (ed, a) => {
    const { field, value } = a as { field: string; value: string };
    return studioCharacter(ed)?.profile[field] === value;
  },
  // P32: the treasure-chest story — logic
  graphNamed: (ed, a) => openGraph(ed)?.name === a,
  hasVar: (ed, a) => {
    const { name, type, value } = a as { name: string; type?: string; value?: unknown };
    const v = ed.store.get<Variables>(paths.variables)?.vars[name];
    return !!v && (type === undefined || v.type === type) && (value === undefined || v.default === value);
  },
  graphHas: (ed, a) => {
    const { type, args } = a as { type: string; args?: Record<string, unknown> };
    return !!openGraph(ed)?.nodes.some((n) => n.type === type && matches(n.args ?? {}, args));
  },
  graphEdge: (ed, a) => {
    const { from, out, to, into } = a as {
      from: { type: string; args?: Record<string, unknown> };
      out: string;
      to: { type: string; args?: Record<string, unknown> };
      into: string;
    };
    const g = openGraph(ed);
    if (!g) return false;
    const is = (id: string, w: typeof from) => {
      const n = g.nodes.find((x) => x.id === id);
      return !!n && n.type === w.type && matches(n.args ?? {}, w.args);
    };
    return g.edges.some((e) => e[1] === out && e[3] === into && is(e[0], from) && is(e[2], to));
  },
  /** the chest's code: the item comes from the variable, rises out, is given; scene-takes-sword removes it */
  chestCode: (ed) => {
    const g = openGraph(ed);
    if (!g) return false;
    const node = (id: string) => g.nodes.find((n) => n.id === id);
    const fed = (id: string, pin: string, type: string, args?: Record<string, unknown>) =>
      g.edges.some(
        (e) => e[2] === id && e[3] === pin && node(e[0])?.type === type && matches(node(e[0])?.args ?? {}, args),
      );
    const spawn = g.nodes.find(
      (n) => n.type === 'world.spawnNear' && fed(n.id, 'item', 'var.get', { var: 'chestItem' }),
    );
    if (!spawn) return false;
    const rises = g.edges.some(
      (e) =>
        e[0] === spawn.id &&
        e[1] === 'entity' &&
        node(e[2])?.type === 'world.setState' &&
        node(e[2])?.args?.state === 'out',
    );
    const gives = g.nodes.some((n) => n.type === 'world.give' && fed(n.id, 'item', 'var.get', { var: 'chestItem' }));
    const takes = g.nodes.some((n) => n.type === 'event.onCustom' && n.args?.event === 'scene-takes-sword');
    return rises && gives && takes;
  },
  // P32: the treasure-chest story — the cinematic
  cineNamed: (ed, a) => openCine(ed)?.name === a,
  cineLength: (ed, a) => Math.abs((openCine(ed)?.length ?? -1) - Number(a)) < 0.01,
  cineTime: (ed, a) => Math.abs(ed.cineTime.value - Number(a)) <= 0.15,
  /** the scene's first mark is in the ring in front of the chest (and, with {facing: true}, turned to it) */
  cineMarkAtChest: (ed, a) => {
    const c = openCine(ed);
    const t = markTarget(ed);
    const m = c?.marks[0];
    if (!m || !t || Math.hypot(m.pos[0] - t.x, m.pos[2] - t.z) > MARK_RADIUS) return false;
    if (!(a as { facing?: boolean } | undefined)?.facing) return true;
    const d = (((((m.yaw * 180) / Math.PI - t.facing) % 360) + 540) % 360) - 180;
    return Math.abs(d) <= MARK_FACING;
  },
  cineItem: (ed, a) => {
    const { role, kind, ...want } = a as { role?: string; kind?: string } & Record<string, unknown>;
    const c = openCine(ed);
    if (!c) return false;
    const clipName = want.clipName as string | undefined;
    delete want.clipName;
    return c.tracks.some(
      (t) =>
        (kind ? t.kind === kind : t.kind === 'actor') &&
        (!role || (t.kind === 'actor' && t.role === role)) &&
        (t.items as Record<string, unknown>[]).some(
          (it) =>
            matches(it, want) && (!clipName || ed.store.get<Clip>(paths.clip(String(it.clip)))?.name === clipName),
        ),
    );
  },
  cineShots: (ed, a) => (openCine(ed)?.tracks.find((t) => t.kind === 'camera')?.items.length ?? 0) >= Number(a),
  zonePlaysScene: (ed, a) => {
    const c = ed.store
      .list('cinematics/')
      .map((p) => ed.store.get<Cinematic>(p)!)
      .find((x) => x.name === a);
    const m = ed.store.get<MapDoc>(paths.map(ed.store.manifest.entry.map));
    return !!c && !!m?.zones.some((z) => z.onEnter?.some((x) => x.do === 'cinematic' && x.cinematic === c.id));
  },
  // P32: an asset's interactions
  assetActions: (ed, a) => {
    const { name, atLeast } = a as { name: string; atLeast: number };
    return projectAsset(ed, name)?.interactions.some((i) => i.do.length >= atLeast) ?? false;
  },
  assetAdds: (ed, a) => {
    const { name, var: v, value } = a as { name: string; var: string; value: number };
    return (
      projectAsset(ed, name)?.interactions.some((i) =>
        i.do.some((x) => x.do === 'addVar' && x.var === v && x.value === value),
      ) ?? false
    );
  },
  assetDoes: (ed, a) => {
    const { name, does } = a as { name: string; does: string };
    return projectAsset(ed, name)?.interactions.some((i) => i.do.some((x) => x.do === does)) ?? false;
  },
  // P9c: the combat course
  mapNamed: (ed, a) => ed.mapDoc.value?.name === a,
  enemyStat: (ed, a) => {
    const { stat, value } = a as { stat: string; value: number };
    const e = studioCharacter(ed)?.enemy as Record<string, unknown> | undefined;
    return !!e && Math.abs(Number(e[stat]) - value) < 0.001;
  },
  wireOn: (ed, a) => {
    const { asset, when } = a as { asset: string; when: string };
    const map = ed.mapId.value;
    const items = ed.store.get<Instances>(paths.instances(map))?.items ?? [];
    return ed.store.list('logic/lg_').some((p) => {
      const g = ed.store.get<LogicGraph>(p);
      const owner = g?.owner && items.find((i) => i.id === g.owner);
      if (!owner || owner.kind !== 'asset') return false;
      const def = ed.store.get<{ name: string }>(paths.asset(owner.asset));
      return def?.name === asset && wiresOf(g).some((w) => w.when === when);
    });
  },
  // P22 part 2: the character sheet course
  sheetTab: (ed, a) => ed.sheetTab.value === a,
  isHero: (ed) => !!ed.studioCharacter.value && ed.store.manifest.hero === ed.studioCharacter.value,
  outfitWorn: (ed, a) => {
    const c = studioCharacter(ed);
    const o = c?.outfits?.find((x) => x.name === c.outfit);
    return !!o && Object.keys(o.look).length >= Number(a ?? 1);
  },
  statAtLeast: (ed, a) => {
    const { stat, value } = a as { stat: string; value: number };
    return Number((studioCharacter(ed)?.stats as Record<string, unknown> | undefined)?.[stat] ?? 0) >= value;
  },
  moveStyle: (ed, a) => studioCharacter(ed)?.moves?.style === a,
  pitchBelow: (ed, a) => (studioCharacter(ed)?.voice?.pitch ?? 1) < Number(a),
  animationSet: (ed, a) => !!studioCharacter(ed)?.animations?.[a as 'idle'],
  // P22 part 4: the faces course
  faceSet: (ed, a) => {
    const { mood, key, value } = a as { mood: string; key: string; value: string };
    return (studioCharacter(ed)?.faces as Record<string, Record<string, string>> | undefined)?.[mood]?.[key] === value;
  },
  talkMood: (ed, a) => {
    const s = ed.session.value as { talks?: { active: boolean; view: { mood: string } | null } } | null;
    return !!s?.talks?.active && s.talks.view?.mood === a;
  },
  // P22 part 3: the creatures course
  bodyFamily: (ed, a) => studioCharacter(ed)?.body?.family === a,
  bodyParam: (ed, a) => {
    const { key, atLeast } = a as { key: string; atLeast: number };
    return Number((studioCharacter(ed)?.body?.params as Record<string, number> | undefined)?.[key] ?? 0) >= atLeast;
  },
  bodyColor: (ed, a) => {
    const { slot, value } = a as { slot: string; value: string };
    return (
      (studioCharacter(ed)?.body?.colors as Record<string, string> | undefined)?.[slot]?.toLowerCase() ===
      value.toLowerCase()
    );
  },
  bodyWalking: (ed) => ed.bodyWalk.value,
  bodyBonesShown: (ed) => ed.bodyBones.value,
  ownPlan: (ed) => {
    const p = studioCharacter(ed)?.body?.plan;
    return !!p && !!ed.store.get(`bodyplans/${p}.json`);
  },
  planHasBone: (ed, a) => {
    const p = studioCharacter(ed)?.body?.plan;
    const plan = p
      ? ed.store.get<{ bones: { name: string }[]; bricks: { bone: string }[] }>(`bodyplans/${p}.json`)
      : null;
    return !!plan?.bones.some((b) => b.name === a) && plan.bricks.some((k) => k.bone === a);
  },
  boneSwing: (ed, a) => {
    const { bone, atLeast } = a as { bone: string; atLeast: number };
    const p = studioCharacter(ed)?.body?.plan;
    const plan = p ? ed.store.get<{ bones: { name: string; swing: number }[] }>(`bodyplans/${p}.json`) : null;
    return (plan?.bones.find((b) => b.name === bone)?.swing ?? 0) >= atLeast;
  },
  levelAtLeast: (ed, a) => Number(ed.session.value?.logic.vars.get('level') ?? 0) >= Number(a),
  // P22: the dialogue course
  characterExists: (ed, a) => ed.store.list('characters/').some((p) => ed.store.get<{ name: string }>(p)?.name === a),
  talksWith: (ed, a) =>
    ed.store
      .list('characters/')
      .map((p) => ed.store.get<{ name: string; talk?: unknown[] }>(p))
      .some((x) => x?.name === a && (x?.talk?.length ?? 0) > 0),
  conversationHas: (ed, a) => {
    const { choice, condition, action } = a as { choice?: boolean; condition?: boolean; action?: boolean };
    const id = ed.dialogueId.value;
    const conv = id ? ed.store.get<Conversation>(paths.dialogue(id)) : null;
    if (!conv) return false;
    const steps = conv.sections.flatMap((s) => s.steps);
    if (choice && !steps.some((s) => s.k === 'choice' && s.options.length >= 2)) return false;
    if (condition && !steps.some((s) => !!s.if || (s.k === 'choice' && s.options.some((o) => !!o.if)))) return false;
    if (action && !steps.some((s) => s.k === 'do' || s.k === 'like')) return false;
    return true;
  },
  dialogueStyleIs: (ed, a) => (ed.store.manifest.dialogue?.style ?? 'adventure') === a,
  inConversation: (ed) => !!ed.session.value?.talks.active,
  // P26: the saving course
  savingIs: (ed, a) => matches(savingOf(ed.store.manifest), a as Record<string, unknown>),
  placedAsset: (ed, a) => {
    const items = ed.store.get<Instances>(paths.instances(ed.mapId.value))?.items ?? [];
    return items.some(
      (i) => i.kind === 'asset' && (ed.store.get<Asset>(paths.asset(i.asset))?.name ?? '') === String(a),
    );
  },
  // P23 part 1: the effects course
  effectOpen: (ed, a) => effectNamed(ed, ed.effectId.value)?.name === a,
  // P23 part 3: the Faces course hears Tom talk
  talkHeard: (ed) => ed.talkHeard.value > 0,
  faceMoodIs: (ed, a) => ed.faceMood.value === a,
  // P23 part 2: the screen effects course
  effectsTabIs: (ed, a) => ed.effectsTab.value === a,
  screenEffectOpen: (ed, a) => screenEffectNamed(ed, ed.screenEffectId.value)?.name === a,
  ownScreenEffectNamed: (ed, a) => {
    const id = ed.screenEffectId.value;
    return !!id && ed.store.has(paths.screenEffect(id)) && screenEffectNamed(ed, id)?.name === a;
  },
  screenFlash: (ed, a) => {
    const e = screenEffectNamed(ed, ed.screenEffectId.value);
    return !!e && ed.store.has(paths.screenEffect(e.id)) && e.flash?.color.toLowerCase() === String(a).toLowerCase();
  },
  screenRumble: (ed) => {
    const e = screenEffectNamed(ed, ed.screenEffectId.value);
    return !!e && ed.store.has(paths.screenEffect(e.id)) && !!e.shake?.rumble;
  },
  screenHook: (ed, a) => {
    const { event, name } = a as { event: string; name: string };
    const id = (ed.store.manifest.screenEffects?.events as Record<string, string> | undefined)?.[event];
    return !!id && screenEffectNamed(ed, id)?.name === name;
  },
  mapMood: (ed, a) => {
    const want = a as Partial<Record<string, unknown>>;
    const m = ed.mapDoc.value?.mood as Record<string, unknown> | undefined;
    return !!m && Object.entries(want).every(([k, v]) => m[k] === v);
  },
  ownEffectNamed: (ed, a) => {
    const id = ed.effectId.value;
    return !!id && ed.store.has(paths.effect(id)) && effectNamed(ed, id)?.name === a;
  },
  effectColor: (ed, a) => {
    const { i, value } = a as { i: number; value: string };
    const e = effectNamed(ed, ed.effectId.value);
    return !!e && ed.store.has(paths.effect(e.id)) && e.colors[i]?.toLowerCase() === value.toLowerCase();
  },
  effectShape: (ed, a) => {
    const e = effectNamed(ed, ed.effectId.value);
    return !!e && ed.store.has(paths.effect(e.id)) && e.shape === a;
  },
  placedEffect: (ed, a) => {
    const items = ed.store.get<Instances>(paths.instances(ed.mapId.value))?.items ?? [];
    return items.some((i) => i.kind === 'effect' && effectNamed(ed, i.effect)?.name === String(a));
  },
  effectHook: (ed, a) => {
    const { event, name } = a as { event: string; name: string };
    const id = (ed.store.manifest.effects?.events as Record<string, string> | undefined)?.[event];
    return !!id && effectNamed(ed, id)?.name === name;
  },
  titleShown: (ed) => {
    const s = ed.session.value;
    return !!s && s.screens.screens().some((x) => x.kind === 'title');
  },
  savesOf: (ed, a) => {
    const n = allSaves(new BrowserSaveStore(), ed.store.manifest.id).length;
    return a === 0 ? n === 0 : n >= Number(a);
  },
  // P26 part 2
  achievementsAtLeast: (ed, a) =>
    ((ed.store.get(paths.progress) as { achievements?: unknown[] } | undefined)?.achievements?.length ?? 0) >=
    Number(a),
  playerSetting: (ed, a) => {
    const s = ed.session.value;
    return !!s && matches(s.progress.settings, a as Record<string, unknown>);
  },
  screenShown: (ed, a) => !!ed.session.value?.screens.screens().some((x) => x.name === a),
  // P27 part 1: the lights course
  mapDarkness: (ed, a) => (ed.mapDoc.value?.darkness ?? 0) >= Number(a),
  lightKind: (ed, a) => lightsOf(ed).some((l) => (l.name ?? '').startsWith(String(a))),
  lightColor: (ed, a) => lightsOf(ed).some((l) => l.light.color.toLowerCase() === String(a).toLowerCase()),
  lightRange: (ed, a) => lightsOf(ed).some((l) => l.light.range >= Number(a)),
  lightsAtLeast: (ed, a) => lightsOf(ed).length >= Number(a),
  lightOff: (ed) => lightsOf(ed).some((l) => !l.on),
  zoneLightsOn: (ed) => (ed.mapDoc.value?.zones ?? []).some((z) => (z.onEnter ?? []).some((x) => x.do === 'lightOn')),
  lightOnInPlay: (ed, a) =>
    !!ed.session.value?.lightSources().some((l) => (l.name ?? '').startsWith(String(a)) && l.on),
  // P23 part 4: posing and the animation state machine
  clipViewIs: (ed, a) => !!openClip(ed) && ed.clipView.value === a,
  poseCount: (ed, a) => poseTimes(openClip(ed) ?? { tracks: [] }).length >= Number(a),
  poseAtTime: (ed, a) => poseTimes(openClip(ed) ?? { tracks: [] }).some((t) => Math.abs(t - Number(a)) < 0.05),
  poseJoint: (ed, a) => {
    const { t, joint, min } = a as { t: number; joint: string; min: number };
    const c = openClip(ed);
    if (!c || !poseTimes(c).some((x) => Math.abs(x - t) < 0.05)) return false;
    return (poseAt(c, t)[joint] ?? 0) >= min;
  },
  poseEase: (ed, a) => {
    const { t, ease } = a as { t: number; ease: string };
    const c = openClip(ed);
    return !!c && easeAt(c, t) === ease;
  },
  animationOwn: (ed, a) => {
    const id = studioCharacter(ed)?.animations?.[a as 'idle'];
    return !!id && ed.store.has(paths.clip(id));
  },
  stateShownIs: (ed, a) => ed.stateShown.value === a,
  heroStateSeen: (ed, a) => !!ed.session.value?.statesSeen.has(a as never),
  ...CODING_TESTS,
};

type TrackArg = { bone: string; prop: string };
function openGraph(ed: EditorState): LogicGraph | null {
  const id = ed.logicGraph.value ?? ed.store.list('logic/lg_')[0]?.slice(6, -5);
  return id ? (ed.store.get<LogicGraph>(paths.logic(id)) ?? null) : null;
}
function openCine(ed: EditorState): Cinematic | null {
  const id = ed.cinematicId.value ?? ed.store.list('cinematics/')[0]?.slice(11, -5);
  return id ? (ed.store.get<Cinematic>(paths.cinematic(id)) ?? null) : null;
}
function lightsOf(ed: EditorState): LightInstance[] {
  return (ed.store.get<Instances>(paths.instances(ed.mapId.value))?.items ?? []).filter(
    (i): i is LightInstance => i.kind === 'light',
  );
}
function studioCharacter(ed: EditorState): Character | null {
  const id = ed.studioCharacter.value;
  return id ? (ed.store.get<Character>(paths.character(id)) ?? null) : null;
}
function openClip(ed: EditorState): Clip | null {
  const id = ed.studioClip.value;
  return id ? (ed.store.get<Clip>(paths.clip(id)) ?? null) : null;
}
const clipTrack = (ed: EditorState, a: TrackArg) =>
  openClip(ed)?.tracks.find((t) => t.bone === a.bone && t.prop === a.prop) ?? null;
const projectAsset = (ed: EditorState, name: string) =>
  ed.store
    .list('assets/')
    .map((p) => ed.store.get<Asset>(p)!)
    .find((x) => x?.name === name) ?? null;

/** true when `payload` has every field of `where` (deep, arrays compared as sets of items) */
export function matches(payload: unknown, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  for (const [k, v] of Object.entries(where)) {
    const got = p[k];
    if (Array.isArray(v)) {
      if (!Array.isArray(got) || !v.every((x) => got.some((g) => JSON.stringify(g) === JSON.stringify(x))))
        return false;
    } else if (v && typeof v === 'object') {
      if (!matches(got, v as Record<string, unknown>)) return false;
    } else if (got !== v) return false;
  }
  return true;
}

export function commandMatches(cmds: readonly Command[], type: string, where?: Record<string, unknown>) {
  return cmds.some((c) => c.type === type && matches(c.payload, where));
}
