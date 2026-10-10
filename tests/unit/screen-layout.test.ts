import { describe, expect, it } from 'vitest';
import { BUILTIN_SCREENS, SCR } from '../../src/builtin/screens';
import { Screen } from '../../src/core/schema';
import { asLines, bindingsOf, interpolate } from '../../src/engine/ui/bindings';
import { placeRect, REF_H, REF_W, screenScale, widgetCss } from '../../src/engine/ui/layout';
import { ScreenStack } from '../../src/engine/ui/ScreenStack';
import { allScreens, resolveScreen, screenOfKind } from '../../src/engine/ui/screens';
import { projectPoint } from '../../src/engine/ui/WorldUI';

describe('Screen layout (P5.7)', () => {
  it('scales the 1280×720 reference to fit and grows the virtual canvas on the loose axis', () => {
    expect(screenScale(1280, 720)).toMatchObject({ scale: 1, vw: REF_W, vh: REF_H });
    const phone = screenScale(2340, 1080);
    expect(phone.scale).toBe(1.5);
    expect(phone.vh).toBe(720);
    expect(phone.vw).toBe(1560);
    const safe = screenScale(1280, 720, { top: 0, right: 40, bottom: 0, left: 40 });
    expect(safe.x).toBe(40);
    expect(safe.vh).toBeGreaterThan(720);
  });

  it('places anchored widgets with the anchor as pivot plus the offset', () => {
    const parent = { x: 0, y: 0, w: 1280, h: 720 };
    expect(placeRect({ anchor: [0, 0], offset: [24, 20] }, parent, 100, 40)).toEqual({ x: 24, y: 20, w: 100, h: 40 });
    expect(placeRect({ anchor: [1, 0], offset: [-24, 20] }, parent, 100, 40)).toEqual({
      x: 1156,
      y: 20,
      w: 100,
      h: 40,
    });
    expect(placeRect({ anchor: [0.5, 1], offset: [0, -64] }, parent, 200, 40)).toEqual({
      x: 540,
      y: 616,
      w: 200,
      h: 40,
    });
    const css = widgetCss({
      type: 'text',
      anchor: [1, 1],
      offset: [-10, -5],
      style: { w: 120, bg: '#000', weight: 'bold' },
    });
    expect(css).toMatchObject({
      position: 'absolute',
      left: '100%',
      top: '100%',
      width: '120px',
      background: '#000',
      fontWeight: 700,
    });
    expect(css.transform).toBe('translate(-100%, -100%) translate(-10px, -5px)');
    expect(widgetCss({ type: 'text' }).position).toBeUndefined(); // flows in its panel
  });

  it('binds {var} text, formats values and lists', () => {
    const vars: Record<string, unknown> = { hp: 2, 'map.name': 'Prairie', ratio: 0.3333 };
    expect(interpolate('{hp} ♥ in {map.name} · {ratio} · {missing}', (n) => vars[n])).toBe('2 ♥ in Prairie · 0.33 · ');
    expect(bindingsOf('a {x} b {y.z}')).toEqual(['x', 'y.z']);
    expect(asLines(new Map([['coin', 3]]))).toEqual(['coin × 3']);
  });

  it('built-in screens are valid and cover the flow; project files override by id', () => {
    for (const s of BUILTIN_SCREENS) expect(Screen.safeParse(s).success).toBe(true);
    expect(BUILTIN_SCREENS.map((s) => s.kind).sort()).toEqual([
      'dialogue',
      'gameover',
      'hud',
      'pause',
      'splash',
      'title',
    ]);
    const mine = { ...BUILTIN_SCREENS.find((s) => s.id === SCR.hud)!, name: 'My HUD' };
    const custom = { ...mine, id: 'scr_shop000001', kind: 'custom' as const, name: 'Shop' };
    const files = new Map<string, unknown>([
      [`screens/${SCR.hud}.json`, mine],
      ['screens/scr_shop000001.json', custom],
    ]);
    expect(resolveScreen(files, SCR.hud)?.name).toBe('My HUD');
    expect(allScreens(files).map((s) => s.name)).toEqual([
      'Splash',
      'Title',
      'My HUD',
      'Pause',
      'Dialogue',
      'Game over',
      'Shop',
    ]);
    expect(screenOfKind(files, 'hud')?.name).toBe('My HUD');
  });
});

describe('ScreenStack (P5.8)', () => {
  it('push / replace / pop / hide; any visible pausing screen pauses the game', () => {
    const files = new Map<string, unknown>();
    const st = new ScreenStack((id) => resolveScreen(files, id));
    let changes = 0;
    st.onChange(() => changes++);
    st.set([SCR.hud]);
    expect(st.pausesGame).toBe(false);
    st.push(SCR.pause);
    expect(st.pausesGame).toBe(true);
    expect(st.top()?.kind).toBe('pause');
    st.replace(SCR.gameover);
    expect(st.ids).toEqual([SCR.hud, SCR.gameover]);
    st.hide(SCR.gameover);
    expect(st.pausesGame).toBe(false);
    expect(st.push('scr_nothere000')).toBe(false);
    expect(st.pop()).toBe(SCR.hud);
    expect(changes).toBe(5);
  });
});

describe('World UI projection (P5.9)', () => {
  it('projects a point in front of the camera to the screen and drops points behind it', () => {
    const cam = {
      eye: [0, 0, 10] as [number, number, number],
      right: [1, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      forward: [0, 0, -1] as [number, number, number],
      fov: Math.PI / 2,
      distance: 10,
    };
    expect(projectPoint(cam, 1, [0, 0, 0])).toEqual({ x: 0.5, y: 0.5, depth: 10 });
    const p = projectPoint(cam, 1, [5, 5, 0])!;
    expect(p.x).toBeCloseTo(0.75, 6);
    expect(p.y).toBeCloseTo(0.25, 6);
    expect(projectPoint(cam, 1, [0, 0, 20])).toBeNull();
  });
});
