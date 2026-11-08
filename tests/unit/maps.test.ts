import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CommandBus, registerAll } from '../../src/core/commands';
import { miniLookOf, pauseLookOf } from '../../src/core/maps/look';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { SaveGame } from '../../src/core/save/save';
import { type Instances, type MapDoc, paths, type Settings } from '../../src/core/schema';
import { RecordingAudio } from '../../src/engine/audio/port';
import { floorOf, type MapPiece, mapModel, seenKey } from '../../src/engine/maps/model';
import { MAX_PINS, MapTracker } from '../../src/engine/maps/tracker';
import { captureSave } from '../../src/engine/runtime/saves';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B7a-1): the maps — their looks, what they show, what they remember, and in Play. */

describe('map looks', () => {
  it('a pause map: the game’s, a dungeon’s room plan, a map’s own; each type’s preset with choices over it', () => {
    expect(pauseLookOf(undefined, undefined, false).type).toBe('parchment');
    expect(pauseLookOf(undefined, undefined, true).type).toBe('floors');
    const game = { pause: { type: 'contour' as const, frame: 'gold' as const, colors: { accent: '#00ff00' } } };
    const l = pauseLookOf(game, undefined, false);
    expect(l).toMatchObject({ type: 'contour', frame: 'gold', icons: 'round', grid: true });
    expect(l.colors.accent).toBe('#00ff00');
    expect(l.colors.back).toBe('#0f1d24');
    expect(pauseLookOf(game, { pause: { type: 'chart' } }, false).type).toBe('chart');
    // markers: all but people by default; one turned off stays off
    expect(
      pauseLookOf({ pause: { type: 'screens', markers: { chests: false } } }, undefined, false).markers,
    ).toMatchObject({
      chests: false,
      keys: true,
      people: false,
    });
  });

  it('the map in play: square by default; round turns with the camera', () => {
    expect(miniLookOf(undefined, undefined)).toMatchObject({ type: 'square', size: 150, turns: false });
    expect(miniLookOf({ mini: { type: 'round' } }, undefined)).toMatchObject({ type: 'round', turns: true });
    expect(miniLookOf({ mini: { type: 'round' } }, { mini: { type: 'off' } }).type).toBe('off');
  });
});

describe('what a map shows', () => {
  const grass: MapPiece = { x: 0, y: 0, z: 0, rows: 4, cols: 8, turn: 0, color: 0, hex: '#3a9a3a' };
  const pond: MapPiece = { x: 8, y: 0, z: 0, rows: 4, cols: 4, turn: 0, color: 0, hex: '#2a5fd0' };
  // a second floor 20 plates up (8 studs)
  const upstairs: MapPiece = { x: 0, y: 20, z: 0, rows: 2, cols: 2, turn: 0, color: 0, hex: '#888888' };

  it('the land from above: each stud’s top brick, water told by its blue', () => {
    const m = mapModel({ mapId: 'm', name: 'M', pieces: [grass, pond], dungeon: false, seen: null, markers: [] });
    const t = m.top(null);
    expect([t.x0, t.z0, t.w, t.h]).toEqual([0, 0, 12, 4]);
    expect(t.color[0]).toBe('#3a9a3a');
    expect(t.water[9]).toBe(1);
    expect(t.water[0]).toBe(0);
  });

  it('where the hero has not been is hidden; a dungeon’s map shows it all, its compass its chests', () => {
    const seen = new Set([seenKey(1, 1)]);
    const chest = { kind: 'chest' as const, x: 40, z: 40, y: 0 };
    const out = mapModel({ mapId: 'm', name: 'M', pieces: [grass], dungeon: true, seen, markers: [chest] });
    expect(out.shows(1, 1)).toBe(true);
    expect(out.shows(40, 40)).toBe(false);
    expect(out.showsMarker(chest)).toBe(false);
    const comp = mapModel({
      mapId: 'm',
      name: 'M',
      pieces: [grass],
      dungeon: true,
      seen,
      hasCompass: true,
      markers: [chest],
    });
    expect(comp.showsMarker(chest)).toBe(true);
    expect(comp.shows(40, 40)).toBe(false);
    const full = mapModel({ mapId: 'm', name: 'M', pieces: [grass], dungeon: true, seen, hasMap: true, markers: [] });
    expect(full.shows(40, 40)).toBe(true);
  });

  it('a dungeon floor by floor: the floors the hero has been on; each floor’s own land', () => {
    expect(floorOf(0.4)).toBe(0);
    expect(floorOf(8)).toBe(1);
    const seen = new Set([seenKey(0, 0), seenKey(0, 0, 1)]);
    const m = mapModel({ mapId: 'm', name: 'M', pieces: [grass, upstairs], dungeon: true, seen, markers: [] });
    expect(m.floors).toEqual([0, 1]);
    expect(m.top(1).color.filter(Boolean)).toHaveLength(m.top(1).w * m.top(1).h > 0 ? 4 : 0);
    expect(m.top(0).color.filter(Boolean).length).toBe(32);
  });
});

