import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { nodeDef } from '../../src/core/logic/catalog';
import { fieldHelp } from '../../src/core/logic/field-help';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type Cinematic, type LogicGraph, paths } from '../../src/core/schema';
import type { ActionCtx, EditorUi } from '../../src/editor/actions/registry';
import { describeUse, eventNames, eventUses } from '../../src/editor/events';
import { EditorState } from '../../src/editor/state';
import { STATE_TESTS } from '../../src/editor/tutorial/checks';
import { MARK_RADIUS, markTarget, STORY_DOERS, storyText } from '../../src/editor/tutorial/story';
import { trackPose } from '../../src/editor/workspaces/character-studio/thumbs';
import {
  assetOfInput,
  nameProblem,
  nameProblems,
  placedObjects,
  statesOf,
  variableUses,
} from '../../src/editor/workspaces/logic/pickers';
import { graph } from './logic-helpers';

/** P32: values picked from what the project has, names checked, and the tutorial's exact numbers. */
function sandbox() {
  const store = new ProjectStore(newProjectFiles({ name: 'Pickers', mapName: 'Practice map' }));
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  const ed = new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
  const c = { ed, ui: {} as EditorUi } as ActionCtx;
  STORY_DOERS.chestStage!(c, {});
  return { ed, c };
}

function addGraph(ed: EditorState, g: LogicGraph) {
  const r = ed.exec({ type: 'logic.create', payload: { graph: g } });
  expect(r.ok, r.error).toBe(true);
  return g;
}

describe('logic pickers', () => {
  it('lists placed objects by asset name, and an asset’s states', () => {
    const { ed } = sandbox();
    const objs = placedObjects(ed);
    const chest = objs.find((o) => o.value === 'Treasure chest');
    expect(chest?.note).toMatch(/placed on Practice map/);
    const g = addGraph(ed, graph([['world.setState', { target: 'Treasure chest', state: 'open' }]], []));
    const a = assetOfInput(ed, g, g.nodes[0]!.id, 'target');
    expect(statesOf(a).map((s) => s.value)).toEqual(['closed', 'open']);
  });

  it('flags a name that matches nothing: an object not placed, a missing state, an unknown asset', () => {
    const { ed } = sandbox();
    const g = addGraph(
      ed,
      graph(
        [
          ['world.setState', { target: 'Treasure chest', state: 'opened' }],
          ['world.despawn', { target: 'Dragon' }],
          ['world.spawnNear', { item: 'Unicorn', near: 'Treasure chest' }],
          ['world.setState', { target: 'Treasure chest', state: 'open' }],
        ],
        [],
      ),
    );
    const [st, de, sp, ok] = g.nodes;
    expect(nameProblem(ed, g, st!.id, 'state')).toMatch(/has no state “opened” \(it has: closed, open\)/);
    expect(nameProblem(ed, g, de!.id, 'target')).toMatch(/No placed object is called “Dragon”/);
    expect(nameProblem(ed, g, sp!.id, 'item')).toMatch(/No asset is called “Unicorn”/);
    expect(nameProblem(ed, g, ok!.id, 'state')).toBeNull();
    expect(nameProblems(ed, g)).toHaveLength(3);
  });

  it('follows a wired object to the item it is (Sword: in, out)', () => {
    const { ed } = sandbox();
    const g = addGraph(
      ed,
      graph(
        [
          ['world.spawnNear', { item: 'Sword', near: 'Treasure chest' }],
          ['world.setState', { state: 'up' }],
        ],
        [[1, 'entity', 2, 'target']],
      ),
    );
    expect(nameProblem(ed, g, g.nodes[1]!.id, 'state')).toMatch(/Sword has no state “up” \(it has: in, out\)/);
  });

  it('every field the story uses explains where its value comes from', () => {
    const set = nodeDef('world.setState')!;
    expect(fieldHelp(set, 'state')).toMatch(/States in the Assets screen/);
    expect(fieldHelp(set, 'target')).toMatch(/asset’s name/);
    expect(fieldHelp(nodeDef('event.onCustom')!, 'event')).toMatch(/exactly this name/);
    expect(fieldHelp(nodeDef('var.get')!, 'var')).toMatch(/Variables list/);
  });

  it('a variable lists where it is used', () => {
    const { ed } = sandbox();
    addGraph(ed, { ...graph([['var.get', { var: 'chestItem' }]], []), name: 'Treasure chest' });
    expect(variableUses(ed, 'chestItem')).toEqual(['graph Treasure chest']);
    expect(variableUses(ed, 'other')).toEqual([]);
  });
});

