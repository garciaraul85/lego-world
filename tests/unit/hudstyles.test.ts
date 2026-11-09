import { describe, expect, it } from 'vitest';
import { BUILTIN_SCREENS } from '../../src/builtin/screens';
import { hudScreenFor } from '../../src/builtin/screens/hud-styles';
import { CommandBus, registerAll } from '../../src/core/commands';
import { buttonsOf, Controls, LAYOUTS } from '../../src/core/controls/controls';
import { CustomHud, customFromEra, faceInLook, HUD_SIZE_PX, hudLookOf } from '../../src/core/controls/hud-custom';
import { DEFAULT_HUD_STYLE, faceOf, HUD_STYLE_INFO, HUD_STYLES, plainFace } from '../../src/core/controls/hud-styles';
import { gatherItem, importCommands } from '../../src/core/library/library';
import { allHooksOf, isGameClass } from '../../src/core/logic/builtins';
import { parseBehaviour } from '../../src/core/logic/code/behaviour';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { type LogicGraph, paths, Screen, type Settings } from '../../src/core/schema';
import course from '../../src/editor/tutorial/content/59-hud-styles.json';
import { RecordingAudio } from '../../src/engine/audio/port';
import { GameButtons, HOLD_FOR_WHEEL } from '../../src/engine/runtime/buttons';
import { PlaySession } from '../../src/engine/runtime/session';

/** Milestone 3b (B7b): HUD styles after each era, their buttons' behaviour, and the buttons and HUD in logic. */
function behaviour(name: string, code: string): LogicGraph {
  const r = parseBehaviour(code);
  if ('error' in r) throw new Error(`line ${r.error.line}: ${r.error.message}`);
  const id = `lg_${name.replace(/\W/g, '').toLowerCase().padEnd(10, 'x').slice(0, 10)}`;
  return { id: id as LogicGraph['id'], name, scope: 'global', behaviour: r.behaviour, nodes: r.nodes, edges: r.edges };
}
// biome-ignore lint/suspicious/noExplicitAny: test helper
const run = (bus: CommandBus, c: any) => bus.execute(c, { source: 'user' });
const HUD = BUILTIN_SCREENS.find((s) => s.id === 'scr_hud0000000')!;

describe('the HUD styles', () => {
  it('five eras, oldest first, each on a layout that exists, every button face known', () => {
    expect(HUD_STYLES).toEqual(['corner64', 'cube', 'pointer', 'tablet', 'openair']);
    for (const st of HUD_STYLES) {
      const info = HUD_STYLE_INFO[st];
      expect(LAYOUTS).toContain(info.layout);
      expect(Controls.safeParse({ layout: info.layout, hud: st }).success).toBe(true);
      // each button the layout has (but menu and moving) wears a face, or shows plainly
      expect(faceOf(st, 'action')?.glyph).toBeTruthy();
    }
    expect(faceOf('corner64', 'item1')).toMatchObject({ glyph: '◀', color: '#f3c233' });
    expect(buttonsOf({ layout: 'pointer' })).toEqual(expect.arrayContaining(['action', 'attack', 'item1', 'wheel']));
    expect(buttonsOf({ layout: 'pointer' })).not.toContain('item2');
    expect(buttonsOf({ layout: 'cube' }).filter((b) => b.startsWith('item'))).toHaveLength(3);
  });

  it('each era arranges the built-in HUD (the widgets keep their ids); the tablet’s second screen holds map and buttons', () => {
    for (const st of HUD_STYLES) {
      const s = hudScreenFor(st, HUD);
      expect(Screen.safeParse(s).success, st).toBe(true);
    }
    const tab = hudScreenFor('tablet', HUD);
    const panel = tab.root.children!.find((w) => w.id === 'tablet')!;
    expect(panel.children!.map((w) => w.id)).toEqual(['minimap', 'buttons', 'money']);
    const open = hudScreenFor('openair', HUD);
    expect(open.root.children!.find((w) => w.id === 'stamina')?.style?.shape).toBe('ring');
    expect(hudScreenFor('corner64', HUD).root.children!.find((w) => w.id === 'buttons')?.anchor).toEqual([1, 0]);
  });

  it('hud.applyStyle sets the layout and arranges the HUD; there is no plain look (null is refused); Undo', () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Hud', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: 'cube' } }).ok).toBe(true);
    expect(s.get<Settings>(paths.settings)?.controls).toMatchObject({ layout: 'cube', hud: 'cube' });
    expect(s.get<Screen>(paths.screen('scr_hud0000000'))?.root.children?.some((w) => w.id === 'money')).toBe(true);
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: 'glasses' } }).ok).toBe(false);
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: null } }).ok).toBe(false);
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: 'tablet' } }).ok).toBe(true);
    bus.undo();
    expect(s.get<Settings>(paths.settings)?.controls?.hud).toBe('cube');
  });

  it('a game that has not picked plays with Open air; every button of its layout still shows (the extra ones plainly)', () => {
    expect(DEFAULT_HUD_STYLE).toBe('openair');
    expect(hudLookOf(undefined, () => undefined)).toMatchObject({ id: 'openair', era: 'openair' });
    expect(hudLookOf('hsy_gonegonego', () => undefined).id).toBe('openair');
    // Open air draws no third item button: it is shown plainly, with its number
    expect(
      faceInLook(
        hudLookOf('openair', () => undefined),
        'item3',
      ),
    ).toBeNull();
    expect(plainFace('item3')).toMatchObject({ glyph: '3', size: 'small' });
    const { p } = (() => {
      const st = new ProjectStore(newProjectFiles({ name: 'Hud', random: () => 0.3, noNeighbours: true }));
      return { p: new PlaySession(st.snapshot(), { audio: new RecordingAudio() }) };
    })();
    expect(p.hudStyle()).toBe('openair');
    expect(p.buttonViews().map((b) => b.id)).toEqual(expect.arrayContaining(['guard', 'lock', 'attack', 'action']));
  });
});

