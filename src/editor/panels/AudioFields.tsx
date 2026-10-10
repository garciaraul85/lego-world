import { SND } from '../../builtin/audio';
import { type Cinematic, type EmitterInstance, type Instances, paths, type UiInstance } from '../../core/schema';
import { audioData } from '../../engine/audio/data';
import { allScreens } from '../../engine/ui/screens';
import type { ActionCtx } from '../actions/registry';
import { Header, Num, TextField } from '../components/fields';
import type { EditorState } from '../state';

/** Pickers for ActionListField (sound, music and screen actions). */
export function actionChoices(ed: EditorState) {
  return {
    sounds: soundOptions(ed).map((o) => ({ id: o.id, name: o.name })),
    music: musicOptions(ed),
    screens: allScreens(ed.store).map((s) => ({ id: s.id, name: `${s.name} · ${s.kind}` })),
    cinematics: cinematicOptions(ed),
  };
}

/** The project's cinematics, by name. */
export function cinematicOptions(ed: EditorState) {
  ed.revision.value;
  return ed.store
    .list('cinematics/')
    .map((p) => ed.store.get<Cinematic>(p)!)
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Sound events of the project (built-ins + its own), by name. */
export function soundOptions(ed: EditorState) {
  ed.revision.value;
  return Object.entries(audioData(ed.store).events)
    .map(([id, e]) => ({ id, name: e.name ?? id, bus: e.bus }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function musicOptions(ed: EditorState) {
  ed.revision.value;
  return Object.entries(audioData(ed.store).music.states).map(([id, m]) => ({ id, name: m.name ?? id }));
}

export function SoundSelect({
  ed,
  value,
  onPick,
  label,
  none,
}: {
  ed: EditorState;
  value: string | null | undefined;
  onPick: (id: string | null) => void;
  label: string;
  none?: string;
}) {
  return (
    <select
      class="inp"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onPick((e.target as HTMLSelectElement).value || null)}
    >
      {none !== undefined && <option value="">{none}</option>}
      {soundOptions(ed).map((o) => (
        <option value={o.id}>
          {o.name} · {o.bus}
        </option>
      ))}
    </select>
  );
}

/** value undefined = "no change" (zones), null = silence */
export function MusicSelect({
  ed,
  value,
  onPick,
  label,
  inherit,
}: {
  ed: EditorState;
  value: string | null | undefined;
  onPick: (id: string | null | undefined) => void;
  label: string;
  inherit?: string;
}) {
  const v = value === undefined ? '~' : value === null ? '' : value;
  return (
    <select
      class="inp"
      aria-label={label}
      value={v}
      onChange={(e) => {
        const x = (e.target as HTMLSelectElement).value;
        onPick(x === '~' ? undefined : x === '' ? null : x);
      }}
    >
      {inherit && <option value="~">{inherit}</option>}
      <option value="">Silence</option>
      {musicOptions(ed).map((o) => (
        <option value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

export function ScreenSelect({
  ed,
  value,
  onPick,
  label,
  none,
}: {
  ed: EditorState;
  value: string | null;
  onPick: (id: string | null) => void;
  label: string;
  none: string;
}) {
  ed.revision.value;
  return (
    <select
      class="inp"
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onPick((e.target as HTMLSelectElement).value || null)}
    >
      <option value="">{none}</option>
      {allScreens(ed.store).map((s) => (
        <option value={s.id}>
          {s.name} · {s.kind}
        </option>
      ))}
    </select>
  );
}

/** Map tab › Audio: the map's music and ambience (P5.4). */
export function MapAudioSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const m = ed.mapDoc.value;
  if (!m) return null;
  const set = (p: object) => ed.exec({ type: 'map.setAudio', payload: { map: m.id, ...p } });
  return (
    <>
      <div class="field">
        Music
        <MusicSelect ed={ed} label="Map music" value={m.music} onPick={(music) => set({ music: music ?? null })} />
      </div>
      <div class="field">
        Ambience
        <SoundSelect
          ed={ed}
          label="Map ambience"
          value={m.ambience}
          none="None"
          onPick={(ambience) => set({ ambience })}
        />
      </div>
      <p class="hint">Music zones override the map music while the hero is inside (Trigger zone › Music).</p>
    </>
  );
}

/** Zone inspector › Audio (P5.4, P5.5). */
export function ZoneAudio({
  c,
  map,
  zone,
}: {
  c: ActionCtx;
  map: string;
  zone: { id: string; music?: string | null | undefined; ambience?: string | null | undefined };
}) {
  const { ed } = c;
  const patch = (p: object) => ed.exec({ type: 'map.updateZone', payload: { map, zone: zone.id, patch: p } });
  return (
    <div class="sec">
      <div class="sech">
        <span>Audio</span>
      </div>
      <div class="field">
        Music
        <MusicSelect
          ed={ed}
          label="Zone music"
          value={zone.music}
          inherit="Keep the map music"
          onPick={(music) => patch({ music })}
        />
      </div>
      <div class="field">
        Ambience
        <SoundSelect
          ed={ed}
          label="Zone ambience"
          value={zone.ambience ?? null}
          none="None"
          onPick={(ambience) => patch({ ambience: ambience ?? undefined })}
        />
      </div>
    </div>
  );
}

/** A sound emitter or world UI item selected in the Scene. */
export function ItemInspector({ c, id }: { c: ActionCtx; id: string }) {
  const { ed } = c;
  const map = ed.mapId.value;
  ed.revision.value;
  const it = ed.store.get<Instances>(paths.instances(map))?.items.find((i) => i.id === id) as
    | EmitterInstance
    | UiInstance
    | undefined;
  if (!it || (it.kind !== 'emitter' && it.kind !== 'ui')) return <div class="sec muted">That item was removed.</div>;
  const patch = (p: Record<string, unknown>) => ed.exec({ type: 'item.update', payload: { map, id, patch: p } });
  const pos = (
    <>
      <div class="sech">
        <span>Position</span>
        <span style={{ textTransform: 'none', letterSpacing: 0 }}>studs</span>
      </div>
      <div class="grid3">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <Num
            label={axis}
            value={Math.round(it.pos[i]! * 100) / 100}
            onCommit={(v) => {
              const p = [...it.pos] as [number, number, number];
              p[i] = v;
              patch({ pos: p });
            }}
          />
        ))}
      </div>
    </>
  );
  const remove = (
    <div class="sec" style={{ borderBottom: 0 }}>
      <button
        type="button"
        class="btn wide danger"
        onClick={() => {
          if (ed.exec({ type: 'item.remove', payload: { map, id } }).ok) ed.selectedItem.value = null;
        }}
      >
        Delete {it.kind === 'emitter' ? 'emitter' : 'world UI'}
      </button>
    </div>
  );
  if (it.kind === 'emitter')
    return (
      <>
        <Header
          title={it.name ?? 'Sound emitter'}
          sub={`Sound emitter · ${it.mode === 'loop' ? 'loop' : 'now and then'}`}
          color="#8b74ff"
        />
        <div class="sec">
          <div class="field">
            Name
            <TextField
              label="Emitter name"
              value={it.name ?? ''}
              onCommit={(name) => patch({ name: name.slice(0, 60) })}
            />
          </div>
          <div class="field">
            Sound
            <SoundSelect ed={ed} label="Emitter sound" value={it.sound} onPick={(sound) => sound && patch({ sound })} />
          </div>
          <div class="field">
            Plays
            <div class="row">
              {(['loop', 'interval'] as const).map((m) => (
                <button
                  type="button"
                  class={`btn ${it.mode === m ? 'on' : ''}`}
                  aria-pressed={it.mode === m}
                  onClick={() => patch({ mode: m })}
                >
                  {m === 'loop' ? 'Loop' : 'Now and then'}
                </button>
              ))}
            </div>
          </div>
          {it.mode === 'interval' && (
            <div class="grid3">
              <Num
                label="Every (s) from"
                value={it.interval[0]}
                onCommit={(v) => patch({ interval: [Math.max(0.1, v), it.interval[1]] })}
              />
              <Num
                label="to"
                value={it.interval[1]}
                onCommit={(v) => patch({ interval: [it.interval[0], Math.max(0.1, v)] })}
              />
            </div>
          )}
          <div class="grid3">
            <Num
              label="Range (studs)"
              value={it.maxDistance}
              onCommit={(v) => patch({ maxDistance: Math.max(1, Math.min(200, v)) })}
            />
            <Num
              label="Volume (dB)"
              value={it.volume}
              onCommit={(v) => patch({ volume: Math.max(-60, Math.min(12, v)) })}
            />
          </div>
          <button type="button" class="btn wide" onClick={() => ed.audio.previewEvent(it.sound)}>
            ▶ Preview sound
          </button>
          {pos}
          <p class="hint">Heard within its range while playing; beyond it the emitter is silent (culled).</p>
        </div>
        {remove}
      </>
    );
  return (
    <>
      <Header title={`World ${it.widget}`} sub="World UI · drawn over the game at this spot" color="#f9d84c" />
      <div class="sec">
        <div class="field">
          Kind
          <div class="row">
            {(['sign', 'label', 'bar'] as const).map((w) => (
              <button
                type="button"
                class={`btn ${it.widget === w ? 'on' : ''}`}
                aria-pressed={it.widget === w}
                onClick={() => patch({ widget: w })}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          Text
          <TextField label="World UI text" value={it.text} onCommit={(text) => patch({ text: text.slice(0, 200) })} />
        </div>
        {it.widget === 'bar' && (
          <div class="field">
            Value / max
            <TextField
              label="Bar variables"
              value={(it.bind ?? ['hp', 'maxHp']).join(' / ')}
              onCommit={(v) =>
                patch({
                  bind: v
                    .split('/')
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .slice(0, 2),
                })
              }
            />
          </div>
        )}
        <div class="grid3">
          <Num
            label="Seen within (studs)"
            value={it.maxDistance}
            onCommit={(v) => patch({ maxDistance: Math.max(1, Math.min(200, v)) })}
          />
        </div>
        {pos}
        <p class="hint">
          Write {'{variable}'} to show a value, e.g. {'{inventory.coin}'}, {'{hp}'}, {'{map.name}'}.
        </p>
      </div>
      {remove}
    </>
  );
}

export const DEFAULT_EMITTER_SOUND = SND.birds;

/** Map tab: the scenes set on this map, opened in the Director (P6.3). */
export function MapCinematics({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const map = ed.mapId.value;
  const list = ed.store
    .list('cinematics/')
    .map((p) => ed.store.get<Cinematic>(p)!)
    .filter((x) => x?.map === map);
  return (
    <div class="field">
      Cinematics
      <div class="row">
        {list.map((x) => (
          <button
            type="button"
            class="btn"
            onClick={() => {
              ed.cinematicId.value = x.id;
              c.ui.workspace('Cinematics');
            }}
          >
            🎬 {x.name}
          </button>
        ))}
        <button type="button" class="btn" onClick={() => c.ui.workspace('Cinematics')}>
          {list.length ? 'Director…' : 'Make one in the Director…'}
        </button>
      </div>
    </div>
  );
}
