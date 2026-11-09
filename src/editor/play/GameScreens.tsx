import type { Signal } from '@preact/signals';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Bindable } from '../../core/controls/controls';
import { mediaCredits } from '../../core/media/uses';
import { type MediaIndex, paths } from '../../core/schema';
import { drawMini } from '../../engine/maps/draw';
import type { PlayRenderer } from '../../engine/runtime/play-renderer';
import type { PlaySession } from '../../engine/runtime/session';
import { artUrl, fontCss } from '../../engine/ui/art';
import { CinematicOverlay } from '../../engine/ui/CinematicOverlay';
import { DialogueLayer } from '../../engine/ui/DialogueLayer';
import { ScreenFxOverlay } from '../../engine/ui/ScreenFxOverlay';
import { type ScreenHost, ScreenLayer } from '../../engine/ui/ScreenRenderer';
import { projectPoint, WorldUI } from '../../engine/ui/WorldUI';
import { MapThumb } from '../components/previews';
import type { EditorState } from '../state';
import { MapScreen } from './MapScreen';
import { QuestLog } from './QuestLog';

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
      look: ed.store.manifest.uiLook,
      run: (actions) => s.uiActions.run(actions, s.uiClock),
      sound: (id) => s.audio.play(id),
      pressed: (screen, widget) => s.screenButton(screen, widget),
      text: (screen, widget) => s.screenText.get(`${screen}:${widget}`),
      media: (ref) => ed.media?.url(ref),
      credits: () => mediaCredits(ed.store.get<MediaIndex>(paths.media)),
      // step 11b part 1: the game's buttons, the item menu and the player's keys
      buttons: () => s.buttonViews(),
      items: () => s.itemViews(),
      slots: () => s.slotViews(),
      equip: (slot, item) => s.equip(slot, item),
      bindings: () => s.bindingViews(),
      // Milestone 3b (B7b): the HUD style, GameHud's decisions, the second screen's touched items
      hudStyle: () => s.hudStyle(),
      hudDef: (id) => s.customHud(id),
      shown: (screen, widget) => s.hudShows(screen, widget),
      hudText: (screen, widget, text) => s.hudText(screen, widget, text),
      tap: (b) => {
        s.buttons.press(b as Bindable);
        setTimeout(() => s.buttons.release(b as Bindable), 90);
      },
      rebind: (id, key) => s.rebind(id, key),
      resetBindings: () => s.resetBindings(),
      art: (id) => artUrl(ed.store, ed.media, id),
      font: (ref) => fontCss(ed.store, ed.media, ref),
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
  // P22: a conversation hides the old dialogue box (its own layer shows the line)
  const talk = s.talks.view;
  const screens = s.screens
    .screens()
    .filter((x) => !(cine?.cin.hideHud && x.kind === 'hud') && !(talk && x.kind === 'dialogue'));
  let anchor: { x: number; y: number } | null = null;
  if (talk?.look.style === 'bubble') {
    const pr = renderer();
    const npc = s.talking;
    const cam = pr?.lastCamera;
    const el = worldRef.current;
    if (cam && el) {
      const at = npc
        ? [npc.state.x, npc.state.y + 2.6, npc.state.z]
        : [s.heroState.x, s.heroState.y + 2.6, s.heroState.z];
      const pt = projectPoint(cam, (el.clientWidth || 1) / (el.clientHeight || 1), at);
      if (pt) anchor = { x: pt.x, y: pt.y };
    }
  }
  return (
    <>
      {/* P23 part 2: the map's mood and screen effects, under the world UI and screens */}
      <ScreenFxOverlay
        mood={s.mood}
        layers={s.screenFx.layers()}
        lowHealth={s.lowHealth()}
        clock={s.clock}
        lens={s.lens.amount}
      />
      <div ref={worldRef} class="bw-world-layer" aria-hidden="true" hidden={!!cine?.cin.hideHud} />
      {cine && s.cine.frame && (
        <CinematicOverlay post={s.cine.frame.post} skippable={cine.cin.skippable} onSkip={() => s.cine.skip()} />
      )}
      <ScreenLayer
        screens={screens}
        host={host}
        tick={t}
        textScale={s.progress.settings.textSize === 'large' ? 1.25 : 1}
      />
      {talk && (
        <DialogueLayer
          view={talk}
          shown={s.talks.revealed()}
          focus={s.talks.focus}
          anchor={anchor}
          onNext={() => s.dialogueNext()}
          onChoose={(i) => s.dialogueChoose(i)}
          blip={(ev, pitch) => s.audio.play(ev, { pitch })}
          // P23 part 3: the portrait talks too (its closed face while a mouth shape is first drawn)
          portrait={(who, mood) => s.portraitOf(who, mood, s.talks.mouth()) ?? s.portraitOf(who, mood)}
        />
      )}
      {s.loading && <LoadingScreen ed={ed} s={s} />}
      {s.mapOpen && <MapScreen s={s} tick={t} />}
      {s.questsOpen && <QuestLog s={s} tick={t} />}
    </>
  );
}

/**
 * Milestone 3b (B7a-1): the map in play (the HUD's Minimap widget): drawn in the game's look for it (Project ›
 * Maps: square, round with a compass ring, grid of screens, or none)
 */
function minimapDrawer(s: PlaySession) {
  return (canvas: HTMLCanvasElement) => {
    const { mini } = s.mapLooks();
    const size = mini.size;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    canvas.style.display = mini.type === 'off' ? 'none' : '';
    const g = canvas.getContext('2d');
    if (!g || mini.type === 'off') return;
    drawMini(g, size, s.mapModel(), mini, s.camYaw, s.clock);
  };
}

/** P27 part 3c: tips shown while a map loads (P21 lets makers write their own) */
export const LOADING_TIPS = [
  'Hold E near broken bricks to build them back.',
  'Q guards; tap it just before a hit lands to parry.',
  'C rolls out of the way; Z locks on to the nearest foe.',
  'Shift runs. Space jumps.',
  'Talk to people with T: they may have something for you.',
  'The minimap shows the area around you.',
  'M opens the map: put down pins and stamps where you want to go back to.',
  'J opens the quest log: track a quest to see where to go next on the maps.',
];

/** P27 part 3c: the built-in loading screen: where you are going, a tip, its picture and real progress */
function LoadingScreen({ ed, s }: { ed: EditorState; s: PlaySession }) {
  const l = s.loading!;
  const tip = LOADING_TIPS[Math.abs(hashString(l.mapId)) % LOADING_TIPS.length]!;
  const pct = Math.round(l.progress * 100);
  return (
    <div class="bw-loading" role="status" aria-label="Loading" data-tour="loading-screen">
      <MapThumb store={ed.store} mapId={l.mapId} size={160} />
      <strong class="bw-loading-name">{l.name}</strong>
      <div class="bw-loading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span class="small">Loading… {pct}%</span>
      <span class="muted small">{tip}</span>
    </div>
  );
}

const hashString = (t: string) => {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return h;
};
