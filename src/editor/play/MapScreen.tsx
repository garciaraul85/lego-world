/**
 * Milestone 3b (B7a-1): the pause map — a full screen over the game (M, or Map on the pause screen). It draws the
 * map the hero is on in the game's look for it (grid of screens, parchment, sea chart, contour, or a dungeon's room
 * plan floor by floor), with its markers and a legend; a click puts down the chosen stamp, a right-click (or Shift-
 * click) takes the nearest up. M or Esc closes it.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { PAUSE_TYPE_INFO } from '../../core/maps/look';
import { drawPause, floorName, floorTabAt, type MapPlace, stampShape } from '../../engine/maps/draw';
import { floorOf, STAMPS, type Stamp } from '../../engine/maps/model';
import type { PlaySession } from '../../engine/runtime/session';

const STAMP_NAMES: Record<Stamp, string> = {
  star: 'Star',
  heart: 'Heart',
  flag: 'Flag',
  cross: 'Cross',
  skull: 'Skull',
  chest: 'Chest',
  eye: 'Eye',
  leaf: 'Leaf',
};

export function MapScreen({ s, tick }: { s: PlaySession; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const place = useRef<MapPlace | null>(null);
  const [stamp, setStamp] = useState<Stamp>('star');
  const [note, setNote] = useState('');
  const model = s.mapModel();
  const { pause } = s.mapLooks();
  const [floor, setFloor] = useState<number | null>(null);
  const shown = floor ?? (model.dungeon && model.hero ? floorOf(model.hero.y) : 0);
  const rec = s.puzzles.dungeons.get(s.world.mapId);
  const legend = model.dungeon
    ? { keys: rec?.keys ?? 0, bossKey: !!rec?.boss, map: !!rec?.map, compass: !!rec?.compass }
    : null;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (g) place.current = drawPause(g, w, h, model, pause, { floor: shown, t: performance.now() / 1000, legend });
  });
  // the hero blinks: redraw a few times a second while open
  const [, setBeat] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBeat((b) => b + 1), 250);
    return () => clearInterval(id);
  }, []);
  void tick;
  const toWorld = (e: MouseEvent): [number, number] | null => {
    const p = place.current;
    const c = ref.current;
    if (!p || !c) return null;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left - p.ox) / p.k + p.x0, (e.clientY - r.top - p.oy) / p.k + p.z0];
  };
  const click = (e: MouseEvent) => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const tab =
      model.dungeon && pause.type === 'floors'
        ? floorTabAt(model, { x: 0, y: 0 }, e.clientX - r.left, e.clientY - r.top)
        : null;
    if (tab !== null) return setFloor(tab);
    const at = toWorld(e);
    if (!at) return;
    if (e.shiftKey) s.unpinMap(at[0], at[1], 6 / (place.current?.k ?? 1) + 2);
    else s.pinMap(at[0], at[1], stamp, note.trim() || undefined);
    setBeat((b) => b + 1);
  };
  const unpin = (e: MouseEvent) => {
    e.preventDefault();
    const at = toWorld(e);
    if (at) s.unpinMap(at[0], at[1], 6 / (place.current?.k ?? 1) + 2);
    setBeat((b) => b + 1);
  };
  return (
    <div class="bw-mapscreen" role="dialog" aria-label="Map">
      <header class="bw-mapscreen-head">
        <strong>{model.name}</strong>
        <span class="muted small">
          {PAUSE_TYPE_INFO[pause.type].label}
          {model.dungeon && pause.type === 'floors' ? ` · ${floorName(shown)}` : ''}
        </span>
        <TrackedGoal s={s} />
        <button type="button" class="bw-mapscreen-close" onClick={() => s.openMap(false)} aria-label="Close the map">
          Close (M)
        </button>
      </header>
      <canvas ref={ref} class="bw-mapscreen-canvas" aria-label="The map" onClick={click} onContextMenu={unpin} />
      <footer class="bw-mapscreen-foot">
        <span class="muted small">Stamp:</span>
        {STAMPS.map((st) => (
          <button
            type="button"
            class={`bw-stamp${st === stamp ? ' on' : ''}`}
            aria-label={`Stamp ${STAMP_NAMES[st]}`}
            aria-pressed={st === stamp}
            onClick={() => setStamp(st)}
          >
            <StampIcon stamp={st} />
          </button>
        ))}
        <input
          class="bw-mapscreen-note"
          aria-label="Pin note"
          placeholder="Note (optional)"
          maxLength={40}
          value={note}
          onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        />
        <span class="muted small">Click: put down · Right-click or Shift-click: take up</span>
      </footer>
    </div>
  );
}

/** Milestone 3b (B7a-2): the tracked quest and its step (where the diamond on the map is) */
function TrackedGoal({ s }: { s: PlaySession }) {
  const d = s.quests.trackedQuest();
  const st = d ? s.quests.stepOf(d) : null;
  if (!s.quests.begun().length) return null;
  return (
    <span class="bw-mapscreen-goal" data-tour="map-goal">
      {d && st ? (
        <span>
          <span aria-hidden="true">◆ </span>
          <strong>{d.name}</strong>: {st.name}
        </span>
      ) : (
        <span class="muted">No quest tracked</span>
      )}
      <button type="button" onClick={() => s.openQuests(true)}>
        Quests (J)
      </button>
    </span>
  );
}

function StampIcon({ stamp }: { stamp: Stamp }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 22, 22);
    g.save();
    g.translate(11, 11);
    stampShape(g, stamp, 8, {
      back: '#000000',
      water: '#000000',
      wall: '#000000',
      fog: '#000000',
      ink: '#ffffff',
      accent: '#ffd23f',
    });
    g.restore();
  }, [stamp]);
  return <canvas ref={ref} width={22} height={22} aria-hidden="true" />;
}
