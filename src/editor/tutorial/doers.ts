import { BUILTIN_ASSETS, builtinAsset } from '../../builtin/assets';
import { DEFAULT_EVENTS, DEFAULT_MIXER } from '../../builtin/audio';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_MODEL_FILES } from '../../builtin/models/data';
import { ADVENTURE_PACK } from '../../builtin/packs/adventure';
import { BUILTIN_SCREENS } from '../../builtin/screens';
import { localToWorld } from '../../core/assets/expand';
import { MOVER_INFO, type Mover, makeMover } from '../../core/assets/movers';
import { type Mirror, mirrorOf, type Stamp, stampAt, stampOf } from '../../core/bricks/build-tools';
import type { Brick } from '../../core/bricks/codec';
import { CustomBrick, customType } from '../../core/bricks/custom';
import type { BodyPlan, Bone } from '../../core/character/body';
import { makeFamily } from '../../core/character/families';
import { cleanHair, type HairStyle } from '../../core/character/hair';
import { DEFAULT_STATS } from '../../core/character/sheet';
import { rewardScene } from '../../core/cinematic/templates';
import type { Command } from '../../core/commands';
import type { NewBrick } from '../../core/commands/handlers/bricks';
import { progressOf } from '../../core/commands/handlers/progress';
import { blankConversation, type Conversation } from '../../core/dialogue/schema';
import { parseScript } from '../../core/dialogue/script';
import { arrivalSpot, assetSpot, reachable, surfaceOf } from '../../core/gamegen/places';
import { newId } from '../../core/ids';
import { importMedia, isBigPicture } from '../../core/media/import';
import { allSaves, type Saving } from '../../core/save/save';
import {
  type Asset,
  type Character,
  type Clip,
  type Gates,
  type Instances,
  type LightInstance,
  type LogicGraph,
  type MapDoc,
  type MediaIndex,
  type Mixer,
  paths,
  type Screen,
  type Variables,
  type Widget,
} from '../../core/schema';
import { fromBase64, modelMatrix, prepareModel } from '../../engine/model/prepare';
import { drawBox } from '../../engine/render/model-draw';
import { BrowserSaveStore } from '../../platform/saves';
import { type ActionCtx, action, runAction } from '../actions/registry';
import { assetLibrary, newAssetDef, placeCommands } from '../assets';
import { looseCopies, modelItems, placeModelAt, placeWaterAt, waterItems } from '../interact/place';
import { sampleClip, samplePoster } from '../media/samples';
import { shrinkMedia } from '../media/shrink';
import { makePackHero, placePackCharacter, setScreenLook } from '../pack/pack';
import { importModelFiles, modelChoices } from '../panels/ModelFields';
import { savingOf } from '../panels/SavingSection';
import type { EditorState } from '../state';
import { settleMove } from '../viewport/settle';
import { buildInto } from '../workspaces/asset-studio/scratch';
import { scriptNames } from '../workspaces/dialogue/model';
import { newGraph } from '../workspaces/logic/model';
import { CODING_DOERS } from './coding';
import type { Do } from './schema';
import { STORY_DOERS, storyText } from './story';

type Ctx = ActionCtx;
const run = (c: Ctx, cmds: Command | Command[], label: string) => {
  const r = c.ed.exec(cmds, { label, source: 'tutorial' });
  if (!r.ok) throw new Error(r.error ?? label);
};
const map = (c: Ctx) => c.ed.mapId.value;
/** step 11: the Asset studio's build plate (its own editor state) */
type Plate = Pick<EditorState, 'exec' | 'bus' | 'mapId' | 'brush'> & {
  mirror: { value: Mirror };
  stamp: { value: Stamp | null };
  scene: { value: { all(): Brick[] } | null };
};
const plate = (): Plate => {
  const p = (globalThis as unknown as { __plate?: Plate }).__plate;
  if (!p?.scene.value) throw new Error('Open the asset in the Assets screen first.');
  return p;
};
/** the project's custom brick of this name */
const customNamed = (c: Ctx, name: string): CustomBrick | undefined =>
  c.ed.store
    .list('bricks/')
    .map((p) => c.ed.store.get<CustomBrick>(p))
    .find((b) => b?.name === name);
const studioChr = (c: Ctx) => {
  const id = c.ed.studioCharacter.value;
  const chr = id ? c.ed.store.get<Character>(paths.character(id)) : null;
  if (!chr) throw new Error('Pick a character of the game first.');
  return chr;
};
const mapDoc = (c: Ctx, m = map(c)) => c.ed.store.get<MapDoc>(paths.map(m))!;
const assetByName = (c: Ctx, name: string): Asset | null =>
  assetLibrary(c.ed).find((x) => x.asset.name === name)?.asset ?? BUILTIN_ASSETS.find((a) => a.name === name) ?? null;
const cell = (c: Ctx, min: number, max: number) => {
  const { cells } = reachable(c.ed.store, map(c));
  return cells.find(([, , , d]) => d >= min && d <= max) ?? cells.at(-1) ?? null;
};
const hud = (c: Ctx): Screen => {
  const id = BUILTIN_SCREENS.find((s) => s.kind === 'hud')!.id;
  return c.ed.store.get<Screen>(paths.screen(id)) ?? BUILTIN_SCREENS.find((s) => s.id === id)!;
};

/**
 * “Do it for me” and the “Show me” demo (P7.3): the same edits a user would make, as commands
 * through the bus (so every one is undoable) or as UI changes. Named functions do the steps that
 * need a place on the map, an id, or a lookup.
 */
import { CUTSCENE_TEMPLATES } from '../../builtin/templates/cutscenes';
import { SCRIPT_TEMPLATES } from '../../builtin/templates/scripts';
import { gatherItem, type LibKind, type VarDef } from '../../core/library/library';
import { nameBook, withIds } from '../../core/logic/code/names';
import { parseCode } from '../../core/logic/code/parse';
import { exportLibrary, gameThings, useLibraryItem } from '../library/LibraryPanel';
import { library } from '../library/store';
import { defaultAnswer, useCutsceneTemplate, useScriptTemplate } from '../pack/templates';

