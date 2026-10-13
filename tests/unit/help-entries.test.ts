import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import SHOTS from '../../docs/help/shots/index.json';
import { CommandBus, registerAll } from '../../src/core/commands';
import { CATALOG } from '../../src/core/logic/catalog';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { ACTIONS } from '../../src/editor/actions/registry';
import { ACTION_HELP, COMMAND_TYPES, GUIDES, helpEntries, helpEntry, SCREENS } from '../../src/editor/help/entries';
import { helpPages } from '../../src/editor/help/pages';
import { HelpIndex } from '../../src/editor/help/search';
import { COURSES } from '../../src/editor/tutorial/index';
import { WIDGET_TYPES } from '../../src/editor/workspaces/screens/model';

/** P32: Help covers every element, and every entry is complete and points at things that exist. */
describe('Help entries', () => {
  const entries = helpEntries();

  it('have unique ids, a name and a purpose', () => {
    const ids = new Set<string>();
    for (const e of entries) {
      expect(ids.has(e.id), `duplicate ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.name, e.id).toBeTruthy();
      expect(e.purpose.length, `${e.id} needs a purpose`).toBeGreaterThan(10);
    }
    expect(entries.length).toBeGreaterThan(300);
  });

  it('cover every action, command, logic node and widget', () => {
    for (const a of ACTIONS.filter((x) => !x.id.startsWith('window.'))) {
      expect(ACTION_HELP[a.id], `ACTION_HELP is missing ${a.id}`).toBeTruthy();
      expect(helpEntry(`action.${a.id}`)).not.toBeNull();
    }
    const s = new ProjectStore(newProjectFiles({ name: 'A', random: () => 0.6 }));
    const bus = registerAll(new CommandBus(s)) as unknown as { handlers: Map<string, unknown> };
    const registered = [...(bus.handlers?.keys?.() ?? [])].sort();
    if (registered.length) expect([...COMMAND_TYPES].sort()).toEqual(registered);
    for (const t of COMMAND_TYPES) expect(helpEntry(`command.${t}`)?.purpose, t).toBeTruthy();
    for (const d of CATALOG) expect(helpEntry(`node.${d.type}`), d.type).not.toBeNull();
    for (const t of WIDGET_TYPES) expect(helpEntry(`widget.${t}`), t).not.toBeNull();
  });

  it('link only to entries, guides and pages that exist', () => {
    const pages = new Set(helpPages().map((p) => p.id));
    const screens = new Set(SCREENS.map((x) => x.id as string));
    const ok = (r: string) =>
      r.startsWith('help:')
        ? pages.has(r.slice(5).split('#')[0]!)
        : r.startsWith('guide:')
          ? screens.has(r.slice(6))
          : !!helpEntry(r);
    for (const e of entries) for (const r of e.related ?? []) expect(ok(r), `${e.id} → ${r}`).toBe(true);
  });

  it('give every screen a guide with numbered areas and five top tasks', () => {
    for (const sc of SCREENS) {
      const g = GUIDES.find((x) => x.screen === sc.id);
      expect(g, `${sc.id} has no guide`).toBeTruthy();
      expect(g!.areas.length).toBeGreaterThan(0);
      expect(g!.top).toHaveLength(5);
      for (const a of g!.areas) expect(helpEntry(a), `${sc.id} area ${a}`).not.toBeNull();
      for (const [, id] of g!.top) expect(helpEntry(id), `${sc.id} task ${id}`).not.toBeNull();
    }
  });

  it('have a picture for every control and every guide area (npm run help:shots refreshes them)', () => {
    const idx = SHOTS as unknown as {
      states: Record<string, string>;
      entries: Record<string, { s: string }>;
      guides: Record<string, { s: string; areas: Record<string, unknown> }>;
    };
    const missing = entries
      .filter((e) => e.match?.length && !idx.entries[e.id])
      .filter((e) => !e.id.startsWith('action.')) // actions without a menu item are listed in the command palette
      .map((e) => e.id);
    expect(missing).toEqual([]);
    for (const g of GUIDES) {
      expect(idx.guides[g.screen], g.screen).toBeTruthy();
      expect(
        g.areas.filter((a) => !idx.guides[g.screen]!.areas[a]),
        `${g.screen} areas`,
      ).toEqual([]);
    }
    for (const f of Object.values(idx.states)) expect(existsSync(`docs/help/shots/${f}`), f).toBe(true);
  });

  it('give every screen a 3–5 minute course: a tour of its areas, then hands-on steps', () => {
    for (const sc of SCREENS) {
      const ch = COURSES[sc.id];
      expect(ch, sc.id).toBeTruthy();
      const tour = ch.steps.filter((s) => s.id.startsWith('tour.'));
      const practice = ch.steps.filter((s) => !s.id.startsWith('tour.'));
      expect(tour.length, `${sc.id} tour`).toBeGreaterThan(0);
      expect(practice.length, `${sc.id} practice`).toBeGreaterThan(0);
      // about 20 s to read a tour step and 30 s per hands-on step
      const seconds = tour.length * 20 + practice.length * 30;
      expect(seconds, `${sc.id} course length`).toBeGreaterThanOrEqual(120);
      expect(seconds, `${sc.id} course length`).toBeLessThanOrEqual(330);
    }
  });
});

/** P32: questions people (and Brix) ask; the right page must be among the first answers. */
describe('Help answers questions', () => {
  const idx = new HelpIndex(helpPages());
  const top = (q: string) => idx.search(q, 3).map((h) => h.page);
  it.each([
    ['how do I place a brick', /tool\.place/],
    ['make a door open when I press E', /assets\.sockets|node\.event\.onInteract/],
    ['change the colour of a brick', /scene\.selection|tool\.paint|bricks\.colors/],
    ['add a trigger zone', /zone/],
    ['where does the hero start', /scene\.spawn|scene\.project/],
    ['connect two maps', /world\.gate|guide\/world/],
    ['keep score', /logic\.vars/],
    ['make the hud fit a phone', /screens\.check|screens#every-screen|^screens$/],
    ['draw an icon', /art/],
    ['make my own font', /art\.font/],
    ['turn an asset upside down', /scene\.asset\.turn/],
    ['play from the title screen', /play\.entry/],
    ['make a character the hero', /characters\.player/],
    ['play music on a map', /scene\.map\.audio/],
    ['volume of effects', /mixer/],
    ['camera shot cinematic', /cinematics\.shots|^cinematics$/],
  ])('%s', (q, want) => {
    expect(
      top(q).some((p) => want.test(p)),
      `${q} → ${top(q).join(', ')}`,
    ).toBe(true);
  });
});
