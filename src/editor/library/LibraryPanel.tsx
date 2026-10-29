import { useEffect, useState } from 'preact/hooks';
import {
  gatherItem,
  importCommands,
  LIB_INFO,
  LIB_KINDS,
  type LibKind,
  type LibraryItem,
  packText,
  readPack,
  type VarDef,
} from '../../core/library/library';
import { paths, type Variables } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { matches, NoMatch, SearchBox } from '../components/SearchBox';
import { Modal } from '../shell/Shell';
import type { EditorState } from '../state';
import { library } from './store';

export const LIBRARY_HELP =
  'My library keeps your own things for every project in this browser: assets, characters, clips, effects, scripts, custom bricks, body plans and hairstyles. Add from this game saves copies here (with what they need: an asset’s custom bricks, a character’s body plan, clips and conversations, a script’s variables and the assets it names). Use in this game brings one into the open project; if the game already has something different under the same id, it comes in as a copy. Export pack saves the library (or what the search shows) as a .bwlib file to share or move to another device; Import pack adds one. Pictures, sounds and 3D models you imported stay with their game.';

const vars = (ed: EditorState): Record<string, VarDef> =>
  (ed.store.get<Variables>(paths.variables)?.vars ?? {}) as Record<string, VarDef>;

/** the game's own things of a kind, as [id, name] */
export function gameThings(ed: EditorState, kind: LibKind): [string, string][] {
  return ed.store
    .list(LIB_INFO[kind].dir)
    .map((p) => ed.store.get<{ id?: string; name?: string }>(p))
    .filter((x): x is { id: string; name?: string } => typeof x?.id === 'string')
    .map((x): [string, string] => [x.id, String(x.name ?? x.id)])
    .sort((a, b) => a[1].localeCompare(b[1]));
}

/** brings a library item into the open game (one undo step); a sentence for the notice */
export function useLibraryItem(ed: EditorState, item: LibraryItem): string {
  const r = importCommands(ed.store, item, vars(ed));
  if (!r.commands.length) return `“${item.name}” is already in this game.`;
  const done = ed.exec(r.commands, { label: `From My library: ${item.name}` });
  if (!done.ok) return `“${item.name}” could not come in: ${done.error ?? 'it does not fit this game'}.`;
  const where: Record<LibKind, string> = {
    asset: 'the Assets list',
    character: 'the Characters workspace',
    clip: 'the Characters workspace (clips)',
    effect: 'the Effects workspace',
    script: 'Logic',
    brick: 'the brick list',
    bodyplan: 'the Body tab of the Characters workspace',
    hairstyle: 'Look › Hair › My library',
  };
  return `“${item.name}” is in this game${r.copied ? ' as a copy (the game had another under the same id)' : ''}: find it in ${where[item.kind]}.`;
}