describe('HUD styles of your own', () => {
  const mk = () => {
    const s = new ProjectStore(newProjectFiles({ name: 'Hud', random: () => 0.3, noNeighbours: true }));
    return { s, bus: registerAll(new CommandBus(s)) };
  };

  it('one started from an era keeps that era’s faces, placed as it places them, inside its box', () => {
    for (const era of HUD_STYLES) {
      const c = customFromEra(era, 'hsy_aaaaaaaaaa', 'Mine');
      expect(CustomHud.safeParse(c).success, era).toBe(true);
      expect(c.layout).toBe(HUD_STYLE_INFO[era].layout);
      for (const [b, f] of Object.entries(c.faces)) {
        expect(f!.glyph, `${era} ${b}`).toBe(faceOf(era, b)!.glyph);
        expect(f!.x + HUD_SIZE_PX[f!.size], `${era} ${b} x`).toBeLessThanOrEqual(c.w + 30);
        expect(f!.y + HUD_SIZE_PX[f!.size], `${era} ${b} y`).toBeLessThanOrEqual(c.h + 30);
      }
    }
    expect(customFromEra('corner64', 'hsy_aaaaaaaaaa', 'Mine').faces.action).toMatchObject({
      x: 78,
      y: 4,
      size: 'big',
    });
  });

  it('hudstyle.put saves one (checked); hud.applyStyle plays with it: its layout, its era’s arrangement; delete goes back to Open air', () => {
    const { s, bus } = mk();
    const st: CustomHud = {
      id: 'hsy_triangle01',
      name: 'Triangle pad',
      layout: 'ocarina',
      base: 'cube',
      w: 200,
      h: 150,
      labels: false,
      plate: '#223344',
      faces: {
        action: { glyph: '▲', color: '#e04848', size: 'big', x: 65, y: 0 },
        attack: { glyph: '◀', color: '#3f74e6', size: 'mid', x: 0, y: 80 },
      },
    };
    expect(run(bus, { type: 'hudstyle.put', payload: { style: { ...st, faces: {} } } }).ok).toBe(false);
    expect(run(bus, { type: 'hudstyle.put', payload: { style: { ...st, w: 5 } } }).ok).toBe(false);
    expect(run(bus, { type: 'hudstyle.put', payload: { style: st } }).ok).toBe(true);
    expect(s.get(paths.hudStyle(st.id))).toEqual(st);
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: 'hsy_nothere00' } }).ok).toBe(false);
    expect(run(bus, { type: 'hud.applyStyle', payload: { style: st.id } }).ok).toBe(true);
    expect(s.get<Settings>(paths.settings)?.controls).toMatchObject({ layout: 'ocarina', hud: st.id });
    // the cube era's arrangement: its map has a gold frame
    const hud = s.get<Screen>(paths.screen('scr_hud0000000'))!;
    expect(hud.root.children!.find((w) => w.id === 'minimap')?.style?.border).toBe('#c9a74a');
    // in Play: its faces, and only its buttons (a button with no face is left out)
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    expect(p.hudStyle()).toBe(st.id);
    expect(faceInLook(p.hudLook(), 'action')?.glyph).toBe('▲');
    expect(faceInLook(p.hudLook(), 'item1')).toBeNull();
    // logic changes to it by name, and back
    p.inputOp('style', 0, 0, 'cube');
    expect(p.hudStyle()).toBe('cube');
    p.inputOp('style', 0, 0, 'triangle pad');
    expect(p.hudStyle()).toBe(st.id);
    expect(run(bus, { type: 'hudstyle.delete', payload: { id: st.id } }).ok).toBe(true);
    expect(s.get<Settings>(paths.settings)?.controls?.hud).toBeUndefined();
    bus.undo();
    expect(s.get<Settings>(paths.settings)?.controls?.hud).toBe(st.id);
  });

  it('a HUD style goes to My library and comes into another game', () => {
    const { s, bus } = mk();
    const st = customFromEra('pointer', 'hsy_remote0001', 'Remote');
    expect(run(bus, { type: 'hudstyle.put', payload: { style: st } }).ok).toBe(true);
    const item = gatherItem(s, 'hudstyle', st.id, { from: 'Hud' })!;
    expect(item).toMatchObject({ kind: 'hudstyle', name: 'Remote', main: 'hudstyles/hsy_remote0001.json' });
    const other = mk();
    const r = importCommands(other.s, item);
    expect(run(other.bus, r.commands).ok).toBe(true);
    expect(other.s.get<CustomHud>(paths.hudStyle(st.id))?.name).toBe('Remote');
  });
});

