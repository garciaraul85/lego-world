import { useEffect, useRef, useState } from 'preact/hooks';
import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { BUILTIN_CLIPS } from '../../../builtin/clips';
import type { Command } from '../../../core/commands';
import { newId } from '../../../core/ids';
import { type Character, type Clip, paths } from '../../../core/schema';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import type { ActionCtx } from '../../actions/registry';
import { ENEMY_HELP, EnemyFields } from '../../components/EnemyFields';
import { DraftText, FieldHelp } from '../../components/fields';
import { HealthFields } from '../../components/HealthFields';
import { PreviewPicker } from '../../components/PreviewPicker';
import { Timeline } from '../../components/timeline/Timeline';
import { shows } from '../../genres/view';
import { actionChoices } from '../../panels/AudioFields';
import { CharacterPreview, type PreviewInput } from './CharacterPreview';
import { CharacterThumb, peakTime, type ThumbView, trackPose } from './thumbs';

/** Look fields grouped the way v68's character builder groups them. */
const SECTIONS: [string, string[]][] = [
  ['Body', ['height', 'gender', 'head', 'skinColor']],
  [
    'Face & hair',
    [
      'hair',
      'hairColor',
      'face',
      'eyes',
      'eyeColor',
      'expression',
      'facialHair',
      'glasses',
      'glassesColor',
      'hat',
      'hatColor',
    ],
  ],
  [
    'Outfit',
    [
      'costume',
      'outfit',
      'shirt',
      'shirtColor',
      'pants',
      'pantsColor',
      'dress',
      'dressColor',
      'heroCut',
      'swimwear',
      'underwear',
      'lingerie',
      'pattern',
      'shoes',
      'shoeColor',
      'accentColor',
    ],
  ],
  ['Accessories', ['gloves', 'gloveColor', 'back', 'cape', 'scarf', 'neck', 'ears', 'wrist', 'belt', 'accessoryColor']],
  ['Gear & powers', ['held', 'power', 'spell']],
];

/** where a choice is worn, so its picture is a close-up of that part */
const viewOf = (k: string): ThumbView =>
  ['head', 'hair', 'face', 'eyes', 'expression', 'facialHair', 'glasses', 'hat', 'ears'].includes(k)
    ? 'head'
    : ['pants', 'shoes', 'underwear', 'swimwear'].includes(k)
      ? 'legs'
      : ['back', 'cape'].includes(k)
        ? 'back'
        : [
              'shirt',
              'outfit',
              'dress',
              'heroCut',
              'lingerie',
              'pattern',
              'gloves',
              'scarf',
              'neck',
              'wrist',
              'belt',
            ].includes(k)
          ? 'torso'
          : 'full';

const pretty = (k: string) =>
  k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace('Color', 'color');

