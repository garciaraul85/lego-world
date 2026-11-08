/**
 * Milestone 3b (B7a-2): the quest log — a full screen over the game (J, or Quests on the pause screen). Its quests
 * on the left (the story's first, then those on the side, then the finished and failed), the chosen one's steps on
 * the right: those done ticked off, the one it is on with where to go and how far along, the rest still hidden.
 * Track shows its goal on both maps; Show on the map opens the pause map. J or Esc closes it.
 */
import { useState } from 'preact/hooks';
import { doOf, QUEST_DO_INFO } from '../../core/quests/quest';
import type { PlaySession } from '../../engine/runtime/session';

export function QuestLog({ s, tick }: { s: PlaySession; tick: number }) {
  void tick;
  const b = s.quests;
  const all = b.begun();
  const [pick, setPick] = useState<string | null>(null);
  const chosen = all.find((d) => d.name === pick) ?? b.trackedQuest() ?? all[0] ?? null;
  const groups: [string, typeof all][] = [
    ['Main quests', all.filter((d) => d.main && b.statusOf(d) === 'active')],
    ['Side quests', all.filter((d) => !d.main && b.statusOf(d) === 'active')],
    ['Finished', all.filter((d) => b.statusOf(d) !== 'active')],
  ];
  const p = chosen ? b.of(chosen) : null;
  // v141: a goal on another map
  const goal = chosen && b.statusOf(chosen) === 'active' ? s.goalOfQuest(chosen) : null;
  const status = chosen ? b.statusOf(chosen) : '';
  const tracked = b.trackedQuest()?.name ?? null;
  return (
    <div class="bw-questlog" role="dialog" aria-label="Quest log" data-tour="quest-log">
      <header class="bw-questlog-head">
        <strong>Quests</strong>
        <span class="muted small">
          {all.filter((d) => b.statusOf(d) === 'active').length} going ·{' '}
          {all.filter((d) => b.statusOf(d) === 'done').length} done
        </span>
        <button
          type="button"
          class="bw-mapscreen-close"
          onClick={() => s.openQuests(false)}
          aria-label="Close the quest log"
        >
          Close (J)
        </button>
      </header>
      {!all.length ? (
        <p class="bw-questlog-empty muted">No quests yet. Talk to people: someone may need a hand.</p>
      ) : (
        <div class="bw-questlog-body">
          <nav class="bw-questlog-list" aria-label="Quests">
            {groups.map(
              ([title, list]) =>
                list.length > 0 && (
                  <section>
                    <h4>{title}</h4>
                    {list.map((d) => {
                      const st = b.statusOf(d);
                      return (
                        <button
                          type="button"
                          class={`bw-questlog-item${chosen?.name === d.name ? ' on' : ''}${st === 'failed' ? ' failed' : ''}`}
                          aria-pressed={chosen?.name === d.name}
                          onClick={() => setPick(d.name)}
                        >
                          <span class={`bw-questlog-mark ${d.main ? 'main' : 'side'}`} aria-hidden="true">
                            {st === 'done' ? '✓' : st === 'failed' ? '✕' : '◆'}
                          </span>
                          <span class="bw-questlog-name">{d.name}</span>
                          {tracked === d.name && <span class="bw-questlog-tag">Tracking</span>}
                        </button>
                      );
                    })}
                  </section>
                ),
            )}
          </nav>
          {chosen && p && (
            <article class="bw-questlog-detail" aria-label={chosen.name}>
              <h3>
                {chosen.name}
                <span class="muted small"> · {chosen.main ? 'Main quest' : 'Side quest'}</span>
              </h3>
              {chosen.about && <p class="bw-questlog-about">{chosen.about}</p>}
              <ol class="bw-questlog-steps">
                {chosen.steps.map((st, i) => {
                  const done = status === 'done' || i < p.step;
                  const now = status !== 'done' && i === p.step;
                  // steps ahead stay hidden, as in a journal written as you go
                  if (!done && !now) return null;
                  const k = doOf(st);
                  const need = st.count ?? 1;
                  const have = now ? b.haveOf(chosen, (it) => s.itemCount(it)) : 0;
                  return (
                    <li class={done ? 'done' : status === 'failed' ? 'failed' : 'now'}>
                      <span class="bw-questlog-tick" aria-hidden="true">
                        {done ? '✓' : '◆'}
                      </span>
                      <span>
                        {st.name}
                        {now && (k === 'get' || k === 'beat') && need > 1 && (
                          <span class="muted small">
                            {' '}
                            ({Math.min(need, Math.max(0, have))} of {need})
                          </span>
                        )}
                        {now && st.at && k !== 'script' && (
                          <span class="bw-questlog-goal small">
                            {QUEST_DO_INFO[k].label} {st.at}
                          </span>
                        )}
                        {now && goal && !goal.here && goal.mapName && (
                          <span class="bw-questlog-goal small">
                            In {goal.mapName}
                            {goal.pos ? ' — the maps show the way there' : ''}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
                {status === 'active' && p.step < chosen.steps.length - 1 && (
                  <li class="ahead muted small" aria-label="More steps ahead">
                    …
                  </li>
                )}
              </ol>
              {status === 'active' && (
                <div class="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    class="bw-questlog-btn"
                    aria-pressed={tracked === chosen.name}
                    onClick={() => s.trackQuest(tracked === chosen.name ? null : chosen.name)}
                  >
                    {tracked === chosen.name ? 'Stop tracking' : 'Track'}
                  </button>
                  <button
                    type="button"
                    class="bw-questlog-btn"
                    onClick={() => {
                      s.trackQuest(chosen.name);
                      s.openMap(true);
                    }}
                  >
                    Show on the map
                  </button>
                </div>
              )}
              {status === 'done' && <p class="bw-questlog-state">Complete</p>}
              {status === 'failed' && <p class="bw-questlog-state failed">Failed</p>}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
