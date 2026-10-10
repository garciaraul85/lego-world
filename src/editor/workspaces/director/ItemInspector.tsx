import { BUILTIN_CLIPS } from '../../../builtin/clips';
import { EMOTE_KINDS } from '../../../builtin/clips/emotes';
import { usesOf } from '../../../core/audio/usage';
import type { ActorItem, CameraItem, Cinematic, Clip, PostItem } from '../../../core/schema';
import { musicOptions, soundOptions } from '../../panels/AudioFields';
import type { EditorState } from '../../state';
import { Check, NumIn, Pick, Sec, TextIn, Vec } from './fields';
import { type Item, itemAt, type Sel, setItem } from './model';

type Change = (c: Cinematic, label: string) => void;

/** Inspector for the selected item or mark; the scene's own settings when nothing is selected. */
export function ItemInspector({
  ed,
  cin,
  sel,
  onChange,
  onSelect,
  stageView,
}: {
  ed: EditorState;
  cin: Cinematic;
  sel: Sel;
  onChange: Change;
  onSelect: (s: Sel) => void;
  stageView: () => { eye: [number, number, number]; target: [number, number, number] } | null;
}) {
  if (sel && 'mark' in sel) return <MarkProps cin={cin} id={sel.mark} onChange={onChange} onSelect={onSelect} />;
  const it = itemAt(cin, sel);
  if (!it || !sel || !('track' in sel)) return <SceneProps ed={ed} cin={cin} onChange={onChange} />;
  const tr = cin.tracks[sel.track]!;
  const put = (next: Item, label = 'Edit item') => onChange(setItem(cin, sel.track, sel.item, next), label);
  const roles = cin.cast.map((m) => ({ id: m.role, name: m.role }));
  const marks = cin.marks.map((m) => ({ id: m.id, name: `mark ${m.id}` }));
  const head = (
    <>
      <NumIn label="Starts at (s)" value={it.t} min={0} max={cin.length} onChange={(t) => put({ ...it, t } as Item)} />
    </>
  );
  const del = (
    <button
      type="button"
      class="btn wide danger"
      onClick={() => {
        onChange(setItem(cin, sel.track, sel.item, null), 'Delete item');
        onSelect(null);
      }}
    >
      Delete item
    </button>
  );
  if (tr.kind === 'actor') {
    const a = it as ActorItem;
    const clips = [...ed.store.list('clips/').map((p) => ed.store.get<Clip>(p)!), ...BUILTIN_CLIPS].map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
    }));
    const make = (d: ActorItem['do']): ActorItem => {
      const t = a.t;
      switch (d) {
        case 'moveTo':
          return { t, do: 'moveTo', mark: cin.marks[0]?.id ?? 'mark1', speed: 'walk' };
        case 'face':
          return { t, do: 'face', target: cin.cast.find((m) => m.role !== tr.role)?.role ?? tr.role };
        case 'play':
          return { t, do: 'play', clip: clips[0]!.id as never };
        case 'say':
          return { t, do: 'say', text: 'Hello!', dur: 2 };
        case 'emote':
          return { t, do: 'emote', kind: 'wave' };
        case 'equip':
          return { t, do: 'equip', item: 'Hammer' };
        default:
          return { t, do: d } as ActorItem;
      }
    };
    return (
      <Sec title={`${tr.role} · instruction`}>
        <Pick
          label="Does"
          value={a.do}
          options={[
            { id: 'moveTo', name: 'Walk / run to a mark' },
            { id: 'face', name: 'Face' },
            { id: 'say', name: 'Say a line' },
            { id: 'emote', name: 'Gesture' },
            { id: 'play', name: 'Play a clip' },
            { id: 'equip', name: 'Hold an item' },
            { id: 'hide', name: 'Hide' },
            { id: 'show', name: 'Show' },
          ]}
          onChange={(d) => put(make(d as ActorItem['do']), 'Change instruction')}
        />
        {head}
        {a.do === 'moveTo' && (
          <>
            <Pick label="Mark" value={a.mark} options={marks} onChange={(mark) => put({ ...a, mark })} />
            <Pick
              label="Speed"
              value={a.speed}
              options={[
                { id: 'walk', name: 'Walk' },
                { id: 'run', name: 'Run' },
                { id: 'teleport', name: 'Jump there (cut)' },
              ]}
              onChange={(speed) => put({ ...a, speed: speed as 'walk' })}
            />
          </>
        )}
        {a.do === 'face' && (
          <Pick
            label="Face"
            value={a.target ?? ''}
            options={[...roles.filter((r) => r.id !== tr.role), ...marks]}
            onChange={(target) => put({ t: a.t, do: 'face', target })}
          />
        )}
        {a.do === 'say' && (
          <>
            <TextIn
              label="Line"
              area
              value={a.text}
              onChange={(text) => text.trim() && put({ ...a, text: text.slice(0, 400) })}
            />
            <NumIn label="Shown for (s)" value={a.dur} min={0.2} onChange={(dur) => put({ ...a, dur })} />
            <Pick
              label="Voice"
              value={a.voice ?? ''}
              options={[
                { id: '', name: 'Default blips' },
                ...soundOptions(ed).map((o) => ({ id: o.id, name: o.name })),
              ]}
              onChange={(v) => {
                const n = { ...a } as typeof a;
                if (v) n.voice = v as never;
                else delete n.voice;
                put(n);
              }}
            />
          </>
        )}
        {a.do === 'emote' && (
          <Pick
            label="Gesture"
            value={a.kind}
            options={EMOTE_KINDS.map((k) => ({ id: k, name: k }))}
            onChange={(kind) => put({ ...a, kind })}
          />
        )}
        {a.do === 'play' && (
          <>
            <Pick label="Clip" value={a.clip} options={clips} onChange={(clip) => put({ ...a, clip: clip as never })} />
            <Check label="Loop until the next instruction" value={!!a.loop} onChange={(loop) => put({ ...a, loop })} />
          </>
        )}
        {a.do === 'equip' && (
          <TextIn label="Item" value={a.item} onChange={(item) => item.trim() && put({ ...a, item: item.trim() })} />
        )}
        {del}
      </Sec>
    );
  }
  if (tr.kind === 'camera') {
    const c = it as CameraItem;
    const mode = c.follow ? 'follow' : 'fixed';
    return (
      <Sec title="Camera shot">
        <TextIn
          label="Shot name"
          value={c.shot}
          onChange={(shot) => shot.trim() && put({ ...c, shot: shot.trim().slice(0, 60) })}
        />
        {head}
        <Pick
          label="Camera"
          value={mode}
          options={[
            { id: 'fixed', name: 'Fixed position' },
            { id: 'follow', name: 'Follows a role' },
          ]}
          onChange={(m) => {
            const n = { ...c };
            if (m === 'follow') {
              n.follow = cin.cast[0]?.role ?? 'hero';
              n.offset = n.offset ?? [1.5, 2.4, -5];
            } else {
              delete n.follow;
              delete n.offset;
              n.pos = n.pos ?? [0, 6, -8];
            }
            put(n);
          }}
        />
        {mode === 'follow' ? (
          <>
            <Pick label="Follows" value={c.follow!} options={roles} onChange={(follow) => put({ ...c, follow })} />
            <Vec
              label="Offset (right, up, ahead)"
              value={c.offset ?? [0, 2.6, -6]}
              onChange={(offset) => put({ ...c, offset })}
            />
          </>
        ) : (
          <Vec label="Position" value={c.pos ?? [0, 6, -8]} onChange={(pos) => put({ ...c, pos })} />
        )}
        <Pick
          label="Looks at"
          value={c.look ?? (c.lookAt ? '@point' : '')}
          options={[
            { id: '', name: mode === 'follow' ? 'The followed role' : 'Straight ahead' },
            ...roles,
            ...marks,
            ...(c.lookAt ? [{ id: '@point', name: 'A point' }] : []),
          ]}
          onChange={(v) => {
            const n = { ...c };
            if (v === '@point') return;
            delete n.lookAt;
            if (v) n.look = v;
            else delete n.look;
            put(n);
          }}
        />
        {c.lookAt && <Vec label="Point" value={c.lookAt} onChange={(lookAt) => put({ ...c, lookAt })} />}
        <NumIn
          label="Field of view (°)"
          value={c.fov ?? 50}
          min={10}
          max={120}
          step={1}
          onChange={(fov) => put({ ...c, fov })}
        />
        <NumIn
          label="Blend from previous (s, 0 = cut)"
          value={c.blend ?? 0}
          min={0}
          onChange={(blend) => put({ ...c, blend })}
        />
        <NumIn label="Shake" value={c.shake ?? 0} min={0} max={3} onChange={(shake) => put({ ...c, shake })} />
        <button
          type="button"
          class="btn wide"
          onClick={() => {
            const v = stageView();
            if (!v) return;
            const n = { ...c, pos: v.eye, lookAt: v.target };
            delete n.follow;
            delete n.offset;
            delete n.look;
            put(n, 'Camera from view');
          }}
        >
          Set from the stage view
        </button>
        {del}
      </Sec>
    );
  }
  if (tr.kind === 'music') {
    const m = it as { t: number; music?: string; stop?: boolean; fade: number };
    return (
      <Sec title="Music">
        {head}
        <Pick
          label="Music"
          value={m.stop ? '' : (m.music ?? '')}
          options={[{ id: '', name: 'Stop the music' }, ...musicOptions(ed)]}
          onChange={(v) => put((v ? { t: m.t, music: v, fade: m.fade } : { t: m.t, stop: true, fade: m.fade }) as Item)}
        />
        <NumIn label="Fade (s)" value={m.fade} min={0} onChange={(fade) => put({ ...m, fade } as Item)} />
        <p class="hint">Scene music wins over every other music; the map’s music returns when the scene ends.</p>
        {del}
      </Sec>
    );
  }
  if (tr.kind === 'sfx') {
    const s = it as { t: number; event: string; role?: string };
    return (
      <Sec title="Sound">
        {head}
        <Pick
          label="Sound"
          value={s.event}
          options={soundOptions(ed).map((o) => ({ id: o.id, name: o.name }))}
          onChange={(event) => put({ ...s, event } as Item)}
        />
        <Pick
          label="At"
          value={s.role ?? ''}
          options={[{ id: '', name: 'Everywhere' }, ...roles]}
          onChange={(v) => {
            const n = { ...s };
            if (v) n.role = v;
            else delete n.role;
            put(n as Item);
          }}
        />
        <button type="button" class="btn wide" onClick={() => ed.audio.previewEvent(s.event)}>
          ▶ Listen
        </button>
        {del}
      </Sec>
    );
  }
  if (tr.kind === 'post') {
    const p = it as PostItem;
    const kind = 'fade' in p ? 'fade' : 'letterbox' in p ? 'letterbox' : 'title' in p ? 'title' : 'slowmo';
    return (
      <Sec title="Post effect">
        <Pick
          label="Effect"
          value={kind}
          options={[
            { id: 'fade', name: 'Fade' },
            { id: 'letterbox', name: 'Letterbox' },
            { id: 'title', name: 'Title card' },
            { id: 'slowmo', name: 'Slow motion' },
          ]}
          onChange={(k) =>
            put(
              (k === 'fade'
                ? { t: p.t, fade: 'in', dur: 1 }
                : k === 'letterbox'
                  ? { t: p.t, letterbox: true }
                  : k === 'title'
                    ? { t: p.t, title: cin.name, dur: 2.5 }
                    : { t: p.t, slowmo: 0.4, dur: 1.5 }) as Item,
            )
          }
        />
        {head}
        {'fade' in p && (
          <>
            <Pick
              label="Fade"
              value={p.fade}
              options={[
                { id: 'in', name: 'In (from colour)' },
                { id: 'out', name: 'Out (to colour)' },
              ]}
              onChange={(fade) => put({ ...p, fade: fade as 'in' })}
            />
            <NumIn label="Over (s)" value={p.dur} min={0} onChange={(dur) => put({ ...p, dur })} />
            <TextIn
              label="Colour"
              value={p.color ?? '#000000'}
              onChange={(color) => /^#[0-9a-f]{6}$/i.test(color) && put({ ...p, color })}
            />
          </>
        )}
        {'letterbox' in p && (
          <Check label="Bars on" value={p.letterbox} onChange={(letterbox) => put({ ...p, letterbox })} />
        )}
        {'title' in p && (
          <>
            <TextIn
              label="Title"
              value={p.title}
              onChange={(title) => title.trim() && put({ ...p, title: title.slice(0, 80) })}
            />
            <TextIn label="Subtitle" value={p.sub ?? ''} onChange={(sub) => put({ ...p, sub: sub.slice(0, 120) })} />
            <NumIn label="Shown for (s)" value={p.dur} min={0.2} onChange={(dur) => put({ ...p, dur })} />
          </>
        )}
        {'slowmo' in p && (
          <>
            <NumIn
              label="Speed (0.1–1)"
              value={p.slowmo}
              min={0.1}
              max={1}
              onChange={(slowmo) => put({ ...p, slowmo })}
            />
            <NumIn label="For (s)" value={p.dur} min={0.1} onChange={(dur) => put({ ...p, dur })} />
          </>
        )}
        {del}
      </Sec>
    );
  }
  const e = it as { t: number; emit?: string; setVar?: string; value?: number | boolean | string };
  return (
    <Sec title="Logic event">
      <Pick
        label="Does"
        value={e.setVar !== undefined ? 'setVar' : 'emit'}
        options={[
          { id: 'emit', name: 'Send event (On custom event)' },
          { id: 'setVar', name: 'Set a variable' },
        ]}
        onChange={(k) =>
          put((k === 'emit' ? { t: e.t, emit: 'scene-event' } : { t: e.t, setVar: 'seenScene', value: true }) as Item)
        }
      />
      {head}
      {e.emit !== undefined && (
        <TextIn
          label="Event name"
          value={e.emit}
          onChange={(emit) => emit.trim() && put({ t: e.t, emit: emit.trim() } as Item)}
        />
      )}
      {e.setVar !== undefined && (
        <>
          <TextIn
            label="Variable"
            value={e.setVar}
            onChange={(v) => /^[a-zA-Z_]\w*$/.test(v) && put({ ...e, setVar: v } as Item)}
          />
          <TextIn
            label="Value"
            value={JSON.stringify(e.value)}
            onChange={(raw) => {
              let value: unknown = raw;
              try {
                value = JSON.parse(raw);
              } catch {
                /* text */
              }
              if (['number', 'boolean', 'string'].includes(typeof value)) put({ ...e, value } as Item);
            }}
          />
        </>
      )}
      {del}
    </Sec>
  );
}

