import { describe, expect, it } from 'vitest';
import SHOTS from '../../docs/help/shots/index.json';
import { FakeProvider } from '../../src/core/ai/fake';
import { CommandBus, registerAll } from '../../src/core/commands';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { ActionCtx, EditorUi } from '../../src/editor/actions/registry';
import { ACTIONS, MENUS } from '../../src/editor/actions/registry';
import { askBrix, brixTools } from '../../src/editor/brix/agent';
import { answerOffline, linkRef, showable } from '../../src/editor/brix/answer';
import { showSteps, stepsToView, viewOf } from '../../src/editor/brix/views';
import { helpEntries } from '../../src/editor/help/entries';
import { helpPages } from '../../src/editor/help/pages';
import { EditorState } from '../../src/editor/state';

/** P19: Brix answers from Help, links its pages, and shows the way to a control without changing the project. */
function sandbox() {
  const store = new ProjectStore(newProjectFiles({ name: 'Brix sandbox', mapName: 'Practice map' }));
  const bus = registerAll(new CommandBus(store));
  const backend = new MemoryBackend();
  const ed = new EditorState({ store, bus, autosave: new Autosave(store, backend), backend });
  const opened: string[] = [];
  const ui = { workspace: (w: string) => opened.push(w) } as unknown as EditorUi;
  return { ed, store, opened, c: { ed, ui } as ActionCtx };
}
const pageIds = new Set(helpPages().map((p) => p.id));

describe('Brix answers from Help without a key', () => {
  it('“how do I add a checkpoint” → checkpoint steps, a Show me and links to real pages', () => {
    const a = answerOffline('how do I add a checkpoint?');
    expect(a.offline).toBe(true);
    expect(a.text.toLowerCase()).toContain('checkpoint');
    expect(a.show.length).toBeGreaterThan(0);
    expect(a.show.some((id) => /checkpoint|saving/.test(id))).toBe(true);
    expect(a.links.length).toBeGreaterThan(0);
    for (const l of a.links) expect(pageIds.has(l.page), l.page).toBe(true);
    expect(linkRef({ page: 'scene', anchor: 'zones', title: '' })).toBe('scene#zones');
  });

  it('answers a few everyday questions with something to show', () => {
    for (const q of ['how do I add music', 'how do I play my game', 'where is the undo button', 'make an enemy']) {
      const a = answerOffline(q);
      expect(a.links.length, q).toBeGreaterThan(0);
      expect(a.text.length, q).toBeGreaterThan(10);
    }
    expect(showable('music').length).toBeGreaterThan(0);
  });

  it('greets, and says so when Help has nothing', () => {
    expect(answerOffline('hello there').text).toMatch(/Brix/);
    const none = answerOffline('qqzzxv');
    expect(none.text).toMatch(/couldn’t find/);
    expect(none.links[0]!.page).toBe('start');
  });
});

describe('Show me', () => {
  it('walks from anywhere to Project › Saving: Scene workspace, the Project tab, then the control', () => {
    expect(viewOf('scene.saving')).toBe('scene-project');
    const steps = showSteps('scene.saving')!;
    expect(steps.map((s) => s.say)).toEqual(['Open the Scene workspace.', 'Open the Project tab.', expect.any(String)]);
    expect(steps[0]!.press && steps[1]!.press).toBe(true);
    expect(steps.at(-1)!.entry).toBe('scene.saving');
    expect(steps.at(-1)!.press).toBeFalsy();
  });

  it('every view the Help pictures were taken in has a way there; every control entry can be shown', () => {
    const views = new Set(Object.values((SHOTS as { entries: Record<string, { s: string }> }).entries).map((e) => e.s));
    // (Brix's own pictures show its panel, opened by asking)
    for (const v of views) if (!v.startsWith('brix')) expect(stepsToView(v).length, v).toBeGreaterThan(0);
    for (const e of helpEntries()) if (e.match?.length) expect(showSteps(e.id), e.id).not.toBeNull();
    // reference entries (commands, nodes) have no control: no Show me
    const ref = helpEntries().find((e) => !e.match?.length)!;
    expect(showSteps(ref.id)).toBeNull();
  });

  it('only moves around the editor: running every step of every view changes no project file', () => {
    const { c, store, opened } = sandbox();
    const before = JSON.stringify([...store.keys()].sort().map((k) => [k, store.get(k)]));
    const views = new Set(Object.values((SHOTS as { entries: Record<string, { s: string }> }).entries).map((e) => e.s));
    for (const v of [...views, 'scene-zone', 'scene-spawn', 'logic-code', 'screens-widget', 'palette'])
      for (const s of stepsToView(v)) {
        s.run?.(c);
        s.done?.(c);
      }
    expect(JSON.stringify([...store.keys()].sort().map((k) => [k, store.get(k)]))).toBe(before);
    expect(opened).toContain('Scene');
    expect(c.ed.palette.value).toBe(true);
    expect(c.ed.logicView.value).toBe('split');
  });
});

describe('Brix with Claude', () => {
  it('has read-only tools: none can run a command or change a file', () => {
    const names = brixTools({ show: [], links: [] }).map((t) => t.name);
    expect(names).toEqual(['search_help', 'read_help_page', 'list_tutorials', 'describe_genre', 'point_at', 'cite']);
  });

  it('searches, points and cites; Show me and links come back with the answer', async () => {
    const fake = new FakeProvider([
      { tools: [{ name: 'search_help', input: { query: 'checkpoint' } }] },
      {
        tools: [
          { name: 'point_at', input: { entry: 'scene.saving' } },
          { name: 'point_at', input: { entry: 'not.real' } },
          { name: 'cite', input: { page: 'e/scene.saving' } },
          { name: 'read_help_page', input: { page: 'scene' } },
          { name: 'list_tutorials', input: {} },
          { name: 'describe_genre', input: { genre: 'explore' } },
        ],
      },
      { text: 'Open Project › Saving and choose Checkpoints.' },
    ]);
    const r = await askBrix({
      provider: fake,
      question: 'how do checkpoints work?',
      signal: new AbortController().signal,
    });
    expect(r.answer.offline).toBe(false);
    expect(r.answer.text).toMatch(/Saving/);
    expect(r.answer.show).toEqual(['scene.saving']);
    expect(r.answer.links.map((l) => l.page)).toEqual(['e/scene.saving']);
    const search = JSON.parse(fake.log[0]!.result) as { page: string }[];
    expect(search.length).toBeGreaterThan(0);
    expect(fake.log.find((l) => l.name === 'point_at' && !l.ok)?.result).toMatch(/No Help entry/);
    expect(fake.log.find((l) => l.name === 'list_tutorials')!.result).toMatch(/saving/);
    expect(fake.log.find((l) => l.name === 'describe_genre')!.result).toMatch(/checklist/);
    expect(fake.runs[0]!.instructions).toMatch(/never change the project/);
    expect(r.turns.at(-1)!.role).toBe('assistant');
  });
});

describe('Help menu', () => {
  it('has Ask Brix (Shift F1)', () => {
    const a = ACTIONS.find((x) => x.id === 'help.brix')!;
    expect(a.key).toBe('Shift F1');
    expect(MENUS.Help).toContain('help.brix');
  });
});
