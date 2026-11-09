import { useState } from 'preact/hooks';
import { type ActionCtx, action, COURSE_GROUPS, runAction } from '../actions/registry';
import { matches, NoMatch, SearchBox } from '../components/SearchBox';
import { shows } from '../genres/view';
import { ACTION_HELP } from '../help/entries/generated';
import { Modal } from './Shell';

/** "Starter pack course (hero, neighbours…)" → name "Starter pack", what "hero, neighbours…" */
function split(label: string): { name: string; what: string } {
  const m = /^(.*?) course(?: \((.*)\))?$/.exec(label);
  return m ? { name: m[1]!, what: m[2] ?? '' } : { name: label, what: '' };
}

/**
 * Help › Courses…: every course in one window, by topic, with a search. It scrolls, so the Help menu stays short
 * however many courses there are. Picking one closes the window and starts the course.
 */
export function CoursesWindow({ c, onClose }: { c: ActionCtx; onClose: () => void }) {
  const [q, setQ] = useState('');
  const groups = COURSE_GROUPS.map(([title, ids]) => {
    const list = ids
      .filter((id) => shows(c.ed, 'action', id))
      .map((id) => ({ id, a: action(id), ...split(action(id).label), about: ACTION_HELP[id] ?? '' }))
      .filter((x) => matches(q, x.name, x.what, x.about, title));
    return { title, list };
  }).filter((g) => g.list.length);
  const first = groups[0]?.list[0];
  const start = (id: string) => {
    onClose();
    runAction(action(id), c);
  };
  return (
    <Modal title="Courses" onClose={onClose}>
      <div class="muted small">
        Each course builds something small with you, step by step, in a practice project (your game is saved first).
        Every step has Show me and Do it for me.
      </div>
      <SearchBox label="courses" value={q} onInput={setQ} autoFocus onEnter={() => first && start(first.id)} />
      <div class="courses-list" role="menu" aria-label="Courses" data-tour="courses-list">
        {groups.map((g) => (
          <section class="courses-group" aria-label={g.title}>
            <div class="small muted courses-title">{g.title}</div>
            {g.list.map((x) => (
              <button
                type="button"
                class="mi course-item"
                role="menuitem"
                aria-label={x.a.label}
                data-tip={x.about || undefined}
                onClick={() => start(x.id)}
              >
                <strong>{x.name}</strong>
                {x.what && <span class="muted small">{x.what}</span>}
              </button>
            ))}
          </section>
        ))}
        <NoMatch q={groups.length ? '' : q} what="courses" />
      </div>
    </Modal>
  );
}
