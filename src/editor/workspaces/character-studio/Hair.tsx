import { useState } from 'preact/hooks';
import {
  type CustomHair,
  cleanHair,
  describeHair,
  HAIR_BEARDS,
  HAIR_FRINGES,
  HAIR_PARTINGS,
  HAIR_PRESETS,
  HAIR_TIES,
  HAIR_TOPS,
  type HairSettings,
  type HairStyle,
  hairFromV68,
  presetHair,
} from '../../../core/character/hair';
import { newId } from '../../../core/ids';
import { paths } from '../../../core/schema';
import { PreviewPicker } from '../../components/PreviewPicker';
import type { EditorState } from '../../state';
import { CharacterThumb } from './thumbs';

/** a hairstyle in My library */
export const libraryHair = (ed: Pick<EditorState, 'store'>): HairStyle[] =>
  ed.store
    .list(paths.hairstyleDir)
    .map((p) => ed.store.get<HairStyle>(p)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

/** the settings of a library hairstyle, as a look wears them */
export const wornFrom = (s: HairStyle): CustomHair => {
  const { id, color: _c, ...rest } = s;
  return { ...cleanHair(rest), name: s.name, from: id };
};

const SLIDERS: [keyof HairSettings, string][] = [
  ['length', 'Length'],
  ['volume', 'Volume'],
  ['tieLength', 'Tie length'],
  ['beardLength', 'Beard length'],
];

/**
 * Milestone 3, 10d part 3: the Hair editor, under the hair choice in Look. A start (presets and My library), then
 * the top, fringe, parting, how it is tied and a beard, each a picture of this character wearing it; length,
 * volume, tie and beard length as sliders (live while dragged, one undo step on letting go); the tips, band and
 * beard colours; and Save to My library, so the hairstyle can be put on any character.
 */
export function HairEditor(p: {
  ed: Pick<EditorState, 'store' | 'exec' | 'notify'>;
  profile: Record<string, unknown>;
  draft: CustomHair | null;
  setDraft(h: CustomHair | null): void;
  setFields(patch: Record<string, unknown>, label: string): void;
}) {
  const { ed, profile } = p;
  const custom = profile.hair === 'Custom';
  const hair = cleanHair(profile.customHair);
  const shown = p.draft ?? hair;
  const lib = libraryHair(ed);
  const [name, setName] = useState('');
  const put = (next: Partial<CustomHair>, label: string, extra: Record<string, unknown> = {}) =>
    p.setFields({ hair: 'Custom', customHair: cleanHair({ ...hair, ...next }), ...extra }, label);
  const thumb = (h: Partial<CustomHair>, view: 'head' | 'back' = 'head', color?: string) => (
    <CharacterThumb
      profile={{
        ...profile,
        hat: 'None',
        hair: 'Custom',
        customHair: cleanHair({ ...hair, ...h }),
        ...(color ? { hairColor: color } : {}),
      }}
      view={view}
      size={40}
    />
  );

  if (!custom)
    return (
      <div class="field" data-help="characters.hair">
        <span class="muted small">Want a hairstyle the list doesn't have?</span>
        <button
          type="button"
          class="btn small"
          data-tour="hair-make-custom"
          onClick={() => p.setFields({ hair: 'Custom', customHair: hairFromV68(String(profile.hair)) }, 'Custom hair')}
        >
          ✂ Make custom hair
        </button>
      </div>
    );

  const saveToLibrary = () => {
    const n = (name || hair.name || describeHair(hair) || 'My hairstyle').trim().slice(0, 40);
    const id = newId('hairstyle') as HairStyle['id'];
    const { name: _n, from: _f, ...settings } = hair;
    const style: HairStyle = { ...settings, id, name: n, color: String(profile.hairColor ?? '#654027') };
    const r = ed.exec([{ type: 'hairstyle.put', payload: { style } }], { label: `Save hairstyle ${n}` });
    if (r.ok) {
      p.setFields({ hair: 'Custom', customHair: { ...hair, name: n, from: id } }, `Hairstyle ${n}`);
      ed.notify(`Saved “${n}” to My library: pick it under My library on any character.`);
      setName('');
    }
  };
  const fromLib = hair.from ? lib.find((s) => s.id === hair.from) : undefined;

  return (
    <div class="hair-editor" data-tour="hair-editor" data-help="characters.hair">
      {profile.hat !== 'None' && (
        <div class="field">
          <span class="muted small">The hat hides most of the hair.</span>
          <button
            type="button"
            class="btn small"
            data-tour="hair-hat-off"
            onClick={() => p.setFields({ hat: 'None' }, 'Hat off')}
          >
            Take the hat off
          </button>
        </div>
      )}
      <div class="field">
        Start from
        <PreviewPicker
          label="Start from a hairstyle"
          tour="hair-preset"
          value=""
          placeholder="Presets…"
          options={HAIR_PRESETS.map((x) => ({ value: x.name, name: x.name, thumb: thumb({ ...presetHair(x.name)! }) }))}
          onPick={(v) => put({ ...presetHair(v)!, name: v, from: undefined }, `Hairstyle: ${v}`)}
        />
      </div>
      <div class="field">
        My library
        <PreviewPicker
          label="My library"
          tour="hair-library"
          value={hair.from ?? ''}
          placeholder={lib.length ? 'Pick one…' : 'Empty: save one below'}
          options={lib.map((s) => ({ value: s.id, name: s.name, thumb: thumb(wornFrom(s), 'head', s.color) }))}
          onPick={(v) => {
            const s = lib.find((x) => x.id === v);
            if (s) p.setFields({ hair: 'Custom', customHair: wornFrom(s), hairColor: s.color }, `Hairstyle: ${s.name}`);
          }}
        />
      </div>
      {(
        [
          ['top', 'Top', HAIR_TOPS, 'head'],
          ['fringe', 'Fringe', HAIR_FRINGES, 'head'],
          ['tie', 'Tied', HAIR_TIES, 'back'],
          ['beard', 'Beard', HAIR_BEARDS, 'head'],
        ] as const
      ).map(([k, label, opts, view]) => (
        <div class="field">
          {label}
          <PreviewPicker
            label={`Hair: ${label.toLowerCase()}`}
            tour={`hair-${k}`}
            value={hair[k]}
            options={opts.map((o) => ({ value: o, name: o, thumb: thumb({ [k]: o }, view) }))}
            onPick={(v) => put({ [k]: v }, `Hair ${label.toLowerCase()}: ${v}`)}
          />
        </div>
      ))}
      <div class="field">
        Parting
        <span role="radiogroup" aria-label="Parting" class="row" style={{ flexWrap: 'wrap', gap: '4px' }}>
          {HAIR_PARTINGS.map((o) => (
            <button
              type="button"
              role="radio"
              aria-checked={hair.parting === o}
              class={`btn small ${hair.parting === o ? 'on' : ''}`}
              data-tour={`hair-parting-${o.toLowerCase()}`}
              onClick={() => put({ parting: o }, `Parting: ${o}`)}
            >
              {o}
            </button>
          ))}
        </span>
      </div>
      {SLIDERS.filter(([k]) =>
        k === 'tieLength' ? hair.tie !== 'None' : k === 'beardLength' ? hair.beard !== 'None' : true,
      ).map(([k, label]) => (
        <label class="field">
          <span>
            {label} <span class="mono muted">{shown[k] as number}</span>
            {k === 'length' && hair.tie !== 'None' && <span class="muted small"> (tied up)</span>}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={shown[k] as number}
            data-tour={`hair-${k}`}
            aria-valuetext={`${shown[k]} of 100`}
            onInput={(e) => p.setDraft({ ...shown, [k]: Number((e.target as HTMLInputElement).value) })}
            onChange={(e) => {
              put({ [k]: Number((e.target as HTMLInputElement).value) }, `Hair ${label.toLowerCase()}`);
              p.setDraft(null);
            }}
          />
        </label>
      ))}
      {(
        [
          ['tips', 'Tips colour', '#1e5aa8', true],
          ['band', 'Band colour', '#2b2b2b', hair.tie !== 'None' || hair.beard === 'Braided'],
          ['beardColor', 'Beard colour', String(profile.hairColor ?? '#654027'), hair.beard !== 'None'],
        ] as const
      )
        .filter(([, , , on]) => on)
        .map(([k, label, start]) => (
          <div class="field">
            <label class="row" style={{ gap: '6px' }}>
              <input
                type="checkbox"
                checked={!!hair[k]}
                data-tour={`hair-${k}-on`}
                onChange={(e) =>
                  put(
                    { [k]: (e.target as HTMLInputElement).checked ? start : undefined },
                    `${label}: ${(e.target as HTMLInputElement).checked ? 'on' : 'off'}`,
                  )
                }
              />
              {label}
            </label>
            {hair[k] && (
              <input
                type="color"
                class="inp"
                value={hair[k]}
                data-tour={`hair-${k}`}
                onChange={(e) => put({ [k]: (e.target as HTMLInputElement).value }, label)}
              />
            )}
          </div>
        ))}
      <div class="field">
        <span class="muted small">{describeHair(hair)}</span>
        <div class="row" style={{ gap: '4px', flexWrap: 'wrap' }}>
          <input
            class="inp"
            placeholder={hair.name ?? 'Name'}
            value={name}
            maxLength={40}
            aria-label="Hairstyle name"
            data-tour="hair-name"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn small" data-tour="hair-save" onClick={saveToLibrary}>
            💾 Save to My library
          </button>
          {fromLib && (
            <button
              type="button"
              class="btn small"
              data-tour="hair-update"
              title="Change the library hairstyle to this one (characters already wearing it keep theirs)"
              onClick={() => {
                const { name: _n, from: _f, ...settings } = hair;
                const n = (name || fromLib.name).slice(0, 40);
                if (
                  ed.exec(
                    {
                      type: 'hairstyle.put',
                      payload: {
                        style: {
                          ...settings,
                          id: fromLib.id,
                          name: n,
                          color: String(profile.hairColor ?? fromLib.color),
                        },
                      },
                    },
                    { label: `Update hairstyle ${n}` },
                  ).ok
                )
                  ed.notify(`Updated “${n}” in My library.`);
              }}
            >
              Update “{fromLib.name}”
            </button>
          )}
          {fromLib && (
            <button
              type="button"
              class="btn small"
              data-tour="hair-delete"
              onClick={() =>
                ed.exec(
                  { type: 'hairstyle.delete', payload: { id: fromLib.id } },
                  { label: `Delete hairstyle ${fromLib.name}` },
                )
              }
            >
              Remove from library
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