function MarkProps({
  cin,
  id,
  onChange,
  onSelect,
}: {
  cin: Cinematic;
  id: string;
  onChange: Change;
  onSelect: (s: Sel) => void;
}) {
  const m = cin.marks.find((x) => x.id === id);
  if (!m) return <div class="sec muted">That mark was removed.</div>;
  const set = (patch: Partial<typeof m>) =>
    onChange({ ...cin, marks: cin.marks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, 'Edit mark');
  const used = JSON.stringify(cin.tracks).includes(`"${id}"`) || cin.cast.some((c) => c.at === id);
  return (
    <Sec title={`Mark ${m.id}`}>
      <Vec label="Position" value={m.pos} onChange={(pos) => set({ pos })} />
      <NumIn
        label="Facing (°)"
        value={Math.round((m.yaw * 180) / Math.PI)}
        step={15}
        onChange={(d) => set({ yaw: (d * Math.PI) / 180 })}
      />
      <p class="hint">Drag a mark on the stage to move it. Actors arrive facing this way.</p>
      <button
        type="button"
        class="btn wide danger"
        disabled={used}
        title={used ? 'Instructions or the cast still use this mark' : ''}
        onClick={() => {
          onChange({ ...cin, marks: cin.marks.filter((x) => x.id !== id) }, 'Delete mark');
          onSelect(null);
        }}
      >
        Delete mark
      </button>
    </Sec>
  );
}

function SceneProps({ ed, cin, onChange }: { ed: EditorState; cin: Cinematic; onChange: Change }) {
  const set = (patch: Partial<Cinematic>) => onChange({ ...cin, ...patch }, 'Edit scene');
  const uses = usesOf(ed.store, cin.id).filter((u) => !u.path.startsWith('cinematics/'));
  return (
    <>
      <Sec title="Scene">
        <TextIn
          label="Name"
          value={cin.name}
          onChange={(name) => name.trim() && set({ name: name.trim().slice(0, 80) })}
        />
        <NumIn
          label="Length (s)"
          value={cin.length}
          min={1}
          max={600}
          step={0.5}
          onChange={(length) => set({ length })}
        />
        <Pick
          label="Map"
          value={cin.map}
          options={ed.maps.value.map((m) => ({ id: m.id, name: m.name }))}
          onChange={(map) => set({ map: map as never })}
        />
        <Check label="Players can skip it (Esc)" value={cin.skippable} onChange={(skippable) => set({ skippable })} />
        <Check label="Letterbox bars" value={cin.letterbox} onChange={(letterbox) => set({ letterbox })} />
        <Check label="Hide the HUD" value={cin.hideHud} onChange={(hideHud) => set({ hideHud })} />
      </Sec>
      <Sec title={`Where used · ${uses.length}`}>
        {uses.length === 0 && (
          <p class="hint">
            Not triggered yet. Use “Play cinematic” in a zone, an asset interaction, a screen button, a gate’s on-arrive
            list, a clip marker or a logic graph.
          </p>
        )}
        {uses.map((u) => (
          <div class="small au-use">
            {u.what} <span class="muted mono">{u.path}</span>
          </div>
        ))}
      </Sec>
    </>
  );
}
