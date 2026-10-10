import { BUILTIN_ASSETS, builtinAsset } from '../../builtin/assets';
import { DEFAULT_EVENTS, DEFAULT_MIXER } from '../../builtin/audio';
import { BUILTIN_CHARACTERS } from '../../builtin/characters';
import { BUILTIN_SCREENS } from '../../builtin/screens';
import { rewardScene } from '../../core/cinematic/templates';
import type { Command } from '../../core/commands';
import { arrivalSpot, assetSpot, brickSpot, reachable } from '../../core/gamegen/places';
import { newId } from '../../core/ids';
import {
  type Asset,
  type Character,
  type Gates,
  type LogicGraph,
  type MapDoc,
  type Mixer,
  paths,
  type Screen,
  type Widget,
} from '../../core/schema';
import { type ActionCtx, action, runAction } from '../actions/registry';
import { assetLibrary } from '../assets';
import { newGraph } from '../workspaces/logic/model';
import { CODING_DOERS } from './coding';
import type { Do } from './schema';

type Ctx = ActionCtx;
const run = (c: Ctx, cmds: Command | Command[], label: string) => {
  const r = c.ed.exec(cmds, { label, source: 'tutorial' });
  if (!r.ok) throw new Error(r.error ?? label);
};
const map = (c: Ctx) => c.ed.mapId.value;
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
  paintSomething(c) {
    const s = c.ed.scene.value!;
    const loose = s.all().filter((b) => !s.ownerOf(b.id));
    const b = loose.find((x) => x.y > 0) ?? loose[0];
    if (!b) throw new Error('No loose bricks to paint.');
    c.ed.select([b.id]);
    run(c, { type: 'bricks.paint', payload: { map: map(c), ids: [b.id], color: '#f7c900' } }, 'Paint');
  },
  placeBrick(c) {
    const cmd = brickSpot(c.ed.store, c.ed.bus, map(c));
    if (!cmd) throw new Error('No free spot for a brick.');
    run(c, cmd, 'Place brick');
  },
  eraseBrick(c) {
    const s = c.ed.scene.value!;
    const loose = s
      .all()
      .filter((b) => !s.ownerOf(b.id) && b.y > 0)
      .sort((a, b) => b.id - a.id);
    for (const b of loose.slice(0, 60)) {
      const cmd: Command = { type: 'bricks.remove', payload: { map: map(c), ids: [b.id] } };
      if (c.ed.bus.dryRun([cmd]).ok) return run(c, cmd, 'Erase');
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
  editAsset(c, a) {
    const def = assetByName(c, String(a.name));
    c.ui.editAsset(def?.id ?? null);
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
    run(
      c,
      {
        type: 'clip.create',
        payload: { clip: { id: newId('clip'), name: 'Wave hello', length: 2, loop: true, tracks: [], events: [] } },
      },
      'New clip',
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
  async walkHero(c) {
    const s = c.ed.session.value;
    if (!s) throw new Error('Press Play first.');
    s.input.keys.add('w');
    await new Promise((r) => setTimeout(r, 1200));
    s.input.keys.delete('w');
  },
};

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
    (document.querySelector(d.click) as HTMLElement | null)?.click();
    return;
  }
  if ('cmd' in d) return run(c, { type: d.cmd, payload: fill(c, d.args) }, d.cmd);
  const fn = DOERS[d.fn];
  if (!fn) throw new Error(`Unknown tutorial action ${d.fn}`);
  await fn(c, (fill(c, d.args ?? {}) as Record<string, unknown>) ?? {});
}