describe('event names', () => {
  it('knows who sends and who listens, including a scene’s Events row', () => {
    const { ed } = sandbox();
    addGraph(ed, { ...graph([['event.onCustom', { event: 'scene-opens-chest' }]], []), name: 'Treasure chest' });
    const uses = eventUses(ed.store);
    // the built-in chest sends its own event when E opens it (a different name)
    expect(eventNames(ed.store)).toContain('chest-opened');
    expect(describeUse(uses.get('scene-opens-chest'))).toBe('nothing sends it yet; heard by graph Treasure chest');
    const cin: Cinematic = {
      id: 'cin_aaaaaaaaaa' as Cinematic['id'],
      name: 'Treasure chest',
      map: ed.store.manifest.entry.map as Cinematic['map'],
      length: 8,
      skippable: true,
      letterbox: true,
      hideHud: true,
      cast: [{ role: 'hero', actor: '$hero' }],
      marks: [{ id: 'mark1', pos: [0, 0, 0], yaw: 0 }],
      tracks: [{ kind: 'event', items: [{ t: 2.9, emit: 'scene-opens-chest' }] }],
    } as Cinematic;
    expect(ed.exec({ type: 'cinematic.put', payload: { cinematic: cin } }).ok).toBe(true);
    expect(describeUse(eventUses(ed.store).get('scene-opens-chest'))).toBe(
      'sent by scene Treasure chest at 2.9 s; heard by graph Treasure chest',
    );
  });
});

describe('the mark step names exact numbers', () => {
  it('fills X, Z and Facing from the chest, and passes only inside the ring and facing it', () => {
    const { ed, c } = sandbox();
    const t = markTarget(ed)!;
    expect(t.x * 2).toBe(Math.round(t.x * 2));
    expect(storyText(ed, 'X {{markX}}, Z {{markZ}}, {{markFacing}}°')).toBe(`X ${t.x}, Z ${t.z}, ${t.facing}°`);
    // an unturned chest: the hero faces −z
    expect(Math.abs(t.facing)).toBe(180);
    STORY_DOERS.chestSpot!(c, {});
    expect(ed.tutorialSpot.value?.radius).toBe(MARK_RADIUS);
    const cin = {
      id: 'cin_bbbbbbbbbb',
      name: 'Treasure chest',
      map: ed.store.manifest.entry.map,
      length: 8,
      skippable: true,
      letterbox: true,
      hideHud: true,
      cast: [{ role: 'hero', actor: '$hero' }],
      marks: [{ id: 'mark1', pos: [t.x + 3, t.y, t.z], yaw: 0 }],
      tracks: [],
    } as unknown as Cinematic;
    const put = (marks: Cinematic['marks']) =>
      ed.exec({ type: 'cinematic.put', payload: { cinematic: { ...cin, marks } } });
    put(cin.marks);
    ed.cinematicId.value = cin.id;
    const at = (facing?: boolean) => STATE_TESTS.cineMarkAtChest!(ed, facing ? { facing } : undefined);
    expect(at()).toBe(false);
    put([{ id: 'mark1', pos: [t.x + 1, t.y, t.z], yaw: 0 }]);
    expect(at()).toBe(true);
    expect(at(true)).toBe(false);
    put([{ id: 'mark1', pos: [t.x, t.y, t.z], yaw: ((t.facing - 20) * Math.PI) / 180 }]);
    expect(at(true)).toBe(true);
    expect(ed.store.get(paths.cinematic(cin.id))).toBeTruthy();
  });
});

describe('track pictures', () => {
  it('moves one joint per picture, mirrored on the left', () => {
    const r = trackPose('rightArm', 'z')!;
    const l = trackPose('leftArm', 'z')!;
    expect(r.clip.tracks[0]!.keys[0]![1]).toBe(-l.clip.tracks[0]!.keys[0]![1]);
    expect(trackPose('rightForearm', 'bend')).toBeTruthy();
    expect(trackPose('prop', 'grip0')).toBeNull();
  });
});