describe('the eras’ buttons', () => {
  it('the pointer era: a tap uses the item button’s item; held, the item wheel opens and letting go uses nothing', () => {
    const used: (string | null)[] = [];
    let menus = 0;
    const b = new GameButtons(
      { layout: 'pointer' },
      {
        offers: () => [],
        act: () => {},
        attack: () => {},
        jump: () => {},
        guard: () => {},
        roll: () => {},
        lock: () => {},
        move: () => {},
        useItem: (item) => used.push(item),
        itemMenu: () => menus++,
        count: () => 1,
      },
    );
    b.equip(1, 'Bow');
    b.press('item1');
    b.update(0.1);
    b.release('item1');
    expect(used).toEqual(['Bow']);
    b.press('item1');
    for (let t = 0; t <= HOLD_FOR_WHEEL + 0.05; t += 0.05) b.update(0.05);
    expect(menus).toBe(1);
    b.release('item1');
    expect(used).toEqual(['Bow']);
  });
});

describe('the buttons and the HUD in logic', () => {
  function game(...graphs: LogicGraph[]) {
    const s = new ProjectStore(newProjectFiles({ name: 'Hud', random: () => 0.3, noNeighbours: true }));
    const bus = registerAll(new CommandBus(s));
    const r = run(bus, [
      { type: 'hud.applyStyle', payload: { style: 'corner64' } },
      ...graphs.map((g) => ({ type: 'logic.create', payload: { graph: g } })),
    ]);
    expect(r.ok, r.error).toBe(true);
    const p = new PlaySession(s.snapshot(), { audio: new RecordingAudio() });
    p.placeAt([0, 0.4, 0], 0);
    const step = (sec: number) => {
      for (let t = 0; t < sec; t += 1 / 60) p.runtime.stepOnce();
    };
    step(0.1);
    return { p, step };
  }

  it('PlayerInput and GameHud are the game’s (not attached), with their hooks', () => {
    expect(allHooksOf('PlayerInput').map((h) => h.method)).toEqual(['actionLabel', 'canPress']);
    expect(allHooksOf('GameHud').map((h) => h.method)).toEqual(['showWidget', 'widgetText']);
    expect(isGameClass('PlayerInput') && isGameClass('GameHud')).toBe(true);
  });

  it('canPress stops a button; actionLabel renames the Action button; presses are heard with their face', () => {
    const inp = behaviour(
      'My Buttons',
      `class MyButtons extends PlayerInput {
  downs = 0;
  face = "";
  canPress(e) {
    return e.button !== "attack";
  }
  actionLabel(e) {
    if (e.kind === "custom") {
      return "Shove";
    }
    return e.base;
  }
  buttonDown(e) {
    this.downs += 1;
    this.face = e.face;
  }
}`,
    );
    const { p, step } = game(inp);
    expect(p.hudStyle()).toBe('corner64');
    // something logic offers the Action button (Set action label): PlayerInput renames it
    p.buttons.custom = 'Push';
    step(0.1);
    expect(p.buttons.now?.label).toBe('Shove');
    p.buttons.press('attack');
    expect(p.buttons.down.has('attack')).toBe(false);
    p.buttons.press('item1');
    step(0.05);
    p.buttons.release('item1');
    step(0.05);
    expect(p.logic.selfOf(inp.id, 'input')).toMatchObject({ downs: 1, face: '◀' });
  });

  it('input.enable turns the buttons off; hud.setStyle changes the look while playing; rumble is asked for', () => {
    const { p } = game();
    p.inputOp('off', 0, 0, '');
    p.buttons.press('action');
    expect(p.buttons.down.size).toBe(0);
    p.inputOp('on', 0, 0, '');
    p.inputOp('style', 0, 0, 'openair');
    expect(p.hudStyle()).toBe('openair');
    p.inputOp('style', 0, 0, 'default');
    expect(p.hudStyle()).toBe('corner64');
    p.inputOp('rumble', 0.8, 0.4, '');
    expect(p.rumble).toEqual({ strength: 0.8, seconds: 0.4 });
  });

  it('GameHud: showWidget hides a widget, widgetText changes what a text widget says', () => {
    const hud = behaviour(
      'My Hud',
      `class MyHud extends GameHud {
  showWidget(e) {
    return e.widget !== "minimap";
  }
  widgetText(e) {
    if (e.widget === "money") {
      return "Rupoints";
    }
    return e.base;
  }
}`,
    );
    const { p } = game(hud);
    expect(p.hudShows('scr_hud0000000', 'minimap')).toBe(false);
    expect(p.hudShows('scr_hud0000000', 'hearts')).toBe(true);
    expect(p.hudText('scr_hud0000000', 'mapname', 'Start')).toBe('Start');
    expect(p.hudText('scr_hud0000000', 'money', '◆ 3')).toBe('Rupoints');
  });

  it('the course’s own classes compile and do what it says: Action heard, a long press changes the look, My Hud hears it', () => {
    const codeOf = (name: string) => {
      for (const st of course.steps)
        for (const d of st.doItForMe as { fn: string; args?: { name?: string; behaviour?: string; code?: string[] } }[])
          if (d.args?.code && (d.args.name ?? d.args.behaviour) === name)
            return d.args.code.join('\n').replace('$NAME', name.replace(/\s/g, ''));
      throw new Error(name);
    };
    const btn = behaviour('My Buttons', codeOf('My Buttons'));
    const hud = behaviour('My Hud', codeOf('My Hud'));
    const { p, step } = game(btn, hud);
    p.buttons.press('action');
    step(0.05);
    p.buttons.release('action');
    step(0.05);
    expect(p.events.some((e) => e.msg.includes('Action pressed'))).toBe(true);
    p.buttons.press('guard');
    step(1.2);
    p.buttons.release('guard');
    step(0.1);
    expect(p.hudStyle()).toBe('openair');
    expect(p.rumble).toMatchObject({ strength: 0.5 });
    expect(p.events.some((e) => e.msg.includes('The HUD changed'))).toBe(true);
  });
});
