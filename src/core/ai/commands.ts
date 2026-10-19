import { z } from 'zod';
import { BodyPlan } from '../character/body';
import * as A from '../commands/handlers/assets';
import * as Au from '../commands/handlers/audio';
import * as Bp from '../commands/handlers/bodyplans';
import * as B from '../commands/handlers/bricks';
import * as Ch from '../commands/handlers/characters';
import * as Ci from '../commands/handlers/cinematics';
import * as Dl from '../commands/handlers/dialogue';
import * as Fx from '../commands/handlers/effects';
import * as G from '../commands/handlers/gates';
import * as I from '../commands/handlers/items';
import * as L from '../commands/handlers/logic';
import * as M from '../commands/handlers/map';
import * as Np from '../commands/handlers/npcs';
import * as Pr from '../commands/handlers/progress';
import type { CommandHandler } from '../commands/types';
import { Conversation } from '../dialogue/schema';
import { Effect } from '../effects/schema';
import type { idPattern } from '../ids';
import { ProgressDoc } from '../save/progress';
import { Saving } from '../save/save';
import {
  Action,
  Asset,
  BIOMES,
  Character,
  Cinematic,
  Clip,
  EmitterInstance,
  id,
  LogicGraph,
  LogicNode,
  Mixer,
  Music,
  Screen,
  SoundEvents,
  TIMES,
  UiInstance,
  VarType,
  Zone,
} from '../schema';

/**
 * What the AI builder may do (P8.1): the engine's own commands, nothing else. Each entry pairs a registered
 * command handler with a Zod schema of its payload (type-checked against the handler, so they cannot drift),
 * a one-line doc, the workspace where the change shows, and an example. The AI never writes files or engine
 * code; `file.*` and `media.*` are deliberately absent.
 */
export type Scope = 'game' | 'map' | 'asset' | 'character' | 'logic' | 'screen' | 'cinematic' | 'audio';
export const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: 'game', label: 'Whole game', hint: 'anything: maps, assets, characters, logic, screens, scenes, audio' },
  { id: 'map', label: 'Map', hint: 'bricks, terrain, spawns, zones, placed assets, signs, sound emitters, gates' },
  { id: 'asset', label: 'Assets', hint: 'asset definitions and their placed copies' },
  { id: 'character', label: 'Characters', hint: 'characters, clips, conversations and the hero' },
  { id: 'logic', label: 'Logic', hint: 'logic graphs (as code) and variables' },
  { id: 'screen', label: 'Screens', hint: 'screens, HUD widgets and the first screen' },
  { id: 'cinematic', label: 'Cinematics', hint: 'cinematic scenes and what triggers them' },
  { id: 'audio', label: 'Audio', hint: 'sound events, music, mixer, map music and emitters' },
];

export type AiCommand = {
  type: string;
  scopes: Scope[];
  doc: string;
  workspace: string;
  schema: z.ZodType;
  example: unknown;
};

const ids = (kind: Parameters<typeof idPattern>[0]) => id(kind);
const map = ids('map');
const xyz = z.tuple([z.number(), z.number(), z.number()]);
const int3 = z.tuple([z.number().int(), z.number().int(), z.number().int()]);
const Generate = z.strictObject({
  environments: z.array(z.enum(BIOMES)).min(1),
  size: z.union([z.literal(16), z.literal(24), z.literal(32)]),
  seed: z.number().int().min(0).max(99_999_999),
  mountainShape: z.string().optional(),
  mountainScale: z.string().optional(),
  time: z.enum(TIMES).optional(),
  rain: z.boolean().optional(),
  snow: z.boolean().optional(),
  snowing: z.boolean().optional(),
});
const NewBrick = z.strictObject({
  type: z.string().regex(/^(brick|plate|tile)\d+x\d+$/),
  x: z.number().int(),
  y: z.number().int().min(0),
  z: z.number().int(),
  rot: z.number().int().min(0).max(3),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  group: z.string().optional(),
  flags: z.number().int().optional(),
  id: z.number().int().optional(),
});
const BrickIds = z.strictObject({ map, ids: z.array(z.number().int()).min(1) });
const SpawnInput = { name: z.string().min(1).max(60).optional(), pos: xyz.optional(), yaw: z.number().optional() };
const ZoneShape = Zone.shape;
const Item = z.discriminatedUnion('kind', [EmitterInstance, UiInstance]);
const Edge = z.tuple([z.string(), z.string(), z.string(), z.string()]);
const VarDef = z.strictObject({
  type: VarType,
  default: z.union([z.number(), z.boolean(), z.string()]),
  scope: z.union([z.literal('global'), ids('map')]),
});

