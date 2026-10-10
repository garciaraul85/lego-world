import { BUILTIN_CHARACTERS } from '../../../builtin/characters';
import type { Character, Cinematic, Instances } from '../../../core/schema';
import { paths } from '../../../core/schema';
import type { EditorState } from '../../state';

/** Who can be cast: the hero, the map's neighbours, the project's characters and the built-ins. */
export function actorChoices(ed: EditorState, map: string) {
  const inst = ed.store.get<Instances>(paths.instances(map));
  const neighbours = (inst?.items ?? []).flatMap((i) => {
    if (i.kind !== 'npc') return [];
    const c = ed.store.get<Character>(paths.character(i.character));
    return c ? [{ id: c.id, name: `${c.name || 'Neighbour'} · neighbour here` }] : [];
  });
  const own = ed.store
    .list('characters/')
    .map((p) => ed.store.get<Character>(p)!)
    .filter((c) => c && !neighbours.some((n) => n.id === c.id))
    .map((c) => ({ id: c.id, name: `${c.name || c.id} · project` }));
  return [
    { id: '$hero', name: 'The hero (player character)' },
    ...neighbours,
    ...own,
    ...BUILTIN_CHARACTERS.map((c) => ({ id: c.id, name: `${c.name} · built-in` })),
  ];
}

/** Cast panel (board 7): roles, who plays them and where they start. */
export function CastPanel({
  ed,
  cin,
  role,
  onRole,
  onChange,
}: {
  ed: EditorState;
  cin: Cinematic;
  role: string | null;
  onRole: (r: string) => void;
  onChange: (c: Cinematic, label: string) => void;
}) {
  const choices = actorChoices(ed, cin.map);
  const setMember = (i: number, patch: Partial<Cinematic['cast'][number]>) => {
    const cast = cin.cast.map((m, j) => (j === i ? { ...m, ...patch } : m));
    // renaming a role renames its track
    const old = cin.cast[i]!.role;
    const tracks = patch.role
      ? cin.tracks.map((t) => (t.kind === 'actor' && t.role === old ? { ...t, role: patch.role! } : t))
      : cin.tracks;
    onChange({ ...cin, cast, tracks }, 'Edit cast');
  };
  return (
    <div class="sec dr-cast">
      <div class="sech">
        <span>Cast · {cin.cast.length}</span>
        <button
          type="button"
          class="link"
          onClick={() => {
            let n = cin.cast.length + 1;
            while (cin.cast.some((m) => m.role === `role${n}`)) n++;
            const actor = (choices.find((c) => c.id !== '$hero')?.id ?? '$hero') as Cinematic['cast'][number]['actor'];
            onChange(
              {
                ...cin,
                cast: [...cin.cast, { role: `role${n}`, actor }],
                tracks: [...cin.tracks, { kind: 'actor', role: `role${n}`, items: [] }],
              },
              'Add cast member',
            );
            onRole(`role${n}`);
          }}
        >
          + Role
        </button>
      </div>
      {cin.cast.map((m, i) => (
        <div class={`dr-member ${role === m.role ? 'on' : ''}`}>
          <div class="row" style={{ flexWrap: 'nowrap' }}>
            <button
              type="button"
              class={`btn icon ${role === m.role ? 'on' : ''}`}
              aria-label={`Select ${m.role}`}
              aria-pressed={role === m.role}
              onClick={() => onRole(m.role)}
            >
              ●
            </button>
            <input
              class="inp"
              aria-label="Role name"
              value={m.role}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value.trim().slice(0, 40);
                if (v && !cin.cast.some((x) => x.role === v)) setMember(i, { role: v });
              }}
            />
            <button
              type="button"
              class="link"
              aria-label={`Remove ${m.role}`}
              onClick={() =>
                onChange(
                  {
                    ...cin,
                    cast: cin.cast.filter((_, j) => j !== i),
                    tracks: cin.tracks.filter((t) => !(t.kind === 'actor' && t.role === m.role)),
                  },
                  'Remove cast member',
                )
              }
            >
              ×
            </button>
          </div>
          <select
            class="inp"
            aria-label={`${m.role} is played by`}
            value={m.actor}
            onChange={(e) => setMember(i, { actor: (e.target as HTMLSelectElement).value as never })}
          >
            {choices.map((c) => (
              <option value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            class="inp"
            aria-label={`${m.role} starts at`}
            value={m.at ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              const next = { ...m } as Cinematic['cast'][number];
              if (v) next.at = v;
              else delete next.at;
              onChange({ ...cin, cast: cin.cast.map((x, j) => (j === i ? next : x)) }, 'Edit cast');
            }}
          >
            <option value="">Starts where it is</option>
            {cin.marks.map((mk) => (
              <option value={mk.id}>Starts at {mk.id}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
