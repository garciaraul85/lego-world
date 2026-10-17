import { describe, expect, it } from 'vitest';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type MapDoc, paths } from '../../src/core/schema';
import type { ActionCtx, EditorUi } from '../../src/editor/actions/registry';
import { EditorState } from '../../src/editor/state';
import { chestFront, chestOnMap, STORY_DOERS } from '../../src/editor/tutorial/story';

/** P32: the treasure-chest story's helpers on the tutorial's practice map. */
function sandbox() {
  const store = new ProjectStore(newProjectFiles({ name: 'Tutorial sandbox', mapName: 'Practice map' }));
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  const ed = new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
  return { ed, c: { ed, ui: {} as EditorUi } as ActionCtx };
}

describe('the chest stage', () => {
  it('places a chest with open ground and a trigger zone in front of it, once', () => {
    const { ed, c } = sandbox();
    STORY_DOERS.chestStage!(c, {});
    const chest = chestOnMap(ed);
    expect(chest).toBeTruthy();
    const f = chestFront(ed)!;
    const m = ed.store.get<MapDoc>(paths.map(ed.store.manifest.entry.map))!;
    expect(m.zones.some((z) => z.tags.includes('Chest'))).toBe(true);
    // the hero stands in front of the lid (+z of an unturned chest), facing it (−z: yaw π)
    expect(f.pos[2]).toBeGreaterThan(chest!.pos[2] + 2);
    expect(Math.abs(Math.abs(f.yaw) - Math.PI)).toBeLessThan(1e-6);
    STORY_DOERS.chestStage!(c, {});
    const again = ed.store.get<MapDoc>(paths.map(ed.store.manifest.entry.map))!;
    expect(again.zones.length).toBe(m.zones.length);
  });
});
