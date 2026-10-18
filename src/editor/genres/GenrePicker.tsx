import { useState } from 'preact/hooks';
import { GENRES } from '../../builtin/genres';
import type { ActionCtx } from '../actions/registry';
import { type MenuEntry, openMenu } from '../interact/menu';
import type { ControlKind } from './controls';
import {
  hiddenInUse,
  isPinned,
  isShowingEverything,
  projectGenre,
  resetControls,
  setControl,
  setShowEverything,
  shows,
  viewGenre,
} from './view';

/**
 * P18: the top bar's genre picker. The genre is saved with the game (one undo step); “Show everything” shows
 * every control on this device without changing the game; the badge lists what the game uses that the view
 * hides, so nothing is out of sight by surprise.
 */
export function GenrePicker({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const g = projectGenre(ed);
  const all = isShowingEverything(ed);
  const view = viewGenre(ed);
  const hidden = hiddenInUse(ed);
  const [open, setOpen] = useState(false);
  return (
    <span class="genre-bar" data-tour="genre">
      <label class="genre-pick" title="What kind of game this is: the editor shows the tools that kind of game uses">
        <span aria-hidden="true">{g.icon}</span>
        <select
          class="inp"
          aria-label="Genre"
          data-tour="genre-pick"
          value={g.id}
          onChange={(e) => {
            const genre = (e.target as HTMLSelectElement).value;
            if (genre === g.id) return;
            ed.exec({ type: 'project.update', payload: { genre } });
            setShowEverything(ed, false);
          }}
        >
          {GENRES.map((x) => (
            <option value={x.id}>{x.name}</option>
          ))}
        </select>
      </label>
      {g.id !== 'open' &&
        (all ? (
          <button
            type="button"
            class="chip genre-all on"
            data-tour="genre-back"
            title="Every control is showing on this device. Go back to the tools this genre uses."
            onClick={() => setShowEverything(ed, false)}
          >
            Showing everything · back to {g.name}
          </button>
        ) : (
          <button
            type="button"
            class="link small genre-all"
            data-tour="genre-open"
            title="Show every control on this device (the game does not change)"
            onClick={() => setShowEverything(ed, true)}
          >
            Show everything
          </button>
        ))}
      {view.features !== 'all' && hidden.length > 0 && (
        <span class="genre-hidden-wrap">
          <button
            type="button"
            class="chip warn genre-hidden"
            data-tour="genre-hidden"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {hidden.length} {hidden.length === 1 ? 'item uses' : 'items use'} hidden features
          </button>
          {open && (
            <div class="popmenu genre-hidden-list" role="dialog" aria-label="Hidden features in use">
              <p class="small muted">
                This game uses these, but the {view.name} view hides them. They still work when you play.
              </p>
              <ul>
                {hidden.map((h) => (
                  <li class="small">
                    {h.what} <span class="muted">· {h.where}</span>
                  </li>
                ))}
              </ul>
              <div class="row">
                <button
                  type="button"
                  class="btn"
                  onClick={() => {
                    setOpen(false);
                    setShowEverything(ed, true);
                  }}
                >
                  Show everything
                </button>
                <button
                  type="button"
                  class="btn"
                  onClick={() => {
                    for (const h of hidden) setControl(ed, h.kind, h.id, 'pin');
                    setOpen(false);
                  }}
                >
                  Pin them to this view
                </button>
              </div>
            </div>
          )}
        </span>
      )}
    </span>
  );
}

/** Right-click on a tab, a tool or a logic node: pin it to this view, hide it, or put it back. */
export function controlMenu(c: ActionCtx, kind: ControlKind, id: string, name: string, e: MouseEvent) {
  e.preventDefault();
  const { ed } = c;
  const view = viewGenre(ed);
  const pinned = isPinned(ed, kind, id);
  const showing = shows(ed, kind, id);
  const entries: MenuEntry[] = [
    {
      kind: 'item',
      id: 'control.pin',
      label: pinned ? `Pinned to ${view.name}` : `Pin to ${view.name}`,
      disabled: pinned,
      run: () => setControl(ed, kind, id, 'pin'),
    },
    {
      kind: 'item',
      id: 'control.hide',
      label: `Hide from ${view.name}`,
      disabled: !showing,
      run: () => setControl(ed, kind, id, 'hide'),
    },
    {
      kind: 'item',
      id: 'control.reset',
      label: 'Put back as the genre has it',
      run: () => setControl(ed, kind, id, 'reset'),
    },
    { kind: 'sep' },
    {
      kind: 'item',
      id: 'control.resetAll',
      label: `Undo all my pins and hides in ${view.name}`,
      run: () => resetControls(ed),
    },
  ];
  openMenu(
    c,
    { title: name, help: { page: 'e/genre.pick', label: 'Help about genres' }, entries },
    e.clientX,
    e.clientY,
  );
}