/** Pairs a handler with its payload schema; TypeScript checks the schema's output fits the handler. */
function def<P>(
  type: string,
  _handler: CommandHandler<P>,
  schema: z.ZodType<P>,
  scopes: Scope[],
  workspace: string,
  doc: string,
  example: P,
): AiCommand {
  return { type, scopes: ['game', ...scopes], doc, workspace, schema, example };
}

const M1 = 'map_aaaaaaaaaa';
export const AI_COMMANDS: AiCommand[] = [
  def(
    'map.create',
    M.createMap,
    z.strictObject({
      id: map.optional(),
      name: z.string().min(1).max(60),
      generate: Generate.optional(),
      spawnId: ids('spawn').optional(),
    }),
    ['map'],
    'World graph',
    'Adds a map, optionally generating its terrain. Give an id when later steps refer to it.',
    {
      id: 'map_bbbbbbbbbb',
      name: 'Forest Edge',
      generate: { environments: ['forest'], size: 24, seed: 4242 },
      spawnId: 'sp_bbbbbbbbbb',
    },
  ),
  def(
    'map.rename',
    M.renameMap,
    z.strictObject({ map, name: z.string().min(1).max(60) }),
    ['map'],
    'Scene',
    'Renames a map.',
    { map: M1, name: 'Old Town' },
  ),
  def(
    'map.delete',
    G.deleteMap,
    z.strictObject({ map }),
    ['map'],
    'World graph',
    'Deletes a map and its gates (not the start map).',
    { map: M1 },
  ),
  def(
    'map.generate',
    M.generateTerrain,
    z.strictObject({ map, config: Generate }),
    ['map'],
    'Scene',
    "Replaces a map's terrain with a generated world (houses, trees and cars become asset instances).",
    { map: M1, config: { environments: ['city', 'forest'], size: 32, seed: 1234 } },
  ),
  def(
    'map.setEnvironment',
    M.setEnvironment,
    z.strictObject({
      map,
      time: z.enum(TIMES).optional(),
      rain: z.boolean().optional(),
      snow: z.boolean().optional(),
      snowing: z.boolean().optional(),
    }),
    ['map'],
    'Scene',
    'Time of day and weather of a map.',
    { map: M1, time: 'evening', rain: true },
  ),
  def(
    'map.addSpawn',
    M.addSpawn,
    z.strictObject({ map, id: ids('spawn').optional(), ...SpawnInput }),
    ['map'],
    'Scene',
    'Adds a spawn point at pos [x, y, z] (y in world units, 0.4 per plate) facing yaw radians.',
    { map: M1, id: 'sp_cccccccccc', name: 'Lookout', pos: [4.5, 1.2, -3.5], yaw: 0 },
  ),
  def(
    'map.updateSpawn',
    M.updateSpawn,
    z.strictObject({ map, spawn: ids('spawn'), ...SpawnInput }),
    ['map'],
    'Scene',
    'Moves, turns or renames a spawn point.',
    { map: M1, spawn: 'sp_cccccccccc', name: 'Hill top' },
  ),
  def(
    'map.removeSpawn',
    M.removeSpawn,
    z.strictObject({ map, spawn: ids('spawn') }),
    ['map'],
    'Scene',
    'Removes a spawn point (and gates using it).',
    { map: M1, spawn: 'sp_cccccccccc' },
  ),
  def(
    'map.addZone',
    M.addZone,
    z.strictObject({
      map,
      zone: z.strictObject({
        id: ids('zone').optional(),
        shape: z.literal('box').optional(),
        min: xyz,
        max: xyz,
        tags: z.array(z.string()).optional(),
        music: ZoneShape.music,
        ambience: ZoneShape.ambience,
        onEnter: ZoneShape.onEnter,
        onExit: ZoneShape.onExit,
      }),
    }),
    ['map', 'logic', 'cinematic', 'audio'],
    'Scene',
    'Adds a trigger zone (a box from min to max in world units). onEnter/onExit are action lists; music/ambience play while inside.',
    {
      map: M1,
      zone: { id: 'zn_dddddddddd', min: [0, 0, 0], max: [4, 3, 4], onEnter: [{ do: 'emit', event: 'reached-gate' }] },
    },
  ),
  def(
    'map.updateZone',
    M.updateZone,
    z.strictObject({ map, zone: ids('zone'), patch: Zone.omit({ id: true, shape: true }).partial() }),
    ['map', 'logic', 'cinematic', 'audio'],
    'Scene',
    "Changes a zone's box, actions, music or ambience.",
    {
      map: M1,
      zone: 'zn_dddddddddd',
      patch: { onEnter: [{ do: 'cinematic', cinematic: 'cin_eeeeeeeeee', once: true }] },
    },
  ),
  def('map.removeZone', M.removeZone, z.strictObject({ map, zone: ids('zone') }), ['map'], 'Scene', 'Removes a zone.', {
    map: M1,
    zone: 'zn_dddddddddd',
  }),
  def(
    'map.setAudio',
    I.setMapAudio,
    z.strictObject({ map, music: ids('music').nullable().optional(), ambience: ids('sound').nullable().optional() }),
    ['map', 'audio'],
    'Audio',
    "A map's music state and ambience loop (null = none).",
    { map: M1, music: 'mus_explore000' },
  ),
  def(
    'bricks.place',
    B.placeBricks,
    z.strictObject({ map, bricks: z.array(NewBrick).min(1) }),
    ['map'],
    'Scene',
    'Places bricks in studs (x, z) and plates (y; a brick is 3 plates tall). Bricks must sit on studs below and never overlap.',
    { map: M1, bricks: [{ type: 'brick2x4', x: 2, y: 0, z: 3, rot: 0, color: '#d20c20' }] },
  ),
  def(
    'bricks.remove',
    B.removeBricks,
    BrickIds,
    ['map'],
    'Scene',
    'Removes bricks by id (bricks holding others up are refused).',
    { map: M1, ids: [101, 102] },
  ),
  def(
    'bricks.move',
    B.moveBricks,
    BrickIds.extend({
      dx: z.number().int(),
      dy: z.number().int(),
      dz: z.number().int(),
      drot: z.number().int().optional(),
    }),
    ['map'],
    'Scene',
    'Moves bricks by a stud/plate offset.',
    { map: M1, ids: [101], dx: 1, dy: 0, dz: 0 },
  ),
  def(
    'bricks.paint',
    B.paintBricks,
    BrickIds.extend({ color: z.string().regex(/^#[0-9a-f]{6}$/i) }),
    ['map'],
    'Scene',
    'Recolors loose bricks (not asset instances).',
    { map: M1, ids: [101], color: '#f7c900' },
  ),
  def(
    'bricks.update',
    B.updateBricks,
    z.strictObject({ map, bricks: z.array(NewBrick.partial().extend({ id: z.number().int() })).min(1) }),
    ['map'],
    'Scene',
    'Sets fields of existing bricks.',
    { map: M1, bricks: [{ id: 101, color: '#0058ac' }] },
  ),
  def(
    'asset.place',
    A.placeAsset,
    z.strictObject({
      map,
      asset: ids('asset'),
      pos: int3,
      rot: z.number().int().min(0).max(3).optional(),
      state: z.string().optional(),
      id: ids('instance').optional(),
    }),
    ['map', 'asset'],
    'Scene',
    'Places a copy (instance) of an asset at pos [x, y plates, z] studs.',
    { map: M1, asset: 'ast_chest00001', pos: [6, 0, 2], rot: 1, id: 'ins_ffffffffff' },
  ),
  def(
    'instance.move',
    A.moveInstance,
    z.strictObject({
      map,
      instance: ids('instance'),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      dz: z.number().int().optional(),
      rot: z.number().int().optional(),
    }),
    ['map', 'asset'],
    'Scene',
    'Moves or turns a placed asset.',
    { map: M1, instance: 'ins_ffffffffff', dx: 2 },
  ),
  def(
    'instance.remove',
    A.removeInstance,
    z.strictObject({ map, instances: z.array(ids('instance')).min(1) }),
    ['map', 'asset'],
    'Scene',
    'Removes placed assets.',
    { map: M1, instances: ['ins_ffffffffff'] },
  ),
  def(
    'instance.setState',
    A.setInstanceState,
    z.strictObject({ map, instance: ids('instance'), state: z.string().min(1) }),
    ['map', 'asset'],
    'Scene',
    'Sets the starting state of a placed asset (e.g. open).',
    { map: M1, instance: 'ins_ffffffffff', state: 'open' },
  ),
  def(
    'instance.rename',
    A.renameInstance,
    z.strictObject({ map, instance: ids('instance'), name: z.string().min(1).max(40).nullable() }),
    ['map', 'asset'],
    'Scene',
    'Names one placed copy (“Gate switch”) so logic and wiring can refer to it by name; null removes the name.',
    { map: M1, instance: 'ins_ffffffffff', name: 'Gate switch' },
  ),
  def(
    'npc.place',
    Np.placeNpc,
    z.strictObject({
      map,
      character: ids('character'),
      pos: z.tuple([z.number(), z.number(), z.number()]),
      heading: z.number().optional(),
      id: ids('instance').optional(),
    }),
    ['map', 'character'],
    'Scene',
    'Puts a character on a map as a neighbour (it wanders near there, talks, and fights the hero if its character is an enemy). pos is in studs; y 0.4 stands on the ground plate.',
    { map: M1, character: 'chr_knight0000', pos: [4, 0.4, 6] },
  ),
  def(
    'npc.remove',
    Np.removeNpc,
    z.strictObject({ map, instance: ids('instance') }),
    ['map'],
    'Scene',
    'Takes a placed neighbour off a map.',
    { map: M1, instance: 'ins_ffffffffff' },
  ),
  def(
    'progress.put',
    Pr.putProgress,
    z.strictObject({ progress: ProgressDoc }),
    [],
    'Scene',
    'The game’s progress setup (Project › Progress): achievements {id, name, description, hidden?} (logic unlocks them by id), collections {item, label, total} (completion counts them), bests {var, label, better: higher|lower}, newGamePlus {enabled, keepItems, keepVars}. Put the whole document.',
    {
      progress: {
        achievements: [{ id: 'first-chest', name: 'Treasure hunter', description: 'Open your first chest.' }],
        collections: [{ item: 'coin', label: 'Coins', total: 10 }],
        bests: [{ var: 'score', label: 'Score', better: 'higher' }],
        newGamePlus: { enabled: true, keepItems: true, keepVars: [] },
      },
    },
  ),
  def(
    'instance.transform',
    A.transformInstance,
    z.strictObject({
      map,
      instance: ids('instance'),
      tilt: z.tuple([z.number(), z.number(), z.number()]).optional(),
      scale: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).optional(),
      rot: z.number().int().min(0).max(3).optional(),
    }),
    ['map', 'asset'],
    'Scene',
    'Turns (degrees about X, Y, Z) and sizes (1 = normal, per axis) a placed asset freely. tilt [0,0,0] and scale [1,1,1] put it back on the brick grid.',
    { map: M1, instance: 'ins_ffffffffff', tilt: [0, 30, 15], scale: [2, 2, 2] },
  ),
  def(
    'instance.unpack',
    A.unpackInstance,
    z.strictObject({ map, instances: z.array(ids('instance')).min(1) }),
    ['map', 'asset'],
    'Scene',
    'Turns placed assets back into loose bricks.',
    { map: M1, instances: ['ins_ffffffffff'] },
  ),
  def(
    'asset.make',
    A.makeAsset,
    z.strictObject({
      map,
      ids: z.array(z.number().int()).min(1),
      name: z.string().min(1).max(60),
      id: ids('asset').optional(),
      category: Asset.shape.category.optional(),
    }),
    ['asset'],
    'Assets',
    'Turns loose bricks of a map into a new asset (they become its first instance).',
    { map: M1, ids: [101, 102], name: 'Watchtower', id: 'ast_gggggggggg' },
  ),
  def(
    'asset.create',
    A.createAsset,
    z.strictObject({ asset: Asset }),
    ['asset'],
    'Assets',
    'Creates an asset from a full definition (read an existing asset file first for the shape).',
    { asset: { $read: 'assets/<id>.json' } } as never,
  ),
  def(
    'asset.update',
    A.updateAsset,
    z.strictObject({ asset: Asset }),
    ['asset'],
    'Assets',
    'Replaces an asset definition: states, sockets, interactions, smash, generator rules. Send the whole asset.',
    { asset: { $read: 'assets/<id>.json' } } as never,
  ),
  def(
    'asset.delete',
    A.deleteAsset,
    z.strictObject({ asset: ids('asset') }),
    ['asset'],
    'Assets',
    'Deletes an unused asset.',
    { asset: 'ast_gggggggggg' },
  ),
  def(
    'character.create',
    Ch.createCharacter,
    z.strictObject({ character: Character }),
    ['character'],
    'Characters',
    'Creates a character from a full definition (copy an existing one and change it).',
    { character: { $read: 'characters/<id>.json' } } as never,
  ),
  def(
    'character.update',
    Ch.updateCharacter,
    z.strictObject({ character: Character }),
    ['character'],
    'Characters',
    'Replaces a character: name, look (profile), gear, and its sheet — stats (health, stamina, speed, jump, strength, defence, level, xpCurve), outfits (name, look overrides, stat bonuses) and outfit (worn), moves (style balanced/swift/heavy/defensive, power, speed), animations (idle/victory/hurt… → clip ids), voice (pitch, blip, footsteps, grunt sounds), behaviour (kind: villager, shopkeeper, questGiver, companion, enemy, boss…; routine: wander or stand), talk (conversations by condition) and barks. Send the whole character (read it first).',
    { character: { $read: 'characters/<id>.json' } } as never,
  ),
  def(
    'character.delete',
    Ch.deleteCharacter,
    z.strictObject({ character: ids('character') }),
    ['character'],
    'Characters',
    'Deletes a character.',
    { character: 'chr_hhhhhhhhhh' },
  ),
  def(
    'clip.create',
    Ch.createClip,
    z.strictObject({ clip: Clip }),
    ['character'],
    'Characters',
    'Creates an animation clip.',
    { clip: { $read: 'clips/<id>.json' } } as never,
  ),
  def(
    'clip.update',
    Ch.updateClip,
    z.strictObject({ clip: Clip }),
    ['character'],
    'Characters',
    'Replaces an animation clip.',
    { clip: { $read: 'clips/<id>.json' } } as never,
  ),
  def(
    'clip.delete',
    Ch.deleteClip,
    z.strictObject({ clip: ids('clip') }),
    ['character'],
    'Characters',
    'Deletes a clip.',
    { clip: 'clp_iiiiiiiiii' },
  ),
  def(
    'project.update',
    M.updateProject,
    z.strictObject({
      name: z.string().min(1).max(80).optional(),
      entryMap: map.optional(),
      entrySpawn: ids('spawn').nullable().optional(),
      hero: ids('character').nullable().optional(),
      entryScreen: ids('screen').nullable().optional(),
      genre: z.string().optional(),
      saving: Saving.nullable().optional(),
    }),
    ['map', 'character', 'screen'],
    'Scene',
    'Game name, start map and spawn, hero character, first screen, genre (what the editor shows: open or explore), saving ({mode: anywhere | savePoints | checkpoints, slots 1–3, autosave}).',
    { name: 'Coin Quest', hero: 'chr_hhhhhhhhhh' },
  ),
  def(
    'gate.connect',
    G.connectGate,
    z.strictObject({
      id: ids('gate').optional(),
      from: z.strictObject({ map, spawn: ids('spawn') }),
      to: z.strictObject({ map, spawn: ids('spawn') }),
      twoWay: z.boolean().optional(),
    }),
    ['map'],
    'World graph',
    'Connects a spawn on one map to a spawn on another; walking onto it travels.',
    {
      id: 'gt_jjjjjjjjjj',
      from: { map: M1, spawn: 'sp_cccccccccc' },
      to: { map: 'map_bbbbbbbbbb', spawn: 'sp_bbbbbbbbbb' },
      twoWay: true,
    },
  ),
  def(
    'gate.update',
    G.updateGate,
    z.strictObject({
      gate: ids('gate'),
      twoWay: z.boolean().optional(),
      reverse: z.boolean().optional(),
      onArrive: z.array(Action).optional(),
    }),
    ['map', 'cinematic'],
    'World graph',
    'One-way/two-way, reverse, or actions when the hero arrives.',
    { gate: 'gt_jjjjjjjjjj', onArrive: [{ do: 'cinematic', cinematic: 'cin_eeeeeeeeee', once: true }] },
  ),
  def('gate.delete', G.deleteGate, z.strictObject({ gate: ids('gate') }), ['map'], 'World graph', 'Removes a gate.', {
    gate: 'gt_jjjjjjjjjj',
  }),
  def(
    'item.add',
    I.addItem,
    z.strictObject({ map, item: Item }),
    ['map', 'audio', 'screen'],
    'Scene',
    'Places a sound emitter (kind emitter) or a world UI sign/label/bar (kind ui) on a map.',
    {
      map: M1,
      item: {
        id: 'ins_kkkkkkkkkk',
        kind: 'ui',
        widget: 'sign',
        pos: [3, 2, 3],
        text: 'Coins: {coins}',
        maxDistance: 30,
      },
    },
  ),
  def(
    'item.update',
    I.updateItem,
    z.strictObject({
      map,
      id: ids('instance'),
      patch: z.record(z.string(), z.unknown()) as unknown as z.ZodType<Partial<z.infer<typeof Item>>>,
    }),
    ['map', 'audio', 'screen'],
    'Scene',
    'Changes fields of an emitter or sign.',
    { map: M1, id: 'ins_kkkkkkkkkk', patch: { text: 'Gems: {gems}' } },
  ),
  def(
    'item.remove',
    I.removeItem,
    z.strictObject({ map, id: ids('instance') }),
    ['map', 'audio', 'screen'],
    'Scene',
    'Removes an emitter or sign.',
    { map: M1, id: 'ins_kkkkkkkkkk' },
  ),
  def(
    'logic.create',
    L.createLogic,
    z.strictObject({ graph: LogicGraph }),
    ['logic'],
    'Logic',
    'Creates a logic graph from nodes and edges. Prefer the logic.code helper.',
    {
      graph: {
        id: 'lg_llllllllll',
        name: 'Rules',
        scope: 'global',
        nodes: [{ id: 'n1', type: 'event.onStart', pos: [0, 0] }],
        edges: [],
      },
    },
  ),
  def(
    'logic.replace',
    L.replaceLogic,
    z.strictObject({ graph: LogicGraph }),
    ['logic'],
    'Logic',
    'Replaces a logic graph. Prefer the logic.code helper.',
    { graph: { id: 'lg_llllllllll', name: 'Rules', scope: 'global', nodes: [], edges: [] } },
  ),
  def(
    'logic.delete',
    L.deleteLogic,
    z.strictObject({ graph: ids('logic') }),
    ['logic'],
    'Logic',
    'Deletes a logic graph.',
    { graph: 'lg_llllllllll' },
  ),
  def(
    'logic.addNode',
    L.addNode,
    z.strictObject({ graph: ids('logic'), node: LogicNode.extend({ id: LogicNode.shape.id.optional() }) }),
    ['logic'],
    'Logic',
    'Adds one node to a graph.',
    { graph: 'lg_llllllllll', node: { type: 'world.give', pos: [240, 0], args: { item: 'coin', count: 1 } } },
  ),
  def(
    'logic.removeNodes',
    L.removeNodes,
    z.strictObject({ graph: ids('logic'), nodes: z.array(z.string()).min(1) }),
    ['logic'],
    'Logic',
    'Removes nodes and their wires.',
    { graph: 'lg_llllllllll', nodes: ['n2'] },
  ),
  def(
    'logic.moveNodes',
    L.moveNodes,
    z.strictObject({
      graph: ids('logic'),
      moves: z.array(z.strictObject({ id: z.string(), pos: z.tuple([z.number(), z.number()]) })),
    }),
    ['logic'],
    'Logic',
    'Moves nodes on the canvas.',
    { graph: 'lg_llllllllll', moves: [{ id: 'n2', pos: [300, 0] }] },
  ),
  def(
    'logic.connect',
    L.connect,
    z.strictObject({ graph: ids('logic'), edge: Edge }),
    ['logic'],
    'Logic',
    'Wires [fromNode, fromPin, toNode, toPin].',
    { graph: 'lg_llllllllll', edge: ['n1', 'then', 'n2', 'in'] },
  ),
  def(
    'logic.disconnect',
    L.disconnect,
    z.strictObject({ graph: ids('logic'), edge: Edge }),
    ['logic'],
    'Logic',
    'Removes a wire.',
    { graph: 'lg_llllllllll', edge: ['n1', 'then', 'n2', 'in'] },
  ),
  def(
    'logic.setArgs',
    L.setArgs,
    z.strictObject({ graph: ids('logic'), node: z.string(), args: z.record(z.string(), z.unknown()) }),
    ['logic'],
    'Logic',
    "Sets a node's inline settings.",
    { graph: 'lg_llllllllll', node: 'n2', args: { count: 3 } },
  ),
  def(
    'logic.setVariable',
    L.setVariable,
    z.strictObject({
      name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      def: VarDef.nullable(),
      rename: z.string().optional(),
    }),
    ['logic', 'screen'],
    'Logic',
    'Adds, changes, renames or (def null) removes a variable.',
    { name: 'coins', def: { type: 'number', default: 0, scope: 'global' } },
  ),
  def(
    'screen.put',
    Au.putScreen,
    z.strictObject({ screen: Screen }),
    ['screen'],
    'Screens',
    'Adds or replaces a screen (read the existing screen first; built-ins are copied into the project).',
    { screen: { $read: 'screens/<id>.json or the built-in from read_project_summary' } } as never,
  ),
  def(
    'screen.delete',
    Au.deleteScreen,
    z.strictObject({ id: ids('screen'), builtin: z.boolean().optional() }),
    ['screen'],
    'Screens',
    'Removes a project screen (a built-in returns to its original).',
    { id: 'scr_mmmmmmmmmm' },
  ),
  def(
    'cinematic.put',
    Ci.putCinematic,
    z.strictObject({ cinematic: Cinematic }),
    ['cinematic'],
    'Cinematics',
    'Adds or replaces a cinematic scene (read docs via describe_command and an existing scene first).',
    { cinematic: { $read: 'cinematics/<id>.json' } } as never,
  ),
  def(
    'dialogue.put',
    Dl.putDialogue,
    z.strictObject({ conversation: Conversation }),
    ['character'],
    'Characters',
    'Adds or replaces a conversation: sections of steps — a line (who: a character id or a name, text, mood), a choice (options with text, optional if, to: a section or end), do (actions such as setVar, addVar, give, cinematic, achieve), like (by), goto. Conditions are words like “gems >= 50 and talks > 0”. Then add it to a character’s talk list with character.update so talking to them plays it.',
    {
      conversation: {
        id: 'dlg_aaaaaaaaaa',
        name: 'Baker hint',
        sections: [
          {
            label: 'start',
            steps: [
              { k: 'line', who: 'chr_aaaaaaaaaa', text: 'Fresh bread today!' },
              {
                k: 'line',
                who: 'chr_aaaaaaaaaa',
                text: 'The key? Try under the mayor’s doormat.',
                if: 'talked.mayor is true',
              },
              { k: 'choice', options: [{ text: 'Thanks!', to: 'end' }] },
            ],
          },
        ],
      },
    },
  ),
  def(
    'dialogue.delete',
    Dl.deleteDialogue,
    z.strictObject({ id: ids('dialogue') }),
    ['character'],
    'Characters',
    'Deletes a conversation nothing starts any more (take it out of talk lists, signs and interactions first).',
    { id: 'dlg_aaaaaaaaaa' },
  ),
  def(
    'bodyplan.put',
    Bp.putBodyPlan,
    z.strictObject({ plan: BodyPlan }),
    ['character'],
    'Characters',
    'Adds or replaces a body plan: a skeleton of bones (name, parent, at: joint offset from the parent in world units, role: root/spine/neck/head/jaw/leg/arm/wing/tail/fin/wheel/turret/other, swing in degrees, phase 0-1 for legs that step together, side -1/1 for wings and fins), bricks that follow each bone (w, d, kind, x/z in studs and y in plates from the joint, colour: main/accent/belly/eye/dark or #hex), move (walk/fly/swim/slither/hop), stride and hover. Movement is generated from the roles. Exactly one bone has no parent. Then give a character body: { plan: id } with character.update. For an animal, a character body: { family: fourLegs/bird/fish/serpent/spider/insect/slime/dragon/robot, params: { size, legs, neck, tail, wings, head, build } } needs no body plan.',
    {
      plan: {
        id: 'bpl_aaaaaaaaaa',
        name: 'Tiny crab',
        family: 'custom',
        move: 'walk',
        stride: 1.5,
        hover: 0,
        bones: [
          { name: 'body', at: [0, 1.2, 0], role: 'root', swing: 3 },
          { name: 'left leg', parent: 'body', at: [-1, 0, 0], role: 'leg', swing: 25, phase: 0, side: -1 },
          { name: 'right leg', parent: 'body', at: [1, 0, 0], role: 'leg', swing: 25, phase: 0.5, side: 1 },
        ],
        bricks: [
          { bone: 'body', w: 2, d: 2, kind: 'brick', x: -1, y: 0, z: -1, color: 'main' },
          { bone: 'left leg', w: 1, d: 1, kind: 'brick', x: -1, y: -3, z: -0.5, color: 'accent' },
          { bone: 'right leg', w: 1, d: 1, kind: 'brick', x: 0, y: -3, z: -0.5, color: 'accent' },
        ],
      },
    },
  ),
  def(
    'effect.put',
    Fx.putEffect,
    z.strictObject({ effect: Effect }),
    ['map'],
    'Effects',
    'Adds or replaces a game effect: particles that are tiny bricks, plates, tiles or studs. mode burst (count at once) or stream (rate a second, for duration seconds, 0: while it plays); spawn point/sphere/ring/box/line with radius; direction up/out/down/forward with spread degrees; speed, life and size as [from, to]; colors (1-4, birth to death); gravity (negative rises), drag, bounce off bricks 0-1. Built-in effects (fx_fire000001, fx_sparks0001, fx_boom000001…) cannot be changed: copy one under a new id. Place one with item.add (kind effect), hook it to hits and events with project.update effects, or play it with the effect action.',
    {
      effect: {
        id: 'fx_aaaaaaaaaa',
        name: 'Green sparks',
        shape: 'stud',
        mode: 'burst',
        count: 24,
        rate: 20,
        duration: 0,
        spawn: 'point',
        radius: 0,
        direction: 'out',
        spread: 180,
        speed: [4, 9],
        life: [0.3, 0.6],
        size: [0.18, 0.04],
        colors: ['#e8ffe0', '#4b9f4a'],
        gravity: 10,
        drag: 0,
        bounce: 0.4,
      },
    },
  ),
  def(
    'effect.delete',
    Fx.deleteEffect,
    z.strictObject({ id: ids('effect') }),
    ['map'],
    'Effects',
    'Deletes a game effect that nothing uses (take it off maps and out of the game effects first).',
    { id: 'fx_aaaaaaaaaa' },
  ),
  def(
    'bodyplan.delete',
    Bp.deleteBodyPlan,
    z.strictObject({ id: ids('bodyplan') }),
    ['character'],
    'Characters',
    'Deletes a body plan no character wears.',
    { id: 'bpl_aaaaaaaaaa' },
  ),
  def(
    'cinematic.delete',
    Ci.deleteCinematic,
    z.strictObject({ id: ids('cinematic') }),
    ['cinematic'],
    'Cinematics',
    'Deletes a scene.',
    { id: 'cin_eeeeeeeeee' },
  ),
  def(
    'audio.setEvent',
    Au.setSoundEvent,
    z.strictObject({
      id: ids('sound'),
      event: SoundEvents.shape.events.valueType.nullable(),
      builtin: z.boolean().optional(),
    }),
    ['audio'],
    'Audio',
    'Adds or changes a sound event (clips must be media refs already in the project or the built-in pack).',
    {
      id: 'snd_smash00000',
      event: { $read: 'the event from read_file audio/events.json or the built-in list' },
    } as never,
  ),
  def(
    'audio.setMusic',
    Au.setMusicState,
    z.strictObject({
      id: ids('music'),
      state: Music.shape.states.valueType.nullable(),
      builtin: z.boolean().optional(),
    }),
    ['audio'],
    'Audio',
    'Adds or changes a music state.',
    { id: 'mus_explore000', state: { $read: 'audio/music.json' } } as never,
  ),
  def(
    'audio.setMusicSettings',
    Au.setMusicSettings,
    z.strictObject({ crossfade: z.number().min(0).optional(), stingers: Music.shape.stingers.optional() }),
    ['audio'],
    'Audio',
    'Music crossfade time and stingers.',
    { crossfade: 2 },
  ),
  def(
    'audio.setMixer',
    Au.setMixer,
    z.strictObject({ base: Mixer, buses: Mixer.shape.buses.partial().optional(), duck: Mixer.shape.duck.optional() }),
    ['audio'],
    'Audio',
    'Mixer bus volumes and ducking. base = the current mixer (read audio/mixer.json or the built-in).',
    { base: { $read: 'audio/mixer.json' } } as never,
  ),
];

/**
 * Helpers: AI-side shorthands that expand into ordinary commands before anything runs, so the
 * patch the user reviews is still only engine commands.
 */
export const AI_HELPERS: AiCommand[] = [
  {
    type: 'logic.code',
    scopes: ['game', 'logic'],
    workspace: 'Logic',
    doc: 'Writes a whole logic graph as script (the Logic workspace Code view dialect). Creates the graph when it does not exist, replaces it otherwise. Expands into logic.create / logic.replace.',
    schema: z.strictObject({
      graph: ids('logic'),
      name: z.string().min(1).max(80),
      scope: z.union([z.literal('global'), ids('map')]).optional(),
      code: z.string().min(1).max(20_000),
    }),
    example: {
      graph: 'lg_llllllllll',
      name: 'Coin rules',
      code: 'on("interact", { asset: "ast_chest00001" }, (e) => {\n  vars.coins += 1;\n  if ((vars.coins >= 3)) {\n    screen.show("scr_win0000000");\n  }\n});\n',
    },
  },
  {
    type: 'cinematic.reward',
    scopes: ['game', 'cinematic'],
    workspace: 'Cinematics',
    doc: 'Makes a complete reward scene (fade in, title, the giver walks up and speaks, three camera shots, music, a cheer) at a spot on a map. Expands into cinematic.put. Trigger it from a zone, interaction, gate or logic.',
    schema: z.strictObject({
      id: ids('cinematic'),
      map,
      at: xyz,
      giver: ids('character'),
      name: z.string().min(1).max(80).optional(),
      line: z.string().min(1).max(200).optional(),
    }),
    example: {
      id: 'cin_eeeeeeeeee',
      map: M1,
      at: [4, 0.4, 2],
      giver: 'chr_hhhhhhhhhh',
      name: 'Well done',
      line: 'You found every coin!',
    },
  },
];

export const aiCommand = (type: string) =>
  AI_COMMANDS.find((c) => c.type === type) ?? AI_HELPERS.find((c) => c.type === type) ?? null;

export const typesFor = (scope: Scope) =>
  [...AI_COMMANDS, ...AI_HELPERS].filter((c) => c.scopes.includes(scope)).map((c) => c.type);

/** JSON Schema of one command's payload (Zod 4 built-in), for describe_command. */
export function payloadJsonSchema(type: string): Record<string, unknown> | null {
  const c = aiCommand(type);
  if (!c) return null;
  try {
    return z.toJSONSchema(c.schema, { unrepresentable: 'any', io: 'input' }) as Record<string, unknown>;
  } catch {
    return { type: 'object', description: 'see the example' };
  }
}
