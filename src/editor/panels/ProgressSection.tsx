import { progressOf } from '../../core/commands/handlers/progress';
import { type Achievement, type Best, type Collection, type ProgressDoc, parsePlayer } from '../../core/save/progress';
import { BrowserSaveStore } from '../../platform/saves';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp, TextField } from '../components/fields';
import { shows } from '../genres/view';

/** P26 part 2: what the Progress section's controls mean (their “?”) */
export const PROGRESS_HELP = {
  achievements:
    'Goals players unlock: logic’s Unlock achievement card (or the action Unlock achievement) unlocks one by its id. Unlocked achievements stay with the player across saves and new games; Pause and the title show them under Achievements. Hidden ones show as ??? until unlocked.',
  collections:
    'Things to find, counted from the inventory: the item’s name (as Give item uses it) and how many there are. Completion % is made of the collections and the achievements.',
  bests:
    'Variables whose best value each player keeps: higher is better (a score) is kept as soon as it is beaten; lower is better (a lap time) when the game is finished.',
  plus: 'After the game is finished (logic’s Finish game card), the title offers New game +: a new game that keeps the items and the variables listed here. The variable newGamePlus counts how many times.',
  player:
    'What you earned while testing in this browser: achievements, best scores, times finished and your Settings (volume, camera, text size, difficulty). Reset forgets them.',
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'goal';

/** Project › Progress: achievements, collections, best scores and new game plus. */
export function ProgressSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  ed.playing.value;
  if (!shows(ed, 'section', 'game.progress')) return null;
  const doc = progressOf((p) => ed.store.get(p));
  const put = (next: ProgressDoc, label: string) =>
    ed.exec({ type: 'progress.put', payload: { progress: next } }, { label });
  const setA = (i: number, patch: Partial<Achievement>) =>
    put({ ...doc, achievements: doc.achievements.map((a, j) => (j === i ? { ...a, ...patch } : a)) }, 'Achievement');
  const setC = (i: number, patch: Partial<Collection>) =>
    put({ ...doc, collections: doc.collections.map((x, j) => (j === i ? { ...x, ...patch } : x)) }, 'Collection');
  const setB = (i: number, patch: Partial<Best>) =>
    put({ ...doc, bests: doc.bests.map((x, j) => (j === i ? { ...x, ...patch } : x)) }, 'Best score');
  const store = new BrowserSaveStore();
  const game = ed.store.manifest.id;
  const rec = parsePlayer(store.readPlayer(game), game);
  const earned = Object.keys(rec.achievements).length;
  return (
    <div class="sec" data-help="game.progress" data-tour="game-progress">
      <div class="sech">
        <span>
          Progress
          <FieldHelp label="Progress" text={PROGRESS_HELP.achievements} />
        </span>
      </div>

      <div class="small muted">
        Achievements
        <FieldHelp label="Achievements" text={PROGRESS_HELP.achievements} />
      </div>
      {doc.achievements.map((a, i) => (
        <div class="prog-row" role="group" aria-label={`Achievement ${a.name}`}>
          <TextField label="Achievement name" value={a.name} onCommit={(name) => setA(i, { name })} />
          <TextField
            label="Achievement description"
            value={a.description || ' '}
            onCommit={(description) => setA(i, { description: description.trim() })}
          />
          <span class="row small" style={{ gap: '6px' }}>
            <span class="mono muted" title="The id logic uses">
              {a.id}
            </span>
            <label class="row small">
              <input
                type="checkbox"
                aria-label="Hidden until unlocked"
                checked={!!a.hidden}
                onChange={(e) => setA(i, { hidden: (e.target as HTMLInputElement).checked || undefined })}
              />
              hidden
            </label>
            <button
              type="button"
              class="link"
              aria-label={`Remove achievement ${a.name}`}
              onClick={() =>
                put({ ...doc, achievements: doc.achievements.filter((_, j) => j !== i) }, 'Remove achievement')
              }
            >
              ×
            </button>
          </span>
        </div>
      ))}
      <button
        type="button"
        class="btn wide"
        data-tour="progress-add-achievement"
        onClick={() => {
          let n = doc.achievements.length + 1;
          let id = slug(`goal ${n}`);
          while (doc.achievements.some((a) => a.id === id)) id = slug(`goal ${++n}`);
          put(
            {
              ...doc,
              achievements: [...doc.achievements, { id, name: `Goal ${n}`, description: 'What the player did.' }],
            },
            'Add achievement',
          );
        }}
      >
        + Achievement
      </button>

      <div class="small muted" style={{ marginTop: '8px' }}>
        Collections
        <FieldHelp label="Collections" text={PROGRESS_HELP.collections} />
      </div>
      {doc.collections.map((x, i) => (
        <div class="row small" role="group" aria-label={`Collection ${x.label}`} style={{ gap: '6px' }}>
          <TextField label="Collection item" value={x.item} onCommit={(item) => setC(i, { item: item.trim() })} />
          <TextField label="Collection label" value={x.label} onCommit={(label) => setC(i, { label })} />
          <input
            class="inp mono"
            style={{ width: '56px' }}
            aria-label="How many there are"
            value={String(x.total)}
            onChange={(e) => {
              const n = Math.round(Number((e.target as HTMLInputElement).value));
              if (n >= 1 && n <= 9999) setC(i, { total: n });
            }}
          />
          <button
            type="button"
            class="link"
            aria-label={`Remove collection ${x.label}`}
            onClick={() => put({ ...doc, collections: doc.collections.filter((_, j) => j !== i) }, 'Remove collection')}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        class="btn wide"
        data-tour="progress-add-collection"
        onClick={() => {
          let item = 'coin';
          for (let n = 2; doc.collections.some((x) => x.item === item); n++) item = `item${n}`;
          put(
            { ...doc, collections: [...doc.collections, { item, label: item === 'coin' ? 'Coins' : item, total: 10 }] },
            'Add collection',
          );
        }}
      >
        + Collection
      </button>

      <div class="small muted" style={{ marginTop: '8px' }}>
        Best scores
        <FieldHelp label="Best scores" text={PROGRESS_HELP.bests} />
      </div>
      {doc.bests.map((x, i) => (
        <div class="row small" role="group" aria-label={`Best score ${x.label}`} style={{ gap: '6px' }}>
          <TextField label="Best score variable" value={x.var} onCommit={(v) => setB(i, { var: v.trim() })} />
          <select
            class="inp"
            aria-label="Which is better"
            value={x.better}
            onChange={(e) => setB(i, { better: (e.target as HTMLSelectElement).value as Best['better'] })}
          >
            <option value="higher">higher is better</option>
            <option value="lower">lower is better</option>
          </select>
          <button
            type="button"
            class="link"
            aria-label={`Remove best score ${x.label}`}
            onClick={() => put({ ...doc, bests: doc.bests.filter((_, j) => j !== i) }, 'Remove best score')}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        class="btn wide"
        data-tour="progress-add-best"
        onClick={() => {
          let v = 'score';
          for (let n = 2; doc.bests.some((x) => x.var === v); n++) v = `score${n}`;
          put({ ...doc, bests: [...doc.bests, { var: v, label: 'Score', better: 'higher' }] }, 'Add best score');
        }}
      >
        + Best score
      </button>

      <div class="small muted" style={{ marginTop: '8px' }}>
        New game plus
        <FieldHelp label="New game plus" text={PROGRESS_HELP.plus} />
      </div>
      <label class="lbl">
        <input
          type="checkbox"
          aria-label="New game plus"
          data-tour="progress-plus"
          checked={doc.newGamePlus.enabled}
          onChange={(e) =>
            put(
              { ...doc, newGamePlus: { ...doc.newGamePlus, enabled: (e.target as HTMLInputElement).checked } },
              'New game plus',
            )
          }
        />{' '}
        Offer New game + after finishing
      </label>
      <label class="lbl">
        <input
          type="checkbox"
          aria-label="Keep items"
          disabled={!doc.newGamePlus.enabled}
          checked={doc.newGamePlus.keepItems}
          onChange={(e) =>
            put(
              { ...doc, newGamePlus: { ...doc.newGamePlus, keepItems: (e.target as HTMLInputElement).checked } },
              'New game plus',
            )
          }
        />{' '}
        Keep items
      </label>
      <label class="field">
        <span>Keep variables</span>
        <input
          class="inp"
          aria-label="Keep variables"
          disabled={!doc.newGamePlus.enabled}
          placeholder="level, maxHp"
          value={doc.newGamePlus.keepVars.join(', ')}
          onChange={(e) =>
            put(
              {
                ...doc,
                newGamePlus: {
                  ...doc.newGamePlus,
                  keepVars: (e.target as HTMLInputElement).value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 20),
                },
              },
              'New game plus',
            )
          }
        />
      </label>

      <div class="small muted" style={{ marginTop: '8px' }}>
        Your player record while testing
        <FieldHelp label="Player record" text={PROGRESS_HELP.player} />
      </div>
      <div class="small mono">
        {earned} achievement{earned === 1 ? '' : 's'} · finished {rec.finished} time{rec.finished === 1 ? '' : 's'} ·{' '}
        {rec.settings.difficulty}
      </div>
      <button
        type="button"
        class="btn wide"
        data-tour="progress-reset"
        onClick={() => {
          store.removePlayer(game);
          ed.notify('Player record reset: no achievements, best scores or finishes, and default Settings.');
          ed.revision.value++;
        }}
      >
        Reset player record
      </button>
    </div>
  );
}
