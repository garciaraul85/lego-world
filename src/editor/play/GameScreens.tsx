import type { Signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { LEGACY_COLORS } from '../../core/legacy/constants';
import type { PlayRenderer } from '../../engine/runtime/play-renderer';
import type { PlaySession } from '../../engine/runtime/session';
import { CinematicOverlay } from '../../engine/ui/CinematicOverlay';
import { type ScreenHost, ScreenLayer } from '../../engine/ui/ScreenRenderer';
import { WorldUI } from '../../engine/ui/WorldUI';
import type { EditorState } from '../state';

/**
 * The game's screens (HUD, title, pause, dialogue, game over…) and world UI over the Play view
 * (P5.7-5.9). `tick` bumps every frame so bound values stay live; only this component re-renders.
 */
export function GameScreens({
  ed,
  session: s,
  renderer,
  tick,
}: {
  ed: EditorState;
  session: PlaySession;
  renderer: () => PlayRenderer | null;
  tick: Signal<number>;
}) {
  const worldRef = useRef<HTMLDivElement>(null);
  const wui = useRef<WorldUI | null>(null);
  const t = tick.value;
  const host: ScreenHost = useMemo(() => {
    const mini = minimapDrawer(s);
    return {
      lookup: s.lookup,
      run: (actions) => s.uiActions.run(actions, s.uiClock),
      sound: (id) => s.audio.play(id),
      pressed: (screen, widget) => s.screenButton(screen, widget),
      text: (screen, widget) => s.screenText.get(`${screen}:${widget}`),
      media: (ref) => ed.media?.url(ref),
      minimap: mini,
      touch: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    };
  }, [s]);
  useEffect(() => {
    wui.current = new WorldUI(worldRef.current!);
    return () => wui.current?.dispose();
  }, [s]);
  // world UI follows the play camera every frame
  useEffect(() => {
    const pr = renderer();
    const el = worldRef.current;
    if (!pr || !el || !wui.current) return;
    const cam = pr.lastCamera;
    if (!cam) return;
    const st = s.heroState;
    wui.current.update(
      s.world.worldUi,
      cam,
      el.clientWidth || 1,
      el.clientHeight || 1,
      [st.x, st.y + 1, st.z],
      s.lookup,
    );
  });
  const cine = s.cine.player;
  const screens = s.screens.screens().filter((x) => !(cine?.cin.hideHud && x.kind === 'hud'));
  return (
    <>
      <div ref={worldRef} class="bw-world-layer" aria-hidden="true" hidden={!!cine?.cin.hideHud} />
      {cine && s.cine.frame && (
        <CinematicOverlay post={s.cine.frame.post} skippable={cine.cin.skippable} onSkip={() => s.cine.skip()} />
      )}
      <ScreenLayer screens={screens} host={host} tick={t} />
    </>
  );
}

/** Top-down map of the current world: bricks cached per world/damage, hero and neighbours live. */
function minimapDrawer(s: PlaySession) {
  let cache: { key: string; img: HTMLCanvasElement; x0: number; z0: number; k: number } | null = null;
  return (canvas: HTMLCanvasElement) => {
    const w = s.world;
    const key = `${w.mapId}:${w.pieces.length}:${w.brokenSerial}`;
    const W = canvas.width;
    if (!cache || cache.key !== key) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (const p of w.pieces) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x + 2);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z + 2);
      }
      if (!Number.isFinite(x0)) [x0, x1, z0, z1] = [-16, 16, -16, 16];
      const k = W / Math.max(8, x1 - x0, z1 - z0);
      const img = document.createElement('canvas');
      img.width = W;
      img.height = W;
      const g = img.getContext('2d');
      if (g) {
        g.fillStyle = '#0b1020';
        g.fillRect(0, 0, W, W);
        const top = new Map<string, { y: number; c: number }>();
        for (const p of w.pieces) {
          const kk = `${Math.floor(p.x)},${Math.floor(p.z)}`;
          const cur = top.get(kk);
          if (!cur || p.y >= cur.y) top.set(kk, { y: p.y, c: p.color });
        }
        for (const [kk, v] of top) {
          const [x, z] = kk.split(',').map(Number) as [number, number];
          g.fillStyle = LEGACY_COLORS[v.c]?.[1] ?? '#888';
          g.fillRect((x - x0) * k, (z - z0) * k, Math.max(1, k * 2), Math.max(1, k * 2));
        }
      }
      cache = { key, img, x0, z0, k };
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.drawImage(cache.img, 0, 0);
    g.fillStyle = '#ffffff';
    for (const n of w.npcs) {
      g.fillRect((n.state.x - cache.x0) * cache.k - 1.5, (n.state.z - cache.z0) * cache.k - 1.5, 3, 3);
    }
    const h = s.heroState;
    const hx = (h.x - cache.x0) * cache.k;
    const hz = (h.z - cache.z0) * cache.k;
    g.fillStyle = '#f7c900';
    g.beginPath();
    g.arc(hx, hz, 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f7c900';
    g.beginPath();
    g.moveTo(hx, hz);
    g.lineTo(hx + Math.sin(h.heading) * 9, hz + Math.cos(h.heading) * 9);
    g.stroke();
  };
}
