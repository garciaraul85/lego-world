import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import { EMOTE_CLIPS } from '../../../builtin/clips/emotes';
import { type Character, type Cinematic, type Clip, paths } from '../../../core/schema';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { PreviewPicker } from '../../components/PreviewPicker';
import type { EditorState } from '../../state';
import { CharacterThumb, peakTime } from '../character-studio/thumbs';

/**
 * P32: the Director's choices about how an actor moves, as pictures of that actor — a clip at its strongest
 * pose, a gesture, the actor holding each item — instead of a list of names.
 */

/** The look of the character playing a role (the player character for “$hero”). */
export function roleProfile(ed: EditorState, cin: Cinematic, role: string): Record<string, unknown> {
  const L = legacyRuntime();
  const m = cin.cast.find((x) => x.role === role);
  const id = !m || m.actor === '$hero' ? ed.store.manifest.hero : m.actor;
  const chr =
    (id ? ed.store.get<Character>(paths.character(id)) : undefined) ??
    (id ? BUILTIN_CHARACTERS.find((c) => c.id === id) : undefined);
  return chr?.profile ?? { ...L.CharacterCatalog.defaults };
}

function Field({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="dr-f">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** “Clip”: every clip, each shown as the actor at the clip's strongest moment. */
export function ClipPicker({
  profile,
  value,
  clips,
  onPick,
}: {
  profile: Record<string, unknown>;
  value: string;
  clips: Clip[];
  onPick: (id: string) => void;
}) {
  return (
    <Field label="Clip">
      <PreviewPicker
        label="Clip"
        tour="cine-clip"
        value={value}
        options={clips.map((c) => ({
          value: c.id,
          name: c.name ?? c.id,
          note: `${c.length} s${c.loop ? ', loops' : ''}${c.group ? ` · ${c.group}` : ''}`,
          thumb: <CharacterThumb profile={profile} size={40} pose={{ clip: c, time: peakTime(c) }} />,
        }))}
        onPick={onPick}
      />
    </Field>
  );
}

/** “Gesture”: wave, cheer, nod… each shown on the actor. */
export function GesturePicker({
  profile,
  value,
  kinds,
  onPick,
}: {
  profile: Record<string, unknown>;
  value: string;
  kinds: readonly string[];
  onPick: (kind: string) => void;
}) {
  return (
    <Field label="Gesture">
      <PreviewPicker
        label="Gesture"
        tour="cine-gesture"
        value={value}
        options={kinds.map((k) => {
          const c = EMOTE_CLIPS.find((x) => x.id.startsWith(`clp_emote${k}`)) ?? null;
          return {
            value: k,
            name: c?.name ?? k,
            thumb: (
              <CharacterThumb profile={profile} size={40} {...(c ? { pose: { clip: c, time: peakTime(c) } } : {})} />
            ),
          };
        })}
        onPick={onPick}
      />
    </Field>
  );
}

/** “Item”: what the actor can hold (the hero's tools and weapons), each shown in the actor's hand. */
export function HeldPicker({
  profile,
  value,
  onPick,
}: {
  profile: Record<string, unknown>;
  value: string;
  onPick: (item: string) => void;
}) {
  const items = legacyRuntime().CharacterCatalog.choices.held ?? [];
  return (
    <Field label="Item">
      <PreviewPicker
        label="Item"
        tour="cine-held"
        value={value}
        options={items.map((o) => ({
          value: o,
          name: o,
          thumb: <CharacterThumb profile={{ ...profile, held: o }} size={40} view="torso" />,
        }))}
        onPick={onPick}
      />
    </Field>
  );
}