describe('what the maps remember', () => {
  it('where the hero has been, pins (up to a limit), bosses beaten — and back from a save', () => {
    const t = new MapTracker();
    t.visit('m', 3, 0, 3, false);
    // outside: the cells round it too
    expect(t.seen('m').size).toBe(9);
    t.visit('d', 3, 8, 3, true);
    expect([...t.seen('d')]).toEqual(['0,0@1']);
    expect(t.pin('m', { x: 1, z: 2, stamp: 'heart', label: 'Fairy' })).toBe(true);
    for (let i = 0; i < MAX_PINS; i++) t.pin('m', { x: 100 + i, z: 0, stamp: 'star' });
    expect(t.pins('m')).toHaveLength(MAX_PINS);
    expect(t.unpin('m', 1.5, 2, 2)?.label).toBe('Fairy');
    t.beat('d', 'Gloomweaver', 5, 0, 5);
    t.reveal('m');
    const back = new MapTracker();
    back.restore(JSON.parse(JSON.stringify(t.capture())));
    expect(back.seen('m').size).toBe(9);
    expect(back.pins('m')).toHaveLength(MAX_PINS - 1);
    expect(back.beaten('d')[0]?.name).toBe('Gloomweaver');
    expect(back.revealed('m')).toBe(true);
  });
});

describe('the maps in Play', () => {
  function game(dungeon = false) {
    const s = new ProjectStore(newProjectFiles({ name: 'Maps', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const map = s.manifest.entry.map;
    if (dungeon) bus.execute({ type: 'map.setDungeon', payload: { map, dungeon: true } } as never, { source: 'user' });
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p.placeAt([0, 0.4, 0], 0);
    for (let i = 0; i < 3; i++) p.runtime.stepOnce();
    return { s, bus, p, map };
  }

  it('the map fills in where the hero goes; M (the map op) opens it and holds the game', () => {
    const { p } = game();
    expect(p.mapModel().shows(0, 0)).toBe(true);
    expect(p.mapModel().shows(200, 200)).toBe(false);
    p.gameOp('map');
    expect(p.mapOpen).toBe(true);
    expect(p.screenPaused).toBe(true);
    p.back();
    expect(p.mapOpen).toBe(false);
  });

  it('pins go on the map and into the save', () => {
    const { p } = game();
    expect(p.pinMap(4, 4, 'flag', 'Cave')).toBe(true);
    const pin = p.mapModel().markers.find((m) => m.kind === 'pin');
    expect(pin).toMatchObject({ stamp: 'flag', label: 'Cave' });
    // biome-ignore lint/suspicious/noExplicitAny: the session is its own save host
    const save = captureSave(p as any, 1);
    expect(SaveGame.safeParse(save).success).toBe(true);
    expect(save.mapNotes?.[p.world.mapId]?.pins?.[0]?.label).toBe('Cave');
    expect(p.unpinMap(4, 4)).toBeTruthy();
  });

  it('a boss shows on the map; beaten, its mark stays, crossed out', () => {
    const { s, map } = game();
    const c = STARTER_CHARACTERS.find((x) => x.slug === 'howler')!;
    s.put(paths.character(c.id), { ...c.character, id: c.id, enemy: { ...c.character.enemy!, style: 'boss' } });
    const inst = s.get<Instances>(paths.instances(map))!;
    s.put(paths.instances(map), {
      ...inst,
      npcsSaved: true,
      items: [
        ...inst.items.filter((i) => i.kind !== 'npc'),
        {
          id: 'ins_bossmapaaa',
          kind: 'npc',
          character: c.id,
          legacyId: 31,
          biome: 'prairie',
          role: 'guard',
          state: { x: 3, y: 0.4, z: 3, heading: 0 },
        },
      ],
    } as Instances);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p.placeAt([0, 0.4, 0], 0);
    p.runtime.stepOnce();
    const boss = () => p.mapModel().markers.find((m) => m.kind === 'boss');
    expect(boss()).toMatchObject({ label: 'Howler' });
    expect(boss()?.done).toBeFalsy();
    const foe = p.world.npcs.find((n) => n.id === 31)!;
    for (let i = 0; i < 20 && p.world.npcs.includes(foe); i++) p.hitNpc(foe, { power: 9, type: 'slash' });
    expect(boss()).toMatchObject({ done: true, label: 'Howler' });
  });

  it('a dungeon’s pause map is its room plan; Project › Maps and a map’s own look are kept', () => {
    const { bus, s, map, p } = game(true);
    expect(p.mapLooks().pause.type).toBe('floors');
    expect(
      bus.execute(
        {
          type: 'project.update',
          payload: { maps: { pause: { type: 'chart' }, mini: { type: 'round', size: 200 } } },
        } as never,
        {
          source: 'user',
        },
      ).ok,
    ).toBe(true);
    expect(s.get<Settings>(paths.settings)?.maps?.mini?.size).toBe(200);
    const bad = bus.execute({ type: 'project.update', payload: { maps: { pause: { type: 'globe' } } } } as never, {
      source: 'user',
    });
    expect(bad.ok).toBe(false);
    expect(
      bus.execute({ type: 'map.setLook', payload: { map, look: { mini: { type: 'screens' } } } } as never, {
        source: 'user',
      }).ok,
    ).toBe(true);
    expect(s.get<MapDoc>(paths.map(map))?.mapLook?.mini?.type).toBe('screens');
    bus.execute({ type: 'map.setLook', payload: { map, look: null } } as never, { source: 'user' });
    expect(s.get<MapDoc>(paths.map(map))?.mapLook).toBeUndefined();
  });
});