/** step 11, 4c: the rules the Scripts and scenes course has you type */
export const OWN_RULES = `on("start", (e) => {
  say("The map costs 20 coins.", 3);
  if ((items.count("coin") >= 20)) {
    items.take("coin", 20);
  }
  character.spawn("Nim", "Arrival");
  character.follow("Nim", true);
});
`;
export const DOERS: Record<string, (c: Ctx, args: Record<string, unknown>) => void | Promise<void>> = {
  generateMap(c, a) {
    run(
      c,
      {
        type: 'map.generate',
        payload: { map: map(c), config: { environments: a.environments, size: 24, seed: 4242 } },
      },
      'Generate terrain',
    );
    const pos = arrivalSpot(c.ed.store, map(c));
    const sp = mapDoc(c).spawns[0];
    if (pos && sp) run(c, { type: 'map.updateSpawn', payload: { map: map(c), spawn: sp.id, pos } }, 'Move the arrival');
    setTimeout(() => c.ui.fit(), 30);
  },
  selectBuilding(c) {
    const s = c.ed.scene.value;
    if (!s) return;
    const insts = [...new Set(s.instanceOf.values())];
    const pick = insts.find((i) => i.def.category === 'building') ?? insts[0];
    if (pick) c.ed.select(pick.bricks.map((b) => b.id));
    else {
      const b = s.all().find((x) => x.y > 0);
      if (b) c.ed.select([b.id]);
    }
    setTimeout(() => c.ui.frameSelection(), 30);
  },
  /** P9c: selects the first placed copy of an asset (by name) on the open map and frames it */
  selectObject(c, a) {
    const s = c.ed.scene.value;
    if (!s) return;
    const pick = [...new Set(s.instanceOf.values())].find((i) => i.def.name === a.asset);
    if (!pick) throw new Error(`There is no ${String(a.asset)} on this map.`);
    c.ed.select(pick.bricks.map((b) => b.id));
    setTimeout(() => c.ui.frameSelection(), 30);
  },
  moveSomething(c) {
    // the selected object (or a placed asset) moves a few studs to where it can stand
    const s = c.ed.scene.value!;
    let ids = [...c.ed.selection.value];
    if (!ids.length) {
      const inst = [...new Set(s.instanceOf.values())].at(-1);
      if (!inst) throw new Error('Place something first.');
      ids = inst.bricks.map((b) => b.id);
      c.ed.select(ids);
    }
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ] as const) {
      const cmd: Command = { type: 'bricks.move', payload: { map: map(c), ids, dx, dy: 0, dz } };
      const fit = settleMove(cmd, (x) => c.ed.bus.check(x));
      if (!c.ed.bus.check(fit.cmd)) return run(c, fit.cmd, 'Move');
    }
    throw new Error('There is no room to move it.');
  },
  eraseObject(c) {
    // the asset copy placed last goes again (a whole object, as the Scene's Erase tool does it)
    const s = c.ed.scene.value!;
    const insts = [...new Set(s.instanceOf.values())].sort((a, b) => b.inst.idBase - a.inst.idBase);
    for (const e of insts.slice(0, 60)) {
      const cmd: Command = { type: 'bricks.remove', payload: { map: map(c), ids: e.bricks.map((b) => b.id) } };
      if (c.ed.bus.dryRun([cmd]).ok) return run(c, cmd, `Erase ${e.def.name}`);
    }
    throw new Error('Nothing can be erased here.');
  },
  addSpawn(c) {
    const p = cell(c, 6, 12);
    if (!p) throw new Error('No open ground.');
    run(
      c,
      {
        type: 'map.addSpawn',
        payload: { map: map(c), name: 'Lookout', pos: [p[0] + 0.5, p[1] * 0.4, p[2] + 0.5], yaw: 0 },
      },
      'Add spawn point',
    );
  },
  addZone(c) {
    const p = cell(c, 8, 14);
    if (!p) throw new Error('No open ground.');
    const y = p[1] * 0.4;
    run(
      c,
      {
        type: 'map.addZone',
        payload: {
          map: map(c),
          zone: { min: [p[0] - 2, y, p[2] - 2], max: [p[0] + 3, y + 4, p[2] + 3], tags: ['Zone 1'] },
        },
      },
      'Add trigger zone',
    );
  },
  addMap(c) {
    const id = newId('map');
    run(
      c,
      {
        type: 'map.create',
        payload: { id, name: 'Prairie', generate: { environments: ['prairie'], size: 24, seed: 77 } },
      },
      'Add map',
    );
    const pos = arrivalSpot(c.ed.store, id);
    const sp = mapDoc(c, id).spawns[0];
    if (pos && sp) run(c, { type: 'map.updateSpawn', payload: { map: id, spawn: sp.id, pos } }, 'Move the arrival');
  },
  connectGate(c) {
    const order = c.ed.store.get<Gates>(paths.gates)?.mapOrder ?? [];
    if (order.length < 2) throw new Error('Add a second map first.');
    const a = mapDoc(c, order[0]!);
    const b = mapDoc(c, order[1]!);
    const from = a.spawns.at(-1)!;
    run(
      c,
      {
        type: 'gate.connect',
        payload: { from: { map: a.id, spawn: from.id }, to: { map: b.id, spawn: b.spawns[0]!.id }, twoWay: true },
      },
      'Connect gate',
    );
  },
  pickAsset(c, a) {
    const def = assetByName(c, String(a.name));
    if (!def) return;
    c.ed.assetBrush.value = { asset: def.id, rot: 0 };
    c.ed.tool.value = 'asset';
  },
  placeAsset(c, a) {
    const def = assetByName(c, String(a.name));
    if (!def) throw new Error(`No asset ${a.name}.`);
    const cmds: Command[] = [];
    if (!c.ed.store.has(paths.asset(def.id))) {
      const b = builtinAsset(def.id);
      if (b) {
        cmds.push({ type: 'asset.create', payload: { asset: b } });
        run(c, cmds, `Add ${def.name}`);
        cmds.length = 0;
      }
    }
    const place = assetSpot(c.ed.store, c.ed.bus, map(c), def, { minSteps: 3 });
    if (!place) throw new Error('No room for it.');
    run(c, place, `Place ${def.name}`);
  },
  // step 11 (P24 part 1): the Build faster course — a new asset, mirrored bricks, a stamp and a drawbridge
  buildNew(c, a) {
    const name = String(a.name ?? 'Gatehouse');
    const has = assetLibrary(c.ed).find((x) => x.asset.name === name && c.ed.store.has(paths.asset(x.asset.id)));
    if (has) {
      c.ui.editAsset(has.asset.id);
      return;
    }
    const asset = { ...newAssetDef(c.ed), name };
    run(c, { type: 'asset.create', payload: { asset } }, `New asset ${name}`);
    c.ui.editAsset(asset.id);
  },
  buildMirrored(c, a) {
    const p = plate();
    if (p.mirror.value.x === null) p.mirror.value = { ...p.mirror.value, x: 0 };
    const m = p.mirror.value;
    const all = p.scene.value!.all();
    const x0 = Math.max(...all.map((b) => b.x + 4), 2);
    const n = Number(a.count ?? 3);
    const want: NewBrick[] = [];
    for (let i = 0; i < n; i++)
      want.push({ type: 'brick1x2', x: x0 + i * 2, y: 0, z: 0, rot: 0, color: String(a.color ?? '#a0a5a9') });
    const bricks = [...want, ...want.flatMap((b) => mirrorOf(b, m))];
    const r = p.exec(
      { type: 'bricks.place', payload: { map: p.mapId.value, bricks } },
      { label: 'Place bricks (mirrored)' },
    );
    if (!r.ok) throw new Error(r.error ?? 'No room for the bricks.');
  },
  buildStamp(c) {
    const p = plate();
    const all = p.scene.value!.all();
    const stamp = stampOf(all);
    p.stamp.value = stamp;
    for (let dz = 3; dz < 30; dz++) {
      const bricks = stampAt(stamp, Math.min(...all.map((b) => b.x)), 0, Math.max(...all.map((b) => b.z)) + dz);
      const cmd = { type: 'bricks.place', payload: { map: p.mapId.value, bricks } };
      if (!p.bus.check(cmd)) {
        p.exec(cmd, { label: 'Stamp' });
        p.stamp.value = null;
        return;
      }
    }
    throw new Error('No room for the stamp.');
  },
  // step 11 (P24 part 2): the Custom bricks course — a slope made, put down four ways, changed into a curve
  brickMake(c, a) {
    const name = String(a.name ?? 'Roof slope');
    const old = customNamed(c, name);
    const brick = CustomBrick.parse({
      id: old?.id ?? newId('custombrick'),
      name,
      base: old?.base ?? 'brick',
      w: old?.w ?? Number(a.w ?? 2),
      d: old?.d ?? Number(a.d ?? 3),
      shape: String(a.shape ?? 'slope'),
      studs: 'flat',
    });
    run(c, { type: 'brick.put', payload: { brick } }, `New brick ${name}`);
    const p = (globalThis as unknown as { __plate?: Plate }).__plate;
    if (p) p.brush.value = { ...p.brush.value, type: customType(brick) };
  },
  brickPlace(c, a) {
    const p = plate();
    const cb = customNamed(c, String(a.name ?? 'Roof slope'));
    if (!cb) throw new Error('Make the brick first.');
    const all = p.scene.value!.all();
    const x0 = all.length ? Math.max(...all.map((b) => b.x)) + 5 : 0;
    const n = Number(a.count ?? 4);
    for (let i = 0; i < n; i++) {
      let ok = false;
      for (let y = 0; y < 30 && !ok; y++) {
        const cmd = {
          type: 'bricks.place',
          payload: {
            map: p.mapId.value,
            bricks: [{ type: customType(cb), x: x0 + i * 4, y, z: 0, rot: i % 4, color: p.brush.value.color }],
          },
        };
        if (!p.bus.check(cmd)) {
          p.exec(cmd, { label: `Place ${cb.name}` });
          ok = true;
        }
      }
      if (!ok) throw new Error('No room for the brick.');
    }
  },
  brickChange(c, a) {
    const cb = customNamed(c, String(a.name ?? 'Roof slope'));
    if (!cb) throw new Error('Make the brick first.');
    const brick = { ...cb, shape: String(a.shape ?? 'curve') as CustomBrick['shape'] };
    run(c, { type: 'brick.put', payload: { brick } }, `Change brick ${cb.name}`);
  },
  // step 11 (P24 part 3): the Your own media course — the Media library, sample files, a credit, a shrink, a screen
  mediaOpen(c) {
    c.ed.mediaLibrary.value = true;
  },
  async mediaSamples(c) {
    const files = [await samplePoster(), await sampleClip()].filter((f): f is NonNullable<typeof f> => !!f);
    for (const f of files) {
      const r = await importMedia(f.name, f.bytes, { index: c.ed.store.get<MediaIndex>(paths.media) });
      if (!r.ok) throw new Error(r.error);
      const mime = r.entry.mime;
      c.ed.media?.put(r.ref, new Blob([f.bytes as BlobPart], { type: mime }));
      if (!r.duplicate) run(c, { type: 'media.register', payload: { ref: r.ref, entry: r.entry } }, `Import ${f.name}`);
    }
  },
  mediaCredit(c, a) {
    const items = c.ed.store.get<MediaIndex>(paths.media)?.items ?? {};
    const ref = Object.keys(items).find((r) => items[r]!.kind === 'image' && !items[r]!.credit);
    if (!ref) throw new Error('Import a picture first.');
    run(
      c,
      {
        type: 'media.update',
        payload: { ref, credit: { author: String(a.author ?? 'Me'), license: String(a.license ?? 'My own work') } },
      },
      'Credit picture',
    );
  },
  async mediaShrink(c) {
    const items = c.ed.store.get<MediaIndex>(paths.media)?.items ?? {};
    for (const ref of Object.keys(items).filter((r) => isBigPicture(items[r]!)))
      if (!(await shrinkMedia(c.ed, ref))) throw new Error('It could not be shrunk.');
  },
  mediaIntro(c, a) {
    const items = c.ed.store.get<MediaIndex>(paths.media)?.items ?? {};
    const clip = Object.keys(items).find((r) => items[r]!.kind === 'video');
    if (!clip) throw new Error('Import a video first.');
    c.ed.mediaLibrary.value = false;
    const name = String(a.name ?? 'Intro');
    const old = c.ed.store
      .list('screens/')
      .map((p) => c.ed.store.get<Screen>(p)!)
      .find((x) => x?.name === name);
    const id = old?.id ?? (newId('screen') as Screen['id']);
    const title = c.ed.store
      .list('screens/')
      .map((p) => c.ed.store.get<Screen>(p)!)
      .find((x) => x?.kind === 'title');
    const screen: Screen = {
      id,
      kind: 'custom',
      name,
      music: null,
      pausesGame: true,
      root: {
        type: 'panel',
        style: { bg: '#000000' },
        children: [
          {
            type: 'video',
            id: 'intro',
            anchor: [0.5, 0.5],
            style: { w: 960, h: 480, src: clip, skip: 1, fit: 'fit' },
            onEnd: [
              ...(title ? [{ do: 'showScreen' as const, screen: title.id }] : []),
              { do: 'hideScreen' as const, screen: id },
            ],
          },
        ],
      },
    };
    run(c, { type: 'screen.put', payload: { screen } }, `Screen ${name}`);
    c.ed.screenId.value = id;
    c.ui.workspace('Screens');
  },
  mediaCreditsWidget(c, a) {
    const name = String(a.name ?? 'Intro');
    const s = c.ed.store
      .list('screens/')
      .map((p) => c.ed.store.get<Screen>(p)!)
      .find((x) => x?.name === name);
    if (!s) throw new Error(`Make the ${name} screen first.`);
    if (JSON.stringify(s.root).includes('"credits"')) return;
    const credits = {
      type: 'credits' as const,
      id: 'credits',
      anchor: [1, 1] as [number, number],
      offset: [-16, -16] as [number, number],
      text: String(a.text ?? 'Made with Brick Worlds'),
      style: { w: 360, h: 120, fontSize: 14, color: '#ffffff', bg: '#0b1020d0', pad: 12, radius: 10 },
    };
    run(
      c,
      {
        type: 'screen.put',
        payload: { screen: { ...s, root: { ...s.root, children: [...(s.root.children ?? []), credits] } } },
      },
      'Add Credits',
    );
    c.ed.screenId.value = s.id;
    c.ui.workspace('Screens');
  },
  buildMover(c, a) {
    const id = c.ed.studioAsset.value;
    const def = id ? c.ed.store.get<Asset>(paths.asset(id)) : undefined;
    if (!def) throw new Error('Open an asset first.');
    const kind = String(a.kind ?? 'drawbridge') as Mover;
    // the last bricks placed (the stamp) become the moving part
    const idx = def.bricks.map((_, i) => i).slice(Math.floor(def.bricks.length / 2));
    const taken = new Set(idx);
    const rest = (def.parts ?? [])
      .map((q) => ({ ...q, bricks: q.bricks.filter((k) => !taken.has(k)) }))
      .filter((q) => q.bricks.length);
    const next = makeMover(
      { ...def, parts: [...rest, { name: MOVER_INFO[kind].label.split(' (')[0]!, bricks: idx }] },
      rest.length,
      kind,
    );
    if (typeof next === 'string') throw new Error(next);
    run(c, { type: 'asset.update', payload: { asset: next } }, `Make a ${kind}`);
  },
  editAsset(c, a) {
    const def = assetByName(c, String(a.name));
    c.ui.editAsset(def?.id ?? null);
  },
  buildInto(c, a) {
    // P32: a copy of one asset built into another (as dragging it onto the build plate does)
    const base = assetByName(c, String(a.into));
    const other = assetByName(c, String(a.name));
    if (!base || !other) throw new Error('Open an asset first.');
    // `as` names a new asset started from `into`, so copies already on the map stay as they are
    const into: Asset = a.as ? { ...base, id: newId('asset'), name: String(a.as), origin: 'user' } : base;
    const cmds: Command[] = [];
    if (!c.ed.store.has(paths.asset(into.id))) cmds.push({ type: 'asset.create', payload: { asset: into } });
    const next = buildInto(into, other, [into.footprint[0], 0, 0]);
    cmds.push({ type: 'asset.update', payload: { asset: next } });
    run(c, cmds, `Build ${other.name} into ${into.name}`);
    c.ed.studioAsset.value = into.id;
  },
  addBrickToOpenAsset(c) {
    // P32: one more brick on top of the open asset (what clicking the build plate with Place bricks does)
    const id = c.ed.studioAsset.value;
    const def = id ? c.ed.store.get<Asset>(paths.asset(id)) : null;
    if (!def) throw new Error('Open an asset with + New asset first.');
    const b = c.ed.brush.value;
    const types = [...def.palette.types];
    const colors = [...def.palette.colors];
    const ix = (arr: string[], v: string) => (arr.includes(v) ? arr.indexOf(v) : arr.push(v) - 1);
    const top = Math.max(...def.bricks.map((t) => t[2] + (def.palette.types[t[0]]!.startsWith('brick') ? 3 : 1)));
    const bricks = [
      ...def.bricks,
      [ix(types, b.type), 0, top, 0, 0, ix(colors, b.color.toLowerCase()), 0],
    ] as Asset['bricks'];
    run(c, { type: 'asset.update', payload: { asset: { ...def, bricks, palette: { types, colors } } } }, 'Add a brick');
  },
  chestGivesCoin(c) {
    const def = c.ed.store
      .list('assets/')
      .map((p) => c.ed.store.get<Asset>(p)!)
      .find((x) => x.name === 'Treasure chest');
    if (!def) throw new Error('Place the chest first.');
    const interactions = def.interactions.map((it, i) =>
      i === 0 ? { ...it, do: [...it.do, { do: 'give' as const, item: 'coin', count: 1 }] } : it,
    );
    run(c, { type: 'asset.update', payload: { asset: { ...def, interactions } } }, 'Edit chest');
    c.ed.studioAsset.value = def.id;
  },
  chestGivesGems(c, a) {
    // P22 dialogue course: opening the chest adds gems (one more action on its first interaction)
    const def = c.ed.store
      .list('assets/')
      .map((p) => c.ed.store.get<Asset>(p)!)
      .find((x) => x.name === 'Treasure chest');
    if (!def) throw new Error('Place the chest first.');
    const amount = Number(a.amount ?? 5);
    const interactions = def.interactions.map((it, i) =>
      i === 0 && !it.do.some((x) => x.do === 'addVar' && x.var === 'gems')
        ? { ...it, do: [...it.do, { do: 'addVar' as const, var: 'gems', value: amount }] }
        : it,
    );
    run(c, { type: 'asset.update', payload: { asset: { ...def, interactions } } }, 'Chest gives gems');
    c.ed.studioAsset.value = def.id;
  },
  newCharacter(c, a) {
    const p = BUILTIN_CHARACTERS.find((x) => x.name === a.preset) ?? BUILTIN_CHARACTERS[0]!;
    const id = newId('character');
    run(c, { type: 'character.create', payload: { character: { ...p, id } } }, 'New character');
    c.ed.studioCharacter.value = id;
  },
  renameCharacter(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr) throw new Error('Make a character first.');
    run(c, { type: 'character.update', payload: { character: { ...chr, name: String(a.name) } } }, 'Rename character');
  },
  makeHero(c) {
    const id = c.ed.studioCharacter.value;
    if (!id) throw new Error('Pick a character first.');
    run(c, { type: 'project.update', payload: { hero: id } }, 'Choose player character');
  },
  newClip(c) {
    const id = newId('clip');
    run(
      c,
      {
        type: 'clip.create',
        payload: { clip: { id, name: 'Wave hello', length: 2, loop: true, tracks: [], events: [] } },
      },
      'New clip',
    );
    c.ed.studioClip.value = id;
  },
  openOwnClip(c) {
    // the clip you made (the newest of your own), open on the timeline
    const own = c.ed.store.list('clips/').map((p) => c.ed.store.get<{ id: string }>(p)!);
    const open = own.find((x) => x.id === c.ed.studioClip.value) ?? own.at(-1);
    if (!open) throw new Error('Make a clip first (Clips › + New).');
    c.ed.studioClip.value = open.id;
  },
  seekClip(c, a) {
    // what clicking the timeline does: stop the clip and put the playhead at `t` seconds
    c.ed.clipPlaying.value = false;
    c.ed.clipTime.value = Number(a.t ?? 0);
  },
  armUpKeys(c) {
    // what the clicks do: on the Right arm · z lane, a key at 1 s with the arm up, back down at the end
    const id = c.ed.studioClip.value;
    const clip = id ? c.ed.store.get<Clip>(paths.clip(id)) : null;
    if (!clip) throw new Error('Open your clip first.');
    const keys: Clip['tracks'][number]['keys'] = [
      [0, 0.06, 'easeInOut'],
      [1, 2.6, 'easeInOut'],
      [clip.length, 0.06, 'easeInOut'],
    ];
    const others = clip.tracks.filter((t) => !(t.bone === 'rightArm' && t.prop === 'z'));
    run(
      c,
      {
        type: 'clip.update',
        payload: { clip: { ...clip, tracks: [...others, { bone: 'rightArm', prop: 'z', keys }] } },
      },
      'Raise the arm',
    );
  },
  newGraph(c) {
    const g = newGraph('My rules', { type: 'event.onStart' });
    run(c, { type: 'logic.create', payload: { graph: g } }, 'New logic');
    c.ed.logicGraph.value = g.id;
  },
  addNode(c, a) {
    const id = c.ed.logicGraph.value ?? c.ed.store.list('logic/lg_')[0]?.slice(6, -5);
    if (!id) throw new Error('Make a graph first.');
    run(c, { type: 'logic.addNode', payload: { graph: id, node: { type: a.type, pos: [320, 60] } } }, 'Add node');
  },
  wireStartToLast(c) {
    const id = c.ed.logicGraph.value;
    const g = id ? c.ed.store.get<LogicGraph>(paths.logic(id)) : undefined;
    if (!g) throw new Error('Make a graph first.');
    const start = g.nodes.find((n) => n.type.startsWith('event.'));
    const last = [...g.nodes].reverse().find((n) => !n.type.startsWith('event.'));
    if (!start || !last) throw new Error('Add a node first.');
    run(c, { type: 'logic.connect', payload: { graph: g.id, edge: [start.id, 'then', last.id, 'in'] } }, 'Connect');
  },
  addVariable(c, a) {
    run(
      c,
      {
        type: 'logic.setVariable',
        payload: { name: String(a.name), def: { type: 'number', default: 0, scope: 'global' } },
      },
      'Add variable',
    );
  },
  addHudText(c) {
    const h = hud(c);
    const w: Widget = {
      type: 'text',
      id: 'score',
      anchor: [0, 1],
      offset: [24, -24],
      text: 'New text',
      style: { fontSize: 22, color: '#ffffff', weight: 'bold' },
    };
    const children = [...(h.root.children ?? []), w];
    run(c, { type: 'screen.put', payload: { screen: { ...h, root: { ...h.root, children } } } }, 'Add text');
    c.ed.screenId.value = h.id;
    c.ed.widgetPath.value = String(children.length - 1);
  },
  setHudText(c, a) {
    const h = hud(c);
    const kids = h.root.children ?? [];
    let i = kids.findIndex((k) => k.id === 'score');
    if (i < 0) i = kids.length - 1;
    const children = kids.map((k, j) => (j === i ? { ...k, text: String(a.text) } : k));
    run(c, { type: 'screen.put', payload: { screen: { ...h, root: { ...h.root, children } } } }, 'Edit text');
    c.ed.screenId.value = h.id;
    c.ed.widgetPath.value = String(i);
  },
  newRewardScene(c) {
    const entry = c.ed.store.manifest.entry.map;
    const sp = mapDoc(c, entry).spawns[0]!;
    const id = newId('cinematic');
    const giver = BUILTIN_CHARACTERS.find((x) => x.name === 'Chef')!.id;
    run(
      c,
      {
        type: 'cinematic.put',
        payload: {
          cinematic: rewardScene({
            id,
            map: entry,
            at: sp.pos as [number, number, number],
            giver,
            name: 'Quest complete!',
          }),
        },
      },
      'New cinematic',
    );
    c.ed.cinematicId.value = id;
  },
  zonePlaysScene(c) {
    const entry = c.ed.store.manifest.entry.map;
    const z = mapDoc(c, entry).zones[0];
    const cin = c.ed.store.list('cinematics/')[0]?.slice(11, -5);
    if (!z || !cin) throw new Error('Draw a zone and make a cinematic first.');
    c.ed.openMap(entry);
    run(
      c,
      {
        type: 'map.updateZone',
        payload: {
          map: entry,
          zone: z.id,
          patch: { onEnter: [...(z.onEnter ?? []), { do: 'cinematic', cinematic: cin, once: true }] },
        },
      },
      'Zone plays the cinematic',
    );
    c.ed.selectedZone.value = z.id;
    c.ed.right.value = 'inspect';
  },
  // P22: the dialogue course
  dialogueVillager(c, a) {
    const name = String(a.name ?? 'Old Tom');
    const has = c.ed.store
      .list('characters/')
      .map((p) => c.ed.store.get<Character>(p)!)
      .find((x) => x?.name === name);
    if (has) {
      c.ed.studioCharacter.value = has.id;
      return;
    }
    const look = BUILTIN_CHARACTERS.find((x) => /chef/i.test(x.name)) ?? BUILTIN_CHARACTERS[0]!;
    const id = newId('character');
    const sp = mapDoc(c).spawns[0];
    const at = arrivalSpot(c.ed.store, map(c)) ?? (sp?.pos as [number, number, number] | undefined) ?? [0, 0.4, 0];
    run(
      c,
      [
        {
          type: 'character.create',
          payload: { character: { ...look, id, name, role: 'npc', profile: { ...look.profile, name } } },
        },
        {
          type: 'npc.place',
          payload: { map: map(c), character: id, pos: [at[0] + 3, at[1], at[2] + 3], heading: Math.PI },
        },
      ],
      `Add ${name}`,
    );
    c.ed.studioCharacter.value = id;
  },
  dialogueConversation(c, a) {
    const name = String(a.character ?? 'Old Tom');
    const chr = c.ed.store
      .list('characters/')
      .map((p) => c.ed.store.get<Character>(p)!)
      .find((x) => x?.name === name);
    if (!chr) throw new Error(`Make ${name} first.`);
    const open = chr.talk?.[0]?.conversation;
    if (open && c.ed.store.has(paths.dialogue(open))) {
      c.ed.dialogueId.value = open;
      c.ed.charTab.value = 'dialogue';
      return;
    }
    const id = newId('dialogue');
    run(
      c,
      [
        { type: 'dialogue.put', payload: { conversation: blankConversation(id, `${name} talk`, chr.id) } },
        {
          type: 'character.update',
          payload: { character: { ...chr, talk: [...(chr.talk ?? []), { conversation: id }] } },
        },
      ],
      'New conversation',
    );
    c.ed.studioCharacter.value = chr.id;
    c.ed.dialogueId.value = id;
    c.ed.charTab.value = 'dialogue';
  },
  dialogueScript(c, a) {
    const id = c.ed.dialogueId.value;
    const cur = id ? c.ed.store.get<Conversation>(paths.dialogue(id)) : null;
    if (!cur) throw new Error('Open a conversation first.');
    const r = parseScript(String(a.script), cur, scriptNames(c.ed));
    if (r.errors.length) throw new Error(`Line ${r.errors[0]!.line}: ${r.errors[0]!.message}`);
    run(c, { type: 'dialogue.put', payload: { conversation: r.conversation } }, 'Edit script');
  },
  // P22 part 2: the character sheet course
  sheetMake(c, a) {
    const name = String(a.name ?? 'Sir Brick');
    const has = c.ed.store
      .list('characters/')
      .map((p) => c.ed.store.get<Character>(p)!)
      .find((x) => x?.name === name);
    if (has) {
      c.ed.studioCharacter.value = has.id;
      return;
    }
    const look = BUILTIN_CHARACTERS.find((x) => x.name === 'Explorer') ?? BUILTIN_CHARACTERS[0]!;
    const id = newId('character');
    run(
      c,
      [{ type: 'character.create', payload: { character: { ...look, id, name, profile: { ...look.profile, name } } } }],
      `Add ${name}`,
    );
    run(c, { type: 'project.update', payload: { hero: id } }, 'Choose player character');
    c.ed.studioCharacter.value = id;
    c.ed.charTab.value = 'look';
  },
  sheetOutfit(c, a) {
    const chr = studioChr(c);
    const name = String(a.name ?? 'Armour');
    const look = (a.look ?? {}) as Record<string, unknown>;
    const others = (chr.outfits ?? []).filter((o) => o.name !== name);
    run(
      c,
      {
        type: 'character.update',
        payload: {
          character: { ...chr, outfits: [...others, { name, look, stats: (a.stats ?? {}) as never }], outfit: name },
        },
      },
      `Outfit ${name}`,
    );
    c.ed.sheetTab.value = 'outfits';
  },
  sheetStats(c, a) {
    const chr = studioChr(c);
    run(
      c,
      {
        type: 'character.update',
        payload: { character: { ...chr, stats: { ...DEFAULT_STATS, ...(chr.stats ?? {}), ...(a as object) } } },
      },
      'Stats',
    );
    c.ed.sheetTab.value = 'stats';
  },
  sheetMoves(c, a) {
    const chr = studioChr(c);
    run(
      c,
      { type: 'character.update', payload: { character: { ...chr, moves: { style: a.style, power: 1, speed: 1 } } } },
      'Fighting style',
    );
    c.ed.sheetTab.value = 'moves';
  },
  sheetVoice(c, a) {
    const chr = studioChr(c);
    run(
      c,
      {
        type: 'character.update',
        payload: { character: { ...chr, voice: { ...(chr.voice ?? {}), pitch: Number(a.pitch) } } },
      },
      'Talk pitch',
    );
    c.ed.sheetTab.value = 'voice';
  },
  sheetAnimation(c, a) {
    const chr = studioChr(c);
    run(
      c,
      {
        type: 'character.update',
        payload: { character: { ...chr, animations: { ...(chr.animations ?? {}), [String(a.action)]: a.clip } } },
      },
      'Animation',
    );
    c.ed.sheetTab.value = 'animations';
  },
  sheetXp(c, a) {
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    s.giveXp(Number(a.amount ?? 100));
  },
  // Milestone 3, 10d: the shape and draw course — a minifig from the first preset, on the map
  lookMake(c, a) {
    const name = String(a.name ?? 'Nova');
    const has = c.ed.store
      .list('characters/')
      .map((p) => c.ed.store.get<Character>(p)!)
      .find((x) => x?.name === name);
    if (has) c.ed.studioCharacter.value = has.id;
    else {
      const id = newId('character');
      const sp = mapDoc(c).spawns[0];
      const at = arrivalSpot(c.ed.store, map(c)) ?? (sp?.pos as [number, number, number] | undefined) ?? [0, 0.4, 0];
      const base = BUILTIN_CHARACTERS[0]!;
      run(
        c,
        [
          {
            type: 'character.create',
            payload: {
              character: {
                ...base,
                id,
                name,
                role: 'npc',
                profile: { ...base.profile, name, ...((a.profile as object) ?? {}) },
              },
            },
          },
          {
            type: 'npc.place',
            payload: { map: map(c), character: id, pos: [at[0] + 3, at[1], at[2] + 3], heading: Math.PI },
          },
        ],
        `Add ${name}`,
      );
      c.ed.studioCharacter.value = id;
    }
    c.ed.sheetTab.value = 'look';
  },
  /** sets look fields of the open character as one undo step */
  lookSet(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr) throw new Error('Open a character first.');
    c.ed.sheetTab.value = 'look';
    run(
      c,
      { type: 'character.update', payload: { character: { ...chr, profile: { ...chr.profile, ...a } } } },
      'Body shape',
    );
  },
  /** Milestone 3, 10d part 3: custom hair settings on the open character, as one undo step */
  hairSet(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr) throw new Error('Open a character first.');
    c.ed.sheetTab.value = 'look';
    const before = chr.profile.hair === 'Custom' ? (chr.profile.customHair as object) : {};
    run(
      c,
      {
        type: 'character.update',
        payload: {
          character: {
            ...chr,
            profile: { ...chr.profile, hat: 'None', hair: 'Custom', customHair: cleanHair({ ...before, ...a }) },
          },
        },
      },
      'Custom hair',
    );
  },
  /** saves the open character's custom hair to My library under a name, and wears it from there */
  hairSave(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr || chr.profile.hair !== 'Custom') throw new Error('Give the character custom hair first.');
    const name = String(a.name ?? 'My hairstyle');
    const { name: _n, from: _f, ...settings } = cleanHair(chr.profile.customHair);
    const sid = newId('hairstyle') as HairStyle['id'];
    run(
      c,
      [
        {
          type: 'hairstyle.put',
          payload: { style: { ...settings, id: sid, name, color: String(chr.profile.hairColor) } },
        },
        {
          type: 'character.update',
          payload: {
            character: { ...chr, profile: { ...chr.profile, customHair: { ...settings, name, from: sid } } },
          },
        },
      ],
      `Save hairstyle ${name}`,
    );
  },
  /** puts a hairstyle from My library on the open character */
  hairFromLibrary(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr) throw new Error('Open a character first.');
    const style = c.ed.store
      .list(paths.hairstyleDir)
      .map((p) => c.ed.store.get<HairStyle>(p)!)
      .find((s) => s?.name === a.name);
    if (!style) throw new Error(`“${String(a.name)}” is not in My library.`);
    const { id: sid, color, name, ...settings } = style;
    c.ed.sheetTab.value = 'look';
    run(
      c,
      {
        type: 'character.update',
        payload: {
          character: {
            ...chr,
            profile: {
              ...chr.profile,
              hat: 'None',
              hair: 'Custom',
              hairColor: color,
              customHair: { ...settings, name, from: sid },
            },
          },
        },
      },
      `Hairstyle: ${name}`,
    );
  },
  /** draws a mark (a star, or a filled side) on a part's side of the open character, as one undo step */
  drawMark(c, a) {
    const id = c.ed.studioCharacter.value;
    const chr = id ? c.ed.store.get<Character>(paths.character(id)) : undefined;
    if (!chr) throw new Error('Open a character first.');
    const part = String(a.part ?? 'head');
    const side = Number(a.side ?? 0);
    c.ed.sheetTab.value = 'draw';
    c.ed.drawPart.value = part;
    c.ed.drawSide.value = side;
    const cv = document.createElement('canvas');
    cv.width = 384;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const paint = { ...((chr.profile.paint as Record<string, string> | undefined) ?? {}) };
    const old = paint[part];
    const draw = () => {
      const x = (side % 3) * 128;
      const y = Math.floor(side / 3) * 128;
      g.fillStyle = String(a.color ?? '#c91a09');
      if (a.mark === 'fill') g.fillRect(x, y, 128, 128);
      else {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 7 : 16;
          const t = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(x + 38 + r * Math.cos(t), y + 62 + r * Math.sin(t));
        }
        g.fill();
      }
      paint[part] = cv.toDataURL('image/png');
      run(
        c,
        { type: 'character.update', payload: { character: { ...chr, profile: { ...chr.profile, paint } } } },
        `Draw on the ${part}`,
      );
    };
    if (!old) return draw();
    return new Promise<void>((ok) => {
      const img = new Image();
      img.onload = () => {
        g.drawImage(img, 0, 0);
        draw();
        ok();
      };
      img.onerror = () => {
        draw();
        ok();
      };
      img.src = old;
    });
  },
  // P22 part 3: the creatures course
  bodyMake(c, a) {
    const name = String(a.name ?? 'Rex');
    const family = String(a.family ?? 'fourLegs') as NonNullable<Character['body']>['family'];
    const has = c.ed.store
      .list('characters/')
      .map((p) => c.ed.store.get<Character>(p)!)
      .find((x) => x?.name === name);
    if (has) {
      c.ed.studioCharacter.value = has.id;
      if (has.body?.family !== family && !has.body?.plan)
        run(
          c,
          { type: 'character.update', payload: { character: { ...has, body: { ...(has.body ?? {}), family } } } },
          `Body: ${family}`,
        );
    } else {
      const id = newId('character');
      const sp = mapDoc(c).spawns[0];
      const at = arrivalSpot(c.ed.store, map(c)) ?? (sp?.pos as [number, number, number] | undefined) ?? [0, 0.4, 0];
      run(
        c,
        [
          {
            type: 'character.create',
            payload: { character: { id, name, role: 'npc', profile: { name }, body: { family } } },
          },
          {
            type: 'npc.place',
            payload: { map: map(c), character: id, pos: [at[0] + 3, at[1], at[2] + 3], heading: Math.PI },
          },
        ],
        `Add ${name}`,
      );
      c.ed.studioCharacter.value = id;
    }
    c.ed.charTab.value = 'look';
    c.ed.sheetTab.value = 'body';
  },
  bodyParams(c, a) {
    const chr = studioChr(c);
    run(
      c,
      {
        type: 'character.update',
        payload: {
          character: {
            ...chr,
            body: { ...(chr.body ?? {}), params: { ...(chr.body?.params ?? {}), ...(a as object) } },
          },
        },
      },
      'Body sliders',
    );
  },
  bodyColors(c, a) {
    const chr = studioChr(c);
    run(
      c,
      {
        type: 'character.update',
        payload: {
          character: {
            ...chr,
            body: { ...(chr.body ?? {}), colors: { ...(chr.body?.colors ?? {}), ...(a as object) } },
          },
        },
      },
      'Body colours',
    );
  },
  bodyEditSkeleton(c) {
    const chr = studioChr(c);
    if (chr.body?.plan) return;
    const family = chr.body?.family ?? 'fourLegs';
    const made = makeFamily(family, chr.body?.params);
    if (!made) throw new Error('Pick a family first.');
    const plan = { id: newId('bodyplan'), name: `${chr.name} body`.slice(0, 40), family, ...made };
    const { family: _f, ...keep } = chr.body ?? {};
    run(
      c,
      [
        { type: 'bodyplan.put', payload: { plan } },
        { type: 'character.update', payload: { character: { ...chr, body: { ...keep, plan: plan.id } } } },
      ],
      'Edit the skeleton',
    );
    c.ed.bodyBones.value = true;
  },
  bodyBone(c, a) {
    const chr = studioChr(c);
    const plan = chr.body?.plan ? c.ed.store.get<BodyPlan>(paths.bodyplan(chr.body.plan)) : null;
    if (!plan) throw new Error('Edit the skeleton first.');
    const name = String(a.name ?? 'horn');
    const bone = {
      name,
      parent: String(a.parent ?? 'head'),
      at: (a.at ?? [0, 1.6, 0]) as Bone['at'],
      role: (a.role ?? 'other') as Bone['role'],
      swing: Number(a.swing ?? 0),
    };
    const bricks = a.brick ? [{ bone: name, ...(a.brick as object) } as BodyPlan['bricks'][number]] : [];
    const has = plan.bones.some((b) => b.name === name);
    run(
      c,
      {
        type: 'bodyplan.put',
        payload: {
          plan: {
            ...plan,
            bones: has ? plan.bones.map((b) => (b.name === name ? bone : b)) : [...plan.bones, bone],
            bricks: [...plan.bricks.filter((k) => k.bone !== name), ...bricks],
          },
        },
      },
      `Add ${name}`,
    );
    c.ed.bodyBone.value = name;
  },
  /** 10d part 3: paints every brick on a bone (Paint and sculpt on the preview, done for you) */
  bodyPaintBone(c, a) {
    const chr = studioChr(c);
    const plan = chr.body?.plan ? c.ed.store.get<BodyPlan>(paths.bodyplan(chr.body.plan)) : null;
    if (!plan) throw new Error('Edit the skeleton first.');
    const bone = String(a.bone);
    const color = String(a.color);
    c.ed.bodySculpt.value = { mode: 'paint', color, kind: 'plate', w: 1, d: 1 };
    run(
      c,
      {
        type: 'bodyplan.put',
        payload: { plan: { ...plan, bricks: plan.bricks.map((k) => (k.bone === bone ? { ...k, color } : k)) } },
      },
      'Paint a brick',
    );
  },
  bodyBoneSet(c, a) {
    const chr = studioChr(c);
    const plan = chr.body?.plan ? c.ed.store.get<BodyPlan>(paths.bodyplan(chr.body.plan)) : null;
    if (!plan) throw new Error('Edit the skeleton first.');
    const name = String(a.bone);
    const { bone: _b, ...set } = a as Record<string, unknown>;
    run(
      c,
      {
        type: 'bodyplan.put',
        payload: { plan: { ...plan, bones: plan.bones.map((b) => (b.name === name ? { ...b, ...set } : b)) } },
      },
      `Bone ${name}`,
    );
    c.ed.bodyBone.value = name;
  },
  dialogueTalkTo(c, a) {
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const n = s.world.npcs.find((x) => String(x.profile.name ?? '') === String(a.name)) ?? s.world.npcs[0];
    if (!n) throw new Error('Nobody is on this map.');
    s.placeAt([n.state.x, n.state.y + 0.2, n.state.z - 2], 0);
    s.talk();
  },
  // P27 part 3: the big worlds course
  startOnThisMap(c) {
    const m = mapDoc(c);
    run(
      c,
      { type: 'project.update', payload: { entryMap: m.id, entrySpawn: m.spawns[0]?.id ?? null } },
      'project.update',
    );
  },
  tripToFirstMap(c) {
    // what walking through a gate does: the hero goes to the map (behind a loading screen if it is not loaded)
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const first = c.ed.store.get<Gates>(paths.gates)?.mapOrder[0];
    if (first) s.goTo(first, '');
  },
  // Milestone 2b: the water and physics course
  looseAsset(c, a) {
    // what ticking Loose in the asset studio does
    const def = assetByName(c, String(a.name));
    const own = def ? c.ed.store.get<Asset>(paths.asset(def.id)) : null;
    if (!own) throw new Error(`Place a ${a.name} on the map first.`);
    if (!own.loose) run(c, { type: 'asset.update', payload: { asset: { ...own, loose: true } } }, 'Loose');
  },
  waterAroundLoose(c) {
    // what right-clicking the ground beside the crate and picking Add water here does
    const copy = looseCopies(c.ed)[0];
    if (!copy) throw new Error('Make an asset loose and place it on the map first.');
    if (!placeWaterAt(c.ed, { x: copy.x, y: copy.y, z: copy.z }, 'pool'))
      throw new Error('The water could not be added.');
  },
  standOnLoose(c) {
    // what jumping onto the floating crate does: the hero lands on its top
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    if (!s.physicsMovement) throw new Error('Set Project › Movement to Physics first, then play again.');
    const o = s.world.looseObjects[0];
    const pose = o && s.world.physics?.objectPose(o.inst.inst.id);
    if (!pose) throw new Error('There is no loose thing on this map.');
    s.placeAt([pose.pos[0], pose.pos[1] + 2.5, pose.pos[2]], s.heroState.heading);
  },
  // step 11b part 2: the swimming course
  deepPool(c) {
    // what Dock › Water › Place does: a pool, 3 studs deep, beside the start
    if (waterItems(c.ed).some((w) => w.size[1] >= 2.5)) return;
    const sp = mapDoc(c).spawns[0]?.pos ?? [0, 0, 0];
    if (!placeWaterAt(c.ed, { x: sp[0]! + 9, y: Math.round(sp[1]! / 0.4), z: sp[2]! }, 'pool'))
      throw new Error('The water could not be added.');
  },
  chestInPool(c) {
    // what placing the Treasure chest on the pool's floor does
    const w = waterItems(c.ed).find((x) => x.size[1] >= 2.5);
    if (!w) throw new Error('Add a pool first.');
    const def = assetByName(c, 'Treasure chest');
    if (!def) throw new Error('No Treasure chest.');
    if (!c.ed.store.has(paths.asset(def.id))) {
      const b = builtinAsset(def.id);
      if (b) run(c, { type: 'asset.create', payload: { asset: b } }, 'Add Treasure chest');
    }
    // somewhere on the pool's floor where it stands on studs (the middle first)
    const cx = Math.round(w.pos[0] + w.size[0] / 2);
    const cz = Math.round(w.pos[2] + w.size[2] / 2);
    const y0 = Math.round(w.pos[1] / 0.4);
    for (let r = 0; r <= 3; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (const dy of [0, 1, -1, 2, 3]) {
            const cmd = {
              type: 'asset.place',
              payload: { map: map(c), asset: def.id, pos: [cx + dx, y0 + dy, cz + dz] },
            };
            if (c.ed.exec(cmd, { label: 'Place Treasure chest' }).ok) return;
          }
        }
    throw new Error('No room for the chest on the pool’s floor.');
  },
  swimBreath(c, a) {
    run(
      c,
      { type: 'project.update', payload: { swimming: { can: true, breath: Number(a?.breath ?? 30) } } },
      'Swimming',
    );
  },
  diveInPool(c) {
    // what walking into the pool and holding E (Dive) does: the hero ends up under the surface
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const w = waterItems(c.ed).find((x) => x.size[1] >= 2.5);
    if (!w) throw new Error('Add a pool first.');
    s.placeAt([w.pos[0] + 1.5, w.pos[1] + 0.05, w.pos[2] + 1.5], s.heroState.heading);
  },
  // step 11, 4a: the starter pack course
  packPlace(c, a) {
    const slug = String(a?.slug ?? '');
    const item = ADVENTURE_PACK.cast.find((x) => x.slug === slug);
    if (!item) throw new Error(`No ${slug} in the pack.`);
    c.ed.dock.value = 'pack';
    if (!placePackCharacter(c.ed, item)) throw new Error(`${item.character.name} could not be placed.`);
  },
  packHero(c, a) {
    const item = ADVENTURE_PACK.cast.find((x) => x.slug === String(a?.slug ?? 'rook'));
    if (!item) throw new Error('No hero in the pack.');
    c.ed.dock.value = 'pack';
    if (!makePackHero(c.ed, item)) throw new Error('It could not be made the player character.');
  },
  // step 11, 4c: the Scripts and scenes course
  packPlaceN(c, a) {
    const item = ADVENTURE_PACK.cast.find((x) => x.slug === String(a?.slug ?? ''));
    if (!item) throw new Error(`No ${String(a?.slug)} in the pack.`);
    c.ed.dock.value = 'pack';
    const want = Number(a?.count ?? 1);
    const have = (c.ed.store.get<Instances>(paths.instances(c.ed.mapId.value))?.items ?? []).filter(
      (i) => i.kind === 'npc' && i.character === item.id,
    ).length;
    for (let i = have; i < want; i++)
      if (!placePackCharacter(c.ed, item)) throw new Error(`${item.character.name} could not be placed.`);
  },
  makeTemplate(c, a) {
    // what filling in the template's form and pressing Make it does
    const kind = a?.kind === 'cutscene' ? 'cutscene' : 'script';
    const t = (kind === 'script' ? SCRIPT_TEMPLATES : CUTSCENE_TEMPLATES).find((x) => x.id === String(a?.id));
    if (!t) throw new Error(`No template ${String(a?.id)}.`);
    const given = (a?.answers ?? {}) as Record<string, string | number>;
    const answers = Object.fromEntries(t.fields.map((f) => [f.key, given[f.key] ?? defaultAnswer(c.ed, f)]));
    const r =
      kind === 'script'
        ? useScriptTemplate(c.ed, t as (typeof SCRIPT_TEMPLATES)[number], answers)
        : useCutsceneTemplate(c.ed, t as (typeof CUTSCENE_TEMPLATES)[number], answers);
    if ('error' in r) throw new Error(r.error);
  },
  defeatAll(c, a) {
    // what beating each of them in a fight does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const name = String(a?.name ?? '');
    for (let i = 0; i < 12 && s.world.npcs.some((n) => String(n.profile.name ?? '') === name); i++)
      s.damage(name, 99, 'slash');
  },
  arenaZone(c) {
    // what drawing a zone with the Zone tool does: an 8 by 8 Arena 9 studs in front of the start
    if (mapDoc(c).zones.some((z) => z.tags[0] === 'Arena')) return;
    const sp = mapDoc(c).spawns[0];
    const at = sp?.pos ?? [0, 0.4, 0];
    const yaw = sp?.yaw ?? 0;
    const cx = Math.round(at[0] + Math.sin(yaw) * 9);
    const cz = Math.round(at[2] + Math.cos(yaw) * 9);
    run(
      c,
      {
        type: 'map.addZone',
        payload: {
          map: map(c),
          zone: { min: [cx - 4, at[1], cz - 4], max: [cx + 4, at[1] + 4, cz + 4], tags: ['Arena'] },
        },
      },
      'Add trigger zone',
    );
  },
  async winArena(c) {
    // what walking into the arena and beating every wave does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const z = s.world.doc.zones.find((x) => x.tags[0] === 'Arena');
    if (!z) throw new Error('Make the Arena zone first.');
    s.placeAt([(z.min[0] + z.max[0]) / 2, z.min[1], (z.min[2] + z.max[2]) / 2], s.heroState.heading);
    for (let i = 0; i < 60 && String(s.logic.vars.get('wave')) !== '-1'; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (s.world.npcs.some((n) => String(n.profile.name ?? '') === 'Rattlebones'))
        s.damage('Rattlebones', 99, 'slash');
    }
  },
  writeOwnRules(c) {
    // what typing the rules in Logic's Code view does
    if (c.ed.store.list('logic/').some((p) => c.ed.store.get<LogicGraph>(p)?.name === 'My own rules')) return;
    const parsed = parseCode(OWN_RULES);
    if ('error' in parsed) throw new Error(parsed.error.message);
    const r = withIds(parsed, nameBook(c.ed.store));
    const id = newId('logic');
    run(
      c,
      {
        type: 'logic.create',
        payload: { graph: { id, name: 'My own rules', scope: 'global', nodes: r.nodes, edges: r.edges } },
      },
      'New logic file',
    );
    c.ed.logicGraph.value = id;
  },
  bringBack(c, a) {
    // what deleting the file (×) and pressing Use in this game in My library does
    const name = String(a?.name ?? '');
    const item = library().items.value.find((i) => i.name === name);
    if (!item) throw new Error(`Save “${name}” to My library first.`);
    for (const p of c.ed.store.list('logic/')) {
      const g = c.ed.store.get<LogicGraph>(p);
      if (g?.name === name) run(c, { type: 'logic.delete', payload: { graph: g.id } }, 'Delete logic file');
    }
    c.ed.dock.value = 'library';
    useLibraryItem(c.ed, item);
  },
  exportPack(c) {
    // what pressing Export pack in My library does
    c.ed.dock.value = 'library';
    exportLibrary(library().items.value);
  },
  stopIfPlaying(c) {
    if (c.ed.session.value) c.ui.stopPlay();
  },
  // step 12a: the Puzzles course
  placePuzzle(c, a) {
    // what clicking a Puzzle pieces card and then the ground does: `ahead` studs in front of the start (its
    // near edge), `side` studs to its right, on the ground there
    const name = String(a?.name ?? '');
    const def = assetByName(c, name);
    if (!def) throw new Error(`No ${name} in the pack.`);
    // `count`: how many of it the step wants on the map (a second Branch); one by default
    const have = (c.ed.store.get<Instances>(paths.instances(map(c)))?.items ?? []).filter(
      (i) => i.kind === 'asset' && assetByName(c, name)?.id === i.asset,
    ).length;
    if (have >= Number(a?.count ?? 1)) return;
    c.ed.dock.value = 'pack';
    const sp = mapDoc(c).spawns[0];
    const at = sp?.pos ?? [0, 0.4, 0];
    const yaw = sp?.yaw ?? 0;
    const f: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
    const r: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    const [w, d] = def.footprint;
    const ahead = Number(a?.ahead ?? 4) + d / 2;
    const side = Number(a?.side ?? 0);
    const x0 = Math.round(at[0] + f[0] * ahead + r[0] * side - w / 2);
    const z0 = Math.round(at[2] + f[1] * ahead + r[1] * side - d / 2);
    const s = surfaceOf(c.ed.store, map(c));
    let top = 0;
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) top = Math.max(top, s.topAt(x, z) ?? 0);
    // `rot`: quarter turns; `faceStart`: turned so its front (a fan's blast) faces back toward the start
    let rot = Number(a?.rot ?? 0);
    if (a?.faceStart) {
      const want: [number, number] = [-f[0], -f[1]];
      let best = -2;
      for (let q = 0; q < 4; q++) {
        const p0 = localToWorld(def, { pos: [0, 0, 0], rot: q }, [0, 0, 0]);
        const p1 = localToWorld(def, { pos: [0, 0, 0], rot: q }, [0, 0, 1]);
        const dot = (p1[0] - p0[0]) * want[0] + (p1[2] - p0[2]) * want[1];
        if (dot > best) {
          best = dot;
          rot = q;
        }
      }
    }
    run(c, placeCommands(c.ed, def.id, [x0, top, z0], rot), `Place ${name}`);
  },
  async pushOntoSwitch(c, a) {
    // what holding Action (Grab) and walking into the block does, until it slides onto the switch: the hero leans in
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const block = s.world.instances.find((i) => i.def.name === String(a?.block ?? 'Push block'));
    const sw = s.world.instances.find((i) => i.def.name === String(a?.switch ?? 'Weight switch'));
    if (!block || !sw) throw new Error('Place the block and the switch first.');
    const dx = Math.sign(Number(sw.inst.pos[0]) - Number(block.inst.pos[0]));
    const dz = Math.sign(Number(sw.inst.pos[2]) - Number(block.inst.pos[2]));
    // the hero stands behind it, facing it, and walks (W) into it, the camera behind
    const yaw = Math.atan2(dx, dz);
    standAt(s, Number(block.inst.pos[0]) + 1 - dx * 1.6, Number(block.inst.pos[2]) + 1 - dz * 1.6, yaw);
    s.camYaw = Math.atan2(-dx, -dz);
    // hold Action (Grab) and walk forward (W)
    s.puzzles.setGrab(true);
    s.input.keys.add('forward');
    try {
      for (let i = 0; i < 40 && sw.state === sw.def.states[0]; i++) await new Promise((r) => setTimeout(r, 250));
    } finally {
      s.input.keys.delete('forward');
      s.puzzles.setGrab(false);
    }
    // a slow machine: shove it the rest of the way
    for (let i = 0; i < 3 && sw.state === sw.def.states[0]; i++) {
      s.puzzles.tryMove(block, dx, dz, false);
      await new Promise((r) => setTimeout(r, 900));
    }
  },
  async pullBlock(c, a) {
    // what holding Action (Grab) at the block and stepping back (S) does: the hero sits back and pulls
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const block = s.world.instances.find((i) => i.def.name === String(a?.block ?? 'Push block'));
    if (!block) throw new Error('Place the block first.');
    const sp = s.world.doc.spawns[0];
    const yaw = sp?.yaw ?? 0;
    const dx = Math.round(Math.sin(yaw));
    const dz = Math.round(Math.cos(yaw));
    // the hero in front of it on the side of the start, facing it, pulls it back towards the start
    standAt(s, Number(block.inst.pos[0]) + 1 - dx * 1.6, Number(block.inst.pos[2]) + 1 - dz * 1.6, yaw);
    const from = `${block.inst.pos[0]},${block.inst.pos[2]}`;
    const moved = () => `${block.inst.pos[0]},${block.inst.pos[2]}` !== from;
    s.camYaw = Math.atan2(-dx, -dz);
    s.puzzles.setGrab(true);
    s.input.keys.add('back');
    try {
      for (let i = 0; i < 40 && !moved(); i++) await new Promise((r) => setTimeout(r, 250));
      // hold on a moment, so the pull shows
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      s.input.keys.delete('back');
      s.puzzles.setGrab(false);
    }
    if (!moved()) {
      s.puzzles.tryMove(block, -dx, -dz, true);
      await new Promise((r) => setTimeout(r, 900));
    }
  },
  // step 12b: the Fire and light course
  async burnVines(c) {
    // what walking over a Branch (it comes out in the hand), walking its end into the Burning torch's flame (it
    // catches) and then up to the vines (they catch, and the stick burns up with them) does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    await takePickup(s, 'Branch', 'Branch');
    await lightBranch(s);
    const vines = s.world.instances.find((i) => i.def.name === 'Vines');
    if (!vines) return;
    for (const gap of [0.6, 0.3, 0, -0.2]) {
      if (s.fireLight.burning.has(vines.inst.id) || !s.fireLight.litBranch) break;
      faceThing(s, vines, gap);
      await wait(400);
    }
    for (let i = 0; i < 30 && s.world.instances.includes(vines); i++) await wait(250);
  },
  async lightTorch(c) {
    // what taking the other Branch, lighting it at the Burning torch and walking its end into the torch stand does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    await takePickup(s, 'Branch', 'Branch');
    await lightBranch(s);
    const stand = s.world.instances.find((i) => i.def.name === 'Torch stand');
    if (!stand) throw new Error('Place a Torch stand first.');
    for (const gap of [0.6, 0.3, 0.1]) {
      if (stand.state === stand.def.states[1]) break;
      faceThing(s, stand, gap);
      lineUpTip(s);
      await wait(400);
    }
    await wait(300);
  },
  // step 12c: the Ice, platforms and climbing course
  async slideIceBlock(c) {
    // what holding Action (Grab) at the ice block and pushing it (W) does: it slides on by itself
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const b = s.world.instances.find((i) => i.def.name === 'Ice block');
    if (!b) throw new Error('Place an Ice block first.');
    const yaw = s.world.doc.spawns[0]?.yaw ?? 0;
    // behind it, on the start's side, facing away from the start
    faceThing(s, b, 0.15, [-Math.round(Math.sin(yaw)), -Math.round(Math.cos(yaw))]);
    await wait(300);
    s.puzzles.setGrab(true);
    s.camYaw = s.heroState.heading + Math.PI;
    s.input.keys.add('forward');
    const was = Number(b.inst.pos[0]) + Number(b.inst.pos[2]);
    for (let i = 0; i < 30 && Number(b.inst.pos[0]) + Number(b.inst.pos[2]) === was; i++) await wait(100);
    s.input.keys.delete('forward');
    s.puzzles.setGrab(false);
    await wait(1500);
  },
  // step 12c-2: the Wind, water and throwing course
  async walkIntoWind(c) {
    // what walking (W) from the start straight toward the fan does: into its wind, leaning into it
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const fan = s.world.instances.find((i) => i.def.wind);
    if (!fan) throw new Error('Place a Fan first.');
    const b = fan.bricks;
    const cx = (Math.min(...b.map((q) => q.x)) + Math.max(...b.map((q) => q.x)) + 1) / 2;
    const cz = (Math.min(...b.map((q) => q.z)) + Math.max(...b.map((q) => q.z)) + 1) / 2;
    const sp = s.world.doc.spawns[0]?.pos ?? [0, 0, 0];
    // at the start, facing the fan, the camera behind
    const yaw = Math.atan2(cx - sp[0]!, cz - sp[2]!);
    standAt(s, sp[0]!, sp[2]!, yaw);
    s.camYaw = yaw + Math.PI;
    s.input.keys.add('forward');
    try {
      for (let i = 0; i < 60 && !logged(s, 'Walking into the wind'); i++) await wait(150);
      await wait(1200);
    } finally {
      s.input.keys.delete('forward');
    }
    if (!logged(s, 'Walking into the wind')) throw new Error('The fan’s wind does not reach the way to it: turn the fan so its front faces the start.');
  },
  async gustAt(c, a) {
    // what picking up the Gust leaf, taking it out (its button) and swinging it (F) at a thing does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    await takePickup(s, 'Gust leaf', 'Gust leaf');
    if (!s.leafOut) s.useItem('Gust leaf', slotOf(s, 'Gust leaf'));
    const name = String(a?.name ?? 'Pinwheel');
    const o = s.world.instances.find((i) => i.def.name === name);
    if (!o) throw new Error(`Place a ${name} first.`);
    faceThing(s, o, 2.5);
    await wait(300);
    const want = String(a?.until ?? '');
    for (let i = 0; i < 4 && !(want && logged(s, want)); i++) {
      s.leafGust();
      await wait(700);
    }
  },
  async throwRockAt(c, a) {
    // what lifting the Rock (Action), walking and pressing Action again at the target does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const target = s.world.instances.find((i) => i.def.name === String(a?.target ?? 'Crystal switch'));
    if (!target) throw new Error('Place the Crystal switch first.');
    const fl = s.fireLight;
    for (let tries = 0; tries < 3 && target.state === target.def.states[0]; tries++) {
      if (!fl.held) {
        const rock = s.world.instances.find((i) => i.def.name === String(a?.name ?? 'Rock'));
        const lying = fl.bombs.find((b) => b.thing);
        if (rock) {
          faceThing(s, rock, 0.1);
          await wait(200);
          fl.liftThing(rock);
        } else if (lying) fl.lift(lying);
        else throw new Error('Place a Rock first.');
        for (let i = 0; i < 30 && (!fl.held || fl.busy); i++) await wait(100);
      }
      // about six studs short of it, facing it: the throw (Action while walking)
      faceThing(s, target, 5.2);
      await wait(300);
      fl.throwHeld();
      for (let i = 0; i < 20 && target.state === target.def.states[0]; i++) await wait(150);
    }
  },
  async swimRiver(c) {
    // what walking into the river does (it is deep: the hero swims, and the current carries it), then holding
    // Action (Dive) a moment to go under
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const w = s.waterBoxes().find((b) => b.current[0] || b.current[1]);
    if (!w) throw new Error('Place a River first.');
    // at its near bank, upstream, facing it
    const sp = s.world.doc.spawns[0]?.pos ?? [0, 0, 0];
    const near = Math.abs(w.z0 - sp[2]!) < Math.abs(w.z1 - sp[2]!) ? w.z0 - 1.2 : w.z1 + 1.2;
    const into = near < w.z0 ? 1 : -1;
    const yaw = into > 0 ? 0 : Math.PI;
    standAt(s, w.x0 + 4, near, yaw);
    s.camYaw = yaw + Math.PI;
    s.input.keys.add('forward');
    try {
      for (let i = 0; i < 30 && !s.swim.on; i++) await wait(150);
    } finally {
      s.input.keys.delete('forward');
    }
    await wait(800);
    s.swim.down = true;
    await wait(1500);
    s.swim.down = false;
    await wait(1200);
  },
  placeRiver(c) {
    // what Dock › Water › River and a click behind the start does: a deep river flowing across, its current 3 studs a
    // second, the start near its upstream end
    const items = c.ed.store.get<Instances>(paths.instances(map(c)))?.items ?? [];
    if (items.some((i) => i.kind === 'water' && i.body === 'river')) return;
    const sp = mapDoc(c).spawns[0];
    const at = sp?.pos ?? [0, 0.4, 0];
    const yaw = sp?.yaw ?? 0;
    // behind the start: 12 studs back
    const bx = at[0]! - Math.sin(yaw) * 12;
    const bz = at[2]! - Math.cos(yaw) * 12;
    if (!placeWaterAt(c.ed, { x: bx + 18, y: Math.round(at[1]! / 0.4), z: bz }, 'river'))
      throw new Error('Could not place the river there.');
  },
  async meltIceWall(c) {
    // what picking up the Branch, holding its end in the Burning torch's flame and touching the ice wall with it does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    await takePickup(s, 'Branch', 'Branch');
    for (let i = 0; i < 10 && !s.stickOut; i++) await wait(150);
    await lightBranch(s);
    const w = s.world.instances.find((i) => i.def.name === 'Ice wall');
    if (!w) return;
    for (const gap of [0.6, 0.3, 0.1]) {
      if (s.fireLight.melting.has(w.inst.id) || !s.fireLight.litBranch) break;
      faceThing(s, w, gap);
      lineUpTip(s);
      await wait(500);
    }
    for (let i = 0; i < 30 && s.world.instances.includes(w); i++) await wait(200);
  },
  async ridePlatform(c) {
    // what jumping onto the moving platform does: the hero rides it there and back
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const p = s.world.instances.find((i) => i.def.name === 'Moving platform');
    if (!p) throw new Error('Place a Moving platform first.');
    const xs = p.bricks.map((b) => b.x);
    const zs = p.bricks.map((b) => b.z);
    const ys = p.bricks.map((b) => b.y);
    s.placeAt(
      [
        (Math.min(...xs) + Math.max(...xs) + 1) / 2,
        (Math.max(...ys) + 1) * 0.4,
        (Math.min(...zs) + Math.max(...zs) + 1) / 2,
      ],
      s.heroState.heading,
    );
    s.camYaw = s.heroState.heading + Math.PI + 0.8;
    s.camPitch = 0.45;
    for (let i = 0; i < 30 && !s.platforms.ride; i++) await wait(150);
    await wait(2500);
  },
  setClimbing(c, a) {
    // what Project › Climbing does
    run(
      c,
      { type: 'project.update', payload: { climbing: (a?.to as 'ladders' | 'anything') ?? 'anything' } },
      'Climbing',
    );
  },
  async climbWall(c) {
    // what walking into the rock face and holding W does (Climbing: Anything): up, and over the top
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const r = s.world.instances.find((i) => i.def.name === 'Rock face');
    if (!r) throw new Error('Place a Rock face first.');
    faceThing(s, r, 0.05);
    await wait(300);
    s.camYaw = s.heroState.heading + Math.PI;
    s.camPitch = 0.3;
    s.input.keys.add('forward');
    for (let i = 0; i < 120 && !s.events.some((e) => e.msg.includes('Over the top of the wall')); i++) await wait(150);
    await wait(600);
    s.input.keys.delete('forward');
  },
  async blastWall(c) {
    // what pressing Action at the Bomb flower (a lit bomb held up), facing the wall from a few studs away and
    // throwing it (Action while walking) does — again with the bomb the flower grows after a miss, until the wall breaks
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const wall = s.world.instances.find((i) => i.def.name === 'Cracked wall');
    const plant = s.world.instances.find((i) => i.def.name === 'Bomb flower');
    if (!wall || !plant) throw new Error('Place a Cracked wall and a Bomb flower first.');
    const broken = () =>
      !s.world.instances.includes(wall) ||
      (s as unknown as { smashedIds(): Set<string> }).smashedIds().has(wall.inst.id);
    for (let tries = 0; tries < 3 && !broken(); tries++) {
      for (let i = 0; i < 30 && plant.state !== plant.def.states[0]; i++) await wait(150);
      faceThing(s, plant, 0.4);
      await wait(250);
      if (!s.fireLight.pick(plant)) continue;
      // up over the head (the game may run slower than the clock)
      for (let i = 0; i < 40 && s.fireLight.carryPose !== 'hold'; i++) await wait(100);
      // a few studs back from the wall, facing it, then the throw
      faceThing(s, wall, 3.2);
      await wait(300);
      s.fireLight.throwHeld();
      for (let i = 0; i < 40 && s.fireLight.busy; i++) await wait(100);
      // step back from the blast
      const yaw = s.heroState.heading;
      standAt(s, s.heroState.x - Math.sin(yaw) * 3, s.heroState.z - Math.cos(yaw) * 3, yaw);
      for (let i = 0; i < 30 && s.fireLight.bombs.length; i++) await wait(150);
      await wait(400);
    }
  },
  placeBeamPuzzle(c) {
    // what placing a Sun crest (turned to shine away from the start), a Mirror in its beam and a Light sensor beside
    // the mirror does: the mirror at first sends the beam away from the sensor
    const place = (name: string, ahead: number, side: number, rot: number) => {
      const def = assetByName(c, name);
      if (!def) throw new Error(`No ${name} in the pack.`);
      const have = (c.ed.store.get<Instances>(paths.instances(map(c)))?.items ?? []).some(
        (i) => i.kind === 'asset' && i.asset === def.id,
      );
      if (have) return;
      const sp = mapDoc(c).spawns[0];
      const at = sp?.pos ?? [0, 0.4, 0];
      const yaw = sp?.yaw ?? 0;
      const f: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
      const r: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
      const [w, d] = def.footprint;
      const x0 = Math.round(at[0] + f[0] * (ahead + d / 2) + r[0] * side - w / 2);
      const z0 = Math.round(at[2] + f[1] * (ahead + d / 2) + r[1] * side - d / 2);
      const surf = surfaceOf(c.ed.store, map(c));
      let top = 0;
      for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) top = Math.max(top, surf.topAt(x, z) ?? 0);
      run(c, placeCommands(c.ed, def.id, [x0, top, z0], rot), `Place ${name}`);
    };
    c.ed.dock.value = 'pack';
    // ahead and to the right of the start (a positive side is the left), clear of the vines (back after Stop) and
    // of the torch stand, in the play camera's view: the crest shines across to the right into the mirror; the sensor is beyond the mirror, where the mirror
    // sends the beam once it is turned (at first it sends it the other way, back toward the start)
    const sp = mapDoc(c).spawns[0];
    const yaw = sp?.yaw ?? 0;
    const f: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
    const r: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
    // a turn k sends the crest's front (local +z) to: 0 +z, 1 -x, 2 -z, 3 +x
    const FRONT: [number, number][] = [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ];
    // the crest's front faces right (-r)
    const rot = [0, 1, 2, 3].reduce((b, k) =>
      -(FRONT[k]![0] * r[0] + FRONT[k]![1] * r[1]) > -(FRONT[b]![0] * r[0] + FRONT[b]![1] * r[1]) ? k : b,
    );
    const [dx, dz] = FRONT[rot]!;
    // turned once more, a mirror leans the other way in each state. Its second state sends a beam going (dx, dz) on
    // to (dz, dx) unturned, to (-dz, -dx) turned once: pick the turn that sends it on away from the start, so the
    // hero turning the mirror from the start side sees the crest, the mirror and the sensor all ahead
    let out: [number, number] = [dz, dx];
    let mrot = 0;
    if (out[0] * f[0] + out[1] * f[1] < 0) {
      out = [-dz, -dx];
      mrot = 1;
    }
    const ahead = 9;
    const side = -12;
    place('Sun crest', ahead, -4, rot);
    place('Mirror', ahead - 1.5, side, mrot);
    place(
      'Light sensor',
      ahead - 1 + Math.round((out[0] * f[0] + out[1] * f[1]) * 6),
      side + Math.round((out[0] * r[0] + out[1] * r[1]) * 6),
      0,
    );
  },
  async turnMirror(c) {
    // what holding the mirror (Grab, Action held) and pushing it (W) does, once or twice until the sensor lights
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const m = s.world.instances.find((i) => i.def.name === 'Mirror');
    const sensor = s.world.instances.find((i) => i.def.name === 'Light sensor');
    if (!m || !sensor) throw new Error('Place the Mirror and the Light sensor first.');
    const yaw = s.world.doc.spawns[0]?.yaw ?? 0;
    const side: [number, number] = [-Math.round(Math.sin(yaw)), -Math.round(Math.cos(yaw))];
    for (let i = 0; i < 2 && sensor.state !== sensor.def.states[1]; i++) {
      // up against it on the start's side, held, and pushed for a moment: it turns round where it stands
      faceThing(s, m, 0.05, side);
      await wait(200);
      s.puzzles.setGrab(true);
      s.camYaw = s.heroState.heading + Math.PI;
      s.input.keys.add('forward');
      for (let t = 0; t < 12 && s.puzzles.pose !== 'push'; t++) await wait(100);
      const was = m.state;
      for (let t = 0; t < 20 && m.state === was; t++) await wait(100);
      s.input.keys.delete('forward');
      s.puzzles.setGrab(false);
      await wait(300);
    }
    // a step back and toward the crest's side, so the hero does not hide the mirror and the sensor beyond it
    faceThing(s, m, 0.8, side);
    standAt(
      s,
      s.heroState.x + Math.round(Math.cos(yaw)) * 1.3,
      s.heroState.z - Math.round(Math.sin(yaw)) * 1.3,
      s.heroState.heading,
    );
    // what dragging the play view up and scrolling out does: looking down on the whole puzzle from behind the hero
    s.camYaw = s.heroState.heading + Math.PI;
    s.camPitch = 0.8;
    s.zoom = 32;
    await wait(500);
  },
  timedCrystal(c, a) {
    // what Puzzle › Switch › Timed and the seconds slider do in the Asset studio
    const def = assetByName(c, 'Crystal switch');
    if (!def?.switch) throw new Error('Place a Crystal switch first.');
    const next = { ...def, switch: { ...def.switch, stays: 'timed' as const, seconds: Number(a?.seconds ?? 8) } };
    run(
      c,
      c.ed.store.has(paths.asset(def.id))
        ? [{ type: 'asset.update', payload: { asset: next } }]
        : [
            { type: 'asset.create', payload: { asset: def } },
            { type: 'asset.update', payload: { asset: next } },
          ],
      'Switch: Timed',
    );
    c.ui.editAsset(def.id);
  },
  hitSwitch(c, a) {
    // what a sword swing at the switch does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const sw = s.world.instances.find((i) => i.def.name === String(a?.name ?? 'Crystal switch'));
    if (!sw) throw new Error('Place the switch first.');
    s.puzzles.hit(sw, 'slash');
  },
  makeDungeon(c) {
    // what ticking This map is a dungeon in the Map tab does
    c.ed.right.value = 'map';
    if (!mapDoc(c).dungeon) run(c, { type: 'map.setDungeon', payload: { map: map(c), dungeon: true } }, 'Dungeon');
  },
  openChestAndDoor(c) {
    // what pressing Action at the chest, then at the door, does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const chest = s.world.instances.find((i) => i.def.name === 'Small chest');
    const door = s.world.instances.find((i) => i.def.name === 'Locked door');
    if (!chest || !door) throw new Error('Place the Small chest and the Locked door first.');
    for (const o of [chest, door]) {
      const so = o.sockets.find((x) => x.kind === 'interact');
      if (!so) continue;
      s.placeAt([so.world[0], s.heroState.y, so.world[2] + 0.6], Math.PI);
      s.stepInteract();
      s.interact();
    }
  },
  async saveToLibrary(c, a) {
    // what ticking it in Add from this game and pressing Save does
    const kind = String(a?.kind ?? 'script') as LibKind;
    const found = gameThings(c.ed, kind).find(([, n]) => n === String(a?.name));
    if (!found) throw new Error(`There is no ${String(a?.name)} in this game yet.`);
    const vars = (c.ed.store.get<Variables>(paths.variables)?.vars ?? {}) as Record<string, VarDef>;
    const it = gatherItem(c.ed.store, kind, found[0], { from: c.ed.store.manifest.name, vars });
    if (!it) throw new Error('It could not be saved.');
    await library().add([it]);
  },
  packLook(c, a) {
    c.ed.dock.value = 'pack';
    if (!setScreenLook(c.ed, a?.look === 'classic' ? 'classic' : 'adventure'))
      throw new Error('The screen look could not be changed.');
  },
  strikeFromBehind(c, a) {
    // what walking round behind it and swinging the sword does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const name = String(a?.name ?? '');
    const n = s.world.npcs.find((x) => String(x.profile.name ?? '') === name);
    if (!n) throw new Error(`${name} is not on this map.`);
    const h = n.state.heading;
    s.placeAt([n.state.x - Math.sin(h) * 1.6, n.state.y, n.state.z - Math.cos(h) * 1.6], h);
    s.damage(name, 2, 'slash');
  },
  openChestUnderwater(c) {
    // what swimming down to the chest and pressing E (Open) does
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const inst = s.world.instances.find((i) => i.def.name === 'Treasure chest');
    const so = inst?.sockets.find((x) => x.kind === 'interact');
    if (!so) throw new Error('Put the Treasure chest in the pool first.');
    s.placeAt([so.world[0]!, so.world[1]!, so.world[2]! + 0.9], Math.PI);
    s.runtime.stepOnce();
    s.buttons.update();
    if (s.buttons.now?.kind !== 'use') throw new Error('Swim up to the chest’s front and press E.');
    s.buttons.press('action');
    s.buttons.release('action');
  },
  // Milestone 2b, 10c part 5: the 3D models course
  placeModel(c, a) {
    // what pressing Place on a model in the dock does: it stands beside the start
    const ref = String((a as { ref?: string } | undefined)?.ref ?? 'builtin:lantern-post');
    const m =
      ref === 'own'
        ? modelChoices(c.ed).find((x) => x.ref.startsWith('sha256:'))
        : modelChoices(c.ed).find((x) => x.ref === ref);
    if (!m) throw new Error(ref === 'own' ? 'Import a model first.' : 'That model is not in the list.');
    const sp = c.ed.mapDoc.value?.spawns[0]?.pos ?? [0, 0, 0];
    if (
      !placeModelAt(
        c.ed,
        { x: sp[0]! + 5 + 4 * (modelItems(c.ed).length % 6), y: Math.round(sp[1]! / 0.4), z: sp[2]! + 5 },
        m.ref,
        m.name,
      )
    )
      throw new Error('The model could not be placed.');
  },
  async importSampleModel(c) {
    // what picking a .glb file in Import a model… does (here: the lantern post, as a file from a modelling tool)
    const bytes = fromBase64(BUILTIN_MODEL_FILES['lantern-post']!.glb);
    const file = new File([bytes as Uint8Array<ArrayBuffer>], 'my-lantern.glb', { type: 'model/gltf-binary' });
    if (!(await importModelFiles(c.ed, [file]))) throw new Error('The model could not be imported.');
  },
  async standOnModel(c) {
    // what jumping onto the model does: the hero lands on top of it
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    if (!s.physicsMovement) throw new Error('Set Project › Movement to Physics first, then play again.');
    const m = [...modelItems(c.ed)].reverse().find((x) => x.solid !== false);
    if (!m) throw new Error('Place a solid 3D model first.');
    const up = await prepareModel(m.model, c.ed.media ? (r) => c.ed.media!.get(r) : null);
    const b = drawBox(modelMatrix(m), up.data.min, up.data.max);
    s.placeAt([(b.min[0] + b.max[0]) / 2, b.max[1] + 1.5, (b.min[2] + b.max[2]) / 2], s.heroState.heading);
  },
  playIfStopped(c) {
    // P27 part 4: what pressing ▶ Play does, unless the game is already playing
    if (!c.ed.session.value) c.ui.play('engine');
  },
  walkFar(c) {
    // what holding W does: the hero walks out of the clearing (placed on the ground 80 studs north)
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    const sp = s.world.doc.spawns[0]?.pos ?? [0, 0, 0];
    s.placeAt([sp[0] + 0.5, 60, sp[2] - 80.5], Math.PI);
  },
  // P27 part 1: the lights course
  lightZone(c) {
    // what drawing a zone around the start and adding the action does: entering it switches the crystal on
    const m = mapDoc(c);
    const sp = m.spawns[0]?.pos ?? [0, 0.4, 0];
    const inst = c.ed.store.get<Instances>(paths.instances(map(c)))?.items ?? [];
    const crystal = inst.find((i) => i.kind === 'light' && !i.on) as LightInstance | undefined;
    if (!crystal) throw new Error('Place a light and switch it off first.');
    let zone = m.zones.find((z) => z.tags.includes('Lights on'));
    if (!zone) {
      run(
        c,
        {
          type: 'map.addZone',
          payload: {
            map: map(c),
            zone: { min: [sp[0] - 5, sp[1], sp[2] - 5], max: [sp[0] + 5, sp[1] + 4, sp[2] + 5], tags: ['Lights on'] },
          },
        },
        'Add trigger zone',
      );
      zone = mapDoc(c).zones.find((z) => z.tags.includes('Lights on'));
    }
    if (!zone) throw new Error('The zone could not be made.');
    run(
      c,
      {
        type: 'map.updateZone',
        payload: {
          map: map(c),
          zone: zone.id,
          patch: { onEnter: [{ do: 'lightOn', name: crystal.name ?? crystal.id, on: 'on' }] },
        },
      },
      'Zone switches the light on',
    );
    c.ed.selectedZone.value = zone.id;
    c.ed.right.value = 'inspect';
  },
  // P23 part 4: the posing course
  stateOwnClip(c, a) {
    // what picking it in the state's clip list does: the clip you made (the newest of your own) for that state
    const chr = studioChr(c);
    const own = c.ed.store.list('clips/').map((p) => c.ed.store.get<Clip>(p)!);
    const clip = own.find((x) => x.id === c.ed.studioClip.value) ?? own.at(-1);
    if (!clip) throw new Error('Make a clip first (Clips › + New).');
    const state = String(a.state ?? 'idle') as keyof NonNullable<Character['animations']>;
    run(
      c,
      {
        type: 'character.update',
        payload: { character: { ...chr, animations: { ...chr.animations, [state]: clip.id } } },
      },
      `${state} clip`,
    );
  },
  dialogueStyle(c, a) {
    run(
      c,
      { type: 'project.update', payload: { dialogue: { ...(c.ed.store.manifest.dialogue ?? {}), style: a.style } } },
      'Dialogue style',
    );
  },
  // P26: the saving course
  setSaving(c, a) {
    const s = { ...savingOf(c.ed.store.manifest), ...(a as Partial<Saving>) };
    run(c, { type: 'project.update', payload: { saving: s } }, 'Saving settings');
  },
  addAchievement(c, a) {
    const cur = progressOf((p) => c.ed.store.get(p));
    const id = String(a.id);
    if (cur.achievements.some((x) => x.id === id)) return;
    run(
      c,
      {
        type: 'progress.put',
        payload: {
          progress: {
            ...cur,
            achievements: [...cur.achievements, { id, name: String(a.name), description: String(a.description ?? '') }],
          },
        },
      },
      'Add achievement',
    );
  },
  playerSetting(c, a) {
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    s.progress.setSetting(a.key as 'difficulty', a.value);
  },
  clearSaves(c) {
    const store = new BrowserSaveStore();
    for (const g of allSaves(store, c.ed.store.manifest.id)) store.remove(c.ed.store.manifest.id, g.slot);
    c.ed.revision.value++;
  },
  tweakSmash(c) {
    const id = 'snd_smash00000';
    const ev =
      c.ed.store.get<{ events: Record<string, unknown> }>(paths.soundEvents)?.events[id] ?? DEFAULT_EVENTS.events[id]!;
    run(c, { type: 'audio.setEvent', payload: { id, event: { ...(ev as object), volume: -3 } } }, 'Edit sound');
    c.ed.audioSel.value = { kind: 'event', id };
  },
  lowerMusic(c) {
    const base = c.ed.store.get<Mixer>(paths.mixer) ?? DEFAULT_MIXER;
    run(c, { type: 'audio.setMixer', payload: { base, buses: { music: -12 } } }, 'Mixer music');
    c.ed.audioSel.value = { kind: 'mixer', id: null };
  },
  mapMusic(c) {
    run(c, { type: 'map.setAudio', payload: { map: map(c), music: 'mus_night00000' } }, 'Change map music');
  },
  addEmitter(c) {
    const p = cell(c, 3, 8);
    if (!p) throw new Error('No open ground.');
    run(
      c,
      {
        type: 'item.add',
        payload: {
          map: map(c),
          item: {
            id: newId('instance'),
            kind: 'emitter',
            name: 'Birdsong',
            sound: 'snd_birds00000',
            pos: [p[0] + 0.5, p[1] * 0.4 + 1, p[2] + 0.5],
            mode: 'loop',
            interval: [3, 6],
            maxDistance: 16,
            volume: 0,
          },
        },
      },
      'Add sound emitter',
    );
  },
  ...CODING_DOERS,
  ...STORY_DOERS,
  async walkHero(c) {
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    s.input.keys.add('w');
    await new Promise((r) => setTimeout(r, 1200));
    s.input.keys.delete('w');
  },
};

