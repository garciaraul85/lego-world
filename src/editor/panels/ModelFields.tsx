import { useRef } from 'preact/hooks';
import { BUILTIN_MODEL_FILES } from '../../builtin/models/data';
import type { Command } from '../../core/commands/types';
import { ACCEPT_OF, importMedia } from '../../core/media/import';
import { type MediaIndex, type ModelInstance, paths } from '../../core/schema';
import { modelErrors, readyModel } from '../../engine/model/prepare';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp, Header, Num, TextField } from '../components/fields';
import { ModelThumb } from '../components/ModelThumb';
import { matches, NoMatch } from '../components/SearchBox';
import { modelItems, placeModelAt, selectOnly } from '../interact/place';
import type { EditorState } from '../state';

/**
 * Milestone 2b, 10c part 5: 3D models — smooth shapes made in a modelling tool (glTF, .glb or .gltf) and the
 * built-in ones — placed on the map beside the bricks, lit by the same sun, lights, fog and shadows.
 */
export const MODEL_HELP = {
  model:
    'A 3D model: a smooth shape made in a modelling tool such as Blender and saved as glTF (.glb, or .gltf with its data inside it), or one of the built-in ones. It is lit by the sun, lights, fog and shadows like the bricks, in WebGPU and WebGL. Models that animate stand still for now (moving models come later).',
  size: 'How big it is: 1 is the size it was made at, in studs (the hero is about 4 tall). 2 is twice as big.',
  turn: 'How far it is turned about its upright axis, in degrees.',
  solid:
    'Solid: the hero bumps into it and can stand on it in Play. Off: things go through it (grass, hanging decorations).',
};

/** what a model reference is called: a built-in model's name, or the imported file's */
export function modelName(ed: EditorState, ref: string): string {
  if (ref.startsWith('builtin:')) return BUILTIN_MODEL_FILES[ref.slice(8)]?.name ?? ref;
  const e = ed.store.get<MediaIndex>(paths.media)?.items[ref];
  return e?.name.replace(/\.(glb|gltf)$/i, '') ?? 'Missing model';
}

/** the models a project can place: the built-in ones, then its own imported files */
export function modelChoices(ed: EditorState): { ref: string; name: string; about: string; triangles?: number }[] {
  const own = Object.entries(ed.store.get<MediaIndex>(paths.media)?.items ?? {})
    .filter(([, e]) => e.kind === 'model')
    .map(([ref, e]) => ({
      ref,
      name: e.name.replace(/\.(glb|gltf)$/i, ''),
      about: `Imported · ${e.name}`,
      ...(e.triangles !== undefined ? { triangles: e.triangles } : {}),
    }));
  const builtin = Object.entries(BUILTIN_MODEL_FILES).map(([id, f]) => ({
    ref: `builtin:${id}`,
    name: f.name,
    about: f.about,
  }));
  return [...own, ...builtin];
}

/** imports .glb / .gltf files into the project; returns the last one's ref */
export async function importModelFiles(ed: EditorState, files: Iterable<File>): Promise<string | null> {
  let last: string | null = null;
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const r = await importMedia(f.name, bytes, { index: ed.store.get<MediaIndex>(paths.media) });
    if (!r.ok) {
      ed.notify(r.error, true);
      continue;
    }
    if (r.entry.kind !== 'model') {
      ed.notify(`${f.name} is not a 3D model: pick a .glb or .gltf file.`, true);
      continue;
    }
    ed.media?.put(r.ref, new Blob([bytes], { type: r.entry.mime }));
    if (!r.duplicate) {
      const cmd: Command = { type: 'media.register', payload: { ref: r.ref, entry: r.entry } };
      if (!ed.exec(cmd, { label: `Import ${f.name}` }).ok) continue;
      ed.notify(`Imported ${f.name} (${(r.entry.triangles ?? 0).toLocaleString('en-US')} triangles).`);
    } else ed.notify(`${f.name} is already in the project.`);
    last = r.ref;
  }
  return last;
}