function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Step 11, 4c: My library in the bottom dock */
export function LibraryPanel({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const lib = library();
  useEffect(() => void lib.load(), []);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const items = lib.items.value.filter((i) => matches(q, i.name, LIB_INFO[i.kind].label, i.from));
  const importPack = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.bwlib,.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      try {
        const got = readPack(await f.text());
        await lib.add(got);
        ed.notify(`Added ${got.length} ${got.length === 1 ? 'thing' : 'things'} to My library from ${f.name}.`);
      } catch (e) {
        ed.notify((e as Error).message);
      }
    };
    inp.click();
  };
  return (
    <div class="scroll pack-panel lib-panel" data-tour="dock-library" data-help="scene.dock.library">
      <div class="row" style={{ gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>My library</strong>
        <FieldHelp label="My library" text={LIBRARY_HELP} />
        <span class="muted small" style={{ flex: 1 }}>
          Your own things, for every project in this browser.
        </span>
        <button type="button" class="btn small" data-tour="library-add" onClick={() => setAdding(true)}>
          + Add from this game…
        </button>
        <button type="button" class="btn small" data-tour="library-import" onClick={importPack}>
          Import pack…
        </button>
        <button
          type="button"
          class="btn small"
          data-tour="library-export"
          disabled={!items.length}
          onClick={() => {
            saveFile('my-library.bwlib', packText(items));
            ed.notify(`Saved ${items.length} ${items.length === 1 ? 'thing' : 'things'} as my-library.bwlib.`);
          }}
        >
          Export pack
        </button>
        <SearchBox label="My library" value={q} onInput={setQ} tour="library-search" />
      </div>
      {lib.loaded.value && !lib.items.value.length && (
        <p class="muted small" style={{ margin: '8px 0' }}>
          Nothing here yet. Press <strong>+ Add from this game…</strong> to keep an asset, a character, a script… for
          your other projects, or <strong>Import pack…</strong> to add someone’s .bwlib file.
        </p>
      )}
      <NoMatch q={lib.items.value.length && !items.length ? q : ''} what="library items" />
      {LIB_KINDS.map((k) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <section class="pack-group" aria-label={LIB_INFO[k].plural}>
            <div class="small muted pack-title">{LIB_INFO[k].plural}</div>
            <div class="pack-terrain" role="list">
              {list.map((i) => (
                <div class="pack-style row" role="listitem" aria-label={i.name} data-tour={`lib-${i.id}`}>
                  <span style={{ flex: 1 }}>
                    <strong class="small">{i.name}</strong>
                    <span class="muted small">
                      {' '}
                      · from {i.from || 'a game'} · {i.saved.slice(0, 10)}
                      {Object.keys(i.files).length > 1
                        ? ` · with ${Object.keys(i.files).length - 1} more file${Object.keys(i.files).length > 2 ? 's' : ''}`
                        : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    class="btn small"
                    aria-label={`Use ${i.name} in this game`}
                    onClick={() => ed.notify(useLibraryItem(ed, i))}
                  >
                    Use in this game
                  </button>
                  <button
                    type="button"
                    class="btn small danger"
                    aria-label={`Remove ${i.name} from My library`}
                    onClick={() => {
                      void lib.remove(i.id);
                      ed.notify(`Removed “${i.name}” from My library (games that use it keep their copy).`);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {adding && <AddFromGame ed={ed} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** the game's own things to tick and save to My library */
function AddFromGame({ ed, onClose }: { ed: EditorState; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const groups = LIB_KINDS.map((k) => ({
    k,
    list: gameThings(ed, k).filter(([, n]) => matches(q, n, LIB_INFO[k].label)),
  })).filter((g) => g.list.length);
  const key = (k: LibKind, id: string) => `${k}:${id}`;
  const toggle = (s: string) => {
    const n = new Set(picked);
    if (n.has(s)) n.delete(s);
    else n.add(s);
    setPicked(n);
  };
  const save = async () => {
    const from = ed.store.manifest.name;
    const made: LibraryItem[] = [];
    for (const s of picked) {
      const [k, id] = s.split(':') as [LibKind, string];
      const it = gatherItem(ed.store, k, id, { from, vars: vars(ed) });
      if (it) made.push(it);
    }
    if (!made.length) return;
    await library().add(made);
    ed.notify(
      `Saved ${made.length === 1 ? `“${made[0]!.name}”` : `${made.length} things`} to My library: every project in this browser can use ${made.length === 1 ? 'it' : 'them'} now.`,
    );
    onClose();
  };
  return (
    <Modal title="Add to My library" onClose={onClose}>
      <p class="muted small" style={{ margin: 0 }}>
        Tick what to keep. Each comes with what it needs from this game (custom bricks, body plans, clips,
        conversations, variables).
      </p>
      <SearchBox label="this game" value={q} onInput={setQ} autoFocus />
      <div class="courses-list" data-tour="library-pick">
        {!groups.length && (
          <p class="muted small">
            This game has nothing of its own yet: make an asset, a character, a script… first. (Built-in and starter
            pack things are in every project already.)
          </p>
        )}
        {groups.map((g) => (
          <section class="courses-group" aria-label={LIB_INFO[g.k].plural}>
            <div class="small muted courses-title">{LIB_INFO[g.k].plural}</div>
            {g.list.map(([id, name]) => (
              <label class="row lib-pick">
                <input
                  type="checkbox"
                  checked={picked.has(key(g.k, id))}
                  onChange={() => toggle(key(g.k, id))}
                  aria-label={`${LIB_INFO[g.k].label}: ${name}`}
                />
                <span>{name}</span>
              </label>
            ))}
          </section>
        ))}
      </div>
      <div class="row" style={{ gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" class="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="btn go"
          disabled={!picked.size}
          data-tour="library-save"
          onClick={() => void save()}
        >
          Save {picked.size ? picked.size : ''} to My library
        </button>
      </div>
    </Modal>
  );
}