/** waits a moment (real time) */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the hero walks over a pickup (if it has none of its item yet) and waits for it to be taken */
/** the stick in hand alight: its end walked into the Burning torch's flame (it catches by itself), unless it is burning */
async function lightBranch(s: NonNullable<Ctx['ed']['session']['value']>) {
  if (s.fireLight.litBranch) return;
  const fire = s.world.instances.find((i) => i.def.name === 'Burning torch');
  if (!fire) throw new Error('Place a Burning torch first.');
  if (!s.stickOut) s.useItem('Branch', slotOf(s, 'Branch'));
  for (const gap of [0.6, 0.3, 0.1, -0.1]) {
    faceThing(s, fire, gap);
    // the stick is in the right hand: a step to the side brings its end in line with the flame
    lineUpTip(s);
    for (let i = 0; i < 4 && !s.fireLight.litBranch; i++) await wait(150);
    if (s.fireLight.litBranch) break;
  }
}

/** the hero steps sideways so the stick's end (in the right hand) is straight ahead of where it was facing */
function lineUpTip(s: NonNullable<Ctx['ed']['session']['value']>) {
  const h = s.heroState;
  const tip = s.fireLight.branchTip();
  const fx = Math.sin(h.heading);
  const fz = Math.cos(h.heading);
  const dx = tip[0] - h.x;
  const dz = tip[2] - h.z;
  const along = dx * fx + dz * fz;
  standAt(s, h.x - (dx - along * fx), h.z - (dz - along * fz), h.heading);
}