/** the Dock's 3D models: Import, the models to place, and the ones on this map */
export function ModelCards({ c, hint, q }: { c: ActionCtx; hint: string; q: string }) {
  const { ed } = c;
  ed.revision.value;
  const input = useRef<HTMLInputElement>(null);
  const list = modelChoices(ed).filter((m) => matches(q, m.name));
  const placed = modelItems(ed);
  const media = ed.media ? (ref: string) => ed.media!.get(ref) : null;
  const place = (ref: string, name: string) => {
    const sp = ed.mapDoc.value?.spawns[0]?.pos ?? [0, 0, 0];
    placeModelAt(
      ed,
      { x: sp[0]! + 5 + 4 * (placed.length % 6), y: Math.round(sp[1]! / 0.4), z: sp[2]! + 5 },
      ref,
      name,
    );
  };
  return (
    <>
      <span class="muted small">{hint}</span>
      <div class="row" style={{ gap: '6px' }}>
        <button
          type="button"
          class="btn"
          data-tour="dock-model-import"
          data-help="scene.dock.models"
          onClick={() => input.current?.click()}
        >
          Import a model…
        </button>
        <span class="muted small">.glb or .gltf, up to 20 MB</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT_OF('model')}
          multiple
          aria-label="Model files to import"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const el = e.target as HTMLInputElement;
            if (el.files?.length) await importModelFiles(ed, [...el.files]);
            el.value = '';
          }}
        />
      </div>
      <NoMatch q={list.length || placed.some((m) => matches(q, m.name)) ? '' : q} what="3D models" />
      <div class="fx-cards" data-tour="dock-models" data-help="scene.dock.models">
        {list.map((m) => (
          <div class="fx-card" data-name={m.name} title={m.about}>
            <ModelThumb model={m.ref} media={media} />
            <span class="small">{m.name}</span>
            <button
              type="button"
              class="btn small"
              data-tour={`dock-model-${m.ref.startsWith('builtin:') ? m.ref.slice(8) : 'own'}`}
              aria-label={`Place ${m.name}`}
              onClick={() => place(m.ref, m.name)}
            >
              Place
            </button>
          </div>
        ))}
      </div>
      {placed.length > 0 && (
        <div class="col" style={{ gap: '4px' }}>
          <span class="muted small">On this map</span>
          {placed
            .filter((m) => matches(q, m.name))
            .map((m) => (
              <button type="button" class="lib-item" onClick={() => selectOnly(ed, 'item', m.id)}>
                <ModelThumb model={m.model} media={media} size={20} />
                <span class="asset-name">{m.name ?? m.id}</span>
                <span class="mono small muted">{modelName(ed, m.model)}</span>
              </button>
            ))}
        </div>
      )}
    </>
  );
}

/** a placed 3D model selected in the Scene: which model, where, turned, how big, solid */
export function ModelInspector({ c, item: it }: { c: ActionCtx; item: ModelInstance }) {
  const { ed } = c;
  const map = ed.mapId.value;
  const patch = (p: Partial<ModelInstance>, label = 'Edit model') =>
    ed.exec({ type: 'item.update', payload: { map, id: it.id, patch: p } }, { label });
  const ready = readyModel(it.model);
  const error = modelErrors.get(it.model);
  const choices = modelChoices(ed);
  return (
    <>
      <Header title={it.name ?? '3D model'} sub={`3D model · ${modelName(ed, it.model)}`} color="#9ad08a" />
      <div class="sec" data-help="scene.item.model" data-tour="item-model">
        <div class="field">
          Name
          <TextField label="Model name" value={it.name ?? ''} onCommit={(name) => patch({ name: name.slice(0, 60) })} />
        </div>
        <label class="field">
          <span>
            Model
            <FieldHelp label="3D model" text={MODEL_HELP.model} />
          </span>
          <select
            class="inp"
            aria-label="Which model"
            data-tour="model-which"
            value={it.model}
            onChange={(e) => patch({ model: (e.target as HTMLSelectElement).value }, 'Change model')}
          >
            {choices.map((m) => (
              <option key={m.ref} value={m.ref}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div class="sech">
          <span>Position (studs; the middle of its base)</span>
        </div>
        <div class="grid3">
          {(['X', 'Y', 'Z'] as const).map((n, i) => (
            <Num
              key={n}
              label={n}
              step={0.5}
              value={Math.round(it.pos[i]! * 100) / 100}
              onCommit={(x) => {
                const p = [...it.pos] as [number, number, number];
                p[i] = x;
                patch({ pos: p }, 'Move model');
              }}
            />
          ))}
        </div>
        <div class="sech">
          <span>
            Turn (degrees) and size
            <FieldHelp label="Turn" text={MODEL_HELP.turn} />
            <FieldHelp label="Size" text={MODEL_HELP.size} />
          </span>
        </div>
        <div class="grid2" data-tour="model-turn-size">
          <Num
            label="Turn"
            step={15}
            value={it.turn ?? 0}
            onCommit={(x) => patch({ turn: ((((x + 180) % 360) + 360) % 360) - 180 }, 'Turn model')}
          />
          <Num
            label="Size"
            step={0.25}
            value={it.size ?? 1}
            onCommit={(x) => patch({ size: Math.max(0.05, Math.min(50, x)) }, 'Model size')}
          />
        </div>
        <label class="field row" style={{ gap: '6px' }}>
          <input
            type="checkbox"
            aria-label="Solid"
            data-tour="model-solid"
            checked={it.solid !== false}
            onChange={(e) => patch({ solid: (e.target as HTMLInputElement).checked }, 'Solid model')}
          />
          <span>
            Solid in Play
            <FieldHelp label="Solid" text={MODEL_HELP.solid} />
          </span>
        </label>
        <p class="muted small" data-tour="model-info">
          {error
            ? `This model can't be drawn: ${error}`
            : ready
              ? `${ready.data.triangles.toLocaleString('en-US')} triangles · ${ready.data.parts.length} part${
                  ready.data.parts.length === 1 ? '' : 's'
                } · ${(ready.data.max[1] - ready.data.min[1]).toFixed(1)} studs tall at size 1`
              : 'Reading the model…'}
        </p>
        <p class="muted small">Right-click it to delete it.</p>
      </div>
    </>
  );
}