export function CharacterStudio({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const L = legacyRuntime();
  /** P32: the preset cards are open (+ New character) */
  const [picking, setPicking] = useState(false);
  const own = ed.store.list('characters/').map((p) => ed.store.get<Character>(p)!);
  const ownClips = ed.store.list('clips/').map((p) => ed.store.get<Clip>(p)!);
  const chrId = ed.studioCharacter.value ?? ed.store.manifest.hero ?? own[0]?.id ?? BUILTIN_CHARACTERS[0]!.id;
  const chr =
    own.find((x) => x.id === chrId) ??
    BUILTIN_CHARACTERS.find((x) => x.id === chrId) ??
    own[0] ??
    BUILTIN_CHARACTERS[0]!;
  const inProject = own.some((x) => x.id === chr.id);
  const allClips = [...ownClips, ...BUILTIN_CLIPS];
  const clipId = ed.studioClip.value;
  const setClipId = (id: string | null) => (ed.studioClip.value = id);
  const clip = allClips.find((x) => x.id === clipId) ?? null;
  const builtinClip = !!clip && !ownClips.some((x) => x.id === clip.id);
  // the playhead and Play are editor state, so the tutorial (and scripts) can read and set them
  const time = ed.clipTime.value;
  const setTime = (v: number | ((t: number) => number)) => {
    ed.clipTime.value = typeof v === 'function' ? v(ed.clipTime.peek()) : v;
  };
  const playing = ed.clipPlaying.value;
  const setPlaying = (v: boolean) => {
    ed.clipPlaying.value = v;
  };
  const [turntable, setTurntable] = useState(false);
  // P32: the timeline's picked track, ringed on the preview
  const [part, setPart] = useState<PreviewInput['part']>(null);
  const preview = useRef<PreviewInput>({
    profile: { ...chr.profile, offHand: chr.gear?.offHand ?? 'None' },
    clip,
    time,
    turntable,
    part: null,
  });
  preview.current = {
    profile: { ...chr.profile, offHand: chr.gear?.offHand ?? 'None' },
    clip,
    time,
    turntable,
    part: clip ? part : null,
  };

  // play the clip in real time
  useEffect(() => {
    if (!clip || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const n = t + dt;
        if (n < clip.length) return n;
        if (clip.loop) return n % clip.length;
        setPlaying(false);
        return clip.length;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clip?.id, clip?.length, clip?.loop, playing]);

  /** Commands that make sure the shown character exists in the project before it is edited. */
  const ensureChr = (): Command[] =>
    inProject ? [] : [{ type: 'character.create', payload: { character: { ...chr, id: newCharId(chr) } } }];
  const newCharId = (x: Character) => (BUILTIN_CHARACTERS.includes(x) ? newId('character') : x.id);
  const saveChr = (next: Character, label: string) => {
    let profile: Record<string, unknown>;
    try {
      profile = L.CharacterCatalog.validate(next.profile);
    } catch (e) {
      ed.notify(e instanceof Error ? e.message : String(e), true);
      return;
    }
    if (!inProject) {
      const id = newId('character');
      if (ed.exec({ type: 'character.create', payload: { character: { ...next, id, profile } } }, { label }).ok)
        ed.studioCharacter.value = id;
      return;
    }
    ed.exec({ type: 'character.update', payload: { character: { ...next, profile } } }, { label });
  };
  const setField = (k: string, v: unknown) =>
    saveChr(
      { ...chr, ...(k === 'name' ? { name: String(v).slice(0, 32) } : {}), profile: { ...chr.profile, [k]: v } },
      `Change ${pretty(k).toLowerCase()}`,
    );

  const saveClip = (next: Clip, label: string) => ed.exec({ type: 'clip.update', payload: { clip: next } }, { label });
  const duplicate = (src: Clip) => {
    const copy: Clip = { ...src, id: newId('clip'), name: `${src.name ?? 'Clip'} (copy)`.slice(0, 60) };
    if (ed.exec({ type: 'clip.create', payload: { clip: copy } }).ok) setClipId(copy.id);
  };
  const emotes = inProject ? (chr.emotes ?? []) : [];
  const toggleEmote = (x: Clip) => {
    const has = emotes.includes(x.id as never);
    const cmds: Command[] = [...ensureChr()];
    if (!has && !ed.store.has(paths.clip(x.id))) cmds.push({ type: 'clip.create', payload: { clip: x } });
    const next = has ? emotes.filter((e) => e !== x.id) : [...emotes, x.id as Clip['id']].slice(0, 4);
    const target = inProject ? chr : null;
    if (!target) {
      ed.notify('Add the character to the project first (change anything in its look).');
      return;
    }
    cmds.push({ type: 'character.update', payload: { character: { ...target, emotes: next } } });
    ed.exec(cmds, { label: has ? 'Remove emote' : 'Add emote' });
  };
  const isHero = ed.store.manifest.hero === chr.id;

  return (
    <div class="studio char-studio">
      <section class="panel studio-lib" aria-label="Characters and clips">
        <div class="ptabs">
          <span class="tab on">Characters</span>
        </div>
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button
            type="button"
            class={`btn ${picking ? '' : 'on'}`}
            data-tour="char-new"
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
          >
            {picking ? 'Close the presets' : '+ New character'}
          </button>
          {picking && (
            <div class="char-presets" role="listbox" aria-label="New character from a preset">
              {BUILTIN_CHARACTERS.map((p) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  class="char-card"
                  data-tip={`Make a new character that starts as ${p.name}`}
                  onClick={() => {
                    const id = newId('character');
                    if (ed.exec({ type: 'character.create', payload: { character: { ...p, id } } }).ok) {
                      ed.studioCharacter.value = id;
                      setPicking(false);
                    }
                  }}
                >
                  <CharacterThumb profile={p.profile} size={56} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div class="scroll" role="listbox" aria-label="Characters">
          {!own.length && (
            <div class="hint" style={{ padding: '6px 10px' }}>
              No characters in this game yet. Press + New character and pick one to start from.
            </div>
          )}
          {own.map((x) => (
            <button
              type="button"
              role="option"
              aria-selected={x.id === chr.id}
              data-name={x.name}
              class={`lib-item ${x.id === chr.id ? 'on' : ''}`}
              onClick={() => (ed.studioCharacter.value = x.id)}
            >
              <CharacterThumb profile={x.profile} size={30} />
              <span class="asset-name">{x.name}</span>
              <span class="mono small muted">{ed.store.manifest.hero === x.id ? 'player' : x.role}</span>
            </button>
          ))}
          <div class="sech" style={{ padding: '10px 10px 4px' }}>
            <span>Clips</span>
            <button
              type="button"
              class="link"
              onClick={() => {
                const blank: Clip = {
                  id: newId('clip'),
                  name: 'New clip',
                  length: 2,
                  loop: true,
                  tracks: [],
                  events: [],
                };
                if (ed.exec({ type: 'clip.create', payload: { clip: blank } }).ok) setClipId(blank.id);
              }}
              data-tour="clip-new"
            >
              + New
            </button>
          </div>
          <button type="button" class={`lib-item ${!clip ? 'on' : ''}`} onClick={() => setClipId(null)}>
            <span class="asset-name">Standing (no clip)</span>
          </button>
          {[...new Set(allClips.map((x) => (ownClips.includes(x) ? 'Mine' : (x.group ?? 'Other'))))].map((g) => (
            <>
              <div class="sech" style={{ padding: '6px 10px 2px' }}>
                <span>{g}</span>
              </div>
              {allClips
                .filter((x) => (ownClips.includes(x) ? 'Mine' : (x.group ?? 'Other')) === g)
                .map((x) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={x.id === clip?.id}
                    class={`lib-item ${x.id === clip?.id ? 'on' : ''}`}
                    onClick={() => {
                      setClipId(x.id);
                      setTime(0);
                      setPlaying(true);
                    }}
                  >
                    {/* P32: the clip's strongest pose, so the list shows what each clip does */}
                    <CharacterThumb profile={chr.profile} size={22} pose={{ clip: x, time: peakTime(x) }} />
                    <span class="asset-name">{x.name ?? x.id}</span>
                    {emotes.includes(x.id as never) && (
                      <span class="chip">key {emotes.indexOf(x.id as never) + 1}</span>
                    )}
                  </button>
                ))}
            </>
          ))}
        </div>
      </section>

      <section class="panel studio-main" aria-label="Character preview and timeline">
        <div class="ptabs studio-head">
          <strong class="studio-title">{chr.name}</strong>
          <span class="muted small">
            {inProject ? (isHero ? 'player character' : chr.role) : 'preset (added to the game on first change)'}
            {clip ? ` · ${clip.name ?? 'clip'}${builtinClip ? ' · built-in (read-only)' : ''}` : ''}
          </span>
          <span class="group" style={{ marginLeft: 'auto' }}>
            <button type="button" class={`btn ${turntable ? 'on' : ''}`} onClick={() => setTurntable(!turntable)}>
              Turntable
            </button>
            {clip && (
              <button type="button" class="btn" data-tour="clip-play" onClick={() => setPlaying(!playing)}>
                {playing ? 'Pause' : 'Play'}
              </button>
            )}
          </span>
        </div>
        <div class="studio-plate char-plate">
          <div class="viewport-wrap">
            <CharacterPreview input={preview} />
          </div>
        </div>
        {clip ? (
          <>
            {builtinClip && (
              <div class="studio-foot small">
                {clip.group === 'Combat' || clip.group === 'Gestures' ? 'Built-in clip' : 'v68 routine'} (read-only).{' '}
                <button type="button" class="link" onClick={() => duplicate(clip)}>
                  Duplicate to edit
                </button>
              </div>
            )}
            <Timeline
              clip={clip}
              time={Math.min(time, clip.length)}
              readOnly={builtinClip}
              choices={{ sounds: actionChoices(ed).sounds, cinematics: actionChoices(ed).cinematics }}
              onSeek={(t) => {
                setPlaying(false);
                setTime(t);
              }}
              onChange={saveClip}
              onTrackSelect={setPart}
              trackThumb={(bone, prop) => {
                const pose = trackPose(bone, prop);
                return <CharacterThumb profile={chr.profile} size={40} {...(pose ? { pose } : {})} />;
              }}
            />
          </>
        ) : (
          <div class="studio-foot muted small">Pick a clip on the left to preview it here and edit its keys.</div>
        )}
      </section>

      <section class="panel right studio-props" aria-label="Character properties">
        <div class="ptabs">
          <span class="tab on">Character</span>
        </div>
        <div class="scroll">
          <div class="sec">
            <label class="field">
              Name
              <DraftText
                class="inp"
                tour="char-name"
                value={chr.name}
                aria-label="Character name"
                onCommit={(text) => {
                  const name = text.trim().slice(0, 32);
                  if (!name) return false;
                  saveChr({ ...chr, name, profile: { ...chr.profile, name } }, 'Rename character');
                }}
              />
            </label>
            <div class="row">
              <button
                type="button"
                class="btn on"
                style={{ flex: 1 }}
                data-tour="char-hero"
                disabled={!inProject || isHero}
                onClick={() =>
                  ed.exec({ type: 'project.update', payload: { hero: chr.id } }, { label: 'Choose player character' })
                }
              >
                {isHero ? 'Player character' : 'Make player character'}
              </button>
              <button
                type="button"
                class="btn danger"
                disabled={!inProject || isHero}
                onClick={() => {
                  if (ed.exec({ type: 'character.delete', payload: { character: chr.id } }).ok)
                    ed.studioCharacter.value = null;
                }}
              >
                Delete
              </button>
            </div>
          </div>
          {/* P9a: a neighbour the hero can hurt (villagers are off: hits do nothing) */}
          {!isHero && shows(ed, 'section', 'character.harm') && (
            <div class="sec" data-tour="char-harm">
              <div class="sech">
                <span>
                  Health
                  <FieldHelp
                    label="Can be harmed"
                    text="On: when this character is a neighbour on a map, the hero's hits hurt it, and at zero it leaves the play (and can leave an item and send an event). Off: hits do nothing — villagers are off. The player character's health is its hearts (the hp variable)."
                  />
                </span>
              </div>
              <label class="lbl">
                <input
                  type="checkbox"
                  data-tour="char-can-be-harmed"
                  checked={!!chr.harm?.canBeHarmed}
                  onChange={() =>
                    saveChr(
                      {
                        ...chr,
                        harm: {
                          canBeHarmed: !chr.harm?.canBeHarmed,
                          health: chr.harm?.health ?? { hp: 3, atZero: { break: false } },
                        },
                      },
                      chr.harm?.canBeHarmed ? 'Cannot be harmed' : 'Can be harmed',
                    )
                  }
                />{' '}
                Can be harmed
              </label>
              {chr.harm?.canBeHarmed && (
                <HealthFields
                  ed={ed}
                  tour="char-health"
                  health={chr.harm.health}
                  onChange={(health, label) => saveChr({ ...chr, harm: { canBeHarmed: true, health } }, label)}
                />
              )}
            </div>
          )}
          {/* P9c: an enemy — it walks to the hero and swings at them */}
          {!isHero && shows(ed, 'section', 'character.enemy') && (
            <div class="sec" data-tour="char-enemy" data-help="characters.enemy">
              <div class="sech">
                <span>
                  Fights the hero
                  <FieldHelp label="Fights the hero" text={ENEMY_HELP.make} />
                </span>
                {chr.enemy && (
                  <button
                    type="button"
                    class="link"
                    aria-label="Stop fighting the hero"
                    onClick={() => {
                      const { enemy: _e, ...rest } = chr;
                      saveChr(rest as typeof chr, 'Not an enemy');
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <EnemyFields
                enemy={chr.enemy}
                onChange={(enemy, label) => {
                  if (!enemy) return;
                  saveChr({ ...chr, enemy }, label);
                }}
                onMake={(enemy, health, name) =>
                  saveChr({ ...chr, enemy, harm: { canBeHarmed: true, health } }, `Make enemy: ${name}`)
                }
              />
            </div>
          )}
          {clip && !builtinClip && (
            <div class="sec">
              <div class="sech">
                <span>Clip</span>
              </div>
              <label class="field">
                Clip name
                <DraftText
                  class="inp"
                  tour="clip-name"
                  aria-label="Clip name"
                  value={clip.name ?? ''}
                  onCommit={(text) => {
                    const name = text.trim().slice(0, 60);
                    if (!name) return false;
                    saveClip({ ...clip, name }, 'Rename clip');
                  }}
                />
              </label>
            </div>
          )}
          {clip && (
            <div class="sec">
              <div class="sech">
                <span>Emotes</span>
                <span>keys 1-4 in play</span>
              </div>
              <label class="lbl">
                <input
                  type="checkbox"
                  checked={emotes.includes(clip.id as never)}
                  disabled={!inProject || (!emotes.includes(clip.id as never) && emotes.length >= 4)}
                  onChange={() => toggleEmote(clip)}
                />{' '}
                {chr.name} can play “{clip.name ?? 'this clip'}”
              </label>
            </div>
          )}
          {SECTIONS.map(([title, keys]) => (
            <div class="sec">
              <div class="sech">
                <span>{title}</span>
              </div>
              {keys
                .filter((k) => k in L.CharacterCatalog.defaults)
                .map((k) =>
                  L.CharacterCatalog.colorFields.includes(k) ? (
                    <label class="field">
                      {pretty(k)}
                      <input
                        type="color"
                        class="inp"
                        value={String(chr.profile[k] ?? '#888888')}
                        onChange={(e) => setField(k, (e.target as HTMLInputElement).value)}
                      />
                    </label>
                  ) : L.CharacterCatalog.choices[k] ? (
                    // P32: each choice is a picture of this character wearing it, close up where it is worn
                    <div class="field">
                      {pretty(k)}
                      <PreviewPicker
                        label={pretty(k)}
                        value={String(chr.profile[k])}
                        options={L.CharacterCatalog.choices[k]!.map((o) => ({
                          value: o,
                          name: o,
                          thumb: <CharacterThumb profile={{ ...chr.profile, [k]: o }} view={viewOf(k)} size={40} />,
                        }))}
                        onPick={(v) => setField(k, v)}
                        tour={k}
                      />
                    </div>
                  ) : null,
                )}
              {/* P9b: the off hand (a shield on the left forearm) */}
              {title === 'Gear & powers' && (
                <div class="field">
                  Off hand
                  <PreviewPicker
                    label="Off hand"
                    tour="offHand"
                    value={chr.gear?.offHand ?? 'None'}
                    options={(['None', 'Shield'] as const).map((o) => ({
                      value: o,
                      name: o,
                      thumb: <CharacterThumb profile={{ ...chr.profile, offHand: o }} view="torso" size={40} />,
                    }))}
                    onPick={(v) => saveChr({ ...chr, gear: { offHand: v as 'None' | 'Shield' } }, `Off hand: ${v}`)}
                  />
                </div>
              )}
            </div>
          ))}
          <div class="sec" style={{ borderBottom: 0 }}>
            <div class="hint">
              Voice, footsteps and neighbor behavior (home zone, dialogue) arrive with Audio (Phase 5) and Logic (Phase
              4). Paint and photo looks are still made in v68 studio.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