async function takePickup(s: NonNullable<Ctx['ed']['session']['value']>, name: string, item: string) {
  if ((s.inventory.get(item) ?? 0) > 0) return;
  const o = s.world.instances.find((i) => i.def.name === name);
  if (!o) throw new Error(`Place a ${name} first.`);
  faceThing(s, o, 0.4);
  for (let i = 0; i < 20 && (s.inventory.get(item) ?? 0) <= 0; i++) await wait(150);
}

/** the item button an item is in (1, 2…), or 1 */
const slotOf = (s: NonNullable<Ctx['ed']['session']['value']>, item: string) =>
  Math.max(1, s.buttons.slots.indexOf(item) + 1);

/** step 12c-2: the play's event log says this */
const logged = (s: NonNullable<Ctx['ed']['session']['value']>, text: string) => s.events.some((e) => e.msg.includes(text));

/** the hero stands by a placed thing, on the side of the start, facing it; returns the way back (x, z) */
function faceThing(
  s: NonNullable<Ctx['ed']['session']['value']>,
  o: { bricks: { x: number; z: number }[] },
  gap: number,
  side?: [number, number],
): [number, number] {
  const xs = o.bricks.map((b) => b.x);
  const zs = o.bricks.map((b) => b.z);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) + 1;
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs) + 1;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const sp = s.world.doc.spawns[0]?.pos ?? [0, 0, 0];
  const vx = sp[0] - cx;
  const vz = sp[2] - cz;
  const back: [number, number] =
    side ?? (Math.abs(vx) > Math.abs(vz) ? [Math.sign(vx) || 1, 0] : [0, Math.sign(vz) || 1]);
  const half = back[0] ? (x1 - x0) / 2 : (z1 - z0) / 2;
  const x = cx + back[0] * (half + gap + 0.5);
  const z = cz + back[1] * (half + gap + 0.5);
  standAt(s, x, z, Math.atan2(-back[0], -back[1]));
  return back;
}

