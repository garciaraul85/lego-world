import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { blankScene, rewardScene } from '../../../core/cinematic/templates';
import { newId } from '../../../core/ids';
import { type Cinematic, type Instances, type MapDoc, paths } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { musicOptions, soundOptions } from '../../panels/AudioFields';
import { CameraPreview } from './CameraPreview';
import { CastPanel } from './CastPanel';
import { ItemInspector } from './ItemInspector';
import { addItem, newItem, type Row, rowsOf, type Sel, setItem } from './model';
import { DirectorPreview } from './preview';
import { ShotList } from './ShotList';
import { Stage, type StageApi } from './Stage';
import { Tracks } from './Tracks';

/**
 * Cinematics director (board 7, P6.3): cast actors, set marks, give instructions, place and cut
 * cameras, then add dialogue, music, sound, post effects and logic events on the timeline.
 * Every edit is one `cinematic.put` (one undo step); the preview reloads the scene and shows
 * the playhead.
 */
export function Director({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const list = ed.store
    .list('cinematics/')
    .map((p) => ed.store.get<Cinematic>(p)!)
    .filter(Boolean);
  const cin = list.find((x) => x.id === ed.cinematicId.value) ?? list[0] ?? null;
  useEffect(() => {
    if (cin && ed.cinematicId.value !== cin.id) ed.cinematicId.value = cin.id;
  }, [cin?.id]);

  const create = (kind: 'reward' | 'blank') => {
    const map = ed.mapDoc.value ?? ed.store.get<MapDoc>(paths.map(ed.store.manifest.entry.map))!;
    const sp = map.spawns.find((s) => s.id === ed.store.manifest.entry.spawn) ?? map.spawns[0];
    const at = (sp?.pos ?? [0, 0.4, 0]) as [number, number, number];
    const id = newId('cinematic');
    const inst = ed.store.get<Instances>(paths.instances(map.id));
    const neighbour = inst?.items.find((i) => i.kind === 'npc');
    const giver =
      neighbour && neighbour.kind === 'npc'
        ? neighbour.character
        : BUILTIN_CHARACTERS.find((x) => x.name === 'Chef')!.id;
    const scene =
      kind === 'reward'
        ? rewardScene({ id, map: map.id, at, giver, name: 'Quest complete!' })
        : blankScene({ id, map: map.id, at, name: `Scene ${list.length + 1}` });
    if (ed.exec({ type: 'cinematic.put', payload: { cinematic: scene } }, { label: `New cinematic ${scene.name}` }).ok)
      ed.cinematicId.value = id;
  };

  if (!cin)
    return (
      <div class="studio director-ws">
        <section class="panel studio-main" aria-label="Director">
          <div class="placeholder">
            <h2>Cinematics director</h2>
            <p class="muted">
              Direct a scene like a film shoot: cast actors, set marks, give instructions, place and cut cameras, then
              add dialogue, music, sound and events. Zones, assets, screen buttons, gates, clips and logic can play it.
            </p>
            <div class="row">
              <button type="button" class="btn on" onClick={() => create('reward')}>
                New reward scene (example)
              </button>
              <button type="button" class="btn" onClick={() => create('blank')}>
                New empty scene
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  return <DirectorFor key={cin.map} c={c} cin={cin} list={list} onCreate={create} />;
}

function DirectorFor({
  c,
  cin,
  list,
  onCreate,
}: {
  c: ActionCtx;
  cin: Cinematic;
  list: Cinematic[];
  onCreate: (k: 'reward' | 'blank') => void;
}) {
  const { ed } = c;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [role, setRole] = useState<string | null>(cin.cast[0]?.role ?? null);
  const [record, setRecord] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const stage = useRef<StageApi | null>(null);
  const preview = useMemo(() => {
    try {
      return new DirectorPreview(ed, cin.map);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [cin.map]);
  useEffect(() => () => preview?.dispose(), [preview]);
  // reload the scene on every edit (and when another scene is picked)
  useEffect(() => {
    preview?.load(cin, Math.min(time, cin.length));
  }, [preview, cin]);
  useEffect(() => {
    if (time > cin.length) setTime(cin.length);
  }, [cin.length]);

  const seek = (t: number) => {
    setPlaying(false);
    preview?.pause();
    const v = Math.max(0, Math.min(cin.length, t));
    preview?.seek(v);
    setTime(v);
  };
  // real-time playback with sound
  useEffect(() => {
    if (!playing || !preview) return;
    let raf = 0;
    let last = performance.now();
    if (time >= cin.length - 1e-6) {
      preview.load(cin, 0);
      setTime(0);
    }
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = preview.play(dt);
      setTime(t);
      if (t >= cin.length) {
        setPlaying(false);
        preview.pause();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const save = (next: Cinematic, label: string) =>
    ed.exec({ type: 'cinematic.put', payload: { cinematic: next } }, { label });
  const rows = rowsOf(cin);
  const add = (row: Row) => {
    const item = newItem(row, time, cin, {
      sound: soundOptions(ed)[0]?.id ?? 'snd_uiclick000',
      music: musicOptions(ed)[0]?.id ?? 'mus_explore000',
    });
    const r = addItem(cin, row, item);
    if (save(r.cin, `Add ${row.label.toLowerCase()} item`).ok) setSel(r.sel);
  };
  const fromView = () => {
    const cam = stage.current?.camera;
    if (!cam) return;
    const f = cam.frame();
    const n = (cin.tracks.find((t) => t.kind === 'camera')?.items.length ?? 0) + 1;
    const r = addItem(cin, rows.find((x) => x.kind === 'camera')!, {
      t: Math.round(time * 10) / 10,
      shot: `Shot ${n}`,
      pos: f.eye.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      lookAt: cam.target.map((v) => Math.round(v * 10) / 10) as [number, number, number],
      fov: Math.round((cam.fov * 180) / Math.PI),
      blend: 0,
    });
    if (save(r.cin, 'Camera from view').ok) setSel(r.sel);
  };
  const recordAt = (pos: [number, number, number]) => {
    if (!role) {
      ed.notify('Pick a role in the cast first (●).');
      return;
    }
    let n = cin.marks.length + 1;
    while (cin.marks.some((m) => m.id === `m${n}`)) n++;
    const from = preview?.session.cine.frame?.actors.get(role)?.pos ?? pos;
    const yaw = Math.atan2(pos[0] - from[0], pos[2] - from[2]);
    const withMark = { ...cin, marks: [...cin.marks, { id: `m${n}`, pos, yaw }] };
    const row = rows.find((r) => r.kind === 'actor' && r.role === role)!;
    const r = addItem(withMark, row, { t: Math.round(time * 10) / 10, do: 'moveTo', mark: `m${n}`, speed: 'walk' });
    if (save(r.cin, `Record ${role} walking`).ok) setSel(r.sel);
  };
  const del = () => {
    if (sel && 'track' in sel) {
      save(setItem(cin, sel.track, sel.item, null), 'Delete item');
      setSel(null);
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel && 'track' in sel) {
          e.preventDefault();
          del();
        }
      } else if (e.key === ' ' && (e.target as HTMLElement).closest('.director-ws')) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div class="studio director-ws">
      <section class="panel studio-lib" aria-label="Scenes, cast and shots">
        <div class="ptabs">
          <span class="tab on">Director</span>
        </div>
        <div class="scroll">
          <div class="sech" style={{ padding: '8px 10px 4px' }}>
            <span>Scenes · {list.length}</span>
            <span class="row">
              <button type="button" class="link" onClick={() => onCreate('blank')}>
                + New
              </button>
              <button type="button" class="link" onClick={() => onCreate('reward')} title="An example reward scene">
                + Reward
              </button>
            </span>
          </div>
          {list.map((x) => (
            <button
              type="button"
              class={`lib-item ${x.id === cin.id ? 'on' : ''}`}
              onClick={() => {
                ed.cinematicId.value = x.id;
                setSel(null);
                setTime(0);
              }}
            >
              <span class="asset-name">🎬 {x.name}</span>
              <span class="mono small muted">{x.length}s</span>
            </button>
          ))}
          <CastPanel ed={ed} cin={cin} role={role} onRole={setRole} onChange={save} />
          <ShotList
            cin={cin}
            sel={sel}
            onPick={(track, item, t) => {
              setSel({ track, item });
              seek(t);
            }}
            onFromView={fromView}
          />
        </div>
      </section>
      <section class="panel studio-main" aria-label="Director stage and timeline">
        <div class="studio-tools" role="toolbar" aria-label="Director tools">
          <input
            class="inp lg-name"
            aria-label="Scene name"
            value={cin.name}
            onChange={(e) => {
              const name = (e.target as HTMLInputElement).value.trim().slice(0, 80);
              if (name) save({ ...cin, name }, 'Rename cinematic');
            }}
          />
          <button type="button" class="btn" aria-label="To start" onClick={() => seek(0)}>
            ⏮
          </button>
          <button type="button" class={`btn ${playing ? '' : 'on'}`} onClick={() => setPlaying(!playing)}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <span class="mono small">
            {time.toFixed(1)} / {cin.length.toFixed(1)} s
          </span>
          <span class="sep" />
          <button
            type="button"
            class={`btn ${record ? 'rec on' : ''}`}
            aria-pressed={record}
            title="Click the stage ground to make the selected role walk there"
            onClick={() => setRecord(!record)}
          >
            ● Record{role ? ` ${role}` : ''}
          </button>
          <button type="button" class="btn" onClick={fromView} title="A camera at the playhead from the stage view">
            🎥 Camera from view
          </button>
          <span class="sep" />
          <button
            type="button"
            class="btn go"
            onClick={() => c.ui.play('engine', { cinematic: cin.id })}
            title="Play the game with this scene"
          >
            ▶ Play in game
          </button>
          <button
            type="button"
            class="btn danger"
            onClick={() => {
              if (ed.exec({ type: 'cinematic.delete', payload: { id: cin.id } }).ok) ed.cinematicId.value = null;
            }}
          >
            Delete scene
          </button>
        </div>
        {failed || !preview ? (
          <div class="placeholder">
            <strong>The stage could not open</strong>
            <span class="muted">{failed}</span>
          </div>
        ) : (
          <div class="dr-views">
            <Stage
              preview={preview}
              cin={cin}
              selMark={sel && 'mark' in sel ? sel.mark : null}
              record={record}
              onSelectMark={(m) => setSel(m ? { mark: m } : null)}
              onMoveMark={(id, pos) =>
                save({ ...cin, marks: cin.marks.map((m) => (m.id === id ? { ...m, pos } : m)) }, 'Move mark')
              }
              onGround={recordAt}
              onApi={(a) => (stage.current = a)}
            />
            <CameraPreview preview={preview} tick={time} />
          </div>
        )}
        <Tracks
          ed={ed}
          cin={cin}
          player={preview?.session.cine.player ?? null}
          time={time}
          sel={sel}
          onSeek={seek}
          onSelect={setSel}
          onChange={save}
          onAdd={add}
        />
      </section>
      <section class="panel studio-lib" aria-label="Item properties">
        <div class="ptabs">
          <span class="tab on">Properties</span>
        </div>
        <div class="scroll">
          <ItemInspector
            ed={ed}
            cin={cin}
            sel={sel}
            onChange={save}
            onSelect={setSel}
            stageView={() => {
              const cam = stage.current?.camera;
              if (!cam) return null;
              const f = cam.frame();
              return {
                eye: f.eye.map((v) => Math.round(v * 10) / 10) as [number, number, number],
                target: cam.target.map((v) => Math.round(v * 10) / 10) as [number, number, number],
              };
            }}
          />
        </div>
      </section>
    </div>
  );
}