/** puts the hero at x, z facing yaw, on whatever it stands on there (a switch is a plate higher than the grass) */
function standAt(s: NonNullable<Ctx['ed']['session']['value']>, x: number, z: number, yaw: number) {
  const c = s.world.controller;
  const y0 = s.heroState.y;
  const y = [0, 0.4, 0.8, 1.2, -0.4].map((d) => y0 + d).find((y) => c.clear(x, y, z)) ?? y0;
  s.placeAt([x, y, z], yaw);
}

/** Fill `$map`, `$spawn`… in a do-list's arguments. */
function fill(c: Ctx, v: unknown): unknown {
  if (typeof v === 'string' && v.startsWith('$')) {
    const order = c.ed.store.get<Gates>(paths.gates)?.mapOrder ?? [];
    switch (v) {
      case '$map':
        return map(c);
      case '$spawn':
        return mapDoc(c).spawns[0]?.id;
      case '$map2':
        return order[1];
      case '$hero':
        return c.ed.store.manifest.hero;
      case '$graph':
        return c.ed.logicGraph.value;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => fill(c, x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(c, x)]));
  return v;
}

/** Performs one do-item. */
export async function perform(c: Ctx, d: Do): Promise<void> {
  const { ed, ui } = c;
  if ('ui' in d) {
    switch (d.ui) {
      case 'workspace':
        return ui.workspace(String(d.value));
      case 'right':
        ed.right.value = d.value as never;
        return;
      case 'dock':
        ed.dock.value = d.value as never;
        return;
      case 'tool':
        ed.tool.value = d.value as never;
        return;
      case 'menu':
        ed.menu.value = (d.value as string | null) ?? null;
        return;
      case 'palette':
        ed.palette.value = !!d.value;
        return;
      case 'logicView':
        ed.logicView.value = d.value as never;
        return;
      case 'assetCat':
        ed.assetCat.value = String(d.value);
        return;
      case 'fit':
        return ui.fit();
      case 'play':
        return ui.play('engine');
      case 'stop':
        return ui.stopPlay();
      case 'pause':
        ed.paused.value = true;
        return;
    }
  }
  if ('action' in d) return runAction(action(d.action), c);
  if ('click' in d) {
    const el = (await appears(d.click)) as HTMLElement | null;
    if (!el) throw new Error(`Could not find ${d.say ?? 'the control to click'} (${d.click}).`);
    el.scrollIntoView({ block: 'nearest' });
    pressAndClick(el);
    return;
  }
  if ('fill' in d) {
    const el = (await appears(d.fill)) as HTMLInputElement | null;
    if (!el) throw new Error(`Could not find ${d.say ?? 'the box to type in'} (${d.fill}).`);
    el.scrollIntoView({ block: 'nearest' });
    el.focus();
    el.value = storyText(c.ed, d.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return;
  }
  if ('show' in d) {
    const el = (await appears(d.show)) as HTMLElement | null;
    if (!el) throw new Error(`Could not find ${d.say ?? 'that part of the screen'} (${d.show}).`);
    el.scrollIntoView({ block: 'nearest' });
    return;
  }
  if ('choose' in d) {
    const el = (await appears(d.choose)) as HTMLSelectElement | null;
    if (!el) throw new Error(`Could not find ${d.say ?? 'the list to pick from'} (${d.choose}).`);
    el.scrollIntoView({ block: 'nearest' });
    const want = storyText(c.ed, d.value);
    const opt = [...el.options].find((o) => o.value === want || o.text === want);
    if (!opt) throw new Error(`“${d.value}” is not in that list.`);
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if ('cmd' in d) return run(c, { type: d.cmd, payload: fill(c, d.args) }, d.cmd);
  const fn = DOERS[d.fn];
  if (!fn) throw new Error(`Unknown tutorial action ${d.fn}`);
  await fn(c, (fill(c, d.args ?? {}) as Record<string, unknown>) ?? {});
}

/** the element, waiting a moment for it to appear (a view that is still opening) */
async function appears(sel: string, ms = 3000): Promise<Element | null> {
  const end = performance.now() + ms;
  for (;;) {
    const el = document.querySelector(sel);
    if (el || performance.now() > end) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * A click the way a pointer makes it: press, release, click, at the middle of the control. Controls that act
 * on press (timeline keys, drag handles) react as they do to a person.
 */
function pressAndClick(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const at = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
    button: 0,
  };
  const P = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new P('pointerdown', { ...at, pointerId: 1, isPrimary: true, buttons: 1 }));
  el.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 }));
  el.dispatchEvent(new P('pointerup', { ...at, pointerId: 1, isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', at));
  el.click();
}
